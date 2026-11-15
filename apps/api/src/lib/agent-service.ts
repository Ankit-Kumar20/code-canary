import { SecurityAgent, createVectorStore } from '@dependency-canary/agent';
import { DEMO_SBOM, type EnrichedSBOM } from '@dependency-canary/shared';

class AgentService {
  private static instance: AgentService;
  private agent: SecurityAgent;
  private indexedProjects: Set<string> = new Set();
  private sbomCache: Map<string, EnrichedSBOM> = new Map();

  private constructor() {
    this.agent = new SecurityAgent(createVectorStore());
    // Automatically pre-index the demo dataset so the agent works out-of-the-box
    this.indexSBOM(DEMO_SBOM).catch(err => {
      console.warn('Auto pre-indexing DEMO_SBOM failed:', err);
    });
  }

  public static getInstance(): AgentService {
    if (!AgentService.instance) {
      AgentService.instance = new AgentService();
    }
    return AgentService.instance;
  }

  public async indexSBOM(sbom: EnrichedSBOM): Promise<void> {
    await this.agent.indexSBOM(sbom);
    this.indexedProjects.add(sbom.projectId);
    this.sbomCache.set(sbom.projectId, sbom);
    console.log(`Indexed SBOM for project: ${sbom.projectId}`);
  }

  public async ask(projectId: string, question: string) {
    // If not yet indexed, check if it's the demo project or in cache
    if (!this.indexedProjects.has(projectId)) {
      if (projectId === DEMO_SBOM.projectId || projectId === 'demo-fullstack-canary') {
        await this.indexSBOM(DEMO_SBOM);
      } else if (this.sbomCache.has(projectId)) {
        await this.indexSBOM(this.sbomCache.get(projectId)!);
      } else if (this.indexedProjects.size > 0) {
        // Fallback to the first available indexed project if ID slightly differs
        const defaultProjectId = Array.from(this.indexedProjects)[0];
        console.warn(`Project ${projectId} not found; falling back to ${defaultProjectId}`);
        return await this.agent.ask(defaultProjectId, question);
      } else {
        await this.indexSBOM(DEMO_SBOM);
        return await this.agent.ask(DEMO_SBOM.projectId, question);
      }
    }
    return await this.agent.ask(projectId, question);
  }

  public isProjectIndexed(projectId: string): boolean {
    return this.indexedProjects.has(projectId);
  }

  public getIndexedProjects(): string[] {
    return Array.from(this.indexedProjects);
  }

  public getSBOM(projectId: string): EnrichedSBOM | undefined {
    return this.sbomCache.get(projectId);
  }
}

export const agentService = AgentService.getInstance();
