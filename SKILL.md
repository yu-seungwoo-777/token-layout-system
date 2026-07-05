---
name: token-layout-system
description: >-
  Build a token-driven layout system in Next.js (App Router) + Tailwind v4
  (`@theme`) + shadcn/ui: a 4-layer CSS token architecture, a `Shell` with
  switchable 1/2/3 columns and responsive sidebar-to-Sheet drawer, shadcn
  components retrofitted so every color and dimension flows from one token
  source, and a verify pipeline that keeps raw px/hex out of components.
  Triggers on any of: design tokens / CSS variables for theming, a reusable
  Header/Footer/Sidebar `Shell`, 1/2/3-column or grid layout variants,
  Tailwind v4 `@theme` wiring, shadcn wired to CSS variables, dark mode via
  tokens, or keeping hardcoded px/hex out of components.
---

# Token Layout System

Build a self-contained layout system where **one token source drives every
color and dimension**. The payoff: switch a `Shell` prop to reflip 1/2/3
columns, toggle `.dark` and the whole tree (including portaled overlays)
recolors with no component edits, and a grep guard provably keeps raw
`px`/`#hex` out of components so the system stays extractable into a shadcn
registry later. What this skill adds over an unassisted build: the same
4-layer structure every time (not a per-session improvisation), twelve
runtime traps pre-paid in `references/gotchas.md` that no static gate
catches, and a verify pipeline that must actually execute. Skip it for
projects that already have a token system, or stacks other than
Next.js + Tailwind v4 `@theme`.

Stack: Next.js App Router · Tailwind v4 (CSS-first `@theme`, **no
`tailwind.config.js`**) · shadcn/ui via **CLI** (not the shadcn skill) · cva.
shadcn is the **worked example**, not a requirement: the architecture
(tokens, Shell, grep guard, verify) has exactly one shadcn dependency —
`Shell`'s mobile drawer imports `Sheet` from `@/components/ui/sheet`. To use
another component library, swap that import for any equivalent drawer/dialog
and apply the same retrofit loop (steps 4–5) to that library's output.

## Asset contract — what to copy, what to change, what to own

- `assets/tokens/*.css` — copy verbatim, then **change values freely**; the
  4-layer *structure* (raw → semantic → layout → component, no layer
  skipping) is the contract. Keep `--text-*` names on Tailwind's scale and
  never add a `--text-*: initial` namespace reset (gotcha #9).
- `assets/globals.css` — the `@theme inline` self-referential shape is the
  contract (gotcha #1); import order (`semantic.css` before `@theme`) is
  load-bearing.
- `assets/components/layout/*`, `typography.tsx` — a **scaffold you copy and
  own**, not a library you update from. Fork it to your needs; it just has
  to keep passing the grep guard.
- shadcn (or other library) components — never shipped frozen here; you
  generate them and retrofit per `references/shadcn-retrofit.md`.

## The one non-negotiable rule

**No raw `px` or `#hex` in `src/components/**`.** Every value is a token
reference — `var(--token)`, a `(--token)` arbitrary, or a Tailwind scale
utility (`h-8`, `ring-3`, `min-w-24`) that compiles to rem without a px
literal in source. This is what makes the system themeable and portable, and
`scripts/verify.sh` enforces it by scanning the **entire** `src/components`
tree (not just `layout`/`ui` — any subfolder you add, e.g. `marketing`, is
covered too). Token *definition* files (`src/styles/**`) may hold literals —
that's the point of the raw layer.

The grep pattern catches `px`, 3–8-digit `#hex`, and CSS color-function
literals (`rgb()`/`hsl()`/`oklch()`/`oklab()`/`lab()`/`lch()`/`color()`),
which covers the overwhelming majority of shadcn/Tailwind output. It does
**not** catch bare magic numbers with no unit (a raw `z-index: 40` or an
opacity literal) — those need a human read during retrofit; see
`references/gotchas.md`.

## Workflow — seven steps

Each step below says *what* and *why* in brief. For exact commands, class
tables, and the verify-gate rationale, **read `references/workflow.md`** as
you enter each step. Read `references/gotchas.md` before step 5.

**0. Scaffold.** `create-next-app` + `shadcn init` + `separator`/`sheet`/
`skeleton`. The installed shadcn *style* varies (Radix vs. the newer
`@base-ui/react`-based `base-nova`) — confirm which before assuming its APIs.
Architecture (tokens, Shell, grep guard, verify) is style-agnostic; component
internals and gotchas are style-specific (worked examples, not drop-ins).

**1. Token layer.** Copy the 4-layer CSS into `src/styles/tokens/` (raw →
semantic → layout → component) and wire via `@theme inline`. The
self-referential `var(--x)` pattern is what keeps dark mode working (the
cycle is invalid at computed-value time, so values come from
`:root`/`.dark` by source order) — see gotcha #1 for the verified mechanism.

**2. `Shell` + primitives.** Copy `assets/components/layout/` (Shell, Header,
Footer, Sidebar, grid CSS). Grid Template Areas for the header/main/footer
regions, driven entirely from layout tokens.

**3. Responsive.** `3col → (lg) 2col → (md) 1col + Sheet`; `2col → (md)
1col + Sheet`. Tailwind default breakpoints only — no media-query px in
components.

**4. Atomic components.** `shadcn add button input badge card` (or generate
equivalents from your library of choice), then retrofit.
Freshly generated shadcn output **fails the grep guard immediately** — this
isn't optional cleanup. Typography is copied from assets (shadcn doesn't ship
it). *Why no retrofitted `button.tsx` in assets?* shadcn CLI output varies
across versions and styles; a frozen file would drift into a wrong reference.
The skill ships the **method** (retrofit table + grep-then-fix loop), not the
frozen output.

**5. Interactive components.** `shadcn add dialog dropdown-menu select switch
tabs tooltip`, same retrofit pass. These exercise portals, focus, and
composition rules — where the subtle, easy-to-miss bugs live. **Read
`references/gotchas.md` first.**

**6. Verify — three complementary gates, actually run them.**
```
grep guard  →  next build  →  Playwright interaction smoke (runtime)
```
`scripts/verify.sh` runs all three. Gate 1 also enforces the layer rule (no
raw-palette tokens referenced from components) and emits non-blocking drift
warnings (one-off rem/vh arbitraries, numeric inline styles); the smoke
includes a coverage-parity test that fails when a static route exists on
disk that the spec never walks. These target how the gates *decay* on a
living project — see "How these gates decay" at the end of
`references/gotchas.md`. The `DropdownMenuGroup` composition bug
passes grep + tsc + build and only throws when the portal opens — only an
**executed** smoke catches it. The runtime gate runs against the production
build (`next start`), not dev, so it covers what users actually ship. An
optional 4th gate (token-resolution check) exists for design systems with many
contributors editing tokens directly — see `references/workflow.md`.

## Acceptance checklist
- [ ] `bg-primary`, `h-header`, `w-sidebar`, `text-2xl` utilities resolve
- [ ] `Shell` `columns` prop flips 1→2→3 on one page (no layout edits)
- [ ] `Shell` `sidebarCollapsed` shrinks the desktop sidebar to `--sidebar-width-collapsed` (track + Sidebar together)
- [ ] responsive 3→2→1 with Sheet drawer below `md`
- [ ] `.dark` on `<html>` recolors layout **and** portaled overlays, no edits
- [ ] `grep -rE "[0-9]+px|#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|oklch\(|oklab\(|lab\(|lch\(|color\(" src/components` → empty
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
- `references/workflow.md` — the seven steps in detail (read per-step)
- `references/shadcn-retrofit.md` — before/after class table (read at steps 4–5)
- `references/gotchas.md` — base-ui / Tailwind v4 traps (read before step 5)
- `evals/evals.json` + `evals/rubrics.md` — prompts + pass/fail checklists for benchmarking
