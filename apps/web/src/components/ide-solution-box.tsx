'use client';

import { useState } from 'react';
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
/*                            CopyButton (shared)                             */
/* -------------------------------------------------------------------------- */
function CopyButton({
  text,
  label = 'Copy IDE Fix Prompt',
  compact = false,
}: {
  text: string;
  label?: string;
  compact?: boolean;
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
        className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold transition-all duration-150 ${
          state === 'copied'
            ? 'bg-success/10 text-success'
            : state === 'failed'
              ? 'bg-critical-bg text-critical'
              : 'bg-accent/10 text-accent hover:bg-accent/20'
        }`}
      >
        {state === 'copied' ? '✓ Copied!' : state === 'failed' ? '✗ Failed' : '⚡ Copy Fix'}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`flex h-9 items-center gap-2 rounded-lg border px-3.5 text-[12.5px] font-semibold shadow-sm transition-all duration-150 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
        state === 'copied'
          ? 'border-success/30 bg-success/10 text-success'
          : state === 'failed'
            ? 'border-critical-border bg-critical-bg text-critical'
            : 'border-line bg-surface text-ink hover:bg-hover hover:border-line-strong'
      }`}
    >
      <span className="text-[14px]">⚡</span>
      <span>
        {state === 'copied'
          ? 'Copied to Clipboard! ✓'
          : state === 'failed'
            ? 'Copy Failed — Try Again'
            : label}
      </span>
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*                         PromptPreviewAccordion                             */
/* -------------------------------------------------------------------------- */
function PromptPreviewAccordion({ prompt }: { prompt: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-line bg-canvas/40">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between px-3.5 py-2 text-[12px] font-medium text-ink-muted hover:text-ink transition-colors"
      >
        <span>Preview generated prompt</span>
        <span className="font-mono text-[10px] text-ink-faint">{open ? '▲ hide' : '▼ show'}</span>
      </button>
      {open && (
        <pre className="overflow-x-auto rounded-b-lg border-t border-line bg-canvas p-3.5 font-mono text-[11px] text-ink-faint leading-relaxed whitespace-pre-wrap">
          {prompt}
        </pre>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                     IdeSolutionBox (Overview section)                      */
/* -------------------------------------------------------------------------- */
interface IdeSolutionBoxProps {
  sbom: EnrichedSBOM;
}

export default function IdeSolutionBox({ sbom }: IdeSolutionBoxProps) {
  // Collect all vuln targets sorted by severity then CVSS
  const targets = sbom.packages
    .flatMap(pkg => (pkg.vulns ?? []).map(vuln => ({ pkg, vuln })))
    .sort((a, b) => {
      const sevRank: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
      return (sevRank[b.vuln.severity] ?? 0) - (sevRank[a.vuln.severity] ?? 0) || b.vuln.cvss - a.vuln.cvss;
    });

  const [activeTab, setActiveTab] = useState(0);

  if (targets.length === 0) return null;

  const active = targets[activeTab];
  const singlePrompt = buildSingleFixPrompt(sbom.projectId, active.pkg, active.vuln);
  const multiPrompt = buildMultiFixPrompt(sbom.projectId, targets);
  const safeVersion = extractSafeVersion(active.vuln);
  const cmd = getUpgradeCommand(active.pkg.eco, active.pkg.name, safeVersion);

  const sevClass =
    active.vuln.severity === 'CRITICAL'
      ? 'bg-critical-bg text-critical border-critical-border'
      : active.vuln.severity === 'HIGH'
        ? 'bg-high-bg text-high border-high-border'
        : active.vuln.severity === 'MEDIUM'
          ? 'bg-medium-bg text-medium border-medium-border'
          : 'bg-low-bg text-low border-low-border';

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-accent/20 bg-surface p-5 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2.5">
          <span className="text-[18px]">⚡</span>
          <div>
            <h2 className="text-[14px] font-bold text-ink">1-Click IDE Fix Prompt</h2>
            <p className="text-[11.5px] text-ink-muted">
              Copy a structured fix prompt and paste it into Cursor, Copilot, or any AI assistant.
            </p>
          </div>
        </div>
        {targets.length > 1 && (
          <CopyButton text={multiPrompt} label={`Copy Fix for All ${targets.length} Targets`} />
        )}
      </div>

      {/* Target Tabs — pill selector */}
      {targets.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {targets.map((t, i) => {
            const isActive = i === activeTab;
            const color =
              t.vuln.severity === 'CRITICAL'
                ? isActive ? 'bg-critical text-white' : 'bg-critical-bg text-critical border border-critical-border'
                : t.vuln.severity === 'HIGH'
                  ? isActive ? 'bg-high text-white' : 'bg-high-bg text-high border border-high-border'
                  : isActive ? 'bg-accent text-white' : 'bg-canvas text-ink-muted border border-line';
            return (
              <button
                key={`${t.pkg.name}-${t.vuln.id}`}
                type="button"
                onClick={() => setActiveTab(i)}
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-all duration-150 ${color}`}
              >
                {t.pkg.name}
              </button>
            );
          })}
        </div>
      )}

      {/* Active Target Detail Card */}
      <div className="rounded-lg border border-line bg-canvas/40 p-4 flex flex-col gap-3">
        {/* Package + CVE header */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[13px] font-bold text-ink">{active.pkg.name}</span>
          <span className="font-mono text-[11px] text-ink-faint rounded bg-surface border border-line px-1.5 py-0.5">
            v{active.pkg.version}
          </span>
          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-bold uppercase ${sevClass}`}>
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {active.vuln.severity}
          </span>
          <span className="font-mono text-[11px] text-ink-muted">
            {active.vuln.id} · CVSS {active.vuln.cvss.toFixed(1)}
          </span>
        </div>

        {/* Summary */}
        <p className="text-[12.5px] text-ink-muted leading-relaxed">{active.vuln.summary}</p>

        {/* Upgrade Command strip */}
        <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2">
          <span className="font-mono text-[11px] text-ink-faint shrink-0">$</span>
          <code className="flex-1 font-mono text-[12px] text-ink">{cmd}</code>
          <CopyButton text={cmd} label="Copy command" compact />
        </div>

        {/* Prompt preview accordion */}
        <PromptPreviewAccordion prompt={singlePrompt} />
      </div>

      {/* Main CTA */}
      <CopyButton text={singlePrompt} label="Copy IDE Fix Prompt" />
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
  return <CopyButton text={prompt} label="Copy IDE Fix Prompt" />;
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

  return <CopyButton text={prompt} label="Copy IDE Fix Prompt" compact />;
}

