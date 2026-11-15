import { Embedder } from "@dependency-canary/shared";

export class MockEmbedder implements Embedder {
  private dimension: number;

  constructor(dimension: number = 1536) {
    this.dimension = dimension;
  }

  async embed(text: string): Promise<number[]> {
    if (!text || text.trim().length === 0) {
      return this.generateSeedVector(1);
    }

    const vector = new Array(this.dimension).fill(0);
    const tokens = text.toLowerCase().split(/[^a-z0-9_-]+/).filter(Boolean);

    // Feature hashing (hashing trick) to map tokens into the embedding vector
    for (const token of tokens) {
      const idx = this.hashString(token) % this.dimension;
      const sign = (this.hashString(token + "_sign") % 2 === 0) ? 1 : -1;
      vector[idx] += sign * (1 + Math.log(1 + token.length));
    }

    // Blend in a subtle deterministic background signal based on whole text hash
    // to guarantee uniqueness and smoothness
    const globalSeed = this.hashString(text);
    let rng = globalSeed;
    for (let i = 0; i < this.dimension; i++) {
      rng = (rng * 1103515245 + 12345) & 0x7fffffff;
      vector[i] += ((rng / 0x7fffffff) - 0.5) * 0.1;
    }

    // Normalize to unit Euclidean norm
    let sumSq = 0;
    for (let i = 0; i < this.dimension; i++) {
      sumSq += vector[i] * vector[i];
    }
    const magnitude = Math.sqrt(sumSq) || 1;
    for (let i = 0; i < this.dimension; i++) {
      vector[i] /= magnitude;
    }

    return vector;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map(text => this.embed(text)));
  }

  private hashString(str: string): number {
    let hash = 2166136261;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return Math.abs(hash >>> 0);
  }

  private generateSeedVector(seed: number): number[] {
    const vector = new Array(this.dimension);
    let rng = seed;
    for (let i = 0; i < this.dimension; i++) {
      rng = (rng * 1103515245 + 12345) & 0x7fffffff;
      vector[i] = (rng / 0x7fffffff - 0.5) * 2;
    }
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0)) || 1;
    return vector.map(val => val / magnitude);
  }
}
