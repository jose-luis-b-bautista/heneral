import type { ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';
import { ThemeToggle } from './ThemeToggle';
import { Avatar } from './ui';

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();

  return (
    <div className="mx-auto flex min-h-svh max-w-2xl flex-col px-4 py-4 sm:px-6 sm:py-6">
      <header className="mb-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-ink" aria-hidden>
            <span className="text-lg">⚑</span>
          </span>
          <div className="leading-tight">
            <h1 className="text-base font-bold text-ink">Salpakan</h1>
            <p className="text-[11px] text-faint">Game of the Generals</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {user ? (
            <>
              <div className="hidden items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 sm:flex">
                <Avatar name={user.username} id={user.id} size="sm" />
                <div className="leading-tight">
                  <p className="text-xs font-semibold text-ink">{user.username}</p>
                  <p className="text-[11px] text-faint">
                    {user.wins}W · {user.losses}L · {user.draws}D
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={logout}
                className="rounded-lg border border-input bg-card px-3 py-2 text-sm font-medium text-label transition hover:border-ring hover:bg-card-soft hover:text-ink"
              >
                Sign out
              </button>
            </>
          ) : null}
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1">{children}</main>
    </div>
  );
}
