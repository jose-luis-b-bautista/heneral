import type { HTMLAttributes, ReactNode } from 'react';

/** Tiny clsx: joins truthy class strings. */
export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

/* ------------------------------- Buttons ------------------------------- */
const buttonBase =
  'inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface ' +
  'disabled:cursor-not-allowed disabled:opacity-60';

export const primaryButtonClass = cx(buttonBase, 'bg-accent text-accent-ink hover:bg-accent-strong');
export const secondaryButtonClass = cx(
  buttonBase,
  'border border-input bg-card text-ink hover:border-ring hover:bg-card-soft',
);
export const dangerButtonClass = cx(
  buttonBase,
  'border border-red-900/60 bg-red-950/40 text-red-200 hover:bg-red-950/70',
);
export const ghostButtonClass = cx(buttonBase, 'text-label hover:bg-card-soft hover:text-ink');

/* -------------------------------- Inputs ------------------------------- */
export const inputClass =
  'w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm text-ink placeholder:text-faint ' +
  'transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:opacity-60';

/* ------------------------------ Structure ------------------------------ */
export function Card({ children, className, ...rest }: { children: ReactNode; className?: string } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx('rounded-xl border border-border bg-card p-4 shadow-sm shadow-black/5', className)}
      {...rest}
    >
      {children}
    </div>
  );
}

export function SectionHeading({
  title,
  hint,
  action,
}: {
  title: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div>
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {hint ? <p className="mt-0.5 text-xs text-faint">{hint}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium uppercase tracking-wide text-label">{label}</span>
      {children}
      {error ? <span className="block text-xs text-red-300">{error}</span> : hint ? <span className="block text-xs text-faint">{hint}</span> : null}
    </label>
  );
}

export function EmptyState({ title, hint, action }: { title: ReactNode; hint?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-input px-6 py-10 text-center">
      <p className="text-sm font-medium text-ink">{title}</p>
      {hint ? <p className="max-w-sm text-xs text-faint">{hint}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function ErrorBanner({ children, onDismiss }: { children: ReactNode; onDismiss?: () => void }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2.5 text-sm text-red-200"
    >
      <span className="flex-1">{children}</span>
      {onDismiss ? (
        <button type="button" onClick={onDismiss} aria-label="Dismiss" className="text-red-300/70 hover:text-red-200">
          ✕
        </button>
      ) : null}
    </div>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'success'; children: ReactNode }) {
  const tones = {
    info: 'border-sky-900/60 bg-sky-950/40 text-sky-200',
    success: 'border-emerald-900/60 bg-emerald-950/40 text-emerald-200',
  } as const;
  return <div className={cx('rounded-lg border px-3 py-2.5 text-sm', tones[tone])}>{children}</div>;
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span role="status" aria-label={label || 'Loading'} className="inline-flex items-center gap-2 text-sm text-muted">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      {label}
    </span>
  );
}

const AVATAR_HUES = ['emerald', 'sky', 'violet', 'fuchsia', 'rose', 'amber', 'teal', 'indigo'] as const;
type Hue = (typeof AVATAR_HUES)[number];

// Literal class pairs (Tailwind must see them in source).
const AVATAR_HUE_CLASSES: Record<Hue, string> = {
  emerald: 'bg-emerald-900/50 text-emerald-200',
  sky: 'bg-sky-900/50 text-sky-200',
  violet: 'bg-violet-900/50 text-violet-200',
  fuchsia: 'bg-fuchsia-900/50 text-fuchsia-200',
  rose: 'bg-rose-900/50 text-rose-200',
  amber: 'bg-amber-900/50 text-amber-200',
  teal: 'bg-teal-900/50 text-teal-200',
  indigo: 'bg-indigo-900/50 text-indigo-200',
};

function hashHue(id: string): Hue {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_HUES[h % AVATAR_HUES.length];
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  const initials = parts.map((p) => p[0]?.toUpperCase() || '').join('');
  return initials || name.slice(0, 2).toUpperCase();
}

export function Avatar({ name, id, size = 'md' }: { name: string; id: string; size?: 'sm' | 'md' }) {
  const hue = hashHue(id);
  const sizes = { sm: 'h-7 w-7 text-xs', md: 'h-9 w-9 text-sm' } as const;
  return (
    <span
      aria-hidden
      className={cx('inline-flex items-center justify-center rounded-full font-semibold', AVATAR_HUE_CLASSES[hue], sizes[size])}
    >
      {initialsOf(name)}
    </span>
  );
}
