import { index, jsonb, pgTable, real, text, timestamp } from 'drizzle-orm/pg-core';
import type { EnrichedSBOM, ScanRequest } from '@dependency-canary/shared';
import { user } from './auth-schema';

export * from './auth-schema';

export const sboms = pgTable('sboms', {
  projectId: text('project_id').primaryKey(),
  sbom: jsonb('sbom').$type<EnrichedSBOM>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const scanJobs = pgTable(
  'scan_jobs',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    refType: text('ref_type').$type<ScanRequest['refType']>().notNull(),
    ref: text('ref').notNull(),
    status: text('status').$type<'pending' | 'completed' | 'failed'>().notNull().default('pending'),
    projectId: text('project_id').references(() => sboms.projectId, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [index('scan_jobs_user_id_idx').on(table.userId)],
);

// RAG documents and their embeddings, generated from each project's SBOM.
export const vectorDocuments = pgTable(
  'vector_documents',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => sboms.projectId, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    metadata: jsonb('metadata').$type<Record<string, any>>().notNull(),
    embedding: real('embedding').array(),
  },
  table => [index('vector_documents_project_id_idx').on(table.projectId)],
);
