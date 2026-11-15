import { EnrichedSBOM, Package, Vulnerability, VectorDocument } from "@dependency-canary/shared";

export class SBOMProcessor {
  processToDocuments(sbom: EnrichedSBOM): VectorDocument[] {
    const documents: VectorDocument[] = [];

    // 1. Overall Project Document
    documents.push({
      id: `project:${sbom.projectId}`,
      content: this.createProjectSummary(sbom),
      metadata: {
        type: "project",
        projectId: sbom.projectId,
        ...sbom.metadata,
      },
    });

    // 2. Microservice Documents
    for (const service of sbom.metadata.services || []) {
      documents.push({
        id: `service:${sbom.projectId}:${service}`,
        content: this.createServiceSummary(sbom, service),
        metadata: {
          type: "service",
          projectId: sbom.projectId,
          service,
        },
      });
    }

    // 3. Package Documents (one per package in SBOM)
    for (const pkg of sbom.packages) {
      documents.push({
        id: `package:${sbom.projectId}:${pkg.name}:${pkg.version}`,
        content: this.createPackageSummary(pkg, sbom),
        metadata: {
          type: "package",
          projectId: sbom.projectId,
          packageName: pkg.name,
          packageVersion: pkg.version,
          ecosystem: pkg.eco,
          isDirect: pkg.direct,
          services: pkg.serviceRefs || [],
          severity: this.getHighestSeverity(pkg),
          requiresCount: pkg.requires?.length || 0,
          requiredByCount: pkg.requiredBy?.length || 0,
        },
      });

      // 4. Vulnerability Documents
      if (pkg.vulns) {
        for (const vuln of pkg.vulns) {
          documents.push({
            id: `vuln:${sbom.projectId}:${vuln.id}`,
            content: this.createVulnerabilityContent(pkg, vuln, sbom),
            metadata: {
              type: "vulnerability",
              projectId: sbom.projectId,
              vulnerabilityId: vuln.id,
              packageName: pkg.name,
              packageVersion: pkg.version,
              severity: vuln.severity,
              cvss: vuln.cvss,
              hasExploits: (vuln.exploits?.length || 0) > 0,
              services: pkg.serviceRefs || [],
            },
          });
        }
      }
    }

    return documents;
  }

  private createProjectSummary(sbom: EnrichedSBOM): string {
    const { summary } = sbom;
    const topRisksStr = summary.topRisks && summary.topRisks.length > 0
      ? summary.topRisks.map(r => `${r.package}@${r.version} (${r.reason})`).join("; ")
      : "No top risks flagged";

    return `Project Security Analysis Summary:
- Project ID: ${sbom.projectId}
- Total packages: ${summary.counts.packages} (${summary.counts.direct} direct, ${summary.counts.transitive} transitive)
- Programming Languages: ${sbom.metadata.languages.join(", ")}
- Deployed Services: ${sbom.metadata.services.join(", ")}
- Vulnerability Overview: ${summary.counts.vulns} total (${summary.counts.critical} critical, ${summary.counts.high} high, ${summary.counts.medium || 0} medium, ${summary.counts.low || 0} low)
- Critical Risk Items: ${topRisksStr}`;
  }

  private createServiceSummary(sbom: EnrichedSBOM, service: string): string {
    const packages = sbom.packages.filter(pkg => pkg.serviceRefs?.includes(service));
    const vulnCount = packages.reduce((sum, pkg) => sum + (pkg.vulns?.length || 0), 0);
    const directPackages = packages.filter(pkg => pkg.direct);

    return `Service "${service}" Security Profile:
- Dependencies: ${packages.length} packages (${directPackages.length} direct, ${packages.length - directPackages.length} transitive)
- Known Vulnerabilities: ${vulnCount} total
- Direct Package Entrypoints: ${directPackages.map(pkg => `${pkg.name}@${pkg.version}`).join(", ") || "None"}
- Vulnerable Packages in Service: ${packages.filter(p => p.vulns && p.vulns.length > 0).map(p => `${p.name}@${p.version} (${p.vulns!.map(v => v.id).join(", ")})`).join("; ") || "None"}`;
  }

  private createPackageSummary(pkg: Package, sbom: EnrichedSBOM): string {
    const vulnSummary = pkg.vulns && pkg.vulns.length > 0
      ? `Vulnerabilities: ${pkg.vulns.length} total (${pkg.vulns.filter(v => v.severity === "CRITICAL").length} critical, ${pkg.vulns.filter(v => v.severity === "HIGH").length} high, ${pkg.vulns.filter(v => v.severity === "MEDIUM").length} medium)`
      : "No known vulnerabilities (Clean)";

    const riskFactors = [];
    if (pkg.risk?.abandoned) riskFactors.push("abandoned / unmaintained");
    if (pkg.risk?.newlyCreated) riskFactors.push("newly created package");
    if (pkg.risk?.typoSuspicion && pkg.risk.typoSuspicion > 0.3) riskFactors.push("possible typosquatting risk");
    if (pkg.risk?.maintainerTrust === "low") riskFactors.push("low maintainer trust");

    const riskSummary = riskFactors.length > 0 ? `Risk factors: ${riskFactors.join(", ")}` : "Risk profile: Normal";

    // Trace reverse dependencies to see who depends on this package
    const parentPackages = sbom.packages
      .filter(p => p.requires?.some(r => r.name === pkg.name))
      .map(p => `${p.name}@${p.version} (${p.direct ? "Direct" : "Transitive"})`);

    const childPackages = (pkg.requires || []).map(r => `${r.name}@${r.version}`);

    return `Package: ${pkg.name}@${pkg.version}
- Ecosystem: ${pkg.eco}
- Dependency Type: ${pkg.direct ? "Direct root dependency" : "Transitive dependency"}
- License: ${pkg.license || "Unknown"}
- Services Exposed: ${pkg.serviceRefs?.join(", ") || "Shared / Global"}
- ${vulnSummary}
- ${riskSummary}
- Dependencies Required (${childPackages.length}): ${childPackages.join(", ") || "None"}
- Depended On By (${parentPackages.length}): ${parentPackages.join(", ") || "None (Root)"}`;
  }

  private createVulnerabilityContent(pkg: Package, vuln: Vulnerability, sbom: EnrichedSBOM): string {
    const exploitInfo = vuln.exploits && vuln.exploits.length > 0
      ? `Exploit Status: AVAILABLE (${vuln.exploits.map(e => `${e.type}: ${e.url}`).join(", ")})`
      : "Exploit Status: No known public weaponized exploit";

    // Direct root parents that introduce this vulnerable package
    const rootParents = pkg.direct 
      ? [`${pkg.name}@${pkg.version} (Direct)`]
      : sbom.packages.filter(p => p.direct && p.requires?.some(r => r.name === pkg.name)).map(p => `${p.name}@${p.version}`);

    return `Vulnerability Record: ${vuln.id}
- Package Affected: ${pkg.name}@${pkg.version} (${pkg.direct ? "Direct" : "Transitive"})
- Severity Tier: ${vuln.severity} (CVSS score: ${vuln.cvss})
- Published Date: ${vuln.published}
- Vulnerability Summary: ${vuln.summary}
- Affected Version Ranges: ${vuln.affectedRanges.join(", ")}
- ${exploitInfo}
- Exposed Microservices: ${pkg.serviceRefs?.join(", ") || "All services"}
- Root Dependency Entrypoints: ${rootParents.join(", ") || "Indirect dependency tree"}`;
  }

  private getHighestSeverity(pkg: Package): string {
    if (!pkg.vulns?.length) return "NONE";

    const severityOrder = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

    for (const severity of severityOrder) {
      if (pkg.vulns.some(v => v.severity === severity)) {
        return severity;
      }
    }

    return "NONE";
  }
}
