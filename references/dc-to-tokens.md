# DC `.dc.html` → tokens

When the design source is a Claude Design `.dc.html`, run
`assets/scripts/extract-dc.mjs` to produce the 4-layer token CSS instead of
copying the default `assets/tokens/*.css`. This is **Step 1, branch B** of the
workflow. This file is the operating reference for the converter — the what,
the mapping, and the verification.

## Why a converter is needed

A DC `.dc.html` is not directly usable in a Next.js + Tailwind v4 + shadcn
project. Four gaps, all closed by the converter:

| Gap | DC source | Skill target |
|---|---|---|
| selector | `[data-theme="light\|dark"]` | `:root` / `.dark` |
| naming | editorial (`--bg`, `--heading`, `--strong`) | shadcn (`--color-background`, `--color-foreground`) |
| color format | hex / rgba | OKLCH |
| raw scales | JS arrays in `renderVals()` (`slateRamp`, `spacing`, `typeScale`, `radii`) | materialized CSS variables in `raw.css` |

Plus the file itself is not standard HTML (`<x-dc>`, `<helmet>`, `<sc-for>`,
`class Component extends DCLogic { renderVals() }`).

## Scope — which DC sections are extracted

A DC token reference typically has ~15 sections. The converter extracts the
**token-definition** sections (the values) and ignores component 실물 and
guide content:

| Extracted → tokens | Ignored |
|---|---|
| brand colors · neutral ramp · semantic colors · typography · radius · spacing · elevation — the `[data-theme]` blocks + the `renderVals()` scale arrays | component examples (buttons, toggles, badges, cards, layout patterns, logo) and guide text (principles, accessibility) |

Rationale: the extracted sections *define* token values; the ignored ones
*consume* them as rendered component demos or prose. Extracting only the
definitions keeps the output a pure token set the skill's 4-layer
architecture can ingest. Component dimensions the prose states explicitly
(button 44/22/10, card 12, focus 2/2, touch target 44) are still captured —
as a cited `DC_SPEC` constant in the converter, not scraped from demo markup.

## Invoke

```
node assets/scripts/extract-dc.mjs <input.dc.html> [--out <dir>] [--no-manifest]
```

- `--out <dir>` — default `<input-dir>/tokens/`.
- `--no-manifest` — write only the 4 CSS files, skip `_manifest.json` and `_report.md`.

Outputs:
- `raw.css` · `semantic.css` · `layout.css` · `component.css`
- `_manifest.json` — provenance + flat token index (machine-readable)
- `_report.md` — verification: hex→OKLCH round-trip delta per color, dark-pair completeness, off-ramp literals, scale coverage (human-readable — **read it after every run**)

Typical Step 1 (branch B):

```
node assets/scripts/extract-dc.mjs .moai/design/handoff/Design\ Tokens.dc.html --out src/styles/tokens
```

Then import the four files from `src/app/globals.css` exactly as the default
flow does (copy `assets/globals.css`).

## What the converter reads (trust hierarchy)

1. **CSS-variable blocks** — `[data-theme="light"]{…}` / `[data-theme="dark"]{…}`
   in `<helmet><style>`. Standard CSS, fully reliable → drives `semantic.css`.
2. **`renderVals()` arrays** — `brandColors`, `slateRamp`, `typeScale`,
   `radii`, `spacing` in `<script data-dc-script>`. Evaluated in a `vm`
   sandbox → drives `raw.css` and the component-radius/spacing roles.
3. **`DC_SPEC` constant table** — structural/component values DC states in
   prose but does not expose via arrays (container 70rem, prose 46rem, header
   4rem/64px, button 44/22/10, focus 2px/2px, touch target 44px). Hardcoded in
   the script with a DC-section citation per value, rather than scraped from
   fragile inline styles. **These constants are sourced from the
   `Design Tokens.dc.html` reference and applied to every input** — if your
   DC source specifies a different header height, button radius, or focus ring,
   the converter will *not* pick it up; review `layout.css`/`component.css`
   after conversion. `_report.md` §1 notes this. (The scales — slate, spacing,
   radii, type — are scraped per-file, so they do track the input.)

If `renderVals()` evaluation fails (or the arrays are absent — e.g. a mockup
`.dc.html` whose `renderVals()` returns UI data, not token arrays), the
converter degrades gracefully:
`semantic.css` still generates from the CSS blocks, `raw.css` ships with
whatever scales were found, and `_report.md` records the warning. The semantic
layer is never lost.

## The four layers it produces

### L1 `raw.css` — DC scales, materialized
- `slateRamp[]` → `--slate-{step}` (hex → OKLCH). DC ships 8 stops; no stops
  are fabricated.
- brand colors → named primitives `--brand-primary/-secondary/-accent` plus
  their `-dark` variants (both kept in raw as named values so `.dark` can
  `var()` them).
- `--brand-primary-soft` / `--brand-accent-soft` (+ dark) — rgba tints →
  `oklch(… / alpha)`.
- `spacing[]` → `--space-1..7` (px ÷ 16 → rem).
- `radii[]` → `--radius-sm/control/card/surface/pill` (pill → `9999px`,
  Tailwind `radius-full` convention).
- `typeScale[]` → `--text-display/h1/h2/h3/lead/body/small/caption/mono`,
  plus `--text-base/-lg/-sm` aliases so common Tailwind utilities still
  resolve (see gotcha below).

### L2 `semantic.css` — DC vars → shadcn roles, `:root` / `.dark`

DC var → output token mapping (the contract):

| DC var | → token | note |
|---|---|---|
| `--bg` | `--color-background` | |
| `--text` | `--color-foreground` | DC body text is softer than shadcn default — faithful |
| `--surface` | `--color-card`, `--color-popover` | |
| `--strong` | `--color-card-foreground`, `--color-popover-foreground`, `--color-secondary-foreground`, `--color-accent-foreground`, `--color-strong` | |
| `--border` | `--color-border`, `--color-input` | |
| `--muted` | `--color-muted-foreground` | muted *text* |
| `--surface2` | `--color-muted`, `--color-secondary`, `--color-accent` | shadcn secondary/accent are bg roles ≈ muted surface |
| `--primary` | `--color-primary`, `--color-ring` | |
| `--secondary` | `--color-primary-hover` | DC `--secondary` is primary's *hover* (darker indigo), **not** shadcn secondary |
| `--accent` | `--color-highlight` | DC teal accent; shadcn `--color-accent` (hover bg) is filled from `--surface2` instead |
| `--onprimary` | `--color-primary-foreground` | |
| `--heading` | `--color-heading` | preserved DC role (no shadcn equivalent) |
| `--primarySoft` | `--color-primary-soft` | preserved |
| `--accentSoft` | `--color-accent-soft` | preserved |
| `--shadow` | `--shadow-card` | box-shadow value, not a color |
| *(omitted)* | `--color-danger`, `--color-danger-foreground` | DC has no error color — **not emitted**; add a `--red-*` raw scale + these roles (see Wiring) |

`--color-foreground` is DC's `--text` (a soft mid-gray), **not** near-black.
This is deliberate — DC's editorial style uses softer body copy. Card text
(`card-foreground`) uses the darker `--strong`. If a shadcn component looks too
low-contrast in body context, that is DC's intent, not a bug.

Unprefixed aliases (`--primary: var(--color-primary)`, …) are emitted at the
bottom of `semantic.css` so base-ui/shadcn internals that read `var(--primary)`
directly keep working — same pattern as the default `assets/tokens/semantic.css`.

### L3 `layout.css` — DC structural dimensions + Shell primitives
DC values: `--container-max` (70rem), `--container-prose` (46rem),
`--form-width` (40rem), `--header-height` (4rem — from the DC top bar),
`--section-pad-y/-mobile/-x`, `--gutter`, `--column-gap`. Where a value
coincides with a spacing-scale stop it is emitted as `var(--space-N)` (e.g.
`--section-pad-y: var(--space-7)`), per the skill's indirection convention;
true one-offs (e.g. `--section-pad-y-mobile` 28px) stay literal with a why.

Shell primitives (`--footer-height`, `--sidebar-width`,
`--sidebar-width-collapsed`, `--grid-3col-ratio`, `--layout-gap`,
`--container-padding-x`) are **appended** to the same file, commented
`Shell primitive — DC defines no …`. This makes DC output a drop-in for the
skill's `Shell`/`grid.css` — those consumers read 7 layout tokens and all 7
are defined here. (`--header-height` is 4rem to match the DC source; the
default skill layout.css uses `var(--space-8)` = 4rem — same value.)

### L4 `component.css` — DC component specs
`--button-radius/min-height/padding-x/font-weight`, `--card-radius/padding/
border-width`, `--badge-radius`, `--input-radius/min-height`, `--focus-ring-
width/offset`, `--touch-target`. Sourced from `radii[]`/`spacing[]` usage
metadata + the `DC_SPEC` table.

## Value-conversion rules (non-negotiable)

- **OKLCH**, rounded L/C to 3dp, H to 1dp (matches `assets/tokens/raw.css`).
  `_report.md` proves every color round-trips within Δ ≤ 1/255 per channel
  (visually lossless; OKLCH is wider-gamut than sRGB so bit-exact is
  impossible).
- **rem** for spacing/radius (px ÷ 16). pill → `9999px`.
- **var()-indirection wherever DC's value coincides with a raw token.** DC is
  self-consistent: `--bg`'s hex *is* `slate-50`, `--border`'s *is* `slate-200`,
  etc. The converter emits `var(--slate-50)` in those cases, not a literal.
  Dark-only neutrals that fall off the 8-stop ramp (e.g. dark `--text`
  `#b6bdc9`) become OKLCH literals in `.dark` — listed in `_report.md` §4. This
  is the one place `semantic.css` carries literals; it lives under
  `src/styles/tokens/`, which `scripts/verify.sh` does not scan.
- **dark-pair integrity.** Every light role must have a dark value. If not,
  `dark_pairs_complete:false` and `_report.md` flags the gap.

## Wiring into the project (post-conversion)

1. Drop the 4 CSS files in `src/styles/tokens/` and import from
   `src/app/globals.css` (copy `assets/globals.css` — import paths unchanged).
2. The standard shadcn roles (`bg-primary`, `text-foreground`, `bg-card`,
   `border-border`, …) work out of the box — `globals.css`'s `@theme inline`
   already wires them.
3. **Preserved DC roles** (`--color-heading/-strong/-highlight/-primary-soft/
   -accent-soft`) are not in the default `@theme inline`. To use them as
   utilities, expose them — append to `globals.css`:
   ```css
   @theme inline {
     --color-heading: var(--color-heading);
     --color-strong: var(--color-strong);
     --color-highlight: var(--color-highlight);
     --color-primary-soft: var(--color-primary-soft);
     --color-accent-soft: var(--color-accent-soft);
   }
   ```
   …yielding `text-heading`, `bg-primary-soft`, etc.
4. **Add the error color** — `--color-danger`/`--color-danger-foreground` are
   **omitted** from DC output (DC defines no error color; a primary-indigo
   placeholder would make `bg-destructive` look like a CTA). Add a `--red-*`
   raw scale to `raw.css` and the two roles to `semantic.css` `:root`/`.dark`.
   Until you do, `bg-destructive` resolves to nothing — visible immediately,
   which is the point.
5. **Type-scale gotcha (skill gotcha #9).** Defining *any* `--text-*` replaces
   Tailwind's default font-size scale rather than merging. DC-sourced `raw.css`
   defines `--text-display/h1/…/mono`, so Tailwind defaults like `text-3xl`,
   `text-4xl` **stop resolving**. The converter aliases the six sizes the
   skill's own assets use — `--text-xs/sm/base/lg/xl/2xl` → nearest DC step
   (xl/2xl are approximate; DC has no 1.25/1.5rem step) — so Typography H1/H2
   and common utilities keep working. If you need more, add them to the same
   scale in `raw.css`; use the DC names (`text-body`, `text-h2`, `text-lead`)
   in components for full fidelity.

## 접근성 (WCAG)

The converter computes contrast for every foreground/background role pair in
both modes and prints it in `_report.md` §2; `--strict` fails the run if any
text pair drops below AA (4.5:1).

Known issue with faithful DC extraction: DC maps `--color-muted-foreground` ←
DC `--muted` (`#8b93a1`), which is **2.89:1** on the DC background — below AA.
shadcn uses `text-muted-foreground` for form descriptions, menu subtitles, and
helper text (the small-text slots), so this matters. Two defensible choices:

- **Stay faithful** — keep DC's value; accept that small muted text is below AA
  in light mode (DC's own design made this trade-off). Use it only for large
  text or non-essential meta.
- **Remap for a11y** — point `--color-muted-foreground` at a darker slate
  (`--slate-500` = `#545b68`, the same value DC uses for body `--text`, ≈6.4:1).
  Edit `semantic.css` `:root`: `--color-muted-foreground: var(--slate-500);`.

The body `--color-foreground` (`#545b68` on `#f6f7f9`) is 6.4:1 — passes AA,
fails AAA — which is DC's editorial intent (softer body copy).

## Trust & `vm`

`renderVals()` is evaluated with `vm.runInNewContext` against a minimal
sandbox: a stubbed `DCLogic` base class and a noop `React`, with **no** `fs`,
`process`, `require`, or network. `vm` is **not** a hardened security sandbox
(per Node docs) — it only prevents accidental globals. This is acceptable
because the input is a Claude Design artifact **you control**. Do not run the
converter against untrusted `.dc.html`. If you need hardened isolation, host
extraction in a separate container.

## Verification beyond this script

The converter does **static** verification only — what it can prove without a
browser or build (OKLCH math self-check, `var()` reference integrity, dark-pair
completeness, WCAG contrast, raw-scale coverage, Shell token coverage). It
deliberately does **not** claim a browser-render proof. Before trusting DC
output in a real app, run the gates the skill itself preaches (Step 6):

1. **CSS parse** — run the four files through `lightningcss`/`postcss` to catch
   malformed declarations or `@import`/`@theme` ordering the brace-count can't
   see. (Not bundled — the skill is zero-dep; install ad hoc: `npx lightningcss …`.)
2. **Build + render readback** — wire a fixture Next app with the DC output
   **and** the skill's `Shell`/`Typography`, then `next build` + a Playwright
   smoke that reads `getComputedStyle` for each role in light and dark. This is
   the only thing that actually proves `.dark` flips colors, `@theme inline`
   resolves, and no token the Shell/Typography needs is missing. For the
   round-trip specifically, it also lets you diff the **rendered** sRGB against
   the source hex — a real fidelity check, stronger than the math self-check.
3. **`--strict` in CI** — `node extract-dc.mjs … --strict` exits non-zero on
   incomplete dark pairs, empty raw-scale coverage, or any WCAG-AA text-pair
   failure. Wire it into the design-source pipeline so a DC edit that breaks
   dark parity or contrast fails before it ships.

The round-trip table in `_report.md` §3 is a **math self-check** (same
`toOklch` + inverse, confirms no sign/coefficient bug, lands within Δ ≤ 1/255
per channel). It is *not* a browser-render proof — for sRGB-in-gamut colors
the conclusion happens to hold, but establishing it is gate 2's job.

## Relationship to existing gates

- `scripts/verify.sh` scans `src/components` only. DC output lives in
  `src/styles/tokens/` → **out of scope, no conflict**. This is what makes DC
  extraction safe to fold into Step 1.
- `_manifest.json` and `_report.md` go in `src/styles/tokens/` (literal-allowed
  zone) so they don't trip the grep guard either.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `renderVals eval failed` / `did not define class Component` | The converter runs the DC script expecting a class named **`Component`** to be a global — it appends `globalThis.__DC = Component` and instantiates that. If the DC file names its class differently or exports it another way, eval fails and the raw scales come up empty. Converter still emits `semantic.css` from the CSS blocks; rename/alias the class or extend the stub in `extract-dc.mjs`. |
| `dark pairs MISSING` | A role's DC var exists in light but not dark. Add the dark value to the DC source and regenerate. |
| `raw 스케일 비어 있음` + tokens look broken | The DC file is a mockup (its `renderVals()` returns UI data, not token arrays). `layout.css`/`component.css` still reference `var(--space-N)`/`var(--radius-*)` that are now undefined — fill those scales in `raw.css` or feed the converter a token-reference DC file instead. |
| Structural specs wrong (header height, button radius, …) | `DC_SPEC` values are hardcoded from `Design Tokens.dc.html` and applied to all inputs. If your source differs, edit `layout.css`/`component.css` after conversion (or the `DC_SPEC` table for repeated use). |
| Color looks slightly off | Check `_report.md` §2 — any Δ > 1 is flagged. Δ ≤ 1 is visually identical. |
| `text-3xl` doesn't resolve | Type-scale gotcha above — add `--text-3xl` to `raw.css` or use `text-h1`. |
| `bg-destructive` shows indigo | `--color-danger` is a primary placeholder — replace with a real red. |
