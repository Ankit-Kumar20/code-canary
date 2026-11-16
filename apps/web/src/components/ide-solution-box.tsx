'use client';

import { useMemo, useState } from 'react';
import type { Package, Vulnerability, EnrichedSBOM } from '@dependency-canary/shared';

/* -------------------------------------------------------------------------- */
/*                           Pure Helper Functions                            */
/* (exported so the vitest unit tests can import them directly)              */
/* -------------------------------------------------------------------------- */

export function extractSafeVersion(vuln?: Vulnerability): string {
  if (!vuln || !vuln.affectedRanges || vuln.affectedRanges.length === 0) {
    return 'latest';
  }
  for (const range of vuln.affectedRanges) {
    const match = range.match(/(?:<|<=)\s*v?([0-9]+(?:\.[0-9]+)+(?:-[a-zA-Z0-9.]+)?)/);
    if (match && match[1]) {
      return match[1];
    }
  }
  return 'latest';
}

export function getManifestFilename(eco: string): string {
  switch (eco.toLowerCase()) {
    case 'npm':
    case 'node':
    case 'javascript':
    case 'typescript':
      return 'package.json';
    case 'pypi':
    case 'python':
      return 'requirements.txt / pyproject.toml';
    case 'cargo':
    case 'rust':
      return 'Cargo.toml';
    case 'go':
    case 'golang':
    case 'gomod':
      return 'go.mod';
    default:
      return 'dependency manifest file';
  }
}

export function getUpgradeCommand(eco: string, pkgName: string, safeVersion: string): string {
  const versionSpec = safeVersion === 'latest' ? 'latest' : `^${safeVersion}`;
  switch (eco.toLowerCase()) {
    case 'npm':
    case 'node':
      return `npm install ${pkgName}@${versionSpec}`;
    case 'pypi':
    case 'python':
      return safeVersion === 'latest'
        ? `pip install --upgrade ${pkgName}`
        : `pip install --upgrade "${pkgName}>=${safeVersion}"`;
    case 'cargo':
    case 'rust':
      return `cargo update -p ${pkgName}`;
    case 'go':
    case 'golang':
    case 'gomod':
      return safeVersion === 'latest'
        ? `go get ${pkgName}@latest`
        : `go get ${pkgName}@v${safeVersion}`;
    default:
      return `Update ${pkgName} to version ${safeVersion}`;
  }
}

export function buildSingleFixPrompt(
  projectId: string,
  pkg: Package,
  vuln: Vulnerability,
): string {
  const safeVersion = extractSafeVersion(vuln);
  const manifest = getManifestFilename(pkg.eco);
  const cmd = getUpgradeCommand(pkg.eco, pkg.name, safeVersion);
  const depType = pkg.direct ? 'Direct manifest requirement' : 'Transitive dependency';
  const ecoLabel = pkg.eco.toUpperCase();

  return `Fix the following security vulnerability in ${projectId}:

- Target Package: ${pkg.name}@${pkg.version} (${ecoLabel})
- Dependency Type: ${depType}
- Advisory / CVE: ${vuln.id} (${vuln.severity} severity, CVSS ${vuln.cvss.toFixed(1)})
- Root Cause / Summary: ${vuln.summary}
- Affected Versions: ${vuln.affectedRanges.join(', ')}
- Target Manifest: ${manifest}
- Safe Target Version: >= ${safeVersion}
- Recommended Upgrade Command: \`${cmd}\`

Instructions for IDE / AI Assistant:
1. Locate "${pkg.name}" in ${manifest} (or add an override/resolution for transitive packages).
2. Update the version constraint to safe version >= ${safeVersion}.
3. Run \`${cmd}\` to sync lockfiles.
4. Review codebase for any deprecated API usage or breaking changes.
5. Run test suite to verify the fix works cleanly without breaking functionality.`;
}

export function buildMultiFixPrompt(
  projectId: string,
  targets: Array<{ pkg: Package; vuln: Vulnerability }>,
): string {
  const lines = targets.map(({ pkg, vuln }) => {
    const safeVersion = extractSafeVersion(vuln);
    const manifest = getManifestFilename(pkg.eco);
    const cmd = getUpgradeCommand(pkg.eco, pkg.name, safeVersion);
    return `• [${vuln.severity}] ${pkg.name}@${pkg.version} (${vuln.id}, CVSS ${vuln.cvss.toFixed(1)})
  Summary: ${vuln.summary}
  Action: Upgrade to >= ${safeVersion} in ${manifest}
  Command: ${cmd}`;
  });

  return `Fix the following security vulnerabilities for ${projectId}:

${lines.join('\n\n')}

Instructions for IDE / AI Assistant:
1. Update each flagged dependency to its recommended safe version in the respective manifest file.
2. Run the specified upgrade commands to regenerate lockfiles.
3. Check for any breaking changes across affected components.
4. Verify tests pass and commit the security patches.`;
}

export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to execCommand
  }

  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/*                               Clean SVG Icons                              */
/* -------------------------------------------------------------------------- */
function IconCopy({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  );
}

function IconCheck({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*                            CopyButton (shared)                             */
/* -------------------------------------------------------------------------- */
function CopyButton({
  text,
  label = 'Copy Fix Prompt',
  compact = false,
  variant = 'default',
}: {
  text: string;
  label?: string;
  compact?: boolean;
  variant?: 'default' | 'primary';
}) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  const handleCopy = async () => {
    const ok = await copyToClipboard(text);
    setState(ok ? 'copied' : 'failed');
    setTimeout(() => setState('idle'), 2500);
  };

  if (compact) {
    return (
      <button
        type="button"
        onClick={handleCopy}
        title={label}
        className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium transition-all duration-150 ${
          state === 'copied'
            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            : state === 'failed'
              ? 'bg-rose-50 text-rose-700 border border-rose-200'
              : 'bg-surface hover:bg-hover text-ink-muted hover:text-ink border border-line shadow-xs'
        }`}
      >
        {state === 'copied' ? (
          <>
            <IconCheck className="w-3 h-3 text-emerald-600" />
            <span>Copied</span>
          </>
        ) : (
          <>
            <IconCopy className="w-3 h-3 text-ink-muted" />
            <span>{label}</span>
          </>
        )}
      </button>
    );
  }

  const isPrimary = variant === 'primary';

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`inline-flex h-9 items-center justify-center gap-2 rounded-lg px-4 text-[12.5px] font-semibold shadow-xs transition-all duration-150 active:scale-[0.99] focus-visible:outline focus-visible:outline-2 ${
        state === 'copied'
          ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
          : state === 'failed'
            ? 'border border-rose-200 bg-rose-50 text-rose-700'
            : isPrimary
              ? 'bg-[#0022f4] hover:bg-[#001ad4] text-white focus-visible:outline-[#0022f4]'
              : 'border border-line bg-surface text-ink hover:bg-hover hover:border-line-strong'
      }`}
    >
      {state === 'copied' ? (
        <>
          <IconCheck className="w-4 h-4 text-emerald-600" />
          <span>Copied to Clipboard!</span>
        </>
      ) : (
        <>
          <IconCopy className="w-3.5 h-3.5 opacity-80" />
          <span>{label}</span>
        </>
      )}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*                     IdeSolutionBox (Redesigned Section)                    */
/* -------------------------------------------------------------------------- */
interface IdeSolutionBoxProps {
  sbom: EnrichedSBOM;
}

const SEVERITY_ORDER: Record<string, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

export default function IdeSolutionBox({ sbom }: IdeSolutionBoxProps) {
  // Collect all targets for bulk prompt
  const allTargets = useMemo(() => {
    return sbom.packages
      .flatMap(pkg => (pkg.vulns ?? []).map(vuln => ({ pkg, vuln })))
      .sort((a, b) => {
        return (SEVERITY_ORDER[b.vuln.severity] ?? 0) - (SEVERITY_ORDER[a.vuln.severity] ?? 0) || b.vuln.cvss - a.vuln.cvss;
      });
  }, [sbom]);

  // Group unique packages with vulnerabilities
  const packageGroups = useMemo(() => {
    const map = new Map<string, { pkg: Package; vulns: Vulnerability[] }>();
    for (const pkg of sbom.packages) {
      if (pkg.vulns && pkg.vulns.length > 0) {
        const key = `${pkg.name}@${pkg.version}`;
        if (!map.has(key)) {
          map.set(key, { pkg, vulns: [...pkg.vulns] });
        } else {
          map.get(key)!.vulns.push(...pkg.vulns);
        }
      }
    }

    return Array.from(map.values())
      .map(({ pkg, vulns }) => {
        const sortedVulns = [...vulns].sort(
          (a, b) => (SEVERITY_ORDER[b.severity] ?? 0) - (SEVERITY_ORDER[a.severity] ?? 0) || b.cvss - a.cvss,
        );
        const worst = sortedVulns[0];
        return {
          pkg,
          vulns: sortedVulns,
          worstSeverity: worst.severity,
          worstCvss: worst.cvss,
        };
      })
      .sort((a, b) => {
        return (
          (SEVERITY_ORDER[b.worstSeverity] ?? 0) - (SEVERITY_ORDER[a.worstSeverity] ?? 0) ||
          b.worstCvss - a.worstCvss ||
          b.vulns.length - a.vulns.length
        );
      });
  }, [sbom]);

  const [selectedSeverity, setSelectedSeverity] = useState<string>('ALL');
  const [selectedPkgIndex, setSelectedPkgIndex] = useState(0);
  const [selectedVulnIndex, setSelectedVulnIndex] = useState(0);
  const [promptOpen, setPromptOpen] = useState(false);

  // Filter package groups by severity tab
  const filteredGroups = useMemo(() => {
    if (selectedSeverity === 'ALL') return packageGroups;
    return packageGroups.filter(g =>
      g.vulns.some(v => v.severity.toUpperCase() === selectedSeverity),
    );
  }, [packageGroups, selectedSeverity]);

  // Safe active selection
  const activeGroup = filteredGroups[selectedPkgIndex] ?? filteredGroups[0] ?? packageGroups[0];
  const activeVuln = activeGroup?.vulns[selectedVulnIndex] ?? activeGroup?.vulns[0];

  if (!activeGroup || !activeVuln) return null;

  const multiPrompt = buildMultiFixPrompt(sbom.projectId, allTargets);
  const singlePrompt = buildSingleFixPrompt(sbom.projectId, activeGroup.pkg, activeVuln);
  const safeVersion = extractSafeVersion(activeVuln);
  const cmd = getUpgradeCommand(activeGroup.pkg.eco, activeGroup.pkg.name, safeVersion);

  // Severity counts
  const counts = {
    all: allTargets.length,
    critical: allTargets.filter(t => t.vuln.severity === 'CRITICAL').length,
    high: allTargets.filter(t => t.vuln.severity === 'HIGH').length,
    medium: allTargets.filter(t => t.vuln.severity === 'MEDIUM').length,
    low: allTargets.filter(t => t.vuln.severity === 'LOW').length,
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity.toUpperCase()) {
      case 'CRITICAL':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'HIGH':
        return 'bg-amber-50 text-amber-800 border-amber-200';
      case 'MEDIUM':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  return (
    <section className="flex flex-col rounded-xl border border-line bg-surface shadow-xs overflow-hidden">
      
      {/* -------------------------------------------------------------------- */}
      {/* 1. Header & Global Actions                                           */}
      {/* -------------------------------------------------------------------- */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-6 py-4 border-b border-line bg-surface">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-[15px] font-bold tracking-tight text-ink">
              1-Click IDE Fix Prompt
            </h2>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-ink-muted">
              {allTargets.length} total targets
            </span>
          </div>
          <p className="mt-0.5 text-[12.5px] text-ink-muted">
            Structured, copy-ready remediation prompts and upgrade commands for Cursor, Copilot, or Claude.
          </p>
        </div>

        {allTargets.length > 1 && (
          <div className="shrink-0">
            <CopyButton text={multiPrompt} label={`Copy Fix for All ${allTargets.length} Targets`} />
          </div>
        )}
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* 2. Structured Severity Filter & Package Selector                     */}
      {/* -------------------------------------------------------------------- */}
      <div className="px-6 py-3.5 bg-canvas/30 border-b border-line flex flex-col gap-3">
        {/* Severity Category Filter */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-ink-faint mr-2">
            Filter:
          </span>
          <button
            type="button"
            onClick={() => {
              setSelectedSeverity('ALL');
              setSelectedPkgIndex(0);
              setSelectedVulnIndex(0);
            }}
            className={`rounded-lg px-2.5 py-1 text-[11.5px] font-semibold transition-all ${
              selectedSeverity === 'ALL'
                ? 'bg-ink text-white shadow-xs'
                : 'bg-surface text-ink-muted hover:text-ink hover:bg-hover border border-line'
            }`}
          >
            All ({counts.all})
          </button>

          {counts.critical > 0 && (
            <button
              type="button"
              onClick={() => {
                setSelectedSeverity('CRITICAL');
                setSelectedPkgIndex(0);
                setSelectedVulnIndex(0);
              }}
              className={`rounded-lg px-2.5 py-1 text-[11.5px] font-semibold transition-all ${
                selectedSeverity === 'CRITICAL'
                  ? 'bg-rose-700 text-white shadow-xs'
                  : 'bg-surface text-rose-700 hover:bg-rose-50 border border-rose-200'
              }`}
            >
              Critical ({counts.critical})
            </button>
          )}

          {counts.high > 0 && (
            <button
              type="button"
              onClick={() => {
                setSelectedSeverity('HIGH');
                setSelectedPkgIndex(0);
                setSelectedVulnIndex(0);
              }}
              className={`rounded-lg px-2.5 py-1 text-[11.5px] font-semibold transition-all ${
                selectedSeverity === 'HIGH'
                  ? 'bg-amber-800 text-white shadow-xs'
                  : 'bg-surface text-amber-800 hover:bg-amber-50 border border-amber-200'
              }`}
            >
              High ({counts.high})
            </button>
          )}

          {counts.medium > 0 && (
            <button
              type="button"
              onClick={() => {
                setSelectedSeverity('MEDIUM');
                setSelectedPkgIndex(0);
                setSelectedVulnIndex(0);
              }}
              className={`rounded-lg px-2.5 py-1 text-[11.5px] font-semibold transition-all ${
                selectedSeverity === 'MEDIUM'
                  ? 'bg-blue-700 text-white shadow-xs'
                  : 'bg-surface text-blue-700 hover:bg-blue-50 border border-blue-200'
              }`}
            >
              Medium ({counts.medium})
            </button>
          )}

          {counts.low > 0 && (
            <button
              type="button"
              onClick={() => {
                setSelectedSeverity('LOW');
                setSelectedPkgIndex(0);
                setSelectedVulnIndex(0);
              }}
              className={`rounded-lg px-2.5 py-1 text-[11.5px] font-semibold transition-all ${
                selectedSeverity === 'LOW'
                  ? 'bg-slate-700 text-white shadow-xs'
                  : 'bg-surface text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              Low ({counts.low})
            </button>
          )}
        </div>

        {/* Unique Package Chips (Organized, no duplicates!) */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-0.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-ink-faint shrink-0 mr-1">
            Packages:
          </span>
          <div className="flex flex-wrap gap-1.5">
            {filteredGroups.map((group, idx) => {
              const isSelected = group.pkg.name === activeGroup.pkg.name;
              const dotColor =
                group.worstSeverity === 'CRITICAL'
                  ? 'bg-rose-500'
                  : group.worstSeverity === 'HIGH'
                    ? 'bg-amber-500'
                    : group.worstSeverity === 'MEDIUM'
                      ? 'bg-blue-500'
                      : 'bg-slate-400';

              return (
                <button
                  key={`${group.pkg.name}-${group.pkg.version}`}
                  type="button"
                  onClick={() => {
                    setSelectedPkgIndex(idx);
                    setSelectedVulnIndex(0);
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-[12px] font-medium transition-all ${
                    isSelected
                      ? 'bg-ink text-white font-semibold shadow-xs'
                      : 'bg-surface hover:bg-hover text-ink border border-line hover:border-line-strong'
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
                  <span className="font-mono text-[11.5px]">{group.pkg.name}</span>
                  <span className={`text-[10px] ${isSelected ? 'text-white/70' : 'text-ink-faint'}`}>
                    ({group.vulns.length})
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* 3. Selected Package Remediation Details                              */}
      {/* -------------------------------------------------------------------- */}
      <div className="p-6 flex flex-col gap-5">
        
        {/* Detail Header: Package Meta + Severity + Vulnerability Selector */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-line">
          <div>
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-ink-faint block">
              Target Package
            </span>
            <div className="flex flex-wrap items-center gap-2.5 mt-1">
              <span className="font-mono text-[15px] font-bold text-ink">
                {activeGroup.pkg.name}
              </span>
              <span className="font-mono text-[11.5px] text-ink-muted bg-canvas border border-line rounded px-1.5 py-0.5">
                v{activeGroup.pkg.version}
              </span>
              <span className="rounded bg-canvas border border-line px-1.5 py-0.5 text-[10.5px] font-medium text-ink-muted uppercase">
                {activeGroup.pkg.eco}
              </span>
              <span className="rounded bg-canvas border border-line px-1.5 py-0.5 text-[10.5px] font-medium text-ink-muted">
                {activeGroup.pkg.direct ? 'Direct dependency' : 'Transitive dependency'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase ${getSeverityBadge(activeVuln.severity)}`}>
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              {activeVuln.severity}
            </span>
            <span className="font-mono text-[11.5px] text-ink-muted">
              {activeVuln.id} · CVSS {activeVuln.cvss.toFixed(1)}
            </span>
          </div>
        </div>

        {/* If this package has multiple vulnerabilities, show clean sub-selector */}
        {activeGroup.vulns.length > 1 && (
          <div>
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-ink-faint block mb-2">
              Vulnerabilities in this Package ({activeGroup.vulns.length}):
            </span>
            <div className="flex flex-wrap gap-1.5">
              {activeGroup.vulns.map((v, i) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setSelectedVulnIndex(i)}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-mono transition-all ${
                    i === selectedVulnIndex
                      ? 'bg-ink text-white font-semibold shadow-xs'
                      : 'bg-canvas hover:bg-hover text-ink-muted border border-line'
                  }`}
                >
                  {v.id} (CVSS {v.cvss.toFixed(1)})
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Vulnerability Description */}
        <div className="rounded-lg border border-line bg-canvas/30 p-4">
          <span className="text-[10.5px] font-bold uppercase tracking-wider text-ink-faint block mb-1">
            Advisory Summary
          </span>
          <p className="text-[13px] text-ink leading-relaxed font-normal">
            {activeVuln.summary}
          </p>
        </div>

        {/* Upgrade Command Strip */}
        <div>
          <span className="text-[10.5px] font-bold uppercase tracking-wider text-ink-faint block mb-1.5">
            Recommended Upgrade Command ({getManifestFilename(activeGroup.pkg.eco)})
          </span>
          <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-canvas/60 px-4 py-2.5 font-mono text-[12.5px] text-ink">
            <div className="flex items-center gap-2 overflow-x-auto">
              <span className="text-ink-faint select-none font-bold">$</span>
              <span>{cmd}</span>
            </div>
            <CopyButton text={cmd} label="Copy" compact />
          </div>
        </div>

        {/* AI Fix Prompt Preview (Collapsible) */}
        <div className="rounded-lg border border-line overflow-hidden">
          <button
            type="button"
            onClick={() => setPromptOpen(o => !o)}
            className="flex w-full items-center justify-between px-4 py-2.5 bg-canvas/40 text-[12px] font-medium text-ink-muted hover:text-ink transition-colors"
          >
            <span className="font-semibold text-ink">AI Assistant Fix Prompt (Cursor / Copilot)</span>
            <span className="font-mono text-[11px] text-ink-faint">{promptOpen ? '▲ Hide Prompt' : '▼ Preview Prompt'}</span>
          </button>
          {promptOpen && (
            <pre className="overflow-x-auto border-t border-line bg-canvas p-4 font-mono text-[11.5px] text-ink leading-relaxed whitespace-pre-wrap">
              {singlePrompt}
            </pre>
          )}
        </div>

        {/* Bottom Primary Action Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          <span className="text-[11.5px] text-ink-faint">
            Target manifest: <code className="font-mono text-ink-muted">{getManifestFilename(activeGroup.pkg.eco)}</code>
          </span>
          <CopyButton
            text={singlePrompt}
            label={`Copy Fix Prompt for ${activeGroup.pkg.name}`}
            variant="primary"
          />
        </div>

      </div>

    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*              Inline compact copy button for Vuln table rows               */
/* -------------------------------------------------------------------------- */
export function VulnRowCopyButton({ pkg, vuln, projectId }: { pkg: Package; vuln: Vulnerability; projectId: string }) {
  const prompt = buildSingleFixPrompt(projectId, pkg, vuln);
  return <CopyButton text={prompt} compact />;
}

/* -------------------------------------------------------------------------- */
/*              Inline copy button for PackageDetail CVE cards               */
/* -------------------------------------------------------------------------- */
export function PackageDetailCopyButton({ pkg, vuln, projectId }: { pkg: Package; vuln: Vulnerability; projectId: string }) {
  const prompt = buildSingleFixPrompt(projectId, pkg, vuln);
  return <CopyButton text={prompt} label="Copy Fix Prompt" />;
}

/* -------------------------------------------------------------------------- */
/*          Remediation step copy button (used inside QAPanel)               */
/* -------------------------------------------------------------------------- */
export function RemediationStepCopyButton({
  projectId,
  stepTitle,
  stepImpact,
  stepBreakage,
  affectedPackages,
  actions,
}: {
  projectId: string;
  stepTitle: string;
  stepImpact: string;
  stepBreakage: string;
  affectedPackages: string[];
  actions: string[];
}) {
  const prompt = `Fix security issue in ${projectId}:

• Goal: ${stepTitle}
• Severity/Impact: ${stepImpact} (Breakage Risk: ${stepBreakage})
• Affected Dependencies: ${affectedPackages.join(', ')}

Action Items:
${actions.map((a, i) => `${i + 1}. ${a}`).join('\n')}

Please update the project manifests, update package lockfiles, resolve breaking changes, and run the test suite to verify the fix.`;

  return <CopyButton text={prompt} label="Copy Fix Prompt" compact />;
}
