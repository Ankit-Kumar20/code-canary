import { EnrichedSBOM } from "../types/sbom";

export const DEMO_SBOM: EnrichedSBOM = {
  projectId: "demo-fullstack-canary",
  generatedAt: new Date().toISOString(),
  metadata: {
    languages: ["TypeScript", "Rust", "Go"],
    services: ["web-gateway", "auth-service", "worker"],
  },
  packages: [
    {
      name: "react",
      version: "18.2.0",
      eco: "npm",
      direct: true,
      license: "MIT",
      serviceRefs: ["web-gateway"],
      requires: [{ name: "typescript", version: "5.4.2" }],
      requiredBy: [{ name: "next", version: "14.1.0" }],
      vulns: [],
      stats: { lastCommit: "2024-04-10", weeklyDownloads: 22000000 },
      risk: { abandoned: false, typoSuspicion: 0.0, newlyCreated: false, maintainerTrust: "high" },
    },
    {
      name: "next",
      version: "14.1.0",
      eco: "npm",
      direct: true,
      license: "MIT",
      serviceRefs: ["web-gateway"],
      requires: [
        { name: "react", version: "18.2.0" },
        { name: "typescript", version: "5.4.2" },
      ],
      requiredBy: [],
      vulns: [
        {
          id: "CVE-2024-34351",
          source: "NVD",
          cvss: 7.5,
          severity: "HIGH",
          published: "2024-05-10",
          summary: "Server Actions SSRF via arbitrary Host header manipulation in Next.js applications",
          affectedRanges: [">=13.4.0 <14.1.1"],
          exploits: [
            { type: "POC", url: "https://github.com/vercel/next.js/security/advisories/GHSA-fr5h-rqp8-gw6v" }
          ],
          advisories: [
            { source: "GHSA", id: "GHSA-fr5h-rqp8-gw6v" }
          ]
        },
      ],
      stats: { lastCommit: "2024-05-01", weeklyDownloads: 5800000 },
      risk: { abandoned: false, typoSuspicion: 0.0, newlyCreated: false, maintainerTrust: "high" },
    },
    {
      name: "jsonwebtoken",
      version: "8.5.1",
      eco: "npm",
      direct: true,
      license: "MIT",
      serviceRefs: ["auth-service"],
      requires: [],
      requiredBy: [],
      vulns: [
        {
          id: "CVE-2022-23529",
          source: "NVD",
          cvss: 9.8,
          severity: "CRITICAL",
          published: "2022-12-21",
          summary: "Arbitrary code execution via maliciously crafted secret or key parameter in jwt.verify",
          affectedRanges: ["<=8.5.1"],
          exploits: [
            { type: "POC", url: "https://github.com/auth0/node-jsonwebtoken/security/advisories/GHSA-27h2-hvpr-p74q" }
          ],
          advisories: [
            { source: "GHSA", id: "GHSA-27h2-hvpr-p74q" }
          ]
        },
      ],
      stats: { lastCommit: "2023-01-15", weeklyDownloads: 14000000 },
      risk: { abandoned: false, typoSuspicion: 0.0, newlyCreated: false, maintainerTrust: "high" },
    },
    {
      name: "axios",
      version: "0.21.1",
      eco: "npm",
      direct: false,
      license: "MIT",
      serviceRefs: ["auth-service", "worker"],
      requires: [],
      requiredBy: [{ name: "jsonwebtoken", version: "8.5.1" }],
      vulns: [
        {
          id: "CVE-2023-45857",
          source: "NVD",
          cvss: 6.5,
          severity: "MEDIUM",
          published: "2023-11-01",
          summary: "Cross-site request forgery and header leakage across relative redirects",
          affectedRanges: ["<1.6.0"],
          exploits: [],
          advisories: [
            { source: "GHSA", id: "GHSA-wf5p-g6vw-rhxx" }
          ]
        },
      ],
      stats: { lastCommit: "2024-02-10", weeklyDownloads: 48000000 },
      risk: { abandoned: false, typoSuspicion: 0.0, newlyCreated: false, maintainerTrust: "high" },
    },
    {
      name: "typescript",
      version: "5.4.2",
      eco: "npm",
      direct: false,
      license: "Apache-2.0",
      serviceRefs: ["web-gateway", "auth-service", "worker"],
      requires: [],
      requiredBy: [
        { name: "react", version: "18.2.0" },
        { name: "next", version: "14.1.0" },
      ],
      vulns: [],
      stats: { lastCommit: "2024-03-01", weeklyDownloads: 42000000 },
      risk: { abandoned: false, typoSuspicion: 0.0, newlyCreated: false, maintainerTrust: "high" },
    },
    {
      name: "d3",
      version: "7.8.5",
      eco: "npm",
      direct: true,
      license: "ISC",
      serviceRefs: ["web-gateway"],
      requires: [],
      requiredBy: [],
      vulns: [],
      stats: { lastCommit: "2023-11-20", weeklyDownloads: 2100000 },
      risk: { abandoned: false, typoSuspicion: 0.0, newlyCreated: false, maintainerTrust: "high" },
    },
    {
      name: "tailwindcss",
      version: "3.4.0",
      eco: "npm",
      direct: true,
      license: "MIT",
      serviceRefs: ["web-gateway"],
      requires: [],
      requiredBy: [],
      vulns: [],
      stats: { lastCommit: "2024-01-10", weeklyDownloads: 8000000 },
      risk: { abandoned: false, typoSuspicion: 0.0, newlyCreated: false, maintainerTrust: "high" },
    },
    {
      name: "lodash",
      version: "4.17.21",
      eco: "npm",
      direct: true,
      license: "MIT",
      serviceRefs: ["worker"],
      requires: [],
      requiredBy: [],
      vulns: [],
      stats: { lastCommit: "2021-02-20", weeklyDownloads: 50000000 },
      risk: { abandoned: false, typoSuspicion: 0.0, newlyCreated: false, maintainerTrust: "high" },
    },
  ],
  summary: {
    counts: {
      packages: 8,
      direct: 6,
      transitive: 2,
      vulns: 3,
      critical: 1,
      high: 1,
      medium: 1,
      low: 0,
    },
    topRisks: [
      {
        package: "jsonwebtoken",
        version: "8.5.1",
        score: 0.98,
        reason: "Critical RCE vulnerability (CVE-2022-23529) via unrestricted key verification",
      },
      {
        package: "next",
        version: "14.1.0",
        score: 0.75,
        reason: "High severity Server Actions SSRF (CVE-2024-34351)",
      },
      {
        package: "axios",
        version: "0.21.1",
        score: 0.45,
        reason: "Medium severity credential leakage on cross-origin redirects",
      },
    ],
  },
};

