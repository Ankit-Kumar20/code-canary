'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { AUTH_BG_IMAGE } from './auth-bg-data';

type Mode = 'sign-in' | 'sign-up';

export default function SignInPage() {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const [mode, setMode] = useState<Mode>('sign-in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (session) router.replace('/');
  }, [session, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);

    const { error } =
      mode === 'sign-in'
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({ name, email, password });

    if (error) {
      setError(error.message ?? 'Something went wrong. Try again.');
      setSubmitting(false);
      return;
    }
    router.replace('/');
  };

  const isSignIn = mode === 'sign-in';

  return (
    <main className="min-h-screen bg-white flex items-center justify-center p-4 sm:p-6 lg:p-12 font-sans selection:bg-[#0022f4]/20 selection:text-[#0022f4]">
      {/* Outer Shell Card - Longer, more expansive length & proportion with subtle high-craft shadow */}
      <div className="w-full max-w-6xl rounded-[30px] sm:rounded-[36px] bg-white p-3.5 sm:p-5 shadow-[0_20px_60px_-15px_rgba(15,23,42,0.12),0_4px_20px_-4px_rgba(15,23,42,0.06)] border border-slate-200/90 overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10 items-stretch">
          
          {/* Left Column: Visual Artwork + Sleek Headline (Boxes & Pill removed) */}
          <div className="lg:col-span-6 relative overflow-hidden rounded-[24px] sm:rounded-[28px] min-h-[520px] sm:min-h-[600px] lg:min-h-[680px] p-8 sm:p-10 lg:p-12 flex flex-col justify-between text-white select-none">
            {/* Background Texture Artwork from assets/image.png */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={AUTH_BG_IMAGE}
              alt="Code Canary Visual Artwork"
              className="absolute inset-0 h-full w-full object-cover object-center pointer-events-none scale-105"
            />

            {/* Subtle elegant gradient overlay for contrast without any neon effects */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-black/15 to-black/70 pointer-events-none" />
            <div className="absolute inset-0 rounded-[24px] sm:rounded-[28px] ring-1 ring-inset ring-white/15 pointer-events-none" />

            {/* Top Brand Identity */}
            <div className="relative z-10">
              <span className="text-[17px] font-semibold tracking-tight text-white">
                Code Canary
              </span>
            </div>

            {/* Bottom Content Area: Pure, clean typography over artwork */}
            <div className="relative z-10 mt-auto pb-4 pt-16">
              <h1 className="text-3xl sm:text-4xl lg:text-[44px] font-bold tracking-tight text-white leading-[1.12]">
                Start your Journey
              </h1>

              <p className="mt-3.5 text-sm sm:text-base text-white/80 max-w-md leading-relaxed font-normal">
                {isSignIn
                  ? 'Sign in to monitor dependency graphs, audit lockfiles, and fix CVE vulnerabilities in real-time.'
                  : 'Follow these simple steps to set up your account and automate SBOM dependency intelligence.'}
              </p>
            </div>

          </div>

          {/* Right Column: Clean, Spacious Auth Form */}
          <div className="lg:col-span-6 flex flex-col justify-center px-4 py-8 sm:px-8 sm:py-10 lg:px-12 lg:py-12">
            <div className="w-full max-w-[420px] mx-auto">
              
              {/* Heading */}
              <div className="text-center mb-7">
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                  {isSignIn ? 'Welcome Back' : 'Join Us'}
                </h2>
                <p className="mt-1.5 text-xs sm:text-sm text-slate-500">
                  {isSignIn
                    ? 'Sign in to scan projects and review audits.'
                    : 'Start auditing your supply chain and SBOM.'}
                </p>
              </div>

              {/* Error message */}
              {error && (
                <div
                  role="alert"
                  className="mb-5 flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50/80 px-3.5 py-2.5 text-xs text-rose-700"
                >
                  <svg
                    className="w-4 h-4 text-rose-500 shrink-0 mt-0.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                  <span className="leading-snug">{error}</span>
                </div>
              )}

              {/* Form */}
              <form onSubmit={submit} className="flex flex-col gap-4">
                {!isSignIn && (
                  <label className="flex flex-col gap-1.5 text-left">
                    <span className="text-xs font-semibold text-slate-700">Full Name</span>
                    <input
                      className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 text-sm text-slate-900 placeholder:text-slate-400 transition-all focus:bg-white focus:border-[#0022f4] focus:ring-2 focus:ring-[#0022f4]/15 focus:outline-none"
                      placeholder="Juliette Karapetyan"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      autoComplete="name"
                      required
                    />
                  </label>
                )}

                <label className="flex flex-col gap-1.5 text-left">
                  <span className="text-xs font-semibold text-slate-700">Email</span>
                  <input
                    className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 text-sm text-slate-900 placeholder:text-slate-400 transition-all focus:bg-white focus:border-[#0022f4] focus:ring-2 focus:ring-[#0022f4]/15 focus:outline-none"
                    type="email"
                    placeholder="name@company.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    autoComplete="email"
                    spellCheck={false}
                    required
                  />
                </label>

                <label className="flex flex-col gap-1.5 text-left">
                  <span className="text-xs font-semibold text-slate-700">Password</span>
                  <div className="relative">
                    <input
                      className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/70 pl-3.5 pr-10 text-sm text-slate-900 placeholder:text-slate-400 transition-all focus:bg-white focus:border-[#0022f4] focus:ring-2 focus:ring-[#0022f4]/15 focus:outline-none"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••••••"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      autoComplete={isSignIn ? 'current-password' : 'new-password'}
                      minLength={8}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                      tabIndex={-1}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18"
                          />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                          />
                        </svg>
                      )}
                    </button>
                  </div>
                  {!isSignIn && (
                    <span className="text-[11px] text-slate-400 mt-0.5">
                      At least 8 characters with lowercase, uppercase &amp; numbers.
                    </span>
                  )}
                </label>

                {/* Submit button - Matched to the exact rich cobalt blue of the artwork */}
                <button
                  type="submit"
                  disabled={submitting}
                  className="mt-2 h-11 w-full rounded-xl bg-[#0022f4] hover:bg-[#001ad4] active:scale-[0.99] font-semibold text-sm text-white shadow-sm transition-all flex items-center justify-center disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0022f4]"
                >
                  {submitting ? (
                    <span className="flex items-center gap-2">
                      <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      {isSignIn ? 'Signing in…' : 'Creating account…'}
                    </span>
                  ) : (
                    'Continue'
                  )}
                </button>
              </form>

              {/* Mode Switcher */}
              <p className="mt-4 text-center text-xs text-slate-500">
                {isSignIn ? "Don't have an account?" : 'Already have an account?'}{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode(isSignIn ? 'sign-up' : 'sign-in');
                    setError(null);
                  }}
                  className="font-semibold text-[#0022f4] hover:text-[#001ad4] transition-colors"
                >
                  {isSignIn ? 'Create one' : 'Log in'}
                </button>
              </p>

              {/* Legal Footer */}
              <p className="mt-5 text-center text-[11px] text-slate-400 leading-relaxed">
                By continuing, you agree to Code Canary’s{' '}
                <span className="text-slate-600 underline underline-offset-2 cursor-pointer">Terms of Service</span>{' '}
                and{' '}
                <span className="text-slate-600 underline underline-offset-2 cursor-pointer">Privacy Policy</span>.
              </p>

            </div>
          </div>

        </div>
      </div>
    </main>
  );
}
