import { describe, it, expect, beforeAll } from 'vitest';
import { 
  SecurityAgent,
  InMemoryVectorStore,
  MockEmbedder,
  SQLiteVectorStore
} from '../index';
import { DEMO_SBOM } from '@dependency-canary/shared';

describe('GraphRAG Security Agent & Q&A Intelligence', () => {
  let agent: SecurityAgent;
  let vectorStore: InMemoryVectorStore;

  beforeAll(async () => {
    vectorStore = new InMemoryVectorStore();
    const embedder = new MockEmbedder();
    agent = new SecurityAgent(vectorStore, undefined, embedder);
    await agent.indexSBOM(DEMO_SBOM);
  });

  describe('Suggested Queries & Reasoning Engine', () => {
    it('answers "What single upgrade removes the most critical CVEs?" with actionable plan', async () => {
      const answer = await agent.ask(
        DEMO_SBOM.projectId,
        'What single upgrade removes the most critical CVEs?'
      );

      expect(answer).toBeDefined();
      expect(answer.question).toContain('single upgrade');
      expect(answer.answerMarkdown).toContain('jsonwebtoken');
      expect(answer.answerMarkdown).toContain('CVE-2022-23529');
      expect(answer.remediationPlan.length).toBeGreaterThan(0);
      expect(answer.citations.some(c => c.id.includes('jsonwebtoken') || c.id.includes('CVE'))).toBe(true);
    });

    it('answers "Which packages pose the highest supply chain risk?" with risk ranking', async () => {
      const answer = await agent.ask(
        DEMO_SBOM.projectId,
        'Which packages pose the highest supply chain risk?'
      );

      expect(answer).toBeDefined();
      expect(answer.answerMarkdown).toContain('jsonwebtoken');
      expect(answer.keyFindings.length).toBeGreaterThan(0);
    });

    it('answers "What are the most dangerous vulnerabilities in direct dependencies?"', async () => {
      const answer = await agent.ask(
        DEMO_SBOM.projectId,
        'What are the most dangerous vulnerabilities in direct dependencies?'
      );

      expect(answer).toBeDefined();
      expect(answer.answerMarkdown).toContain('Direct');
      expect(answer.remediationPlan.length).toBeGreaterThan(0);
    });

    it('answers "How can I reduce attack surface with minimal breakage?"', async () => {
      const answer = await agent.ask(
        DEMO_SBOM.projectId,
        'How can I reduce attack surface with minimal breakage?'
      );

      expect(answer).toBeDefined();
      expect(answer.answerMarkdown).toContain('next');
      expect(answer.remediationPlan.some(s => s.estimatedBreakage === 'LOW')).toBe(true);
    });

    it('answers package-specific inquiry for jsonwebtoken', async () => {
      const answer = await agent.ask(
        DEMO_SBOM.projectId,
        'Is jsonwebtoken safe to use?'
      );

      expect(answer.answerMarkdown).toContain('CVE-2022-23529');
      expect(answer.keyFindings.some(f => f.nodeId.includes('jsonwebtoken'))).toBe(true);
    });

    it('answers CVE-specific inquiry for CVE-2024-34351', async () => {
      const answer = await agent.ask(
        DEMO_SBOM.projectId,
        'What is CVE-2024-34351 and which services are impacted?'
      );

      expect(answer.answerMarkdown).toContain('CVE-2024-34351');
      expect(answer.answerMarkdown).toContain('next');
    });
  });

  describe('SQLite Vector Store Hybrid Search', () => {
    it('indexes and searches correctly with SQLite store', async () => {
      const sqliteStore = new SQLiteVectorStore(':memory:');
      const sqliteAgent = new SecurityAgent(sqliteStore);
      await sqliteAgent.indexSBOM(DEMO_SBOM);

      const answer = await sqliteAgent.ask(
        DEMO_SBOM.projectId,
        'What are the most dangerous vulnerabilities?'
      );

      expect(answer).toBeDefined();
      expect(answer.answerMarkdown.length).toBeGreaterThan(50);
      expect(answer.remediationPlan.length).toBeGreaterThan(0);
    });
  });
});

