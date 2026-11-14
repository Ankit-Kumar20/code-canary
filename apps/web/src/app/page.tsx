'use client';

import { useMemo, useState } from 'react';
import {
  ScanRequest,
  EnrichedSBOM,
  AgentAnswer,
  Package,
  Vulnerability,
} from '@dependency-canary/shared';
import DependencyGraphViz from '@/components/dependency-graph-viz';
import QAPanel from '@/components/qa-panel';

const API = 'http://localhost:3001/api';

type View = 'overview' | 'packages' | 'vulnerabilities' | 'graph' | 'agent';
type Severity = Vulnerability['severity'];
type RefType = ScanRequest['refType'];


const SEVERITIES: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
const SEVERITY_RANK: Record<Severity, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
const SEVERITY_LABEL: Record<Severity, string> = {
  CRITICAL: 'Critical',
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
};

const VIEWS: { id: View; label: string; icon: JSX.Element }[] = [
  { id: 'overview', label: 'Overview', icon: <IconGrid /> },
  { id: 'packages', label: 'Packages', icon: <IconBox /> },
  { id: 'vulnerabilities', label: 'Vulnerabilities', icon: <IconShield /> },
  { id: 'graph', label: 'Dependency graph', icon: <IconGraph /> },
  { id: 'agent', label: 'Ask agent', icon: <IconSpark /> },
];

const REF_TYPES: { id: RefType; label: string; placeholder: string }[] = [
  { id: 'git', label: 'Git', placeholder: 'https://github.com/user/repo' },
  { id: 'zip', label: 'ZIP', placeholder: 'https://example.com/project.zip' },
  { id: 'image', label: 'Image', placeholder: 'nginx:latest' },
];

function worstSeverity(pkg: Package): Severity | null {
  let worst: Severity | null = null;
  for (const v of pkg.vulns ?? []) {
    if (!worst || SEVERITY_RANK[v.severity] > SEVERITY_RANK[worst]) worst = v.severity;
  }
  return worst;
}

export default function HomePage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sbom, setSBOM] = useState<EnrichedSBOM | null>(null);
  const [view, setView] = useState<View>('overview');
  const [selected, setSelected] = useState<Package | null>(null);
  const [refType, setRefType] = useState<RefType>('git');
  const [ref, setRef] = useState('');

  const handleScan = async (request: ScanRequest) => {
    setLoading(true);
    setError(null);
    setSBOM(null);
    setSelected(null);

    try {
      const scanResponse = await fetch(`${API}/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
      if (!scanResponse.ok) throw new Error(`Scan failed: ${scanResponse.statusText}`);

      const { jobId } = await scanResponse.json();

      let enrichResult;
      for (let attempts = 0; attempts < 30; attempts++) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        const enrichResponse = await fetch(`${API}/enrich?jobId=${jobId}`);
        if (enrichResponse.ok) {
          enrichResult = await enrichResponse.json();
          break;
        }
      }
      if (!enrichResult) throw new Error('The scan timed out after 60 seconds. Try again or scan a smaller project.');

      setSBOM(enrichResult);
      setView('overview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scan failed');
    } finally {
      setLoading(false);
    }
  };

  const handleAsk = async (question: string): Promise<AgentAnswer> => {
    if (!sbom) throw new Error('No SBOM available');
    const response = await fetch(`${API}/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: sbom.projectId, question }),
    });
    if (!response.ok) throw new Error(`Failed to get answer: ${response.statusText}`);
    return response.json();
  };

  const handleGenerateReport = async () => {
    if (!sbom) return;
    const response = await fetch(`${API}/report?projectId=${sbom.projectId}&format=pdf`);
    if (!response.ok) {
      setError('The report could not be generated. Check that the API is running on port 3001.');
      return;
    }
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dependency-report-${sbom.projectId}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  };

  const submitScan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ref.trim() || loading) return;
    handleScan({ projectRef: 'user-input', refType, ref: ref.trim() });
  };

  const currentView = VIEWS.find(v => v.id === view)!;

  return (
    <div className="flex h-dvh overflow-hidden text-[13px]">
      {/* Sidebar */}
      <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-sidebar">
        <div className="flex h-12 items-center gap-2 px-4">
          <span className="grid h-5 w-5 place-items-center rounded-[5px] bg-accent text-[11px] font-semibold text-white">
            C
          </span>
          <span className="font-medium">Dependency Canary</span>
        </div>

        <div className="px-2 pb-2">
          <button
            type="button"
            onClick={() => {
              setSBOM(null);
              setError(null);
              setSelected(null);
            }}
            className="flex h-8 w-full items-center gap-2 rounded-md border border-line bg-surface px-2.5 text-ink shadow-[0_1px_1px_rgba(15,23,42,0.04)] transition-colors duration-150 hover:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <IconPlus />
            New scan
          </button>
        </div>

        <nav aria-label="Project views" className="flex flex-col gap-px px-2">
          <p className="px-2 pb-1 pt-3 text-[11px] font-medium uppercase tracking-[0.06em] text-ink-faint">
            {sbom ? sbom.projectId : 'No project'}
          </p>
          {VIEWS.map(item => {
            const active = sbom && view === item.id;
            const count =
              item.id === 'packages'
                ? sbom?.summary.counts.packages
                : item.id === 'vulnerabilities'
                  ? sbom?.summary.counts.vulns
                  : undefined;
            return (
              <button
                key={item.id}
                type="button"
                disabled={!sbom}
                aria-current={active ? 'page' : undefined}
                onClick={() => {
                  setView(item.id);
                  setSelected(null);
                }}
                className={`flex h-7 items-center gap-2 rounded-md px-2 text-left transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:text-ink-faint ${
                  active ? 'bg-hover font-medium text-ink' : 'text-ink-muted enabled:hover:bg-hover enabled:hover:text-ink'
                }`}
              >
                <span className="text-ink-faint">{item.icon}</span>
                <span className="flex-1 truncate">{item.label}</span>
                {count !== undefined && <span className="tabular-nums text-ink-faint">{count}</span>}
              </button>
            );
          })}
        </nav>

        {sbom && (
          <div className="mt-auto border-t border-line px-4 py-3 text-[12px] text-ink-faint">
            Scanned {new Date(sbom.generatedAt).toLocaleString()}
          </div>
        )}
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col bg-surface">
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-line px-5">
          <div className="flex items-center gap-1.5 text-ink-muted">
            {sbom ? (
              <>
                <span>{sbom.projectId}</span>
                <span className="text-ink-faint">›</span>
                <span className="font-medium text-ink">{currentView.label}</span>
              </>
            ) : (
              <span className="font-medium text-ink">New scan</span>
            )}
          </div>
          {sbom && (
            <button
              type="button"
              onClick={handleGenerateReport}
              className="flex h-7 items-center gap-1.5 rounded-md border border-line px-2.5 text-ink transition-colors duration-150 hover:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <IconDownload />
              Download report
            </button>
          )}
        </header>

        {error && (
          <div role="alert" className="flex items-center gap-2 border-b border-line bg-[color-mix(in_oklch,var(--critical)_8%,white)] px-5 py-2 text-critical">
            <IconAlert />
            <span className="flex-1">{error}</span>
            <button type="button" onClick={() => setError(null)} className="text-ink-muted hover:text-ink">
              Dismiss
            </button>
          </div>
        )}

        <div className="flex min-h-0 flex-1">
          <main className="min-w-0 flex-1 overflow-y-auto">
            {!sbom ? (
              <EmptyScan
                loading={loading}
                refType={refType}
                setRefType={setRefType}
                value={ref}
                setValue={setRef}
                onSubmit={submitScan}
                onDemo={() => {
                  setSBOM(DEMO_SBOM);
                  setError(null);
                  setView('overview');
                }}
              />
            ) : view === 'overview' ? (
              <Overview sbom={sbom} onOpen={setSelected} onNavigate={setView} />
            ) : view === 'packages' ? (
              <PackageList packages={sbom.packages} selected={selected} onOpen={setSelected} />
            ) : view === 'vulnerabilities' ? (
              <VulnerabilityList packages={sbom.packages} onOpen={setSelected} />
            ) : view === 'graph' ? (
              <div className="p-5">
                <DependencyGraphViz sbom={sbom} />
              </div>
            ) : (
              <div className="mx-auto max-w-3xl p-5">
                <QAPanel projectId={sbom.projectId} onAsk={handleAsk} />
              </div>
            )}
          </main>

          {sbom && selected && <PackageDetail pkg={selected} onClose={() => setSelected(null)} />}
        </div>
      </div>
    </div>
  );
}

function EmptyScan({
  loading,
  refType,
  setRefType,
  value,
  setValue,
  onSubmit,
  onDemo,
}: {
  loading: boolean;
  refType: RefType;
  setRefType: (t: RefType) => void;
  value: string;
  setValue: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onDemo: () => void;
}) {
  const current = REF_TYPES.find(t => t.id === refType)!;

  if (loading) {
    return (
      <div className="px-5 py-4" aria-busy="true" aria-live="polite">
        <p className="mb-4 text-ink-muted">Resolving the dependency graph and checking advisories…</p>
        <div className="flex flex-col gap-px">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex h-9 items-center gap-3">
              <div className="h-3.5 w-3.5 animate-pulse rounded bg-hover" />
              <div className="h-3 animate-pulse rounded bg-hover" style={{ width: `${30 + ((i * 17) % 40)}%` }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-[520px] flex-col gap-6 px-5 pt-[14vh]">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-[20px] font-semibold tracking-[-0.01em]">Scan a project</h1>
        <p className="max-w-[65ch] text-ink-muted">
          Build a full SBOM, flag known vulnerabilities and supply-chain risks, and get a minimal patch plan.
        </p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded-[10px] border border-line bg-surface p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_12px_rgba(15,23,42,0.04)]">
        <div role="radiogroup" aria-label="Source type" className="flex gap-1 rounded-md bg-sidebar p-0.5">
          {REF_TYPES.map(t => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={refType === t.id}
              onClick={() => setRefType(t.id)}
              className={`h-7 flex-1 rounded-[5px] transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${
                refType === t.id ? 'bg-surface font-medium text-ink shadow-[0_1px_2px_rgba(15,23,42,0.08)]' : 'text-ink-muted hover:text-ink'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <label htmlFor="ref" className="sr-only">
          {refType === 'git' ? 'Repository URL' : refType === 'zip' ? 'ZIP file URL' : 'Container image'}
        </label>
        <div className="flex gap-2">
          <input
            id="ref"
            type="text"
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder={current.placeholder}
            autoComplete="off"
            spellCheck={false}
            className="h-9 min-w-0 flex-1 rounded-md border border-line bg-surface px-3 text-[16px] text-ink placeholder:text-ink-faint hover:border-[rgba(15,23,42,0.16)] focus:border-accent focus:outline-none focus:ring-2 focus:ring-[color-mix(in_oklch,var(--accent)_20%,transparent)] sm:text-[13px]"
          />
          <button
            type="submit"
            disabled={!value.trim()}
            className="h-9 rounded-md bg-accent px-3.5 font-medium text-white transition-[background-color,transform] duration-150 hover:bg-accent-hover active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-hover disabled:text-ink-faint"
          >
            Start scan
          </button>
        </div>
      </form>

      <p className="text-ink-muted">
        No project handy?{' '}
        <button type="button" onClick={onDemo} className="font-medium text-accent underline-offset-2 hover:underline">
          Open the sample project
        </button>
      </p>
    </div>
  );
}

function Overview({
  sbom,
  onOpen,
  onNavigate,
}: {
  sbom: EnrichedSBOM;
  onOpen: (p: Package) => void;
  onNavigate: (v: View) => void;
}) {
  const { counts, topRisks } = sbom.summary;
  const stats = [
    { label: 'Packages', value: counts.packages, sub: `${counts.direct} direct · ${counts.transitive} transitive` },
    { label: 'Critical', value: counts.critical, sub: 'Fix immediately', tone: counts.critical ? 'text-critical' : '' },
    { label: 'High', value: counts.high, sub: 'Fix this sprint', tone: counts.high ? 'text-high' : '' },
    { label: 'Vulnerabilities', value: counts.vulns, sub: `${counts.medium ?? 0} medium · ${counts.low ?? 0} low` },
  ];
  const byName = new Map(sbom.packages.map(p => [`${p.name}@${p.version}`, p]));

  return (
    <div className="flex flex-col gap-8 px-5 py-5">
      <div className="grid grid-cols-2 overflow-hidden rounded-[10px] border border-line lg:grid-cols-4">
        {stats.map((s, i) => (
          <div key={s.label} className={`flex flex-col gap-1 p-4 ${i > 0 ? 'border-l border-line' : ''}`}>
            <span className="text-ink-muted">{s.label}</span>
            <span className={`text-[24px] font-semibold tabular-nums tracking-[-0.02em] ${s.tone ?? ''}`}>{s.value}</span>
            <span className="text-[12px] text-ink-faint">{s.sub}</span>
          </div>
        ))}
      </div>

      <section className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <h2 className="font-medium">Top risks</h2>
          <button type="button" onClick={() => onNavigate('vulnerabilities')} className="text-ink-muted hover:text-ink">
            View all vulnerabilities
          </button>
        </div>
        {topRisks.length === 0 ? (
          <p className="rounded-[10px] border border-dashed border-line px-4 py-6 text-center text-ink-muted">
            No risky packages found. Re-scan after dependency changes to stay covered.
          </p>
        ) : (
          <ul className="overflow-hidden rounded-[10px] border border-line">
            {topRisks.map((risk, i) => {
              const pkg = byName.get(`${risk.package}@${risk.version}`);
              return (
                <li key={i} className={i > 0 ? 'border-t border-line' : ''}>
                  <button
                    type="button"
                    disabled={!pkg}
                    onClick={() => pkg && onOpen(pkg)}
                    className="flex h-11 w-full items-center gap-3 px-4 text-left transition-colors duration-150 enabled:hover:bg-canvas"
                  >
                    <SeverityIcon severity={pkg ? worstSeverity(pkg) : null} />
                    <span className="font-medium">{risk.package}</span>
                    <span className="font-mono text-[12px] text-ink-faint">{risk.version}</span>
                    <span className="flex-1 truncate text-ink-muted">{risk.reason}</span>
                    <RiskMeter score={risk.score} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-medium">Environment</h2>
        <dl className="grid grid-cols-[120px_1fr] gap-y-2 text-ink-muted">
          <dt>Languages</dt>
          <dd className="flex flex-wrap gap-1">{sbom.metadata.languages.map(l => <Tag key={l}>{l}</Tag>)}</dd>
          <dt>Services</dt>
          <dd className="flex flex-wrap gap-1">{sbom.metadata.services.map(s => <Tag key={s}>{s}</Tag>)}</dd>
        </dl>
      </section>
    </div>
  );
}

function GroupHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="sticky top-0 z-10 flex h-9 items-center gap-2 border-b border-line bg-sidebar px-5">
      <span className="font-medium">{label}</span>
      <span className="tabular-nums text-ink-faint">{count}</span>
    </div>
  );
}

function PackageList({
  packages,
  selected,
  onOpen,
}: {
  packages: Package[];
  selected: Package | null;
  onOpen: (p: Package) => void;
}) {
  const sorted = useMemo(
    () =>
      [...packages].sort(
        (a, b) =>
          (SEVERITY_RANK[worstSeverity(b) ?? 'LOW'] + (b.vulns?.length ? 1 : 0)) -
            (SEVERITY_RANK[worstSeverity(a) ?? 'LOW'] + (a.vulns?.length ? 1 : 0)) || a.name.localeCompare(b.name),
      ),
    [packages],
  );
  const groups = [
    { label: 'Direct', items: sorted.filter(p => p.direct) },
    { label: 'Transitive', items: sorted.filter(p => !p.direct) },
  ].filter(g => g.items.length);

  return (
    <div>
      {groups.map(g => (
        <section key={g.label}>
          <GroupHeader label={g.label} count={g.items.length} />
          <ul>
            {g.items.map(pkg => {
              const isSelected = selected?.name === pkg.name && selected.version === pkg.version;
              const vulnCount = pkg.vulns?.length ?? 0;
              return (
                <li key={`${pkg.name}@${pkg.version}`} className="border-b border-line">
                  <button
                    type="button"
                    onClick={() => onOpen(pkg)}
                    className={`flex h-10 w-full items-center gap-3 px-5 text-left transition-colors duration-150 ${
                      isSelected ? 'bg-hover' : 'hover:bg-canvas'
                    }`}
                  >
                    <SeverityIcon severity={worstSeverity(pkg)} />
                    <span className="truncate font-medium">{pkg.name}</span>
                    <span className="font-mono text-[12px] text-ink-faint">{pkg.version}</span>
                    <span className="flex-1" />
                    {pkg.risk?.abandoned && <Tag>Abandoned</Tag>}
                    {pkg.license && <span className="hidden text-ink-faint md:inline">{pkg.license}</span>}
                    <Tag>{pkg.eco}</Tag>
                    <span className={`w-16 text-right tabular-nums ${vulnCount ? 'text-ink' : 'text-ink-faint'}`}>
                      {vulnCount ? `${vulnCount} vuln${vulnCount > 1 ? 's' : ''}` : '—'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function VulnerabilityList({ packages, onOpen }: { packages: Package[]; onOpen: (p: Package) => void }) {
  const rows = packages.flatMap(pkg => (pkg.vulns ?? []).map(v => ({ v, pkg })));

  if (rows.length === 0) {
    return (
      <p className="px-5 py-10 text-center text-ink-muted">
        No known vulnerabilities in this dependency graph.
      </p>
    );
  }

  return (
    <div>
      {SEVERITIES.map(sev => {
        const items = rows.filter(r => r.v.severity === sev).sort((a, b) => b.v.cvss - a.v.cvss);
        if (!items.length) return null;
        return (
          <section key={sev}>
            <GroupHeader label={SEVERITY_LABEL[sev]} count={items.length} />
            <ul>
              {items.map(({ v, pkg }) => (
                <li key={`${v.id}-${pkg.name}`} className="border-b border-line">
                  <button
                    type="button"
                    onClick={() => onOpen(pkg)}
                    className="flex h-10 w-full items-center gap-3 px-5 text-left transition-colors duration-150 hover:bg-canvas"
                  >
                    <SeverityIcon severity={v.severity} />
                    <span className="w-36 shrink-0 font-mono text-[12px] text-ink-muted">{v.id}</span>
                    <span className="flex-1 truncate">{v.summary}</span>
                    <Tag>
                      {pkg.name}@{pkg.version}
                    </Tag>
                    <span className="w-10 text-right tabular-nums text-ink-muted">{v.cvss.toFixed(1)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function PackageDetail({ pkg, onClose }: { pkg: Package; onClose: () => void }) {
  const vulns = [...(pkg.vulns ?? [])].sort((a, b) => b.cvss - a.cvss);
  return (
    <aside aria-label={`${pkg.name} details`} className="flex w-[360px] shrink-0 flex-col overflow-y-auto border-l border-line bg-surface">
      <div className="flex h-11 items-center justify-between border-b border-line px-4">
        <span className="truncate font-medium">
          {pkg.name} <span className="font-mono text-[12px] font-normal text-ink-faint">{pkg.version}</span>
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close details"
          className="grid h-7 w-7 place-items-center rounded-md text-ink-muted hover:bg-hover hover:text-ink"
        >
          ✕
        </button>
      </div>

      <dl className="grid grid-cols-[96px_1fr] gap-y-2.5 border-b border-line px-4 py-4">
        <dt className="text-ink-muted">Ecosystem</dt>
        <dd>{pkg.eco}</dd>
        <dt className="text-ink-muted">Type</dt>
        <dd>{pkg.direct ? 'Direct' : 'Transitive'}</dd>
        {pkg.license && (
          <>
            <dt className="text-ink-muted">License</dt>
            <dd>{pkg.license}</dd>
          </>
        )}
        {pkg.risk && (
          <>
            <dt className="text-ink-muted">Maintainers</dt>
            <dd className="capitalize">{pkg.risk.maintainerTrust} trust</dd>
          </>
        )}
        <dt className="text-ink-muted">Depends on</dt>
        <dd className="tabular-nums">{pkg.requires?.length ?? 0} packages</dd>
      </dl>

      <div className="flex flex-col gap-3 px-4 py-4">
        <h3 className="font-medium">
          Vulnerabilities <span className="tabular-nums text-ink-faint">{vulns.length}</span>
        </h3>
        {vulns.length === 0 ? (
          <p className="text-ink-muted">No known vulnerabilities for this version.</p>
        ) : (
          vulns.map(v => (
            <div key={v.id} className="flex flex-col gap-1.5 rounded-lg border border-line p-3">
              <div className="flex items-center gap-2">
                <SeverityIcon severity={v.severity} />
                <span className="font-mono text-[12px]">{v.id}</span>
                <span className="ml-auto tabular-nums text-ink-muted">CVSS {v.cvss.toFixed(1)}</span>
              </div>
              <p className="text-ink-muted">{v.summary}</p>
              {v.affectedRanges.length > 0 && (
                <p className="text-[12px] text-ink-faint">Affects {v.affectedRanges.join(', ')}</p>
              )}
            </div>
          ))
        )}
      </div>
    </aside>
  );
}

/* Linear-style priority glyph: bars for severity, filled square for critical */
function SeverityIcon({ severity }: { severity: Severity | null }) {
  const label = severity ? `${SEVERITY_LABEL[severity]} severity` : 'No known vulnerabilities';
  if (severity === 'CRITICAL') {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" role="img" aria-label={label} className="shrink-0">
        <rect width="14" height="14" rx="3" fill="var(--critical)" />
        <rect x="6.25" y="3" width="1.5" height="5" rx="0.75" fill="white" />
        <rect x="6.25" y="9.5" width="1.5" height="1.5" rx="0.75" fill="white" />
      </svg>
    );
  }
  const filled = severity ? SEVERITY_RANK[severity] : 0;
  const color = severity === 'HIGH' ? 'var(--high)' : severity === 'MEDIUM' ? 'var(--medium)' : 'var(--low)';
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" role="img" aria-label={label} className="shrink-0">
      {[0, 1, 2].map(i => (
        <rect
          key={i}
          x={1 + i * 4.5}
          y={9 - i * 3}
          width="3"
          height={4 + i * 3}
          rx="1"
          fill={i < filled ? color : 'rgba(15,23,42,0.12)'}
        />
      ))}
    </svg>
  );
}

function RiskMeter({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  return (
    <span className="flex items-center gap-2" aria-label={`Risk score ${pct} percent`}>
      <span className="h-1 w-16 overflow-hidden rounded-full bg-hover">
        <span className="block h-full rounded-full bg-critical" style={{ width: `${pct}%` }} />
      </span>
      <span className="w-8 text-right tabular-nums text-ink-muted">{pct}%</span>
    </span>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-5 shrink-0 items-center rounded-full border border-line px-2 text-[12px] text-ink-muted">
      {children}
    </span>
  );
}

const iconProps = {
  width: 14,
  height: 14,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

function IconGrid() {
  return (
    <svg {...iconProps}>
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
      <rect x="9" y="9" width="5" height="5" rx="1" />
    </svg>
  );
}
function IconBox() {
  return (
    <svg {...iconProps}>
      <path d="M8 1.75 14 5v6l-6 3.25L2 11V5l6-3.25Z" />
      <path d="M2 5l6 3.25L14 5M8 8.25v6" />
    </svg>
  );
}
function IconShield() {
  return (
    <svg {...iconProps}>
      <path d="M8 1.75 13.5 4v4c0 3.25-2.5 5.5-5.5 6.25C5 13.5 2.5 11.25 2.5 8V4L8 1.75Z" />
    </svg>
  );
}
function IconGraph() {
  return (
    <svg {...iconProps}>
      <circle cx="4" cy="4" r="2" />
      <circle cx="12" cy="4" r="2" />
      <circle cx="8" cy="12" r="2" />
      <path d="M5.2 5.6 7 10.3M10.8 5.6 9 10.3" />
    </svg>
  );
}
function IconSpark() {
  return (
    <svg {...iconProps}>
      <path d="M8 2v3M8 11v3M2 8h3M11 8h3M4 4l1.75 1.75M10.25 10.25 12 12M12 4l-1.75 1.75M5.75 10.25 4 12" />
    </svg>
  );
}
function IconPlus() {
  return (
    <svg {...iconProps}>
      <path d="M8 3v10M3 8h10" />
    </svg>
  );
}
function IconDownload() {
  return (
    <svg {...iconProps}>
      <path d="M8 2v8M4.5 6.5 8 10l3.5-3.5M2.5 13.5h11" />
    </svg>
  );
}
function IconAlert() {
  return (
    <svg {...iconProps}>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 5v3.5M8 11h.01" />
    </svg>
  );
}

const DEMO_SBOM: EnrichedSBOM = {
  projectId: 'demo-project',
  generatedAt: new Date().toISOString(),
  metadata: { languages: ['typescript', 'javascript'], services: ['web', 'api'] },
  packages: [
    { name: 'react', version: '18.2.0', eco: 'npm', direct: true, license: 'MIT', requires: [{ name: 'typescript', version: '5.9.2' }], vulns: [] },
    {
      name: 'next',
      version: '14.1.0',
      eco: 'npm',
      direct: true,
      license: 'MIT',
      requires: [
        { name: 'react', version: '18.2.0' },
        { name: 'typescript', version: '5.9.2' },
      ],
      vulns: [
        { id: 'CVE-2024-1234', source: 'NVD', cvss: 3.1, severity: 'LOW', published: '2024-01-01', summary: 'Test vulnerability', affectedRanges: ['<14.2.0'] },
      ],
    },
    { name: 'typescript', version: '5.9.2', eco: 'npm', direct: false, license: 'Apache-2.0', requires: [], vulns: [] },
    { name: 'd3', version: '7.8.5', eco: 'npm', direct: true, license: 'ISC', requires: [{ name: 'typescript', version: '5.9.2' }], vulns: [] },
    {
      name: 'tailwindcss',
      version: '3.4.0',
      eco: 'npm',
      direct: true,
      license: 'MIT',
      requires: [],
      vulns: [
        { id: 'CVE-2024-5678', source: 'NVD', cvss: 5.5, severity: 'MEDIUM', published: '2024-01-02', summary: 'Another test vulnerability', affectedRanges: ['<3.5.0'] },
      ],
    },
    { name: 'lodash', version: '4.17.21', eco: 'npm', direct: true, license: 'MIT', requires: [], vulns: [] },
  ],
  summary: {
    counts: { packages: 6, direct: 5, transitive: 1, vulns: 2, critical: 0, high: 0, medium: 1, low: 1 },
    topRisks: [
      { package: 'tailwindcss', version: '3.4.0', score: 0.6, reason: 'Medium severity vulnerability' },
      { package: 'next', version: '14.1.0', score: 0.3, reason: 'Low severity vulnerability' },
    ],
  },
};
