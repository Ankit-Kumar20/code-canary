import { InMemoryVectorStore } from '@dependency-canary/agent';
import type { VectorDocument, VectorSearchResult, VectorStore, VectorStoreQuery } from '@dependency-canary/shared';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { vectorDocuments } from '@/db/schema';

export class PostgresVectorStore implements VectorStore {
  async addDocuments(documents: VectorDocument[]): Promise<void> {
    if (documents.length === 0) return;
    await db
      .insert(vectorDocuments)
      .values(
        documents.map(doc => ({
          id: doc.id,
          projectId: doc.metadata.projectId,
          content: doc.content,
          metadata: doc.metadata,
          embedding: doc.embedding ?? null,
        })),
      )
      .onConflictDoUpdate({
        target: vectorDocuments.id,
        set: {
          content: sql`excluded.content`,
          metadata: sql`excluded.metadata`,
          embedding: sql`excluded.embedding`,
        },
      });
  }

  // Narrows candidates with the metadata filter in SQL, then ranks them with the
  // same hybrid vector + keyword scoring as the in-memory store.
  async search(query: VectorStoreQuery): Promise<VectorSearchResult[]> {
    const rows = await db
      .select()
      .from(vectorDocuments)
      .where(query.filter ? sql`${vectorDocuments.metadata} @> ${JSON.stringify(query.filter)}::jsonb` : undefined);

    const ranker = new InMemoryVectorStore();
    await ranker.addDocuments(
      rows.map(row => ({
        id: row.id,
        content: row.content,
        metadata: row.metadata,
        embedding: row.embedding ?? undefined,
      })),
    );
    return ranker.search({ ...query, filter: undefined });
  }

  async hasProject(projectId: string): Promise<boolean> {
    const [row] = await db
      .select({ id: vectorDocuments.id })
      .from(vectorDocuments)
      .where(eq(vectorDocuments.projectId, projectId))
      .limit(1);
    return !!row;
  }

  async deleteProject(projectId: string): Promise<void> {
    await db.delete(vectorDocuments).where(eq(vectorDocuments.projectId, projectId));
  }

  async clear(): Promise<void> {
    await db.delete(vectorDocuments);
  }
}
