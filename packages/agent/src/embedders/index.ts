import { Embedder } from "@dependency-canary/shared";
import { OpenAIEmbedder } from "./openai-embedder";
import { MockEmbedder } from "./mock-embedder";

export { OpenAIEmbedder } from "./openai-embedder";
export { MockEmbedder } from "./mock-embedder";

export function createEmbedder(): Embedder {
  const geminiKey = process.env.GEMINI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  
  if (geminiKey || openaiKey) {
    return new OpenAIEmbedder(geminiKey || openaiKey);
  }
  
  return new MockEmbedder();
}