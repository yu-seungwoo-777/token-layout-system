**English** | [한국어](README.ko.md)

# token-layout-system

A [Claude Code skill](https://docs.claude.com/en/docs/claude-code/skills) for building a reusable, token-driven layout system in Next.js (App Router) with Tailwind v4 CSS-first `@theme` and shadcn/ui.

It produces a 4-layer CSS token system (raw → semantic → layout → component), a `Shell` component with switchable 1/2/3 columns and a responsive sidebar-to-Sheet drawer, and shadcn components retrofitted so every color and dimension flows from one token source — dark mode works with zero component edits.

## Install

**Option A — install the packaged skill.** Grab the `.skill` file (from a release, or package it yourself with `package_skill.py` from the [skill-creator](https://github.com/anthropics/skills) tooling) and use "Save skill" in a Claude Code client that supports skill installation.

**Option B — clone straight into your skills directory:**
```bash
git clone https://github.com/yu-seungwoo-777/token-layout-system ~/.claude/skills/token-layout-system
```

Either way, only `SKILL.md`'s `name` + `description` stay in Claude's context all the time (a few hundred tokens). The full workflow body, `assets/`, and `references/` load only when the skill actually triggers — that's the skill system's progressive-disclosure design, and it's why installing this costs you nothing until you use it.

## How it triggers

You don't need to say "use the token-layout-system skill." Claude Code matches new requests against every installed skill's `description`, and this one is written to fire on intent, not just exact wording — asking for a design-token layout, a reusable Header/Footer/Sidebar `Shell`, 1/2/3-column layout variants, Tailwind v4 `@theme` token architecture, a shadcn library wired to CSS variables, or just "keep hardcoded px/hex out of my components" will all trigger it, even in a brand-new, unrelated project.

Once it triggers, Claude adapts the workflow below to *your* project rather than replaying it verbatim — the asset files get copied in as a starting point, then wired into whatever app structure and shadcn style your `create-next-app`/`shadcn init` actually produced.

## Workflow

The skill walks through seven steps. Full detail, exact commands, and the acceptance checklist live in [`SKILL.md`](SKILL.md) — this is the shape of it:

**0. Scaffold.** `create-next-app` + `shadcn init` + `separator`/`sheet`/`skeleton`. The installed shadcn *style* varies (Radix vs. the newer `@base-ui/react`-based `base-nova`) — check `components.json`'s `"style"` field before assuming which API you're dealing with.

**1. Token layer.** Copy four CSS files into `src/styles/tokens/`:
- `raw.css` — primitives only (OKLCH color scales, `--space-1..8`, `--radius-*`, `--text-*`, weights). The only literals in the whole system.
- `semantic.css` — role tokens (`--color-primary`, `--color-background`, `--color-danger`…) as `var()` of raw, redefined under `.dark`.
- `layout.css` — structural sizes (`--header-height`, `--sidebar-width`, `--grid-3col-ratio`…).
- `component.css` — per-component exceptions (`--button-radius`, `--input-height`…).

Wire them into `globals.css` via `@theme inline` — this self-referencing pattern (`--color-primary: var(--color-primary)`) is what lets `.dark`'s override win instead of Tailwind baking in the light value.

**2. `Shell` + primitives.** A cva-driven layout component using **CSS Grid Template Areas** (not flexbox) for the header/main/footer structure:
```ts
columns?: 1 | 2 | 3                       // default 1
sidebarPosition?: "left" | "right" | "none"
header?, footer?, sidebar?, aside?: React.ReactNode
sidebarTitle?: string                     // mobile Sheet a11y title
```

**3. Responsive.** `3col → (lg) 2col → (md) 1col + Sheet drawer`; `2col → (md) 1col + Sheet`. Tailwind's default breakpoints only — no custom breakpoints, no media-query px inside components.

**4. Atomic components.** `shadcn add button input badge card`, then retrofit each against [`references/shadcn-retrofit.md`](references/shadcn-retrofit.md)'s before/after table — freshly generated shadcn output fails the grep guard immediately (`ring-[3px]`, `rounded-[min(var(--radius-md),10px)]`, etc.), so this step isn't optional cleanup. Also add `Typography` (shadcn doesn't ship one).

**5. Interactive components.** `shadcn add dialog dropdown-menu select switch tabs tooltip`, same retrofit pass. These exercise portals, focus, and composition rules — where the subtle, easy-to-miss bugs live. Read [`references/gotchas.md`](references/gotchas.md) first.

**6. Verify — and actually run it.** A three-layer pipeline (`scripts/verify.sh`):
```
grep guard  →  next build  →  Playwright interaction smoke
(static)       (compile)      (runtime — opens every overlay)
```
A base-ui composition bug (`DropdownMenuLabel` used outside `DropdownMenuGroup`) passes grep, `tsc`, **and** `next build` — it only throws when the component is actually opened. Only an *executed* Playwright run catches it; a written-but-never-run spec verifies nothing.

## The one non-negotiable rule

No raw `px` or `#hex` in `src/components/**`. Every dimension is a token reference — `var(--token)`, a `[var(--token)]` arbitrary, or a Tailwind scale utility that compiles to rem without a literal in source. Token *definition* files (`src/styles/**`) are the exception — that's the point of the raw layer. `scripts/verify.sh` enforces this across the whole `src/components` tree with `grep -rE "[0-9]+px|#[0-9a-fA-F]{3}\b|#[0-9a-fA-F]{6}\b|rgba?\(|hsla?\(" src/components` — it catches px/hex/rgb/hsl literals but not bare unitless magic numbers, which still need a human read.

## Twelve traps worth knowing before you start

Condensed from [`references/gotchas.md`](references/gotchas.md) — each cost real debugging time building the reference implementation, and none are caught by `tsc` or `grep`:

1. **`@theme inline` self-reference is the whole trick** for dark-mode-aware utilities — without `inline`, Tailwind bakes in the light value and dark mode never flips.
2. **The `.dark` class must live on `<html>`**, not a nested container — portaled components (Dialog, Select, Tooltip…) render at `<body>` root and only inherit theme via `<html>`.
3. **base-ui is stricter than Radix about composition** — a bare `DropdownMenuLabel` throws unless wrapped in `DropdownMenuGroup`. Passes every static gate; only fails at runtime.
4. **`render={<Button/>}` remaps `data-slot`** — don't target composed triggers by their original slot name.
5. **Token *value* mismaps are invisible to every static gate** — `--input-height: var(--space-8)` is syntactically perfect and renders at double the intended height.
6. **Responsive breakpoints go in the TSX, not as media-query px** in the grep'd directories.
7. **A sidebar's divider border must face the content**, computed from `sidebarPosition`, or it lands on the screen edge instead of the middle.
8. **A written-but-unrun smoke test is false safety** — install the browser and actually execute it, or it verifies nothing.
9. **Redefining part of a Tailwind scale in `@theme inline` drops the untouched entries** — override `--text-sm..--text-2xl` and `text-xs`/`text-3xl`/`text-4xl` silently stop resolving.
10. **Grid track sizing must follow actual content, not just the `columns`/`sidebarPosition` props** — `columns={2}` with no `sidebar` passed would otherwise reserve an empty `--sidebar-width` track.
11. **Theme toggles need `localStorage` + pre-hydration script** in production, or they reset to light on navigation and flash the wrong theme.
12. **OKLCH isn't stylistic — it's what makes opacity modifiers honest** — Tailwind v4 compiles `bg-primary/50` to `color-mix(in oklab, …)`, which only mixes perceptually correct when the source is OKLCH. HSL sources drift in hue/lightness at every `/N` step shadcn leans on, and no gate in the pipeline catches it.

## Contents

- `SKILL.md` — the workflow Claude Code actually loads (English only — this README has a Korean translation at `README.ko.md`, but `SKILL.md` itself doesn't, since translating it doesn't change what Claude Code loads).
- `assets/` — starter token CSS, `Shell`/`Header`/`Footer`/`Sidebar`, `globals.css` wiring, `Typography`, Playwright config + smoke spec
- `references/workflow.md` — the seven build steps in detail (read per-step as you enter each one)
- `references/shadcn-retrofit.md` — full before/after class table for retrofitting shadcn output onto the token layer
- `references/gotchas.md` — the full write-up of the 12 traps above
- `scripts/verify.sh` — the three-layer verification pipeline
- `evals/evals.json` — test prompts used to benchmark this skill against an unassisted baseline
- `evals/rubrics.md` — pass/fail checklists (one per eval) that make the benchmark reproducible: each assertion is binary (file exists, grep result, exit code) so two graders reach the same score

## Benchmark

Evaluated across an original 3-prompt benchmark (with-skill vs. baseline, no skill): **20/20 vs 16/20** on structural/correctness assertions (the assertion lists are in `evals/rubrics.md`). The clearest wins were a 4-layer token structure (vs. inlined tokens) and catching the `DropdownMenuGroup` runtime bug (gotcha #3) that passes every static gate. A follow-up eval targeting gotcha #5 (silent token value mismap) did *not* discriminate — a strong baseline model organically builds an equivalent dimension-parity check once the failure mode is described — which is itself a useful finding about where this skill's value concentrates: structural conventions and non-obvious runtime composition rules, not general "add more verification" engineering. The eval suite has since grown to 9 prompts (`evals/evals.json`) covering style drift, intent-based triggering, OKLCH correctness, and the two silent dark-mode regressions (`@theme inline` removal and `.dark` misplaced off `<html>`) — these later evals are discrimination tests, not part of the original 20/20-vs-16/20 scorecard.
