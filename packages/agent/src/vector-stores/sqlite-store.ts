import { VectorStore, VectorDocument, VectorSearchResult, VectorStoreQuery } from "@dependency-canary/shared";
import { InMemoryVectorStore } from "./memory-store";

export class SQLiteVectorStore implements VectorStore {
  private db: any = null;
  private fallbackStore: InMemoryVectorStore | null = null;

  constructor(dbPath: string = ":memory:") {
    try {
      // Dynamic require so missing native binary doesn't crash the entire module
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Database = require("better-sqlite3");
      this.db = new Database(dbPath);
      this.initialize();
    } catch (err) {
      console.warn("better-sqlite3 native addon unavailable; falling back to InMemoryVectorStore:", err instanceof Error ? err.message : err);
      this.db = null;
      this.fallbackStore = new InMemoryVectorStore();
    }
  }

  private initialize() {
    if (!this.db) return;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        metadata TEXT NOT NULL,
        embedding BLOB
      );
      
      CREATE INDEX IF NOT EXISTS idx_id ON documents(id);
    `);
  }

  async addDocuments(documents: VectorDocument[]): Promise<void> {
    if (this.fallbackStore) {
      return this.fallbackStore.addDocuments(documents);
    }

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO documents (id, content, metadata, embedding)
      VALUES (?, ?, ?, ?)
    `);

    const transaction = this.db.transaction((docs: VectorDocument[]) => {
      for (const doc of docs) {
        const embeddingBuffer = doc.embedding 
          ? Buffer.from(new Float64Array(doc.embedding).buffer)
          : null;
        
        stmt.run(
          doc.id,
          doc.content,
          JSON.stringify(doc.metadata),
          embeddingBuffer
        );
      }
    });

    transaction(documents);
  }

  async search(query: VectorStoreQuery): Promise<VectorSearchResult[]> {
    if (this.fallbackStore) {
      return this.fallbackStore.search(query);
    }

    let sql = "SELECT id, content, metadata, embedding FROM documents";
    const params: any[] = [];
    
    if (query.filter) {
      const conditions: string[] = [];
      
      for (const [key, value] of Object.entries(query.filter)) {
        conditions.push(`json_extract(metadata, '$.${key}') = ?`);
        params.push(value);
      }
      
      if (conditions.length > 0) {
        sql += ` WHERE ${conditions.join(" AND ")}`;
      }
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params);

    const queryTokens = (query.query || "")
      .toLowerCase()
      .split(/[^a-z0-9_-]+/)
      .filter(t => t.length > 1);

    const results: VectorSearchResult[] = rows.map((row: any) => {
      let embedding: number[] | undefined;
      
      if (row.embedding) {
        const buffer = Buffer.from(row.embedding);
        embedding = Array.from(new Float64Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / Float64Array.BYTES_PER_ELEMENT));
      }

      const doc: VectorDocument = {
        id: row.id,
        content: row.content,
        metadata: JSON.parse(row.metadata),
        embedding,
      };

      let vectorScore = 0;
      let lexicalScore = 0;

      if (query.embedding && doc.embedding) {
        vectorScore = this.cosineSimilarity(query.embedding, doc.embedding);
      }

      if (queryTokens.length > 0) {
        const textContent = `${doc.id} ${doc.content} ${row.metadata}`.toLowerCase();
        let matches = 0;
        let cveMatches = 0;

        for (const token of queryTokens) {
          if (textContent.includes(token)) {
            matches++;
            if (token.startsWith("cve-") || doc.id.toLowerCase().includes(token)) {
              cveMatches++;
            }
          }
        }

        lexicalScore = (matches + cveMatches * 2) / (queryTokens.length + 2);
      }

      let score: number;
      if (query.embedding && doc.embedding) {
        score = (vectorScore * 0.65) + (lexicalScore * 0.35);
      } else if (queryTokens.length > 0) {
        score = lexicalScore;
      } else {
        score = 0.5;
      }

      score = Math.max(0.01, Math.min(1.0, score));

      return {
        document: doc,
        score,
      };
    });

    results.sort((a, b) => b.score - a.score);

    if (query.k && query.k > 0) {
      return results.slice(0, query.k);
    }

    return results;
  }

  async clear(): Promise<void> {
    if (this.fallbackStore) {
      return this.fallbackStore.clear();
    }
    this.db.exec("DELETE FROM documents");
  }

  close() {
    if (this.db) {
      this.db.close();
    }
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (!a || !b || a.length !== b.length || a.length === 0) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dotProduct / denom;
  }
}
