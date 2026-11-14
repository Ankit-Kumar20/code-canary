import OpenAI from "openai";
import { Embedder } from "@dependency-canary/shared";

export class OpenAIEmbedder implements Embedder {
  private client: OpenAI;
  private model: string;

  constructor(apiKey?: string) {
    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey) {
      this.client = new OpenAI({
        apiKey: geminiKey,
        baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
        maxRetries: 0,
      });
      this.model = process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001";
    } else {
      this.client = new OpenAI({
        apiKey: apiKey || process.env.OPENAI_API_KEY,
      });
      this.model = "text-embedding-3-small";
    }
  }

  async embed(text: string): Promise<number[]> {
    try {
      const response = await this.client.embeddings.create({
        model: this.model,
        input: text,
      });

      return response.data[0].embedding;
    } catch (err) {
      console.warn(`Embedding API call failed for model ${this.model}; using feature hash:`, err);
      const { MockEmbedder } = require("./mock-embedder");
      return new MockEmbedder().embed(text);
    }
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    try {
      const response = await this.client.embeddings.create({
        model: this.model,
        input: texts,
      });

      return response.data.map(item => item.embedding);
    } catch (err) {
      console.warn(`Batch embedding API call failed for model ${this.model}; using feature hash:`, err);
      const { MockEmbedder } = require("./mock-embedder");
      return new MockEmbedder().embedBatch(texts);
    }
  }
}