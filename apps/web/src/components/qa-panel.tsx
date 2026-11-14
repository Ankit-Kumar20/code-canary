'use client';

import { useState } from 'react';
import type { AgentAnswer } from '@dependency-canary/shared';
import { RemediationStepCopyButton } from './ide-solution-box';

interface QAPanelProps {
  projectId: string;
  onAsk: (question: string) => Promise<AgentAnswer>;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderMarkdown(md: string): string {
  if (!md) return '';

  // 1. Code blocks ```lang\ncode\n```
  let html = md.replace(/```([a-z0-9]*)\n([\s\S]*?)```/g, (_match, _lang, code) => {
    return `<pre class="my-3 overflow-x-auto rounded-xl border border-line bg-canvas p-3 font-mono text-[12px] text-ink shadow-sm leading-relaxed"><code>${escapeHtml(code.trim())}</code></pre>`;
  });

  // 2. Headings
  html = html.replace(/^#### (.*$)/gim, '<h4 class="mt-4 mb-1.5 text-[13.5px] font-bold text-ink">$1</h4>');
  html = html.replace(/^### (.*$)/gim, '<h3 class="mt-4 mb-2 text-[14.5px] font-bold text-ink flex items-center gap-1.5">$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2 class="mt-4 mb-2.5 text-[16px] font-bold text-ink border-b border-line pb-1.5">$1</h2>');

  // 3. Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="rounded bg-canvas border border-line px-1.5 py-0.5 font-mono text-[11.5px] text-ink font-medium">$1</code>');

  // 4. Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-ink">$1</strong>');

  // 5. Bullet items
  html = html.replace(/^\s*-\s+(.*$)/gim, '<li class="flex items-start gap-2 py-0.5"><span class="mt-1.5 h-1.5 w-1.5 rounded-full bg-accent shrink-0"></span><span>$1</span></li>');

  // 6. Numbered list items
  html = html.replace(/^\s*(\d+)\.\s+(.*$)/gim, '<li class="flex items-start gap-2 py-0.5"><span class="font-mono text-[11px] font-bold text-accent shrink-0 mt-0.5">$1.</span><span>$2</span></li>');

  // 7. Paragraph spacing
  html = html.replace(/\n\n/g, '<div class="h-2"></div>');
  html = html.replace(/\n/g, '<br />');

  return html;
}

export default function QAPanel({ projectId, onAsk }: QAPanelProps) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<AgentAnswer | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const suggestedQuestions = [
    'What single upgrade removes the most critical CVEs?',
    'Which packages pose the highest supply chain risk?',
    'What are the most dangerous vulnerabilities in direct dependencies?',
    'How can I reduce attack surface with minimal breakage?',
    'What abandoned packages should I replace first?',
  ];

  const executeAsk = async (queryText: string) => {
    if (!queryText.trim() || loading) return;

    setLoading(true);
    setError(null);

    try {
      const result = await onAsk(queryText.trim());
      setAnswer(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to retrieve agent analysis');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeAsk(question);
  };

  const handleSuggestedClick = (sq: string) => {
    setQuestion(sq);
    executeAsk(sq);
  };

  return (
    <div className="flex flex-col gap-6 rounded-2xl border border-line bg-surface p-6 shadow-card">
      {/* Title & Description */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-accent/10 text-accent">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M8 2v3M8 11v3M2 8h3M11 8h3M4 4l1.75 1.75M10.25 10.25 12 12M12 4l-1.75 1.75M5.75 10.25 4 12" />
            </svg>
          </div>
          <h2 className="text-[16px] font-semibold text-ink">Ask Security AI Agent</h2>
          <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10.5px] font-semibold text-accent">
            GraphRAG
          </span>
        </div>
        <p className="text-[12.5px] text-ink-muted">
          Query this SBOM for vulnerability blast radiuses, patch plans, or dependency risk assessments.
        </p>
      </div>

      {/* Query Form */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={question}
            onChange={e => setQuestion(e.target.value)}
            placeholder="e.g. Which packages have known RCEs or should be upgraded first?"
            className="h-10 flex-1 rounded-xl border border-line bg-surface px-3.5 text-[13px] text-ink placeholder:text-ink-faint transition-all duration-150 hover:border-line-strong focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/15"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !question.trim()}
            className="flex h-10 items-center justify-center gap-2 rounded-xl bg-accent px-5 text-[13px] font-semibold text-white shadow-sm transition-all duration-150 hover:bg-accent-hover hover:shadow active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-canvas disabled:text-ink-faint disabled:shadow-none"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                <span>Analyzing graph…</span>
              </span>
            ) : (
              <span>Ask Agent</span>
            )}
          </button>
        </div>
      </form>

      {/* Suggested Questions */}
      <div className="flex flex-col gap-2">
        <span className="text-[11.5px] font-semibold uppercase tracking-wider text-ink-faint">
          Suggested queries (Click to run)
        </span>
        <div className="flex flex-wrap gap-1.5">
          {suggestedQuestions.map((sq, index) => (
            <button
              key={index}
              type="button"
              onClick={() => handleSuggestedClick(sq)}
              className="rounded-lg border border-line bg-canvas/60 px-2.5 py-1 text-[11.5px] text-ink-muted transition-all duration-150 hover:border-accent/40 hover:bg-accent/5 hover:text-accent active:scale-[0.99]"
              disabled={loading}
            >
              {sq}
            </button>
          ))}
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-xl border border-critical-border bg-critical-bg p-3.5 text-[12.5px] text-critical">
          <p className="font-medium">{error}</p>
        </div>
      )}

      {/* Answer View */}
      {answer && (
        <div className="flex flex-col gap-6 pt-2 border-t border-line animate-fadeIn">
          {/* Main Answer Text */}
          <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-5 shadow-sm">
            <div className="flex items-center justify-between border-b border-line pb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-accent flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                Agent Intelligence Verdict
              </span>
              <span className="text-[11px] font-mono text-ink-faint">
                Target: {projectId}
              </span>
            </div>
            <div
              className="prose prose-sm max-w-none text-[13px] text-ink leading-relaxed"
              dangerouslySetInnerHTML={{
                __html: renderMarkdown(answer.answerMarkdown),
              }}
            />
          </div>

          {/* Key Findings */}
          {answer.keyFindings && answer.keyFindings.length > 0 && (
            <div className="flex flex-col gap-2.5">
              <h3 className="text-[13.5px] font-semibold text-ink">Key Security Findings</h3>
              <ul className="grid grid-cols-1 gap-2.5">
                {answer.keyFindings.map((finding, index) => (
                  <li
                    key={index}
                    className="flex items-start gap-3 rounded-xl border border-line bg-surface p-3 shadow-subtle"
                  >
                    <span className="mt-1 h-2 w-2 rounded-full bg-accent shrink-0" />
                    <div className="flex flex-col gap-0.5">
                      <span className="font-mono text-[12px] font-semibold text-ink">
                        {finding.nodeId}
                      </span>
                      <p className="text-[12.5px] text-ink-muted">{finding.reason}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Remediation Plan */}
          {answer.remediationPlan && answer.remediationPlan.length > 0 && (
            <div className="flex flex-col gap-3">
              <h3 className="text-[13.5px] font-semibold text-ink">Recommended Remediation Steps</h3>
              <div className="flex flex-col gap-3">
                {answer.remediationPlan.map((step, index) => {
                  const isHighImpact = step.impact?.toUpperCase() === 'HIGH';
                  return (
                    <div
                      key={index}
                      className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface p-4 shadow-subtle"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded px-1.5 py-0.5 font-mono text-[10.5px] font-bold uppercase ${
                            isHighImpact ? 'bg-critical-bg text-critical' : 'bg-high-bg text-high'
                          }`}
                        >
                          {step.impact} IMPACT
                        </span>
                        <span className="rounded bg-canvas border border-line px-1.5 py-0.5 font-mono text-[10.5px] font-medium text-ink-muted uppercase">
                          {step.estimatedBreakage} BREAKAGE RISK
                        </span>
                        {/* ⚡ IDE Fix prompt button */}
                        <span className="ml-auto">
                          <RemediationStepCopyButton
                            projectId={projectId}
                            stepTitle={step.title}
                            stepImpact={step.impact}
                            stepBreakage={step.estimatedBreakage}
                            affectedPackages={step.affectedPackages}
                            actions={step.actions}
                          />
                        </span>
                      </div>
                      <h4 className="text-[13px] font-semibold text-ink">{step.title}</h4>
                      <ul className="list-disc list-inside space-y-1 text-[12px] text-ink-muted">
                        {step.actions.map((action, actionIndex) => (
                          <li key={actionIndex}>{action}</li>
                        ))}
                      </ul>
                      {step.affectedPackages.length > 0 && (
                        <div className="rounded bg-canvas p-2 text-[11.5px] font-mono text-ink-faint">
                          Affects: {step.affectedPackages.join(', ')}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Citations */}
          {answer.citations && answer.citations.length > 0 && (
            <details className="rounded-xl border border-line bg-canvas/30 p-3 text-[12px] text-ink-muted" open>
              <summary className="cursor-pointer font-medium hover:text-ink select-none">
                Verified References & Citations ({answer.citations.length})
              </summary>
              <ul className="mt-2.5 space-y-1.5">
                {answer.citations.map((citation, index) => (
                  <li key={index} className="flex items-center gap-2">
                    <span className="rounded bg-line-subtle px-1.5 py-0.5 font-mono text-[10.5px] font-semibold uppercase text-ink-faint">
                      {citation.type}
                    </span>
                    <span className="font-mono text-ink font-medium">{citation.id}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
