import { VectorStore, VectorDocument, VectorSearchResult, VectorStoreQuery } from "@dependency-canary/shared";

export class InMemoryVectorStore implements VectorStore {
  private documents: VectorDocument[] = [];

  async addDocuments(documents: VectorDocument[]): Promise<void> {
    for (const doc of documents) {
      const existingIndex = this.documents.findIndex(d => d.id === doc.id);
      if (existingIndex >= 0) {
        this.documents[existingIndex] = doc;
      } else {
        this.documents.push(doc);
      }
    }
  }

  async search(query: VectorStoreQuery): Promise<VectorSearchResult[]> {
    let filteredDocs = this.documents;

    if (query.filter) {
      filteredDocs = this.documents.filter(doc => {
        return Object.entries(query.filter!).every(([key, value]) => {
          return doc.metadata && doc.metadata[key] === value;
        });
      });
    }

    const queryTokens = (query.query || "")
      .toLowerCase()
      .split(/[^a-z0-9_-]+/)
      .filter(t => t.length > 1);

    const results: VectorSearchResult[] = filteredDocs.map(doc => {
      let vectorScore = 0;
      let lexicalScore = 0;

      // 1. Vector similarity
      if (query.embedding && doc.embedding) {
        vectorScore = this.cosineSimilarity(query.embedding, doc.embedding);
      }

      // 2. Lexical / Keyword matching (BM25-style)
      if (queryTokens.length > 0) {
        const textContent = `${doc.id} ${doc.content} ${JSON.stringify(doc.metadata)}`.toLowerCase();
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

      // Hybrid rank combination
      let score: number;
      if (query.embedding && doc.embedding) {
        score = (vectorScore * 0.65) + (lexicalScore * 0.35);
      } else if (queryTokens.length > 0) {
        score = lexicalScore;
      } else {
        score = 0.5;
      }

      // Keep within [0, 1] bounds
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
    this.documents = [];
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
