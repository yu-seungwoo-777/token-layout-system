**English** | [한국어](README.ko.md)

# token-layout-system

A [Claude Code skill](https://docs.claude.com/en/docs/claude-code/skills) for building a reusable, token-driven layout system in Next.js (App Router) with Tailwind v4 CSS-first `@theme` and shadcn/ui.

It produces a 4-layer CSS token system (raw → semantic → layout → component), a `Shell` component with switchable 1/2/3 columns and a responsive sidebar-to-Sheet drawer, and shadcn components retrofitted so every color and dimension flows from one token source — dark mode works with zero component edits.

## Install

Drop this repo into your skills directory, or use the packaged `.skill` file with a Claude Code client that supports skill installation.

## Contents

- `SKILL.md` — the workflow (0–6 steps: scaffold → tokens → Shell → responsive → atomics → interactive components → verify). This is the file Claude Code actually loads; a Korean reference translation lives at `docs/SKILL.ko.md`.
- `assets/` — starter token CSS, `Shell`/`Header`/`Footer`/`Sidebar`, `globals.css` wiring, `Typography`, Playwright config + smoke spec
- `references/shadcn-retrofit.md` — before/after class table for retrofitting shadcn output onto the token layer
- `references/gotchas.md` — 9 traps found while building the reference implementation (base-ui composition rules, portal dark mode, token value mismaps, etc.)
- `scripts/verify.sh` — three-layer verification pipeline (grep guard → `next build` → Playwright interaction smoke) that catches both static hardcoding and runtime-only bugs
- `evals/evals.json` — test prompts used to benchmark this skill against an unassisted baseline

## Benchmark

Evaluated across 3 test prompts (with-skill vs. baseline, no skill): **20/20 vs 16/20** on structural/correctness assertions. The clearest wins were a 4-layer token structure (vs. inlined tokens) and catching a real base-ui runtime composition bug (`DropdownMenuLabel` requiring a `DropdownMenuGroup` parent) that passes `grep`, `tsc`, and `next build` but throws the moment the component is opened — only an *executed* Playwright interaction test catches it.
