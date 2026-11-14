import { describe, it, expect } from 'vitest';
import { SecurityAgent } from '../reasoning/agent';
import { InMemoryVectorStore } from '../vector-stores/memory-store';
import { EnrichedSBOM } from '@dependency-canary/shared';

const expressSbom: EnrichedSBOM = {
  projectId: "expressjs_express",
  generatedAt: new Date().toISOString(),
  metadata: {
    languages: ["javascript", "typescript"],
    services: ["web-gateway"]
  },
  packages: [
    {
      name: "body-parser",
      version: "1.20.2",
      eco: "npm",
      direct: true,
      serviceRefs: ["web-gateway"],
      license: "MIT",
      repoUrl: "https://github.com/expressjs/body-parser",
      stats: { weeklyDownloads: 35000000 },
      risk: { abandoned: false, typoSuspicion: 0.0, newlyCreated: false, maintainerTrust: "high" },
      vulns: [
        {
          id: "CVE-2024-45590",
          source: "GHSA",
          cvss: 7.5,
          severity: "HIGH",
          published: "2024-09-10",
          summary: "body-parser vulnerable to denial of service when url encoding is enabled",
          affectedRanges: ["<1.20.3"],
          exploits: [{ type: "POC", url: "https://github.com/advisories/GHSA-qwcr-r2fm-qrc7" }],
          advisories: [{ source: "GHSA", id: "GHSA-qwcr-r2fm-qrc7" }]
        }
      ],
      requires: [],
      requiredBy: []
    },
    {
      name: "send",
      version: "0.18.0",
      eco: "npm",
      direct: true,
      serviceRefs: ["web-gateway"],
      license: "MIT",
      repoUrl: "https://github.com/pillarjs/send",
      stats: { weeklyDownloads: 25000000 },
      risk: { abandoned: false, typoSuspicion: 0.0, newlyCreated: false, maintainerTrust: "high" },
      vulns: [
        {
          id: "CVE-2024-43796",
          source: "GHSA",
          cvss: 5.3,
          severity: "MEDIUM",
          published: "2024-09-10",
          summary: "send vulnerable to regular expression denial of service",
          affectedRanges: ["<0.19.0"],
          exploits: [],
          advisories: [{ source: "GHSA", id: "GHSA-m6cv-s553-5x79" }]
        }
      ],
      requires: [],
      requiredBy: []
    }
  ],
  summary: {
    counts: {
      packages: 2,
      direct: 2,
      transitive: 0,
      vulns: 2,
      critical: 0,
      high: 1,
      medium: 1,
      low: 0
    },
    topRisks: [
      {
        package: "body-parser",
        version: "1.20.2",
        reason: "CVE-2024-45590 (HIGH) - denial of service when url encoding is enabled",
        score: 0.75
      }
    ]
  }
};

const fastapiSbom: EnrichedSBOM = {
  projectId: "fastapi_fastapi",
  generatedAt: new Date().toISOString(),
  metadata: {
    languages: ["python"],
    services: ["auth-service", "worker"]
  },
  packages: [
    {
      name: "starlette",
      version: "0.38.2",
      eco: "pypi",
      direct: true,
      serviceRefs: ["auth-service"],
      license: "BSD-3-Clause",
      repoUrl: "https://github.com/encode/starlette",
      stats: { weeklyDownloads: 15000000 },
      risk: { abandoned: false, typoSuspicion: 0.0, newlyCreated: false, maintainerTrust: "high" },
      vulns: [
        {
          id: "CVE-2024-47874",
          source: "GHSA",
          cvss: 7.5,
          severity: "HIGH",
          published: "2024-10-15",
          summary: "Starlette denial of service via multipart form with excessive parts",
          affectedRanges: ["<0.38.3"],
          exploits: [{ type: "POC", url: "https://github.com/advisories/GHSA-74m5-2c7w-9w3x" }],
          advisories: [{ source: "GHSA", id: "GHSA-74m5-2c7w-9w3x" }]
        }
      ],
      requires: [],
      requiredBy: []
    },
    {
      name: "pydantic",
      version: "2.8.2",
      eco: "pypi",
      direct: true,
      serviceRefs: ["auth-service", "worker"],
      license: "MIT",
      repoUrl: "https://github.com/pydantic/pydantic",
      stats: { weeklyDownloads: 45000000 },
      risk: { abandoned: false, typoSuspicion: 0.0, newlyCreated: false, maintainerTrust: "high" },
      vulns: [],
      requires: [],
      requiredBy: []
    }
  ],
  summary: {
    counts: {
      packages: 2,
      direct: 2,
      transitive: 0,
      vulns: 1,
      critical: 0,
      high: 1,
      medium: 0,
      low: 0
    },
    topRisks: [
      {
        package: "starlette",
        version: "0.38.2",
        reason: "CVE-2024-47874 (HIGH) - denial of service via multipart form",
        score: 0.75
      }
    ]
  }
};

describe("Real Repositories Contrast Test (Express vs FastAPI)", () => {
  it("generates ecosystem-specific, real package analyses without fallback", async () => {
    const agent = new SecurityAgent(new InMemoryVectorStore());

    // 1. Express (Node.js)
    await agent.indexSBOM(expressSbom);
    const expressAnswer = await agent.ask("expressjs_express", "What single upgrade removes the most critical CVEs?");
    expect(expressAnswer.answerMarkdown).toContain("body-parser");
    expect(expressAnswer.answerMarkdown).toContain("npm install body-parser");
    expect(expressAnswer.answerMarkdown).not.toContain("jsonwebtoken"); // Zero fallback leaks!
    expect(expressAnswer.answerMarkdown).not.toContain("pip install");

    // 2. FastAPI (Python)
    await agent.indexSBOM(fastapiSbom);
    const fastapiAnswer = await agent.ask("fastapi_fastapi", "What single upgrade removes the most critical CVEs?");
    expect(fastapiAnswer.answerMarkdown).toContain("starlette");
    expect(fastapiAnswer.answerMarkdown).toContain("pip install --upgrade starlette");
    expect(fastapiAnswer.answerMarkdown).not.toContain("jsonwebtoken"); // Zero fallback leaks!
    expect(fastapiAnswer.answerMarkdown).not.toContain("npm install");
  });
});

