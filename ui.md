# climbcal — UI & Design Guide

A portable description of how this app looks, feels, and is styled.
Keep this as a reference for future projects: the *patterns* below (dark-first
tokens, a single primitives module, token-based theming, contrast tests) are
reusable even when the domain changes.

- **Stack:** React 19 + Vite + TypeScript + Tailwind CSS 4 + React Router.
- **Styling model:** Tailwind utility classes only — no CSS Modules, no
  styled-components. The one hand-written stylesheet is `src/index.css`, used
  for theme tokens, base element styles, and two non-utility rules.
- **Design language:** dark-first, low-chrome, card-based, mobile-first.

---

## 1. Design principles

1. **Dark-first, theme-agnostic components.** Every component is written once
   against Tailwind's `zinc` / `emerald` scales. The light theme redefines those
   *same* tokens, so no component needs a `dark:` variant to look right. A
   `dark:` utility is almost never needed.
2. **One source of truth for styling.** All colour token values live in
   `src/index.css`. All shared component classes (buttons, inputs, cards) live
   in `src/components/ui.tsx`. Change a button once and it changes everywhere.
3. **Composition over configuration.** Small primitives (`Card`, `Field`,
   `Select`, `Avatar`) are composed by pages. There is no giant themed
   component library.
4. **Mobile-first, then enhance.** Base styles target phones; `sm:` adds
   desktop detail. Some content is *deliberately* desktop-only (see §9).
5. **Accessibility is tested, not assumed.** Contrast ratios (`theme.test.ts`)
   and the mobile zoom guard (`mobile.test.ts`) are asserted in CI.

---

## 2. Theming architecture

The theme is driven by a single `.dark` class on `<html>`, **not** the OS
preference at render time. This lets the in-app toggle override the OS.

### Wiring

| Piece | File | Role |
| ----- | ---- | ---- |
| `@custom-variant dark` | `src/index.css` | Makes `dark:` key off `.dark` on `<html>` |
| `@theme { … }` block | `src/index.css` | Light-theme token values (the default) |
| `.dark { … }` block | `src/index.css` | Dark-theme overrides of the same tokens |
| `ThemeProvider` / `useTheme` | `src/hooks/useTheme.tsx` | State, localStorage, applies the class |
| Pre-paint script | `index.html` | Sets `.dark` before first paint (no flash) |
| `ThemeToggle` | `src/components/ThemeToggle.tsx` | The ☀️ / 🌙 button |

The storage key `climbcal-theme` is defined once (`THEME_STORAGE_KEY`) and the
pre-paint script in `index.html` reads the literal string; `theme.test.ts`
asserts they stay in sync.

```ts
// applyTheme — the ONLY place the theme touches the DOM
document.documentElement.classList.toggle('dark', theme === 'dark')
```

**Reusable idea:** put theme tokens in CSS custom properties under a class, then
write components against the *token names* (via Tailwind), never against raw hex.

---

## 3. Colour system

### Semantic zinc scale (surfaces + text)

Components use `zinc-*` by **semantic role**, and the light theme flips the
values so the role is preserved in both themes:

| Utility | Role | Light value | Dark value |
| ------- | ---- | ----------- | ---------- |
| `zinc-950` | page background | `#fafafa` | `#09090b` |
| `zinc-900` | card / raised surface | `#ffffff` | `#18181b` |
| `zinc-800` | card border | `#e4e4e7` | `#27272a` |
| `zinc-700` | input / button border | `#d4d4d8` | `#3f3f46` |
| `zinc-600` | hover border, ring | `#a1a1aa` | `#52525b` |
| `zinc-100` | primary text | `#18181b` | `#f4f4f5` |
| `zinc-200` | strong text | `#27272a` | `#e4e4e7` |
| `zinc-300` | form labels | `#3f3f46` | `#d4d4d8` |
| `zinc-400` | muted / secondary text | `#52525b` | `#a1a1aa` |
| `zinc-500` | hint / small print | `#71717a` | `#71717a` |

> Note how `zinc-950` (background) is **darker** in dark mode and **lighter**
> in light mode. Same class name, opposite luminosity — because the token is
> defined per theme.

### Accent & status

| Token group | Role |
| ----------- | ---- |
| `emerald-*` | Accent: primary buttons, own sessions, links, success |
| `red-*` | Danger: error banners, delete buttons |
| `sky-*` | Info: neutral notices, planned/future heatmap cells |

Accent surfaces use the `bg-emerald-950/40 border-emerald-800` **tinted card**
pattern, with `text-emerald-200/300` for readable ink on top.

---

## 4. Typography

- System font stack (`--font-sans`): `ui-sans-serif, system-ui, 'Segoe UI',
  Roboto, Helvetica, Arial, sans-serif`. No webfont, no FOUT.
- Antialiasing enabled on `body` (`-webkit-font-smoothing: antialiased`).
- Tailwind's default weight/size utilities only. Common choices:
  - Page/section title: `text-lg font-semibold`
  - Card title: `text-sm font-medium`
  - Body: `text-sm`
  - Metadata / hints: `text-xs` with `text-zinc-500`
  - Stat number: `text-2xl font-semibold`
  - All-caps micro-label: `text-xs uppercase tracking-wide text-zinc-500`

---

## 5. Layout & spacing

- **App shell** (`Layout.tsx`): `mx-auto max-w-6xl`, `px-4 sm:px-6`,
  `flex min-h-svh flex-col`. `main` is `flex-1`.
- **Header:** logo + nav + theme toggle/avatar/sign-out. Nav wraps to its own
  row on phones via `order-3 w-full sm:order-2 sm:w-auto`.
- **Cards:** `rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 shadow-sm
  shadow-black/20`. Nested session cards use `rounded-lg` (one step smaller).
- **Radii:** `rounded-lg` for controls and inner cards, `rounded-xl` for top
  level cards, `rounded-full` for pills/badges/avatars.
- **Spacing rhythm:** gap/padding multiples of Tailwind's scale — `p-2.5`,
  `p-3`, `p-4`, `gap-2`, `gap-3`, `space-y-2`, `space-y-4`.
- **Grids:** `grid-cols-2 gap-3 sm:grid-cols-3` for stat cards; a 7-column
  Mon–Sun grid for the week; `flex gap-0.5` for the stats heatmap.

---

## 6. Component primitives (`src/components/ui.tsx`)

Everything visual is built from these. Reuse them across pages.

### Class-name helpers

```ts
cx(...values) // tiny clsx replacement: joins truthy class strings
```

### Buttons — shared class constants

| Constant | Look |
| -------- | ---- |
| `primaryButtonClass` | Solid `bg-emerald-600`, white text, hover `emerald-500` |
| `secondaryButtonClass` | Bordered `bg-zinc-900`, `zinc-200` text |
| `dangerButtonClass` | Tinted red border/panel, `red-200` text |
| `ghostButtonClass` | Borderless, `zinc-300`, hover `bg-zinc-800` |

All four share the same shape: `inline-flex items-center justify-center gap-2
rounded-lg px-3.5 py-2 text-sm font-* transition`, with
`focus-visible:ring-2 … disabled:cursor-not-allowed disabled:opacity-60`.

### Inputs

```ts
inputClass   // w-full rounded-lg border border-zinc-700 bg-zinc-950/70
             // px-3 py-2 text-sm … focus:border-emerald-600 focus:ring-2
selectClass  // inputClass + appearance-none pr-9 (Select draws its own chevron)
```

`Select` wraps a native `<select>` in `relative` and overlays a `currentColor`
chevron so it themes with text. Props pass straight through to the element.

### Structure

| Component | Purpose |
| --------- | ------- |
| `Card` | The rounded, bordered surface |
| `SectionHeading` | Title + optional hint + optional right-hand action |
| `Field` | Label + control + hint wrapper for forms |
| `Disclosure` | Collapsible section (see §8) |
| `EmptyState` | Dashed-border placeholder with title + hint |
| `ErrorBanner` | Tinted red alert, optional dismiss |
| `Notice` | Info / success banner (`tone`) |
| `Spinner` / `PageLoader` | Loading affordances |
| `VisibilityBadge` | Public/Private pill |
| `Avatar` | Initial chip (see §7) |
| `GymNameChip` / `GymCell` | Coloured domain label (see §7b) |

### The tinted alert/notice pattern

```tsx
// Error
className="border-red-900/60 bg-red-950/40 text-red-200"
// Success
className="border-emerald-900/60 bg-emerald-950/40 text-emerald-200"
// Info
className="border-sky-900/60 bg-sky-950/40 text-sky-200"
```

`border-<hue>-900/60` + `bg-<hue>-950/40` + `text-<hue>-200` reads as a status
surface in dark mode, and the light theme's redefined tokens keep it soft.


---

## 7. Identity colours

### a. Avatars (`src/lib/avatar.ts`)

- 8 hues: `emerald, sky, violet, fuchsia, rose, amber, teal, indigo`.
- Hue is **derived from the user id** (a small string hash), so a climber keeps
  the same colour on every page and render — no flicker.
- Each hue has a chip token + an ink token in **both** themes
  (`--color-avatar-<hue>` and `--color-avatar-<hue>-ink`).
- Class names are written literally (`AVATAR_HUE_CLASSES`) because Tailwind only
  sees class strings that appear in source.
- Sizes: `xs` (calendar dot, `h-5 w-5`), `sm` (card chip, `h-7 w-7`),
  `md` (header, `h-9 w-9`). Initials via `initialsOf(profile)`.

### b. Gym brand colours (`src/lib/gymColors.ts`)

- A `Record<gymName, {primary, background}>` of real-world brand pairs.
- Rendered **verbatim**: `primary` fills the chip, `background` is the label ink.
  No contrast correction (an intentional, documented trade-off).
- `GymNameChip` applies them via inline `style` (dynamic values can't be static
  Tailwind classes); gyms with no palette fall back to the neutral
  `border-zinc-700 bg-zinc-800/60` chip.

**Reusable idea:** stable, data-derived accents (hash → palette) beat random
colours. They give each entity a persistent visual identity.

---

## 8. Interaction patterns

### Collapsible disclosure

`Disclosure` sections **start closed** so a long page opens compact. The whole
header row is the click target, but the accessible control is a real `<button>`
with `aria-expanded` / `aria-controls`. `hint` and `action` sit *outside* the
panel so a folded section still says what it is.

### URL as UI state

View modes and periods live in the query string so they are linkable and
shareable:
`/week?week=2026-09-14`, `/feed?view=calendar&month=2026-09`,
`/u/<username>` for public shares.

### Modals

`SessionFormModal` is a single add/edit dialog. Native `<select>` + `<optgroup>`
keep the gym picker grouped by region; a sentinel option (`__other__`,
`__exact__`) switches between preset and free-text/clock input.

### Feedback

- Loading: `PageLoader` (spinner + label) or a per-section loading hint.
- Empty: `EmptyState` with a title and a forward-looking hint.
- Errors: `ErrorBanner` at the top of the section.
- Success/info: `Notice`.
- Share/copy: status text swaps to "Copied", never a toast dependency.

---

## 9. Responsive & mobile details

- **Breakpoint:** a single `sm:` step does most of the work; layout is
  single-column on phones.
- **Desktop-only small print:** `subTextClass = 'hidden … sm:block'`. Friend
  nudges and per-day counts are hidden on phones so cards stay uncluttered.
- **iOS focus-zoom guard** (`src/index.css`): form controls are forced to
  `16px` for `@media (hover: none) and (pointer: coarse)`. iOS Safari zooms the
  page whenever a focused field is under 16px; the shared `inputClass` is 14px
  (`text-sm`), so this hard override prevents the zoom. It is deliberately
  unlayered so it beats Tailwind utilities, and keyed to pointer type (not
  width) because a phone in landscape is wider than `sm` but still zooms.
- **Viewport meta** allows pinch-zoom (`width=device-width, initial-scale=1`,
  no `maximum-scale`) — enforced by `mobile.test.ts`.
- **Tap targets:** small controls carry padding + `leading-6`; the whole
  disclosure header row is tappable.


---

## 10. Accessibility

- Real semantic elements: `<button>`, `<select>`, `<nav>`, headings with a kept
  outline level (`Disclosure` takes `headingLevel`).
- `aria-label` on icon-only controls (`ThemeToggle`, the day `+` button, the
  spinner as `role="status"`).
- `aria-expanded` / `aria-controls` on disclosures; `aria-hidden` on decorative
  glyphs (emoji logo, avatar initials, chevrons).
- Focus rings everywhere via `focus-visible:ring-2`.
- **Contrast is enforced by tests** (`src/theme.test.ts`):
  - Body text pairs: WCAG AA ≥ 4.5:1 in both themes.
  - Secondary text: ≥ 4.5:1 light, ≥ 1.3:1 dark.
  - Borders: ≥ 1.05:1 (visible).
  - Every avatar chip's ink: ≥ 4.5:1 in both themes.

---

## 11. How the design is verified

Because the token values live in CSS, tests **parse `src/index.css` and
`index.html` from disk** (Vitest stubs CSS imports) rather than duplicating
values:

- `src/theme.test.ts` — parses the `@theme` and `.dark` blocks, computes WCAG
  contrast for the documented pairs, checks every avatar hue has a chip+ink pair
  in both themes, and asserts the toggle / pre-paint script stay wired to the
  same storage key and `.dark` class.
- `src/mobile.test.ts` — asserts the 16px touch-form-control rule and the
  zoom-friendly viewport meta.

**Rule of thumb:** if a design decision matters (contrast, zoom, grid shape),
encode it as a test that reads the real source so it can't silently drift.

---

## 12. Copying this into a new project — checklist

1. **Tokens first.** Create `src/index.css` with `@import 'tailwindcss'`, a
   `@custom-variant dark (&:where(.dark, .dark *))`, an `@theme` block of
   light values, and a `.dark` block that redefines the *same* token names.
2. **Pre-paint script** in `index.html` that reads a `*-theme` localStorage key
   and toggles `.dark` before first paint; add a `theme-color` meta.
3. **`useTheme` provider** with `getInitialTheme` (saved → OS fallback) and
   `applyTheme` (toggles the class + meta colour).
4. **One `ui.tsx` module** exporting `cx`, the four button classes, `inputClass`
   / `selectClass`, and the Card/Field/Disclosure/EmptyState/ErrorBanner/Notice
   primitives. Keep class constants here, not scattered in pages.
5. **Stable identity colours** via a hash → palette helper, tokens defined per
   theme, class names written literally.
6. **Mobile-first** layouts; add `sm:` only to enhance. Use a `subTextClass`
   for desktop-only small print.
7. **Add the guards:** a theme-contrast test and a mobile-form-control test that
   read the CSS/HTML from disk.
8. **Keep `dark:` variants rare.** If a component needs one, a token is probably
   missing.

---

### File map

| Concern | File |
| ------- | ---- |
| Theme tokens, base styles, mobile guard | `src/index.css` |
| Theme state & persistence | `src/hooks/useTheme.tsx` |
| Theme toggle button | `src/components/ThemeToggle.tsx` |
| Pre-paint script, viewport meta | `index.html` |
| Design primitives & class tokens | `src/components/ui.tsx` |
| App shell / header / nav | `src/components/Layout.tsx` |
| Avatar palette | `src/lib/avatar.ts` |
| Gym brand colours | `src/lib/gymColors.ts` |
| Heatmap / stats visuals | `src/lib/stats.ts` |
| Contrast + wiring tests | `src/theme.test.ts` |
| Mobile behaviour tests | `src/mobile.test.ts` |

