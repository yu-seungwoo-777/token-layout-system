# Eval rubrics — pass/fail checklists

Each eval in `evals.json` has a prose `expected_output` for human reading; this
file is the **machine-gradeable checklist** — binary pass/fail assertions you
can verify by inspecting the output (files, grep, build, smoke). Together they
make the suite reproducible: two graders walking the same checklist on the same
output reach the same score, and the README's "20/20 vs 16/20" scorecard maps
to a defined set of assertions rather than vibes.

## How to grade

For each eval, walk the list. Each item is either:
- ✅ **PASS** — the assertion holds (file exists, grep returns expected result,
  build/smoke exits 0, etc.)
- ❌ **FAIL** — it doesn't. Note which one; the failing item is more useful for
  improving the skill than the raw score.

A skill-loaded run is expected to pass every item. A baseline (no-skill) run
passes a subset — the delta is the skill's measurable contribution.

---

## Eval 1 — scaffold full system from empty dir

| # | Assertion | How to verify |
|---|---|---|
| 1.1 | `src/styles/tokens/{raw,semantic,layout,component}.css` all exist | `ls src/styles/tokens/` shows 4 files |
| 1.2 | `raw.css` defines OKLCH color scales (no `hsl()`/`#hex` literals) | `grep -E "oklch\(" raw.css` returns entries; `grep -E "hsl\(|#[0-9a-f]{3,6}" raw.css` returns none |
| 1.3 | `semantic.css` redefines `--color-*` roles under `:root` AND `.dark` | `grep -cE "^\.dark" semantic.css` ≥ 1; both blocks define `--color-primary` |
| 1.4 | `globals.css` uses `@theme inline` (the `inline` keyword present) | `grep "@theme inline" globals.css` returns ≥ 1 |
| 1.5 | `src/components/layout/{shell,header,footer,sidebar}.tsx` exist | `ls src/components/layout/` shows 4 files |
| 1.6 | `shell.tsx` uses CSS Grid Template Areas (via `grid.css`) | `grep "grid-template-areas" src/components/layout/grid.css` returns ≥ 1 |
| 1.7 | `Shell` accepts `columns?: 1 \| 2 \| 3` prop | `grep "columns" shell.tsx` shows the type |
| 1.8 | shadcn atomics (button/input/badge/card) retrofitted (no px/hex literals) | `grep -rE "[0-9]+px\|#[0-9a-fA-F]{3,6}\|rgba?\(\|hsla?\(" src/components` returns empty |
| 1.9 | demo routes exist (one per columns variant + components page) | at least 2 routes under `app/` render a `<Shell>` |
| 1.10 | `scripts/verify.sh` exists and runs green end-to-end | `bash scripts/verify.sh` exits 0 |
| 1.11 | Playwright smoke **executed** (chromium installed, not just spec written) | verify.sh output shows "✅ e2e ok" |

## Eval 2 — add interactive components to existing token system

| # | Assertion | How to verify |
|---|---|---|
| 2.1 | dialog/dropdown-menu/select/switch/tabs files exist in `src/components/ui/` | `ls` shows all 5 |
| 2.2 | each retrofitted — no px/hex literals in any | `grep -rE "[0-9]+px\|#[0-9a-fA-F]{3,6}" src/components/ui` returns empty |
| 2.3 | composition correct for the style actually generated (Radix or base-ui) | if base-ui: `DropdownMenuLabel` is inside `DropdownMenuGroup`; if Radix: no forced wrapper (Radix doesn't need it) |
| 2.4 | smoke spec routes cover the new overlays | `smoke.spec.ts` `routes` array includes the components page |
| 2.5 | `bash scripts/verify.sh` exits 0 (grep + build + executed smoke all green) | exit 0 |
| 2.6 | smoke actually opens each overlay without runtime error | verify.sh "✅ e2e ok"; no `pageerror` in e2e log |

## Eval 3 — add 4th gate (silent token-value regression)

| # | Assertion | How to verify |
|---|---|---|
| 3.1 | a 4th check exists in the pipeline (script or Playwright assertion) | `verify.sh` runs ≥ 4 distinct gates, OR smoke.spec.ts has a `getBoundingClientRect`/`getComputedStyle` assertion |
| 3.2 | the check compares rendered dimensions of related controls (e.g. button vs input height) | grep for `getBoundingClientRect` or `getComputedStyle` in e2e/scripts |
| 3.3 | **proven to fail**: deliberately mis-mapping a token (`--input-height: var(--space-7)`) makes the check fail | inject the mis-map, run verify.sh, exit ≠ 0 with useful message |
| 3.4 | **proven to pass once corrected**: reverting to `var(--space-6)` makes it pass | revert, run verify.sh, exit 0 |
| 3.5 | still runnable as one command (`bash scripts/verify.sh`) | single command runs all gates |

## Eval 4 — Radix style via default init

| # | Assertion | How to verify |
|---|---|---|
| 4.1 | 4-layer token architecture present (same as eval 1.1–1.4) | see eval 1 checks |
| 4.2 | `Shell` + grid-template-areas present | see eval 1.5–1.6 |
| 4.3 | grep-guard verify pipeline present | `scripts/verify.sh` exists |
| 4.4 | retrofit adapted to **Radix** internals (not pasted base-ui class strings) | component files import from `radix-ui`/`@radix-ui/*`; no `@base-ui` imports |
| 4.5 | grep guard passes | see eval 1.8 |
| 4.6 | `next build` exits 0 | run it |
| 4.7 | executed Playwright smoke opens every overlay, no runtime error | verify.sh "✅ e2e ok" |

## Eval 5 — Radix style forced via explicit flags

| # | Assertion | How to verify |
|---|---|---|
| 5.1 | `components.json` confirms a Radix style (not base-ui) | `grep '"style"' components.json` shows Radix-based |
| 5.2 | component files genuinely import from `radix-ui`/`@radix-ui/*` | grep component files |
| 5.3 | retrofit **diverges** from base-ui-specific guidance: no forced `DropdownMenuGroup` wrapper (that's base-ui-only) | inspect dropdown-menu.tsx — wrapper absent |
| 5.4 | uses Radix `asChild`/`Slot` patterns, NOT base-ui `render={<Button/>}` | grep for `asChild` present, `render={` absent |
| 5.5 | 4-layer tokens/Shell/grep guard copied verbatim (style-agnostic parts unchanged) | diff against assets/ shows only component internals diverge |
| 5.6 | grep guard + `next build` + executed smoke all pass | `bash scripts/verify.sh` exits 0 |

## Eval 6 — intent-based trigger (casual Korean, no skill jargon)

| # | Assertion | How to verify |
|---|---|---|
| 6.1 | the skill **triggers** (model doesn't ask clarifying questions, starts building) | trace: skill description matched the prompt |
| 6.2 | produces 4-layer token architecture | see eval 1.1–1.4 |
| 6.3 | produces Shell with header/sidebar/footer + responsive Sheet drawer | see eval 1.5–1.6; shell.tsx has the Sheet wiring |
| 6.4 | dark-mode toggle on `<html>` (not a wrapper div) | grep root layout for `className="dark"` or equivalent on `<html>` |
| 6.5 | shadcn components retrofitted to tokens | see eval 1.8 |
| 6.6 | grep guard + build + executed smoke pass | `bash scripts/verify.sh` exits 0 |

## Eval 7 — color change + sidebar width (no skill jargon)

| # | Assertion | How to verify |
|---|---|---|
| 7.1 | primary color is now purple in `:root` | `grep --color-primary semantic.css` shows purple source |
| 7.2 | purple persists in `.dark` (override updated) | `.dark` block's `--color-primary` also purple-sourced |
| 7.3 | any **new** color added to `raw.css` is in OKLCH (not HSL/hex) | if raw.css changed: `grep "oklch("` matches new entries; no `hsl(`/`#hex` |
| 7.4 | sidebar width changed via `--sidebar-width` in `layout.css` only | layout.css's `--sidebar-width` value changed |
| 7.5 | **no component file edited** to swap colors (button.tsx, input.tsx untouched) | `git diff` shows changes only in `src/styles/**` |
| 7.6 | grep guard still clean | see eval 1.8 |

## Eval 8 — diagnose `--text-*: initial` namespace reset

| # | Assertion | How to verify |
|---|---|---|
| 8.1 | root cause correctly identified: **`--text-*: initial` is a Tailwind v4 namespace reset** that discards the entire `--text-*` namespace (including Tailwind defaults like `--text-xs`/`3xl`/`4xl`) before re-adding the explicitly-named entries | output mentions namespace reset / `initial` discarding the namespace / `--text-*: initial` being the cause |
| 8.2 | the mechanism is stated precisely: partial override **merges** with defaults (not replaces) — the reset, not the override, is the footgun | output does NOT claim partial override alone drops defaults; it distinguishes the two and points at `initial` as the cause |
| 8.3 | fix applied: the `--text-*: initial;` line removed | `grep "text-\\*: initial" globals.css` returns nothing |
| 8.4 | `text-xs`/`text-3xl`/`text-4xl` resolve again after fix | manual or computed-style check; or compile and grep for `.text-xs`/`.text-3xl`/`.text-4xl` in output |
| 8.5 | recognizes this is invisible to error-only gates (grep/build/smoke all green) — the classes just silently emit no `font-size` | output mentions the gate-blindness |

## Eval 9 — diagnose `.dark` on wrapper instead of `<html>`

| # | Assertion | How to verify |
|---|---|---|
| 9.1 | root cause correctly identified: **portals render at `<body>` root, outside the wrapper, inheriting theme from `<html>` only** | output mentions portals appending to `<body>` / DOM root / inheriting from `<html>` |
| 9.2 | fix applied: `.dark` moved from wrapper back to `<html>` | root layout's `<html>` carries the dark class; wrapper div no longer does |
| 9.3 | portaled overlays (Dialog/Select/Tooltip) now recolor in dark mode | manual or computed-style check on a portaled element |
| 9.4 | recognizes this is invisible to error-only gates (no throw, compiles, grep clean) | output notes the gate-blindness |

---

## Scorecard mapping

The README's "20/20 vs 16/20" refers to the **original 3-prompt benchmark**
(evals 1–3's predecessors), scored against an earlier form of these checklists.
Evals 4–9 are discrimination tests added later; they are not part of the
20/20-vs-16/20 scorecard but use the same assertion-based grading. To reproduce
a score: walk each eval's table, count ✅, divide by total assertions.

**Assertion counts per eval** (for a max-score reference):
1: 11 · 2: 6 · 3: 5 · 4: 7 · 5: 6 · 6: 6 · 7: 6 · 8: 5 · 9: 4 — **total 56 assertions across 9 evals**.
