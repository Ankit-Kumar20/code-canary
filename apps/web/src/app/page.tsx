'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  type ScanRequest,
  type EnrichedSBOM,
  type AgentAnswer,
  type Package,
  type Vulnerability,
  DEMO_SBOM,
} from '@dependency-canary/shared';
import DependencyGraphViz from '@/components/dependency-graph-viz';
import QAPanel from '@/components/qa-panel';
import { authClient } from '@/lib/auth-client';
import IdeSolutionBox, { VulnRowCopyButton, PackageDetailCopyButton } from '@/components/ide-solution-box';

const API = `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/api`;

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

const VIEWS: { id: View; label: string; icon: (active: boolean) => JSX.Element }[] = [
  { id: 'overview', label: 'Overview', icon: active => <IconGrid active={active} /> },
  { id: 'packages', label: 'Packages', icon: active => <IconBox active={active} /> },
  { id: 'vulnerabilities', label: 'Vulnerabilities', icon: active => <IconShield active={active} /> },
  { id: 'graph', label: 'Dependency Graph', icon: active => <IconGraph active={active} /> },
  { id: 'agent', label: 'Security Agent', icon: active => <IconSpark active={active} /> },
];

const REF_TYPES: { id: RefType; label: string; placeholder: string; icon: JSX.Element }[] = [
  { id: 'git', label: 'Git Repository', placeholder: 'https://github.com/owner/repository', icon: <IconGit /> },
  { id: 'zip', label: 'ZIP Archive', placeholder: 'https://example.com/project.zip', icon: <IconZip /> },
  { id: 'image', label: 'Container Image', placeholder: 'nginx:latest or node:20-alpine', icon: <IconContainer /> },
];

function worstSeverity(pkg: Package): Severity | null {
  let worst: Severity | null = null;
  for (const v of pkg.vulns ?? []) {
    if (!worst || SEVERITY_RANK[v.severity] > SEVERITY_RANK[worst]) worst = v.severity;
  }
  return worst;
}

export default function HomePage() {
  const router = useRouter();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sbom, setSBOM] = useState<EnrichedSBOM | null>(null);
  const [view, setView] = useState<View>('overview');
  const [selected, setSelected] = useState<Package | null>(null);
  const [refType, setRefType] = useState<RefType>('git');
  const [ref, setRef] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [projects, setProjects] = useState<{ projectId: string; ref: string; refType: RefType; scannedAt: string }[]>([]);

  const loadProjects = async () => {
    const response = await fetch(`${API}/projects`, { credentials: 'include' });
    if (response.ok) setProjects(await response.json());
  };

  useEffect(() => {
    if (session) loadProjects();
  }, [session]);

  const openProject = async (projectId: string) => {
    setError(null);
    setSelected(null);
    const response = await fetch(`${API}/projects?projectId=${encodeURIComponent(projectId)}`, { credentials: 'include' });
    if (!response.ok) {
      setError('The project could not be loaded.');
      return;
    }
    setSBOM(await response.json());
    setView('overview');
  };

  useEffect(() => {
    if (!sessionPending && !session) router.replace('/sign-in');
  }, [session, sessionPending, router]);

  const handleScan = async (request: ScanRequest) => {
    setLoading(true);
    setError(null);
    setSBOM(null);
    setSelected(null);

    try {
      const scanResponse = await fetch(`${API}/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(request),
      });
      if (!scanResponse.ok) throw new Error(`Scan request failed: ${scanResponse.statusText}`);

      const { jobId } = await scanResponse.json();

      let enrichResult;
      for (let attempts = 0; attempts < 30; attempts++) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        const enrichResponse = await fetch(`${API}/enrich?jobId=${jobId}`, { credentials: 'include' });
        if (enrichResponse.ok) {
          enrichResult = await enrichResponse.json();
          break;
        }
      }
      if (!enrichResult) throw new Error('The scan timed out after 60 seconds. Try scanning a smaller project or check the API service.');

      setSBOM(enrichResult);
      setView('overview');
      loadProjects();
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
      credentials: 'include',
      body: JSON.stringify({ projectId: sbom.projectId, question }),
    });
    if (!response.ok) throw new Error(`Failed to get answer: ${response.statusText}`);
    return response.json();
  };

  const handleGenerateReport = async () => {
    if (!sbom) return;
    const response = await fetch(`${API}/report?projectId=${sbom.projectId}&format=pdf`, { credentials: 'include' });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(`The report could not be generated: ${body?.error ?? response.statusText}`);
      return;
    }
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `security-audit-${sbom.projectId}.pdf`;
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

  const signOut = async () => {
    await authClient.signOut();
    router.replace('/sign-in');
  };

  if (!session) {
    return <div className="flex h-screen items-center justify-center bg-canvas text-[13px] text-ink-faint">Loading…</div>;
  }

  const currentView = VIEWS.find(v => v.id === view)!;
  const criticalCount = sbom?.summary.counts.critical ?? 0;
  const highCount = sbom?.summary.counts.high ?? 0;

  return (
    <div className="flex h-screen overflow-hidden text-[13px] bg-canvas text-ink antialiased">
      {/* -------------------- Collapsible Left Sidebar -------------------- */}
      <aside
        className={`relative flex shrink-0 flex-col border-r border-line bg-sidebar select-none transition-all duration-200 ease-in-out ${collapsed ? 'w-16 items-center' : 'w-64'
          }`}
      >
        {/* Reddit-style Circular Hamburger Straddling the Vertical Border Line */}
        <button
          type="button"
          onClick={() => setCollapsed(c => !c)}
          className="absolute right-0 top-[72px] translate-x-1/2 z-30 flex h-7 w-7 items-center justify-center rounded-full border border-line bg-surface text-ink-muted shadow-sm transition-all duration-150 hover:bg-hover hover:text-ink hover:scale-110 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <IconMenu />
        </button>

        {/* Brand Header */}
        <div
          className={`flex h-14 w-full items-center border-b border-line ${collapsed ? 'justify-center px-0' : 'justify-between px-4'
            }`}
        >
          {!collapsed ? (
            <div className="flex items-center gap-2.5 min-w-0 pr-4">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent text-[12px] font-bold text-white shadow-sm">
                C
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[13px] font-semibold tracking-tight text-ink leading-tight truncate">Code Canary</span>
                <span className="text-[11px] text-ink-faint truncate">Security & SBOM</span>
              </div>
            </div>
          ) : (
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-[12px] font-bold text-white shadow-sm">
              C
            </div>
          )}
        </div>

        {/* Action: New Project Button */}
        <div className={`w-full border-b border-line-subtle ${collapsed ? 'py-3 flex justify-center' : 'py-3 pl-3 pr-6'}`}>
          {!collapsed ? (
            <button
              type="button"
              onClick={() => {
                setSBOM(null);
                setError(null);
                setSelected(null);
              }}
              className="flex h-9 w-full items-center justify-between rounded-lg border border-line bg-surface px-3 text-[12.5px] font-medium text-ink shadow-sm transition-all duration-150 hover:bg-hover hover:border-line-strong active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              <div className="flex items-center gap-2">
                <IconPlus />
                <span>New Project</span>
              </div>
              <kbd className="rounded border border-line bg-canvas px-1.5 py-0.5 text-[10px] font-mono text-ink-faint">
                ⌘N
              </kbd>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setSBOM(null);
                setError(null);
                setSelected(null);
              }}
              title="New Project (⌘N)"
              aria-label="New Project"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface text-ink shadow-sm hover:bg-hover hover:border-line-strong active:scale-[0.98] transition-all"
            >
              <IconPlus />
            </button>
          )}
        </div>

        {/* Project Card in Sidebar */}
        {!collapsed ? (
          <div className="w-full px-3 pt-3 pb-1">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint px-1 mb-1.5">
              Current Project
            </div>
            <div className="rounded-lg border border-line bg-surface p-2.5 shadow-sm">
              <div className="font-mono text-[12px] font-semibold text-ink truncate" title={sbom ? sbom.projectId : 'No active audit'}>
                {sbom ? sbom.projectId : 'No active audit'}
              </div>
              <div className="mt-1.5 flex items-center gap-1.5 text-[11px]">
                {sbom ? (
                  criticalCount > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded bg-critical-bg text-critical px-1.5 py-0.5 font-medium text-[10.5px]">
                      <span className="h-1.5 w-1.5 rounded-full bg-critical" />
                      {criticalCount} Critical CVE{criticalCount > 1 ? 's' : ''}
                    </span>
                  ) : highCount > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded bg-high-bg text-high px-1.5 py-0.5 font-medium text-[10.5px]">
                      <span className="h-1.5 w-1.5 rounded-full bg-high" />
                      {highCount} High CVE{highCount > 1 ? 's' : ''}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded bg-success-bg text-success px-1.5 py-0.5 font-medium text-[10.5px]">
                      <span className="h-1.5 w-1.5 rounded-full bg-success" />
                      Clean / Safe
                    </span>
                  )
                ) : (
                  <span className="text-ink-faint">Ready to analyze</span>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="py-2.5 flex justify-center w-full">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface shadow-sm cursor-pointer"
              title={
                sbom
                  ? `${sbom.projectId} (${criticalCount > 0 ? `${criticalCount} Critical` : highCount > 0 ? `${highCount} High` : 'Clean'})`
                  : 'No active audit'
              }
            >
              <span
                className={`h-2.5 w-2.5 rounded-full ${criticalCount > 0
                    ? 'bg-critical ring-2 ring-critical/20'
                    : highCount > 0
                      ? 'bg-high ring-2 ring-high/20'
                      : 'bg-success ring-2 ring-success/20'
                  }`}
              />
            </div>
          </div>
        )}

        {/* Submitted Projects */}
        {!collapsed && (
          <div className="w-full px-3 pt-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint px-1 mb-1.5">
              Projects
            </div>
            {projects.length === 0 ? (
              <div className="px-1 text-[11px] text-ink-faint">No projects yet</div>
            ) : (
              <div className="flex max-h-48 flex-col gap-0.5 overflow-y-auto">
                {projects.map(project => {
                  const active = sbom?.projectId === project.projectId;
                  return (
                    <button
                      key={project.projectId}
                      type="button"
                      title={project.ref}
                      aria-current={active ? 'true' : undefined}
                      onClick={() => openProject(project.projectId)}
                      disabled={loading}
                      className={`flex flex-col rounded-lg px-2.5 py-1.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${active ? 'bg-accent/10 text-accent' : 'text-ink-muted hover:bg-hover hover:text-ink'}`}
                    >
                      <span className="truncate font-mono text-[12px] font-medium">{project.projectId}</span>
                      <span className="truncate text-[10.5px] text-ink-faint">
                        {project.refType} · {new Date(project.scannedAt).toLocaleDateString()}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Navigation Section */}
        <nav
          aria-label="Project views"
          className={`flex flex-1 flex-col gap-1 w-full ${collapsed ? 'items-center py-2' : 'px-3 pt-2'}`}
        >
          {!collapsed && (
            <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint px-1 py-1">
              Navigation
            </div>
          )}

          {VIEWS.map(item => {
            const active = sbom && view === item.id;
            const count =
              item.id === 'packages'
                ? sbom?.summary.counts.packages
                : item.id === 'vulnerabilities'
                  ? sbom?.summary.counts.vulns
                  : undefined;

            if (collapsed) {
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={!sbom}
                  title={`${item.label}${count !== undefined ? ` (${count})` : ''}`}
                  aria-label={item.label}
                  onClick={() => {
                    setView(item.id);
                    setSelected(null);
                  }}
                  className={`relative flex h-9 w-9 items-center justify-center rounded-lg transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-30 ${active
                      ? 'bg-accent/10 text-accent font-semibold shadow-sm'
                      : 'text-ink-muted hover:bg-hover hover:text-ink'
                    }`}
                >
                  <span>{item.icon(!!active)}</span>
                  {count !== undefined && count > 0 && item.id === 'vulnerabilities' && (
                    <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-critical ring-2 ring-sidebar" />
                  )}
                </button>
              );
            }

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
                className={`group flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-left text-[12.5px] transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40 ${active
                    ? 'bg-accent/10 font-semibold text-accent shadow-sm'
                    : 'text-ink-muted hover:bg-hover hover:text-ink font-medium'
                  }`}
              >
                <span className={`transition-colors duration-150 ${active ? 'text-accent' : 'text-ink-faint group-hover:text-ink'}`}>
                  {item.icon(!!active)}
                </span>
                <span className="flex-1 truncate">{item.label}</span>
                {count !== undefined && (
                  <span
                    className={`tabular-nums rounded-full font-mono px-2 py-0.5 text-[11px] font-semibold ${active
                        ? 'bg-accent/20 text-accent'
                        : item.id === 'vulnerabilities' && count > 0
                          ? 'bg-critical-bg text-critical'
                          : 'bg-canvas text-ink-faint'
                      }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Signed-in User */}
        <div className={`border-t border-line w-full ${collapsed ? 'py-3 flex justify-center' : 'px-3 py-2.5'}`}>
          {!collapsed ? (
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/10 text-[11px] font-semibold text-accent">
                {(session.user.name || session.user.email).charAt(0).toUpperCase()}
              </div>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[12px] font-medium text-ink leading-tight">{session.user.name}</span>
                <span className="truncate text-[11px] text-ink-faint" title={session.user.email}>{session.user.email}</span>
              </div>
              <button
                type="button"
                onClick={signOut}
                title="Sign out"
                aria-label="Sign out"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-hover hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              >
                <IconSignOut />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={signOut}
              title={`Sign out (${session.user.email})`}
              aria-label="Sign out"
              className="flex h-8 w-8 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-hover hover:text-ink"
            >
              <IconSignOut />
            </button>
          )}
        </div>

        {/* Sidebar Footer */}
        <div className={`border-t border-line bg-sidebar w-full ${collapsed ? 'py-3 flex justify-center' : 'px-4 py-3'}`}>
          {!collapsed ? (
            <div className="flex items-center justify-between text-[11px] text-ink-faint">
              <span className="flex items-center gap-1.5">
                <IconClock />
                <span>Status</span>
              </span>
              <span className="font-mono text-[11px] text-ink-muted">
                {sbom ? new Date(sbom.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Idle'}
              </span>
            </div>
          ) : (
            <span className="text-ink-faint cursor-pointer" title={sbom ? `Audited: ${new Date(sbom.generatedAt).toLocaleTimeString()}` : 'Idle'}>
              <IconClock />
            </span>
          )}
        </div>
      </aside>

      {/* -------------------- Main Workspace Viewport -------------------- */}
      <div className="flex min-w-0 flex-1 flex-col bg-surface overflow-hidden">
        {/* Top Header Bar */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-line px-8 bg-surface">
          {/* Breadcrumbs */}
          <div className="flex items-center gap-2 text-[13px]">
            {sbom ? (
              <>
                <span className="font-mono text-ink-muted text-[12px] bg-canvas px-2.5 py-1 rounded-md border border-line">
                  {sbom.projectId}
                </span>
                <span className="text-ink-faint">/</span>
                <span className="font-semibold text-ink">{currentView.label}</span>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-accent" />
                <span className="font-semibold text-ink">New Dependency Scan</span>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          {sbom && (
            <button
              type="button"
              onClick={handleGenerateReport}
              className="flex h-9 items-center gap-2 rounded-lg border border-line bg-surface px-3.5 text-[12.5px] font-medium text-ink shadow-sm transition-all duration-150 hover:bg-hover hover:border-line-strong active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              <IconDownload />
              <span>Export PDF Report</span>
            </button>
          )}
        </header>

        {/* Global Error Banner */}
        {error && (
          <div
            role="alert"
            className="flex items-center gap-3 border-b border-critical-border bg-critical-bg px-8 py-2.5 text-[12.5px] text-critical"
          >
            <IconAlert />
            <span className="flex-1 font-medium">{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="rounded px-2 py-0.5 text-critical hover:bg-critical/10 font-semibold transition-colors"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Workspace Body Area */}
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
              <VulnerabilityList packages={sbom.packages} onOpen={setSelected} projectId={sbom.projectId} />
            ) : view === 'graph' ? (
              <div className="p-8 max-w-7xl mx-auto">
                <DependencyGraphViz sbom={sbom} />
              </div>
            ) : (
              <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto min-h-full flex flex-col justify-center">
                <QAPanel
                  projectId={sbom.projectId}
                  userName={session?.user?.name}
                  onAsk={handleAsk}
                />
              </div>
            )}
          </main>

          {/* Slide-over Package Detail Drawer */}
          {sbom && selected && <PackageDetail pkg={selected} onClose={() => setSelected(null)} projectId={sbom.projectId} />}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                EmptyScan                                   */
/* -------------------------------------------------------------------------- */
const SECURITY_INSIGHTS = [
  'Transitive dependencies can introduce vulnerabilities even when your direct dependencies are secure.',
  'An SBOM provides a complete inventory of software components and their dependencies.',
  'CVEs help identify publicly disclosed security vulnerabilities.',
  'The same vulnerable package can affect multiple projects through different dependency paths.',
  'License compliance is an important part of software supply-chain security.',
  'Outdated dependencies can expose applications to known security risks.',
  'OSV and NVD provide vulnerability information for software packages.',
];

function ContextualInsightLoader() {
  const [insightIndex, setInsightIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => {
      setVisible(false);
      const fadeTimeout = setTimeout(() => {
        setInsightIndex(prev => (prev + 1) % SECURITY_INSIGHTS.length);
        setVisible(true);
      }, 250);
      return () => clearTimeout(fadeTimeout);
    }, 4500);

    return () => clearInterval(timer);
  }, []);

  return (
    <div
      className="mt-3.5 flex w-full flex-col gap-1.5 rounded-xl border border-line bg-surface p-3.5 text-left shadow-sm transition-colors"
      role="region"
      aria-label="Security Insight"
    >
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-accent">
        <IconSparkle className="h-3.5 w-3.5 shrink-0 text-accent" />
        <span>Security Insight</span>
      </div>
      <div className="flex min-h-[36px] items-center" aria-live="polite" aria-atomic="true">
        <p
          className={`text-[12.5px] leading-relaxed text-ink-muted transition-all duration-300 ease-in-out ${
            visible ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0'
          }`}
        >
          {SECURITY_INSIGHTS[insightIndex]}
        </p>
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
      <div className="mx-auto flex max-w-lg flex-col items-center justify-center px-6 pt-[16vh] text-center" aria-busy="true" aria-live="polite">
        <div className="relative mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 text-accent">
          <div className="absolute inset-0 animate-ping rounded-2xl bg-accent/20" />
          <IconShieldCheck />
        </div>
        <h2 className="text-[18px] font-bold text-ink">Analyzing Dependency Tree</h2>
        <p className="mt-1 text-[13px] text-ink-muted leading-relaxed">
          Building SBOM, querying advisory databases, and verifying supply chain trust…
        </p>

        <div className="mt-8 flex w-full flex-col gap-2 rounded-xl border border-line bg-surface p-4 shadow-sm">
          {[
            { label: 'Resolving manifest lockfiles & graph nodes', done: true },
            { label: 'Fetching vulnerability advisories (NVD & OSV)', done: true },
            { label: 'Evaluating license compliance & maintainer risk', done: false },
          ].map((step, i) => (
            <div key={i} className="flex items-center gap-3 py-1.5 text-left text-[12px]">
              <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                {step.done ? (
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-white">
                    ✓
                  </span>
                ) : (
                  <span className="flex h-4 w-4 items-center justify-center text-accent" aria-label="Processing">
                    <IconSpinner className="h-3.5 w-3.5" />
                  </span>
                )}
              </span>
              <span className="font-medium text-ink">{step.label}</span>
            </div>
          ))}
        </div>

        <ContextualInsightLoader />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-8 px-6 pt-[12vh]">
      {/* Title */}
      <div className="flex flex-col gap-2 text-center items-center">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-accent/20 bg-accent/5 px-3 py-0.5 text-[11px] font-semibold text-accent uppercase tracking-wider">
          AI-Powered SBOM & Advisory Engine
        </div>
        <h1 className="text-[28px] font-bold tracking-tight text-ink">
          Audit Project Dependencies
        </h1>
        <p className="max-w-md text-[13.5px] text-ink-muted leading-relaxed">
          Uncover vulnerabilities, pinpoint supply-chain risks, inspect transitive links, and generate actionable remediation plans.
        </p>
      </div>

      {/* Main Scan Form Card */}
      <form
        onSubmit={onSubmit}
        className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5 shadow-card"
      >
        {/* Source Type Selector */}
        <div role="radiogroup" aria-label="Source type" className="grid grid-cols-3 gap-1 rounded-lg bg-canvas p-1 border border-line">
          {REF_TYPES.map(t => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={refType === t.id}
              onClick={() => setRefType(t.id)}
              className={`flex h-8 items-center justify-center gap-1.5 rounded-md text-[12px] font-medium transition-all duration-150 ${refType === t.id
                  ? 'bg-surface text-ink font-semibold shadow-sm'
                  : 'text-ink-muted hover:text-ink hover:bg-hover'
                }`}
            >
              <span className={refType === t.id ? 'text-accent' : 'text-ink-faint'}>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        {/* Input & Submit */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint">
              <IconLink />
            </span>
            <input
              id="ref"
              type="text"
              value={value}
              onChange={e => setValue(e.target.value)}
              placeholder={current.placeholder}
              autoComplete="off"
              spellCheck={false}
              className="h-10 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-[13px] text-ink placeholder:text-ink-faint transition-all duration-150 hover:border-line-strong focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
          </div>
          <button
            type="submit"
            disabled={!value.trim()}
            className="flex h-10 items-center justify-center gap-2 rounded-lg bg-accent px-5 text-[13px] font-semibold text-white shadow transition-all duration-150 hover:bg-accent-hover active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-canvas disabled:text-ink-faint disabled:shadow-none"
          >
            <span>Run Audit</span>
            <IconArrowRight />
          </button>
        </div>
      </form>

      {/* Demo Link & Props */}
      <div className="flex flex-col items-center gap-4 text-center">
        <p className="text-[12.5px] text-ink-muted">
          Want to test right now?{' '}
          <button
            type="button"
            onClick={onDemo}
            className="font-semibold text-accent underline underline-offset-4 hover:text-accent-hover transition-colors"
          >
            Load sample repository audit
          </button>
        </p>

        <div className="grid grid-cols-3 gap-3 w-full pt-4 border-t border-line text-left">
          <div className="flex flex-col gap-0.5 p-3 rounded-lg border border-line-subtle bg-canvas/40">
            <span className="text-[12px] font-semibold text-ink">CycloneDX SBOM</span>
            <span className="text-[11px] text-ink-faint">Complete manifest hierarchy</span>
          </div>
          <div className="flex flex-col gap-0.5 p-3 rounded-lg border border-line-subtle bg-canvas/40">
            <span className="text-[12px] font-semibold text-ink">CVE & GHSA Feed</span>
            <span className="text-[11px] text-ink-faint">Live vulnerability scoring</span>
          </div>
          <div className="flex flex-col gap-0.5 p-3 rounded-lg border border-line-subtle bg-canvas/40">
            <span className="text-[12px] font-semibold text-ink">AI Security Agent</span>
            <span className="text-[11px] text-ink-faint">Guided remediation plans</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                 Overview                                   */
/* -------------------------------------------------------------------------- */
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
    {
      label: 'Total Packages',
      value: counts.packages,
      sub: `${counts.direct} direct · ${counts.transitive} transitive`,
      badge: 'Manifest',
      badgeTone: 'bg-canvas text-ink-muted border border-line',
      tone: 'text-ink',
    },
    {
      label: 'Critical CVEs',
      value: counts.critical,
      sub: counts.critical > 0 ? 'Fix immediately' : 'No critical risks',
      badge: counts.critical > 0 ? 'Urgent' : 'Clean',
      badgeTone: counts.critical > 0 ? 'bg-critical-bg text-critical border border-critical-border' : 'bg-success-bg text-success border border-success/20',
      dot: counts.critical > 0 ? 'bg-critical' : 'bg-success',
      tone: counts.critical > 0 ? 'text-critical' : 'text-ink',
    },
    {
      label: 'High Severity',
      value: counts.high,
      sub: counts.high > 0 ? 'Fix this sprint' : 'No high risks',
      badge: counts.high > 0 ? 'Review' : 'Clear',
      badgeTone: counts.high > 0 ? 'bg-high-bg text-high border border-high-border' : 'bg-success-bg text-success border border-success/20',
      dot: counts.high > 0 ? 'bg-high' : 'bg-success',
      tone: counts.high > 0 ? 'text-high' : 'text-ink',
    },
    {
      label: 'Vulnerabilities',
      value: counts.vulns,
      sub: `${counts.medium ?? 0} med · ${counts.low ?? 0} low`,
      badge: counts.vulns > 0 ? `${counts.vulns} Total` : 'None',
      badgeTone: 'bg-canvas text-ink-muted border border-line',
      tone: 'text-ink',
    },
  ];

  const byName = new Map(sbom.packages.map(p => [`${p.name}@${p.version}`, p]));

  return (
    <div className="flex flex-col gap-5 p-8 max-w-7xl mx-auto">
      {/* ⚡ 1-Click IDE Fix Prompt Box */}
      <IdeSolutionBox sbom={sbom} />

      {/* 4 Compact Stat Tiles (Sleek, Clean, High Density) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map(s => (
          <div
            key={s.label}
            className="flex flex-col justify-between rounded-lg border border-line bg-surface px-3.5 py-2.5 shadow-subtle hover:border-line-strong transition-all"
          >
            <div className="flex items-center justify-between text-ink-muted">
              <span className="text-[11.5px] font-medium text-ink-muted">{s.label}</span>
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${s.badgeTone}`}>
                {s.dot && <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />}
                {s.badge}
              </span>
            </div>

            <div className="flex items-baseline gap-2 mt-1.5">
              <span className={`text-[22px] font-bold tabular-nums tracking-tight leading-none ${s.tone}`}>
                {s.value}
              </span>
              <span className="text-[11px] text-ink-faint truncate font-medium">
                {s.sub}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* ----------------- Priority Targets Table (Strictly Aligned) ----------------- */}
      <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <h2 className="text-[14px] font-bold text-ink">Priority Vulnerability Targets</h2>
            <span className="rounded-full bg-line-subtle px-2 py-0.5 text-[11px] font-semibold text-ink-muted">
              {topRisks.length} flagged
            </span>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('vulnerabilities')}
            className="text-[12.5px] font-medium text-accent hover:text-accent-hover transition-colors"
          >
            View all vulnerabilities →
          </button>
        </div>

        {topRisks.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-line py-8 text-center bg-canvas/30">
            <span className="text-emerald-500 mb-1"><IconShieldCheck /></span>
            <p className="text-[13px] font-medium text-ink">No high-risk security flaws discovered</p>
            <p className="text-[12px] text-ink-faint mt-0.5">All examined dependencies pass current baseline security checks.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-line">
            {/* Header: Strict CSS Grid 3 Columns */}
            <div className="grid grid-cols-[240px_1fr_130px] items-center gap-4 px-5 py-2.5 border-b border-line bg-canvas text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
              <span>Package</span>
              <span>Root Cause / Advisory</span>
              <span className="text-right">Risk Score</span>
            </div>

            {/* Rows: Matching Exactly the Same CSS Grid 3 Columns */}
            <ul className="divide-y divide-line">
              {topRisks.map((risk, i) => {
                const pkg = byName.get(`${risk.package}@${risk.version}`);
                const worst = pkg ? worstSeverity(pkg) : null;
                return (
                  <li key={i}>
                    <button
                      type="button"
                      disabled={!pkg}
                      onClick={() => pkg && onOpen(pkg)}
                      className="group grid grid-cols-[240px_1fr_130px] items-center gap-4 w-full px-5 py-2.5 text-left transition-colors duration-150 enabled:hover:bg-hover/60"
                    >
                      {/* Col 1: Severity + Package Name + Version Tag Inline */}
                      <div className="flex items-center gap-2 min-w-0">
                        <SeverityIcon severity={worst} />
                        <span className="font-semibold text-ink truncate group-hover:text-accent transition-colors text-[13px]">
                          {risk.package}
                        </span>
                        <span className="font-mono text-[10.5px] text-ink-faint rounded bg-canvas px-1.5 py-0.5 border border-line-subtle shrink-0">
                          {risk.version}
                        </span>
                      </div>

                      {/* Col 2: Reason / Summary */}
                      <div className="truncate text-[12.5px] text-ink-muted pr-2">
                        {risk.reason}
                      </div>

                      {/* Col 3: Risk Score Bar + Percentage (Right-aligned) */}
                      <div className="flex items-center justify-end">
                        <RiskMeter score={risk.score} />
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>

      {/* ----------------- Detected Runtime & Services ----------------- */}
      <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5 shadow-sm">
        <h2 className="text-[14px] font-bold text-ink">Detected Runtime & Services</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[12.5px]">
          <div className="flex flex-col gap-2 rounded-lg border border-line p-3 bg-canvas/30">
            <span className="font-semibold text-ink-muted text-[11px] uppercase tracking-wider">Programming Languages</span>
            <div className="flex flex-wrap gap-1.5">
              {sbom.metadata.languages.map(l => (
                <span
                  key={l}
                  className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1 font-medium text-ink text-[11.5px] shadow-sm"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                  {l}
                </span>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-lg border border-line p-3 bg-canvas/30">
            <span className="font-semibold text-ink-muted text-[11px] uppercase tracking-wider">Discovered Services</span>
            <div className="flex flex-wrap gap-1.5">
              {sbom.metadata.services.map(s => (
                <span
                  key={s}
                  className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1 font-medium text-ink text-[11.5px] shadow-sm"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  {s}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                               PackageList                                  */
/* -------------------------------------------------------------------------- */
function PackageList({
  packages,
  selected,
  onOpen,
}: {
  packages: Package[];
  selected: Package | null;
  onOpen: (p: Package) => void;
}) {
  const [filter, setFilter] = useState('');
  const [tab, setTab] = useState<'all' | 'direct' | 'transitive' | 'vulns'>('all');

  const filtered = useMemo(() => {
    return packages
      .filter(p => {
        if (tab === 'direct' && !p.direct) return false;
        if (tab === 'transitive' && p.direct) return false;
        if (tab === 'vulns' && (!p.vulns || p.vulns.length === 0)) return false;
        if (!filter.trim()) return true;
        const q = filter.toLowerCase();
        return p.name.toLowerCase().includes(q) || p.version.toLowerCase().includes(q);
      })
      .sort((a, b) => {
        const rankA = (SEVERITY_RANK[worstSeverity(a) ?? 'LOW'] || 0) + (a.vulns?.length ? 2 : 0);
        const rankB = (SEVERITY_RANK[worstSeverity(b) ?? 'LOW'] || 0) + (b.vulns?.length ? 2 : 0);
        return rankB - rankA || a.name.localeCompare(b.name);
      });
  }, [packages, filter, tab]);

  return (
    <div className="flex flex-col gap-5 p-8 max-w-7xl mx-auto">
      <div className="rounded-xl border border-line bg-surface shadow-sm overflow-hidden">
        {/* Search Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-line bg-surface">
          <div className="relative min-w-[280px] flex-1 sm:max-w-md">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint">
              <IconSearch />
            </span>
            <input
              type="text"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Search package name or version…"
              className="h-9 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-[12.5px] text-ink placeholder:text-ink-faint transition-all duration-150 hover:border-line-strong focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1 rounded-lg border border-line bg-canvas p-1 text-[11.5px]">
            {(['all', 'direct', 'transitive', 'vulns'] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`rounded-md px-3 py-1 font-medium capitalize transition-all duration-150 ${tab === t ? 'bg-surface text-ink font-semibold shadow-sm' : 'text-ink-muted hover:text-ink'
                  }`}
              >
                {t === 'vulns' ? 'With Vulnerabilities' : t}
              </button>
            ))}
          </div>
        </div>

        {/* Aligned Table Header */}
        <div className="grid grid-cols-[240px_110px_1fr_130px_90px] items-center gap-4 px-5 py-2.5 border-b border-line bg-canvas text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
          <span>Package Name</span>
          <span>Version</span>
          <span>License & Ecosystem</span>
          <span>Dependency Type</span>
          <span className="text-right">Advisories</span>
        </div>

        {/* Package Rows */}
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-ink-muted">
            <p className="text-[13.5px] font-semibold">No packages matching &ldquo;{filter}&rdquo;</p>
            <p className="text-[12px] text-ink-faint mt-1">Try refining your search filter.</p>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {filtered.map(pkg => {
              const isSelected = selected?.name === pkg.name && selected.version === pkg.version;
              const vulnCount = pkg.vulns?.length ?? 0;
              const worst = worstSeverity(pkg);

              return (
                <li key={`${pkg.name}@${pkg.version}`}>
                  <button
                    type="button"
                    onClick={() => onOpen(pkg)}
                    className={`group grid grid-cols-[240px_110px_1fr_130px_90px] items-center gap-4 w-full px-5 py-3 text-left transition-colors duration-150 ${isSelected ? 'bg-accent/8 border-l-2 border-accent' : 'hover:bg-hover/60'
                      }`}
                  >
                    {/* Col 1: Severity + Name */}
                    <div className="flex items-center gap-2.5 min-w-0">
                      <SeverityIcon severity={worst} />
                      <span className="truncate font-semibold text-ink group-hover:text-accent transition-colors text-[13px]">
                        {pkg.name}
                      </span>
                    </div>

                    {/* Col 2: Version */}
                    <span className="font-mono text-[11.5px] text-ink-faint truncate">
                      v{pkg.version}
                    </span>

                    {/* Col 3: License & Eco */}
                    <div className="flex items-center gap-2 truncate">
                      {pkg.license && (
                        <span className="rounded border border-line bg-canvas px-1.5 py-0.5 font-mono text-[10.5px] text-ink-muted">
                          {pkg.license}
                        </span>
                      )}
                      <span className="rounded bg-line-subtle px-1.5 py-0.5 font-mono text-[10.5px] text-ink-faint uppercase">
                        {pkg.eco}
                      </span>
                    </div>

                    {/* Col 4: Direct / Transitive */}
                    <span className="text-[11.5px] text-ink-muted font-medium">
                      {pkg.direct ? 'Direct manifest' : 'Transitive link'}
                    </span>

                    {/* Col 5: Vulnerabilities Count (Right-aligned) */}
                    <span
                      className={`text-right font-mono text-[11.5px] ${vulnCount > 0 ? 'text-critical font-bold' : 'text-ink-faint'
                        }`}
                    >
                      {vulnCount ? `${vulnCount} vuln${vulnCount > 1 ? 's' : ''}` : '0'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                            VulnerabilityList                               */
/* -------------------------------------------------------------------------- */
function VulnerabilityList({
  packages,
  onOpen,
  projectId,
}: {
  packages: Package[];
  onOpen: (p: Package) => void;
  projectId: string;
}) {
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState<'ALL' | Severity>('ALL');

  const rows = useMemo(() => {
    return packages.flatMap(pkg => (pkg.vulns ?? []).map(v => ({ v, pkg })));
  }, [packages]);

  const countsBySev = useMemo(() => {
    const counts: Record<string, number> = { ALL: rows.length, CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    for (const r of rows) {
      counts[r.v.severity] = (counts[r.v.severity] || 0) + 1;
    }
    return counts;
  }, [rows]);

  const filtered = useMemo(() => {
    return rows
      .filter(r => {
        if (severityFilter !== 'ALL' && r.v.severity !== severityFilter) return false;
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
          r.v.id.toLowerCase().includes(q) ||
          r.v.summary.toLowerCase().includes(q) ||
          r.pkg.name.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.v.cvss - a.v.cvss || SEVERITY_RANK[b.v.severity] - SEVERITY_RANK[a.v.severity]);
  }, [rows, search, severityFilter]);

  if (rows.length === 0) {
    return (
      <div className="p-8 max-w-7xl mx-auto">
        <div className="flex flex-col items-center justify-center rounded-xl border border-line bg-surface py-20 text-center shadow-sm">
          <div className="h-10 w-10 text-emerald-500 mb-2">
            <IconShieldCheck />
          </div>
          <h3 className="text-[15px] font-bold text-ink">Zero Vulnerabilities Discovered</h3>
          <p className="text-[12.5px] text-ink-faint max-w-sm mt-1">
            No CVE or GHSA security advisories apply to this project dependency graph.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 p-8 max-w-7xl mx-auto">
      {/* Search & Filter Card */}
      <div className="rounded-xl border border-line bg-surface shadow-sm overflow-hidden">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-line bg-surface">
          <div className="relative min-w-[280px] flex-1 sm:max-w-md">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint">
              <IconSearch />
            </span>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search CVE ID, package, or description…"
              className="h-9 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-[12.5px] text-ink placeholder:text-ink-faint transition-all duration-150 hover:border-line-strong focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
          </div>

          {/* Severity Filter Tabs */}
          <div className="flex items-center gap-1 rounded-lg border border-line bg-canvas p-1 text-[11.5px]">
            {(['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map(sev => {
              const count = countsBySev[sev] ?? 0;
              const isActive = severityFilter === sev;
              return (
                <button
                  key={sev}
                  type="button"
                  onClick={() => setSeverityFilter(sev)}
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-all duration-150 ${isActive
                      ? 'bg-surface text-ink font-semibold shadow-sm'
                      : 'text-ink-muted hover:text-ink'
                    }`}
                >
                  <span className="capitalize">{sev === 'ALL' ? 'All' : sev.toLowerCase()}</span>
                  <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${isActive ? 'bg-line text-ink' : 'bg-line-subtle text-ink-faint'}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Table Header: 6 Columns */}
        <div className="grid grid-cols-[120px_160px_180px_1fr_90px_100px] items-center gap-4 px-5 py-2.5 border-b border-line bg-canvas text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
          <span>Severity</span>
          <span>Advisory ID</span>
          <span>Target Package</span>
          <span>Vulnerability Summary</span>
          <span className="text-right">CVSS Score</span>
          <span className="text-right">IDE Fix</span>
        </div>

        {/* Table Rows */}
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-ink-muted">
            <p className="text-[13.5px] font-semibold">No advisories match this filter</p>
            <p className="text-[12px] text-ink-faint mt-1">Try clearing your search query or selecting &ldquo;All&rdquo;.</p>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {filtered.map(({ v, pkg }) => {
              const sevBadgeClass =
                v.severity === 'CRITICAL'
                  ? 'bg-critical-bg text-critical border-critical-border'
                  : v.severity === 'HIGH'
                    ? 'bg-high-bg text-high border-high-border'
                    : v.severity === 'MEDIUM'
                      ? 'bg-medium-bg text-medium border-medium-border'
                      : 'bg-low-bg text-low border-low-border';

              return (
                <li key={`${v.id}-${pkg.name}`}>
                  <div className="group grid grid-cols-[120px_160px_180px_1fr_90px_100px] items-center gap-4 w-full px-5 py-3 transition-colors duration-150 hover:bg-hover/60">
                    {/* Clickable area covers cols 1–5 */}
                    <button
                      type="button"
                      onClick={() => onOpen(pkg)}
                      className="col-span-5 grid grid-cols-[120px_160px_180px_1fr_90px] items-center gap-4 text-left"
                    >
                      {/* Col 1: Severity Badge */}
                      <div className="flex items-center">
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wider ${sevBadgeClass}`}>
                          <span className="h-1.5 w-1.5 rounded-full bg-current" />
                          {SEVERITY_LABEL[v.severity]}
                        </span>
                      </div>

                      {/* Col 2: CVE ID */}
                      <span className="font-mono text-[12px] font-bold text-ink group-hover:text-accent transition-colors">
                        {v.id}
                      </span>

                      {/* Col 3: Target Package + Version Pill */}
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="font-semibold text-ink truncate text-[13px]">{pkg.name}</span>
                        <span className="font-mono text-[10.5px] text-ink-faint rounded bg-canvas px-1.5 py-0.5 border border-line-subtle shrink-0">
                          v{pkg.version}
                        </span>
                      </div>

                      {/* Col 4: Summary */}
                      <span className="truncate text-[12.5px] text-ink-muted pr-2">
                        {v.summary}
                      </span>

                      {/* Col 5: CVSS Score */}
                      <div className="text-right">
                        <span
                          className={`inline-block font-mono text-[11.5px] font-bold tabular-nums px-2 py-0.5 rounded ${v.cvss >= 9
                              ? 'bg-critical-bg text-critical'
                              : v.cvss >= 7
                                ? 'bg-high-bg text-high'
                                : 'bg-canvas text-ink-muted border border-line-subtle'
                            }`}
                        >
                          {v.cvss.toFixed(1)}
                        </span>
                      </div>
                    </button>

                    {/* Col 6: ⚡ IDE Fix */}
                    <div className="flex justify-end" onClick={e => e.stopPropagation()}>
                      <VulnRowCopyButton pkg={pkg} vuln={v} projectId={projectId} />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                               PackageDetail                                */
/* -------------------------------------------------------------------------- */
function PackageDetail({ pkg, onClose, projectId }: { pkg: Package; onClose: () => void; projectId: string }) {
  const vulns = [...(pkg.vulns ?? [])].sort((a, b) => b.cvss - a.cvss);

  return (
    <aside
      aria-label={`${pkg.name} details`}
      className="flex w-96 shrink-0 flex-col overflow-y-auto border-l border-line bg-surface shadow-lg"
    >
      {/* Header */}
      <div className="flex h-14 items-center justify-between border-b border-line px-6">
        <div className="flex flex-col min-w-0 pr-2">
          <span className="truncate text-[14px] font-bold text-ink">{pkg.name}</span>
          <span className="font-mono text-[11.5px] text-ink-faint">v{pkg.version}</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close details"
          className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-hover hover:text-ink"
        >
          ✕
        </button>
      </div>

      {/* Metadata Key-Value List */}
      <dl className="grid grid-cols-[110px_1fr] gap-y-3 border-b border-line px-6 py-5 text-[12.5px]">
        <dt className="text-ink-muted">Ecosystem</dt>
        <dd className="font-mono font-medium text-ink uppercase">{pkg.eco}</dd>
        <dt className="text-ink-muted">Requirement</dt>
        <dd className="font-medium text-ink">{pkg.direct ? 'Direct manifest requirement' : 'Transitive dependency'}</dd>
        {pkg.license && (
          <>
            <dt className="text-ink-muted">License</dt>
            <dd className="font-mono font-medium text-ink">{pkg.license}</dd>
          </>
        )}
        {pkg.risk && (
          <>
            <dt className="text-ink-muted">Maintainer Trust</dt>
            <dd className="capitalize font-medium text-ink">{pkg.risk.maintainerTrust} trust</dd>
          </>
        )}
        <dt className="text-ink-muted">Dependencies</dt>
        <dd className="tabular-nums font-medium text-ink">{pkg.requires?.length ?? 0} packages</dd>
      </dl>

      {/* Advisory Findings */}
      <div className="flex flex-col gap-3 px-6 py-5">
        <div className="flex items-center justify-between">
          <h3 className="text-[13px] font-bold text-ink">
            Known Security Advisories
          </h3>
          <span className="rounded-full bg-line-subtle px-2 py-0.5 text-[11px] font-bold text-ink">
            {vulns.length}
          </span>
        </div>

        {vulns.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg border border-line bg-canvas/40 p-3.5 text-[12px] text-ink-muted">
            <span className="text-emerald-500 font-bold">✓</span>
            <span>No security advisories registered for this release.</span>
          </div>
        ) : (
          vulns.map(v => (
            <div
              key={v.id}
              className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4 shadow-sm"
            >
              <div className="flex items-center gap-2">
                <SeverityIcon severity={v.severity} />
                <span className="font-mono text-[12px] font-bold text-ink">{v.id}</span>
                <span
                  className={`ml-auto font-mono text-[11px] font-bold tabular-nums px-2 py-0.5 rounded ${v.cvss >= 9
                      ? 'bg-critical-bg text-critical'
                      : v.cvss >= 7
                        ? 'bg-high-bg text-high'
                        : 'bg-canvas text-ink-muted'
                    }`}
                >
                  CVSS {v.cvss.toFixed(1)}
                </span>
              </div>
              <p className="text-[12px] text-ink-muted leading-relaxed">{v.summary}</p>
              {v.affectedRanges.length > 0 && (
                <div className="rounded bg-canvas p-2 text-[11px] font-mono text-ink-faint">
                  Affects versions: {v.affectedRanges.join(', ')}
                </div>
              )}
              {/* ⚡ IDE Fix copy button */}
              <PackageDetailCopyButton pkg={pkg} vuln={v} projectId={projectId} />
            </div>
          ))
        )}
      </div>
    </aside>
  );
}

/* -------------------------------------------------------------------------- */
/*                           Linear-style Glyph                               */
/* -------------------------------------------------------------------------- */
function SeverityIcon({ severity }: { severity: Severity | null }) {
  const label = severity ? `${SEVERITY_LABEL[severity]} severity` : 'Clean / Safe';
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
    <div className="flex items-center gap-2.5">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-line-subtle">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${pct}%`,
            backgroundColor: pct > 70 ? 'var(--critical)' : pct > 40 ? 'var(--high)' : 'var(--medium)',
          }}
        />
      </div>
      <span className="w-8 text-right font-mono text-[11px] font-bold tabular-nums text-ink">
        {pct}%
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                SVG Icons                                   */
/* -------------------------------------------------------------------------- */
const iconProps = {
  width: 14,
  height: 14,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

function IconGrid({ active }: { active?: boolean }) {
  return (
    <svg {...iconProps} strokeWidth={active ? 1.9 : 1.6}>
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
      <rect x="9" y="9" width="5" height="5" rx="1" />
    </svg>
  );
}

function IconBox({ active }: { active?: boolean }) {
  return (
    <svg {...iconProps} strokeWidth={active ? 1.9 : 1.6}>
      <path d="M8 1.75 14 5v6l-6 3.25L2 11V5l6-3.25Z" />
      <path d="M2 5l6 3.25L14 5M8 8.25v6" />
    </svg>
  );
}

function IconShield({ active }: { active?: boolean }) {
  return (
    <svg {...iconProps} strokeWidth={active ? 1.9 : 1.6}>
      <path d="M8 1.75 13.5 4v4c0 3.25-2.5 5.5-5.5 6.25C5 13.5 2.5 11.25 2.5 8V4L8 1.75Z" />
    </svg>
  );
}

function IconGraph({ active }: { active?: boolean }) {
  return (
    <svg {...iconProps} strokeWidth={active ? 1.9 : 1.6}>
      <circle cx="4" cy="4" r="2" />
      <circle cx="12" cy="4" r="2" />
      <circle cx="8" cy="12" r="2" />
      <path d="M5.2 5.6 7 10.3M10.8 5.6 9 10.3" />
    </svg>
  );
}

function IconSpark({ active }: { active?: boolean }) {
  return (
    <svg {...iconProps} strokeWidth={active ? 1.9 : 1.6}>
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

function IconSearch() {
  return (
    <svg {...iconProps}>
      <circle cx="6.5" cy="6.5" r="4.5" />
      <path d="M10 10l4 4" />
    </svg>
  );
}

function IconGit() {
  return (
    <svg {...iconProps}>
      <circle cx="4" cy="4" r="2" />
      <circle cx="12" cy="7" r="2" />
      <circle cx="4" cy="12" r="2" />
      <path d="M4 6v4M4 8a4 4 0 0 1 4-4h2" />
    </svg>
  );
}

function IconZip() {
  return (
    <svg {...iconProps}>
      <path d="M3 3h10v10H3z" />
      <path d="M7 3v10M9 5h-2M9 8h-2M9 11h-2" />
    </svg>
  );
}

function IconContainer() {
  return (
    <svg {...iconProps}>
      <path d="M2 5l6-3 6 3v6l-6 3-6-3V5z" />
      <path d="M2 5l6 3 6-3M8 8v6" />
    </svg>
  );
}

function IconLink() {
  return (
    <svg {...iconProps}>
      <path d="M6.5 9.5 9.5 6.5M7 5l1.5-1.5a3 3 0 0 1 4.24 4.24L11.24 9.24M9 11l-1.5 1.5a3 3 0 0 1-4.24-4.24L4.76 6.76" />
    </svg>
  );
}

function IconArrowRight() {
  return (
    <svg {...iconProps}>
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  );
}

function IconClock() {
  return (
    <svg {...iconProps}>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 4.5v3.5l2.5 1.5" />
    </svg>
  );
}

function IconShieldCheck() {
  return (
    <svg {...iconProps}>
      <path d="M8 1.75 13.5 4v4c0 3.25-2.5 5.5-5.5 6.25C5 13.5 2.5 11.25 2.5 8V4L8 1.75Z" />
      <path d="m5.5 8 2 2 3.5-3.5" />
    </svg>
  );
}

function IconSpinner({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeOpacity="0.25" />
      <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconSparkle({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className={className} aria-hidden="true">
      <path d="M8 1c.4 3.6 3.4 6.6 7 7-3.6.4-6.6 3.4-7 7-.4-3.6-3.4-6.6-7-7 3.6-.4 6.6-3.4 7-7Z" />
    </svg>
  );
}

function IconMenu() {
  return (
    <svg {...iconProps}>
      <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*                               Demo Dataset                                 */
/* -------------------------------------------------------------------------- */
// DEMO_SBOM is imported from @dependency-canary/shared

function IconSignOut() {
  return (
    <svg {...iconProps}>
      <path d="M6 13.5H3.5a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1H6" />
      <path d="M10.5 11 13.5 8l-3-3" />
      <path d="M13.5 8H6" />
    </svg>
  );
}
