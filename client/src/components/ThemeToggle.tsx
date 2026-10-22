import { useTheme } from '../hooks/useTheme';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const dark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-input bg-card text-base transition hover:border-ring hover:bg-card-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
    >
      <span aria-hidden>{dark ? '☀️' : '🌙'}</span>
    </button>
  );
}
