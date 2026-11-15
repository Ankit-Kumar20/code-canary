import { SecurityAgent } from '@dependency-canary/agent';
import { DEMO_SBOM, type EnrichedSBOM } from '@dependency-canary/shared';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { sboms } from '@/db/schema';
import { PostgresVectorStore } from './postgres-vector-store';

// SBOMs and their RAG embeddings live in Postgres; this service keeps no project state in memory.
class AgentService {
  private static instance: AgentService;
  private vectorStore = new PostgresVectorStore();
  private agent = new SecurityAgent(this.vectorStore);

  private constructor() {
    // Make sure the demo project is stored so the agent works out of the box
    this.ensureIndexed(DEMO_SBOM).catch(err => {
      console.warn('Storing DEMO_SBOM failed:', err);
    });
  }

  public static getInstance(): AgentService {
    if (!AgentService.instance) {
      AgentService.instance = new AgentService();
    }
    return AgentService.instance;
  }

  // Stores a (re)scanned SBOM and replaces its embeddings.
  public async indexSBOM(sbom: EnrichedSBOM): Promise<void> {
    await db
      .insert(sboms)
      .values({ projectId: sbom.projectId, sbom })
      .onConflictDoUpdate({
        target: sboms.projectId,
        set: { sbom, updatedAt: sql`now()` },
      });
    await this.vectorStore.deleteProject(sbom.projectId);
    await this.agent.indexSBOM(sbom);
    console.log(`Indexed SBOM for project: ${sbom.projectId}`);
  }

  public async ask(projectId: string, question: string) {
    let sbom = await this.getSBOM(projectId);
    if (!sbom) {
      console.warn(`Project ${projectId} not found; falling back to ${DEMO_SBOM.projectId}`);
      sbom = DEMO_SBOM;
      await this.ensureIndexed(sbom);
    } else if (!(await this.vectorStore.hasProject(sbom.projectId))) {
      await this.agent.indexSBOM(sbom);
    }
    return this.agent.ask(sbom.projectId, question, sbom);
  }

  public async getSBOM(projectId: string): Promise<EnrichedSBOM | undefined> {
    const [row] = await db
      .select({ sbom: sboms.sbom })
      .from(sboms)
      .where(eq(sboms.projectId, projectId))
      .limit(1);
    return row?.sbom;
  }

  private async ensureIndexed(sbom: EnrichedSBOM): Promise<void> {
    if (!(await this.getSBOM(sbom.projectId)) || !(await this.vectorStore.hasProject(sbom.projectId))) {
      await this.indexSBOM(sbom);
    }
  }
}

export const agentService = AgentService.getInstance();
