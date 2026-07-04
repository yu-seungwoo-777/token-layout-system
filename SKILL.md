---
name: token-layout-system
description: >-
  Build a reusable, token-driven layout system in Next.js (App Router) with
  Tailwind v4 CSS-first @theme and shadcn/ui. Produces a 4-layer CSS token
  system (raw → semantic → layout → component), a Shell component with
  switchable 1/2/3 columns and a responsive sidebar-to-Sheet drawer, and
  shadcn components retrofitted so every color and dimension flows from one
  token source (dark mode with zero component edits). Use this whenever the
  user wants a design-token layout, a reusable Header/Footer/Sidebar Shell,
  column/grid layout variants, Tailwind v4 @theme token architecture, a
  shadcn component library wired to CSS variables, or asks to keep hardcoded
  px/hex out of components — even if they don't say "token system" by name.
---

# Token Layout System

Build a self-contained layout system where **one token source drives every
color and dimension**. The payoff: switch a `Shell` prop to reflip 1/2/3
columns, toggle `.dark` and the whole tree (including portaled overlays)
recolors with no component edits, and a grep guard provably keeps raw
`px`/`#hex` out of components so the system stays extractable into a shadcn
registry later.

Stack: Next.js App Router · Tailwind v4 (CSS-first `@theme`, **no
`tailwind.config.js`**) · shadcn/ui via **CLI** (not the shadcn skill) · cva.

## The one non-negotiable rule

**No raw `px` or `#hex` in `src/components/**`.** Every value is a token
reference — `var(--token)`, a `[var(--token)]` arbitrary, or a Tailwind scale
utility (`h-8`, `ring-3`, `min-w-24`) that compiles to rem without a px
literal in source. This is what makes the system themeable and portable, and
`scripts/verify.sh` enforces it. Token *definition* files (`src/styles/**`)
may hold literals — that's the point of the raw layer.

## Workflow

### 0. Scaffold
```
npx create-next-app@latest <app> --typescript --tailwind --app --src-dir --import-alias "@/*"
cd <app>
npx shadcn@latest init -d          # detects Next + Tailwind v4; writes components.json
npx shadcn@latest add separator sheet skeleton
```
Note the actual versions: `create-next-app@latest` may install Next 16 and a
shadcn style (`base-nova`) built on `@base-ui/react` rather than Radix. The
approach is identical; just expect base-ui APIs (see `references/gotchas.md`).

**What generalizes vs. what's style-specific.** Confirm which style you got:
`grep '"style"' components.json` and check whether `button.tsx` imports
`@base-ui/react` or `@radix-ui`. The *architecture* always transfers — the
4-layer tokens, `@theme inline`, Shell, grep guard, and verify pipeline are
style-agnostic, so copy those assets verbatim. But `assets/components/*` and
`references/gotchas.md` were captured against the **base-ui / base-nova** style;
if the CLI gave you a Radix-based style, treat them as a *worked example*, not a
drop-in: the generated component internals differ, so apply the
`shadcn-retrofit.md` **principles** (re-grep after every `add`; map each px/hex
to a token) rather than pasting class strings, and expect different composition
rules than the base-ui ones in gotchas. The one invariant across styles: fresh
shadcn output smuggles in raw px, so the grep-then-retrofit loop is mandatory
either way.

### 1. Token layer — copy, don't hand-write
Copy the four files in `assets/tokens/` to `src/styles/tokens/`:
- **raw.css** — primitives only (HSL color scales, `--space-1..8`,
  `--radius-*`, `--text-*`, weights). The *only* literals in the system.
- **semantic.css** — role tokens (`--color-primary`, `--color-background`,
  `--color-danger`…) as `var()` of raw, redefined under `.dark`. Plus
  unprefixed aliases (`--primary`…) for base-ui internals that read them.
- **layout.css** — `--header-height`, `--sidebar-width`, `--grid-3col-ratio`…
- **component.css** — per-component exception tokens (`--button-radius`,
  `--input-height`, `--switch-*`…).

Then wire them in `src/app/globals.css` (copy `assets/globals.css`): import
the four files, then expose them via `@theme inline`. The `inline`
self-reference (`--color-primary: var(--color-primary)`) is load-bearing —
see gotcha #1. This yields utilities `bg-primary`, `text-muted-foreground`,
`h-header`, `w-sidebar`, `text-2xl`.

Adjust import paths in `globals.css` to your tree (`../styles/tokens/…`).

### 2. Shell + primitives — copy from assets
Copy `assets/components/layout/` (`shell.tsx`, `header.tsx`, `footer.tsx`,
`sidebar.tsx`, `layout.css`) to `src/components/layout/`. Structure:
- `layout.css` — the outer **CSS Grid Template Areas** (`header`/`main`/
  `footer` rows). Grid, not flexbox — keep it that way.
- `shell.tsx` — cva-driven column grid; imports `@/components/ui/sheet` for
  the mobile drawer (a legit `registryDependency`, not a self-containment
  violation).

`Shell` props:
```ts
columns?: 1 | 2 | 3                       // default 1
sidebarPosition?: "left" | "right" | "none"
header?, footer?, sidebar?, aside?: React.ReactNode
sidebarTitle?: string                     // mobile Sheet a11y title
```

### 3. Responsive (already wired in shell.tsx)
`3col → (lg) 2col → (md) 1col + Sheet`; `2col → (md) 1col + Sheet`. Tailwind
default breakpoints only; **no custom breakpoints, no media-query px in
components** (gotcha #6). Below `md` the sidebar hides and opens via the
shadcn `Sheet`.

### 4. Atomic components — add via CLI, then retrofit
```
npx shadcn@latest add button input badge card
```
The generated files **fail the grep guard immediately** (e.g. `ring-[3px]`,
`rounded-[min(var(--radius-md),10px)]`). Retrofit each per
`references/shadcn-retrofit.md` (before/after table). Then add the Typography
component (not shipped by shadcn) — copy `assets/components/typography.tsx`;
it references the raw `text-*`/`--leading-*`/`--weight-*` scale.

### 5. Interactive components — the real test
```
npx shadcn@latest add dialog dropdown-menu select switch tabs tooltip
```
Re-run the grep guard and retrofit (same table). These exercise **portals,
focus, and base-ui composition rules** — where the subtle bugs live. Read
`references/gotchas.md` before wiring them (esp. #2 portal dark, #3
`DropdownMenuGroup` requirement, #4 `render` data-slot).

### 6. Verify — three complementary gates, and actually *run* them
Copy `assets/playwright.config.ts` and `assets/e2e/smoke.spec.ts` (adjust its
route list to your demo pages), install Playwright **including the browser**,
then run `scripts/verify.sh`:
```
npm i -D @playwright/test && npx playwright install chromium
bash scripts/verify.sh        # grep guard → next build → playwright smoke
```
Why all three: the `DropdownMenuGroup` bug passes grep, tsc, **and** build —
it only throws when the portal opens. Only the smoke, *executed*, catches it.

**A smoke test that is written but never run protects nothing.** Skipping
`playwright install`, or committing the spec without executing it, is the exact
failure mode that ships a latent "throws the moment you open it" bug while every
static gate stays green — verified in practice: a run that only *wrote* the spec
and asserted "looks runtime-safe" shipped a bare `DropdownMenuLabel` that throws
on open. Installing chromium is a one-time cost; pay it, and make the run part
of the gate. Wire `verify.sh` into CI / a `"verify"` npm script so the runtime
layer runs on every change, not just when someone remembers to.

## Acceptance checklist
- [ ] `bg-primary`, `h-header`, `w-sidebar`, `text-2xl` utilities resolve
- [ ] `Shell` `columns` prop flips 1→2→3 on one page (no layout edits)
- [ ] responsive 3→2→1 with Sheet drawer below `md`
- [ ] `.dark` on `<html>` recolors layout **and** portaled overlays, no edits
- [ ] `grep -rE "[0-9]+px|#[0-9a-fA-F]{6}" src/components` → empty
- [ ] the interaction smoke **actually runs** (chromium installed) and opens
      every overlay — a spec that exists but never executed does not count
- [ ] `bash scripts/verify.sh` → all three layers green

## Files
- `assets/tokens/*.css` — the 4-layer token starter (copy verbatim, tweak values)
- `assets/globals.css` — `@theme inline` wiring
- `assets/components/layout/*` — Shell / Header / Footer / Sidebar / grid CSS
- `assets/components/typography.tsx` — Typography (shadcn doesn't ship it)
- `assets/playwright.config.ts`, `assets/e2e/smoke.spec.ts` — runtime gate
- `scripts/verify.sh` — the 3-layer verify pipeline
- `references/shadcn-retrofit.md` — before/after class table (read at steps 4–5)
- `references/gotchas.md` — base-ui / Tailwind v4 traps (read before step 5)
