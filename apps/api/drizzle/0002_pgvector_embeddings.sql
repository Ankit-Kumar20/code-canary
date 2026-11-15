CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
-- Embeddings are derived from stored SBOMs and may have other dimensions; agent-service re-indexes on demand.
DELETE FROM "vector_documents";--> statement-breakpoint
ALTER TABLE "vector_documents" ALTER COLUMN "embedding" SET DATA TYPE vector(1536) USING "embedding"::vector(1536);--> statement-breakpoint
CREATE INDEX "vector_documents_embedding_idx" ON "vector_documents" USING hnsw ("embedding" vector_cosine_ops);
