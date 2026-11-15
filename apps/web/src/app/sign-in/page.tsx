'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';

type Mode = 'sign-in' | 'sign-up';

const inputClass =
  'h-10 w-full rounded-lg border border-line bg-surface px-3 text-[16px] sm:text-[13px] text-ink shadow-sm placeholder:text-ink-faint transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20';

export default function SignInPage() {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const [mode, setMode] = useState<Mode>('sign-in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4 text-[13px]">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-[13px] font-bold text-white shadow-sm">
            C
          </div>
          <div className="flex flex-col">
            <span className="text-[14px] font-semibold tracking-tight text-ink leading-tight">Code Canary</span>
            <span className="text-[11px] text-ink-faint">Security & SBOM</span>
          </div>
        </div>

        <div className="rounded-xl border border-line bg-surface p-6 shadow-card">
          <h1 className="text-[16px] font-semibold text-ink">{isSignIn ? 'Sign in' : 'Create your account'}</h1>
          <p className="mt-1 text-ink-muted">
            {isSignIn ? 'Sign in to scan projects and review audits.' : 'Start auditing your dependencies.'}
          </p>

          <form onSubmit={submit} className="mt-5 flex flex-col gap-3.5">
            {!isSignIn && (
              <label className="flex flex-col gap-1.5">
                <span className="font-medium text-ink">Name</span>
                <input
                  className={inputClass}
                  value={name}
                  onChange={e => setName(e.target.value)}
                  autoComplete="name"
                  required
                />
              </label>
            )}
            <label className="flex flex-col gap-1.5">
              <span className="font-medium text-ink">Email</span>
              <input
                className={inputClass}
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
                spellCheck={false}
                required
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-medium text-ink">Password</span>
              <input
                className={inputClass}
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete={isSignIn ? 'current-password' : 'new-password'}
                minLength={8}
                required
              />
            </label>

            {error && (
              <p role="alert" className="rounded-lg border border-critical-border bg-critical-bg px-3 py-2 text-critical">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="mt-1 flex h-10 items-center justify-center rounded-lg bg-accent px-4 font-semibold text-white shadow-sm transition-colors hover:bg-accent-hover active:scale-[0.99] disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {submitting ? (isSignIn ? 'Signing in…' : 'Creating account…') : isSignIn ? 'Sign in' : 'Create account'}
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-ink-muted">
          {isSignIn ? "Don't have an account?" : 'Already have an account?'}{' '}
          <button
            type="button"
            onClick={() => {
              setMode(isSignIn ? 'sign-up' : 'sign-in');
              setError(null);
            }}
            className="font-semibold text-accent hover:text-accent-hover"
          >
            {isSignIn ? 'Create one' : 'Sign in'}
          </button>
        </p>
      </div>
    </main>
  );
}
