import { useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { Card, ErrorBanner, Field, inputClass, primaryButtonClass } from '../components/ui';

export function AuthPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'login') await login(username.trim(), password);
      else await register(username.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-sm">
      <Card>
        <div className="mb-4 flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-accent-ink" aria-hidden>
            <span className="text-xl">⚑</span>
          </span>
          <div>
            <h1 className="text-lg font-bold text-ink">Salpakan</h1>
            <p className="text-xs text-faint">Game of the Generals</p>
          </div>
        </div>

        {/* Mode switch */}
        <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg border border-border bg-surface p-1">
          {(['login', 'register'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setError(null);
              }}
              className={
                mode === m
                  ? 'rounded-md bg-card py-1.5 text-sm font-semibold text-ink shadow-sm'
                  : 'rounded-md py-1.5 text-sm font-medium text-muted hover:text-ink'
              }
            >
              {m === 'login' ? 'Log in' : 'Sign up'}
            </button>
          ))}
        </div>

        {error ? (
          <div className="mb-3">
            <ErrorBanner>{error}</ErrorBanner>
          </div>
        ) : null}

        <form onSubmit={onSubmit} className="space-y-3">
          <Field label="Username">
            <input
              className={inputClass}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              minLength={3}
              maxLength={32}
            />
          </Field>
          <Field label="Password" hint={mode === 'register' ? 'At least 6 characters.' : undefined}>
            <input
              type="password"
              className={inputClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              minLength={6}
            />
          </Field>
          <button type="submit" disabled={busy} className={`${primaryButtonClass} w-full`}>
            {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}
          </button>
        </form>
      </Card>
    </div>
  );
}
