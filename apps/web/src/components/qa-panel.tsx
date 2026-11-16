'use client';

import { useState, useRef, useEffect } from 'react';
import type { AgentAnswer } from '@dependency-canary/shared';
import { RemediationStepCopyButton } from './ide-solution-box';

interface QAPanelProps {
  projectId: string;
  userName?: string;
  onAsk: (question: string) => Promise<AgentAnswer>;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  text: string;
  answer?: AgentAnswer;
  timestamp: Date;
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
    return `<pre class="my-3 overflow-x-auto rounded-xl border border-slate-200 bg-slate-900 p-3.5 font-mono text-[12px] text-slate-100 shadow-sm leading-relaxed"><code>${escapeHtml(code.trim())}</code></pre>`;
  });

  // 2. Headings
  html = html.replace(/^#### (.*$)/gim, '<h4 class="mt-4 mb-1.5 text-[13.5px] font-bold text-slate-900">$1</h4>');
  html = html.replace(/^### (.*$)/gim, '<h3 class="mt-4 mb-2 text-[14.5px] font-bold text-slate-900 flex items-center gap-1.5">$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2 class="mt-4 mb-2.5 text-[16px] font-bold text-slate-900 border-b border-slate-200 pb-1.5">$1</h2>');

  // 3. Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="rounded bg-slate-100 border border-slate-200 px-1.5 py-0.5 font-mono text-[11.5px] text-slate-800 font-medium">$1</code>');

  // 4. Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-slate-900">$1</strong>');

  // 5. Bullet items
  html = html.replace(/^\s*-\s+(.*$)/gim, '<li class="flex items-start gap-2 py-0.5"><span class="mt-1.5 h-1.5 w-1.5 rounded-full bg-[#0022f4] shrink-0"></span><span>$1</span></li>');

  // 6. Numbered list items
  html = html.replace(/^\s*(\d+)\.\s+(.*$)/gim, '<li class="flex items-start gap-2 py-0.5"><span class="font-mono text-[11px] font-bold text-[#0022f4] shrink-0 mt-0.5">$1.</span><span>$2</span></li>');

  // 7. Paragraph spacing
  html = html.replace(/\n\n/g, '<div class="h-2"></div>');
  html = html.replace(/\n/g, '<br />');

  return html;
}

interface ReadyQuestion {
  label: string;
  query: string;
}

const READY_QUESTIONS: ReadyQuestion[] = [
  {
    label: 'What single upgrade removes the most critical CVEs?',
    query: 'What single upgrade removes the most critical CVEs with minimal breakage?',
  },
  {
    label: 'Which packages pose the highest supply chain risk?',
    query: 'Which packages pose the highest supply chain risk and have critical CVEs?',
  },
  {
    label: 'Analyze transitive blast radius of critical vulnerabilities',
    query: 'Analyze the transitive blast radius of the highest severity vulnerability.',
  },
  {
    label: 'What are the most dangerous vulnerabilities in direct dependencies?',
    query: 'What are the most dangerous vulnerabilities in direct dependencies?',
  },
  {
    label: 'How can I reduce attack surface with minimal breakage?',
    query: 'How can I reduce attack surface with minimal breakage and generate IDE fixes?',
  },
  {
    label: 'What abandoned packages or deep dependency cycles should I audit?',
    query: 'What abandoned packages or deep dependency cycles should I replace first?',
  },
];

export default function QAPanel({ projectId, userName = 'Maya', onAsk }: QAPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const displayName = userName?.split(' ')[0] || 'Maya';

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const executeAsk = async (queryText: string) => {
    if (!queryText.trim() || loading) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: queryText.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    setError(null);

    try {
      const result = await onAsk(queryText.trim());
      const agentMsg: ChatMessage = {
        id: `agent-${Date.now()}`,
        role: 'agent',
        text: result.answerMarkdown,
        answer: result,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, agentMsg]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to retrieve agent analysis');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeAsk(input);
  };

  const handleResetChat = () => {
    setMessages([]);
    setError(null);
  };

  return (
    <div className="w-full flex-1 rounded-[28px] sm:rounded-[36px] border border-slate-200/90 bg-white p-6 sm:p-8 lg:p-10 shadow-[0_12px_45px_-12px_rgba(15,23,42,0.08)] flex flex-col min-h-[720px] text-slate-800 transition-all font-sans">
      
      {/* 1. Header Bar: Canara AI title on left, New Chat button on right */}
      <header className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-[20px] sm:text-[22px] font-bold text-slate-900 tracking-tight">
            Canara AI
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleResetChat}
            title="New Conversation / Reset"
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:border-slate-300 hover:bg-slate-50 transition-colors shadow-2xs active:scale-[0.98]"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>New Chat</span>
          </button>
        </div>
      </header>

      {/* 2. Main Middle Area: Welcome State OR Message Stream */}
      <div className="flex-1 flex flex-col justify-center min-h-[460px]">
        {messages.length === 0 ? (
          /* Empty / Welcome State with Stacked Questions (No Emojis) */
          <div className="flex flex-col items-center justify-center py-6 sm:py-8 px-2 text-center animate-fadeIn">
            
            {/* Center Glowing 3D Electric Blue Orb */}
            <div className="relative flex items-center justify-center my-2">
              <div className="absolute h-16 w-16 rounded-full bg-[#0022f4]/30 blur-xl animate-pulse" />
              <div className="relative h-14 w-14 sm:h-16 sm:w-16 rounded-full shadow-[0_10px_30px_-5px_rgba(0,34,244,0.5),inset_0_-8px_16px_rgba(0,18,160,0.85),inset_0_4px_8px_rgba(147,197,253,0.75)] bg-[radial-gradient(circle_at_35%_35%,#60a5fa_0%,#0022f4_45%,#0015a8_75%,#020b50_100%)] transition-transform duration-300 hover:scale-105" />
            </div>

            {/* Welcome Greeting */}
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 mt-4">
              Welcome, {displayName}
            </h1>
            <p className="mt-1.5 text-xs sm:text-sm text-slate-500 max-w-md leading-relaxed">
              Ask anything about your supply-chain risks, or select a question below for an immediate solution:
            </p>

            {/* Stacked Questions (No Emojis) */}
            <div className="flex flex-col gap-2.5 w-full max-w-xl mt-6 text-left">
              {READY_QUESTIONS.map((q, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => executeAsk(q.query)}
                  className="group w-full flex items-center justify-between rounded-xl border border-slate-200/90 bg-slate-50/70 hover:bg-white hover:border-[#0022f4] hover:shadow-sm px-4 py-3 text-left transition-all active:scale-[0.99]"
                >
                  <span className="text-xs sm:text-[13px] font-medium text-slate-700 group-hover:text-[#0022f4] transition-colors">
                    {q.label}
                  </span>
                  <svg className="w-4 h-4 text-slate-400 group-hover:text-[#0022f4] group-hover:translate-x-0.5 transition-all shrink-0 ml-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ))}
            </div>

          </div>
        ) : (
          /* Active Chat Stream */
          <div className="flex flex-col gap-6 overflow-y-auto max-h-[580px] pr-1 py-2">
            {messages.map(msg => (
              <div
                key={msg.id}
                className={`flex flex-col ${
                  msg.role === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                {msg.role === 'user' ? (
                  /* User message bubble */
                  <div className="max-w-[85%] sm:max-w-xl rounded-2xl rounded-tr-sm bg-slate-900 px-4 py-3 text-sm text-white shadow-sm">
                    <p className="whitespace-pre-wrap">{msg.text}</p>
                  </div>
                ) : (
                  /* Agent message card */
                  <div className="w-full max-w-4xl flex flex-col gap-4 rounded-2xl border border-slate-200/90 bg-slate-50/60 p-5 sm:p-6 shadow-sm">
                    <div className="flex items-center gap-2.5 border-b border-slate-200/80 pb-3">
                      <div className="h-6 w-6 rounded-full bg-[#0022f4]/15 text-[#0022f4] flex items-center justify-center font-bold text-xs ring-1 ring-[#0022f4]/30">
                        ⚡
                      </div>
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                        Canara AI Verdict
                      </span>
                      <span className="ml-auto text-[11px] font-mono text-slate-400">
                        {projectId}
                      </span>
                    </div>

                    {/* Markdown answer */}
                    <div
                      className="text-sm text-slate-800 leading-relaxed"
                      dangerouslySetInnerHTML={{
                        __html: renderMarkdown(msg.text),
                      }}
                    />

                    {/* Key Findings */}
                    {msg.answer?.keyFindings && msg.answer.keyFindings.length > 0 && (
                      <div className="flex flex-col gap-2 mt-2">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                          Key Security Findings
                        </h4>
                        <div className="grid grid-cols-1 gap-2">
                          {msg.answer.keyFindings.map((finding, idx) => (
                            <div
                              key={idx}
                              className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-2xs"
                            >
                              <span className="mt-1 h-2 w-2 rounded-full bg-[#0022f4] shrink-0" />
                              <div className="flex flex-col">
                                <span className="font-mono text-xs font-semibold text-slate-900">
                                  {finding.nodeId}
                                </span>
                                <span className="text-xs text-slate-500 mt-0.5">
                                  {finding.reason}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Remediation Plan */}
                    {msg.answer?.remediationPlan && msg.answer.remediationPlan.length > 0 && (
                      <div className="flex flex-col gap-2.5 mt-2">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                          Recommended Remediation Steps
                        </h4>
                        <div className="flex flex-col gap-2.5">
                          {msg.answer.remediationPlan.map((step, idx) => {
                            const isHighImpact = step.impact?.toUpperCase() === 'HIGH';
                            return (
                              <div
                                key={idx}
                                className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs"
                              >
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase ${
                                      isHighImpact
                                        ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                                    }`}
                                  >
                                    {step.impact} IMPACT
                                  </span>
                                  <span className="rounded bg-slate-100 border border-slate-200 px-1.5 py-0.5 font-mono text-[10px] font-medium text-slate-600 uppercase">
                                    {step.estimatedBreakage} BREAKAGE RISK
                                  </span>
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
                                <span className="text-xs font-semibold text-slate-900">
                                  {step.title}
                                </span>
                                <ul className="list-disc list-inside space-y-0.5 text-xs text-slate-600">
                                  {step.actions.map((act, aIdx) => (
                                    <li key={aIdx}>{act}</li>
                                  ))}
                                </ul>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Citations */}
                    {msg.answer?.citations && msg.answer.citations.length > 0 && (
                      <details className="mt-2 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-500">
                        <summary className="cursor-pointer font-medium hover:text-slate-900 select-none">
                          Verified References & Citations ({msg.answer.citations.length})
                        </summary>
                        <ul className="mt-2 space-y-1">
                          {msg.answer.citations.map((c, cIdx) => (
                            <li key={cIdx} className="flex items-center gap-2 font-mono text-[11px]">
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600 uppercase font-semibold">
                                {c.type}
                              </span>
                              <span className="text-slate-800">{c.id}</span>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* Loading indicator */}
            {loading && (
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 max-w-sm text-slate-600 text-xs animate-pulse">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#0022f4] border-t-transparent" />
                <span>Canara AI analyzing graph…</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Error state */}
      {error && (
        <div className="my-2 rounded-xl border border-rose-200 bg-rose-50/90 px-3.5 py-2.5 text-xs text-rose-700 flex items-center justify-between">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-rose-500 hover:text-rose-800 font-bold ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* 3. Bottom Chat Input Area */}
      <form onSubmit={handleSubmit} className="mt-4">
        <div className="relative rounded-2xl border border-slate-200/90 bg-white p-2.5 sm:p-3 shadow-[0_4px_20px_-4px_rgba(15,23,42,0.06)] focus-within:border-slate-400 focus-within:shadow-[0_4px_24px_-2px_rgba(15,23,42,0.1)] transition-all">
          
          {/* Main Input Textarea */}
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                executeAsk(input);
              }
            }}
            placeholder="Write your message…"
            rows={1}
            disabled={loading}
            className="w-full resize-none border-0 bg-transparent px-2 pt-1 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-0 leading-relaxed max-h-32"
          />

          {/* Bottom Toolbar inside the input card */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-100 mt-2 px-1">
            {/* Left Action Buttons */}
            <div className="flex items-center gap-1 sm:gap-1.5 text-slate-400">
              {/* Paperclip */}
              <button
                type="button"
                title="Attach SBOM / Lockfile"
                className="h-7 w-7 rounded-lg hover:bg-slate-100 hover:text-slate-600 flex items-center justify-center transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
              </button>

              {/* Search / Graph query */}
              <button
                type="button"
                title="Search Knowledge Graph"
                className="h-7 w-7 rounded-lg hover:bg-slate-100 hover:text-slate-600 flex items-center justify-center transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>

              {/* Code */}
              <button
                type="button"
                title="Code Directive"
                className="h-7 w-7 rounded-lg hover:bg-slate-100 hover:text-slate-600 flex items-center justify-center transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
              </button>
            </div>

            {/* Right Action: Send Button */}
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="h-8 w-8 rounded-xl bg-[#0022f4] hover:bg-[#001ad4] active:scale-95 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white flex items-center justify-center shadow-xs transition-all"
                title="Send Message"
              >
                {loading ? (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                ) : (
                  <svg
                    className="w-4 h-4 translate-x-[0.5px]"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" fill="currentColor" fillOpacity="0.2" />
                  </svg>
                )}
              </button>
            </div>
          </div>

        </div>
      </form>

    </div>
  );
}
