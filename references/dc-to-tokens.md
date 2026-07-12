# Design source → tokens (Step 1, branch B)

When a design source exists — Claude Design (a `.dc.html` token doc *or* an SPA
bundle), Figma, JSON — extract its tokens into the 4-layer model instead of
copying the default `assets/tokens/*.css`. This file gives the **mapping
principles** (they apply to any source), the **`.dc.html` reference adapter**
(`extract-dc.mjs` — one instance), and **guidance for other sources** (SPA
bundle, …).

> **Extraction is a *direction*, not one tool.** The source format varies, so a
> frozen converter drifts — the same reason the skill ships a retrofit *table*,
> not a frozen `button.tsx` (step 4). `extract-dc.mjs` is the reference adapter
> for `.dc.html`; for other Claude Design exports and non-DC sources, apply the
> principles below to the source you actually have, then verify with
> `verify-tokens.mjs`.

## Mapping principles (any source)

Whatever the source, extraction into the 4 layers follows the same rules. The
`.dc.html` adapter below is one realization; a hand-mapping of an SPA bundle is
another. Internalize these — don't memorize a script.

1. **Split into the 4 layers** — raw (primitives, the only literals) → semantic
   (roles as `var()` of raw, under `:root`/`.dark`) → layout (structural) →
   component (per-component exceptions). See *The four layers* below.
2. **Map editorial names → shadcn roles** — `--bg`→`--color-background`,
   `--text`→`--color-foreground`, `--primary`→`--color-primary` + `--color-ring`,
   … (full table in *L2 semantic*). Preserve roles with no shadcn equivalent
   (`--heading`, `-soft`).
3. **Colors → OKLCH** — opacity modifiers (`bg-primary/50`) compile to
   `color-mix(in oklab, …)`, honest only when the source is OKLCH (gotcha #12).
4. **px → rem** (÷16). `999px` → `9999px` (Tailwind `radius-full`).
5. **`var()`-indirection wherever the source value coincides with a raw
   token** — if `--bg`'s hex *is* the slate-50 step, emit `var(--slate-50)`,
   not a literal. Keeps one source of truth.
6. **Faithful over defaults** — preserve the source's values (even soft muted
   text below AA); warn, don't silently replace with generic defaults.
7. **Mind the gaps the source doesn't cover** — an error color (add a `--red-*`
   scale + `--color-danger`) and the Typography scale (`--text-*`/
   `--leading-*`/`--weight-*` — `assets/components/typography.tsx` needs them).
8. **Verify, don't trust the extract** — `node assets/scripts/verify-tokens.mjs
   src/styles/tokens` (dangling refs, Typography deps, dark-pair completeness,
   WCAG). Format-independent: same checks whatever produced the tokens.

## When extraction gets hard: two failure modes

Extraction from a real source will hit difficulty. There are **two distinct
directions** it comes from — handle each differently. The rule in both:
**surface it, don't silently resolve it.** A defensible choice buried in the
output is still a silent design decision. This operationalizes principle 6
(faithful-over-defaults) for the cases where you can't simply preserve.

**1. Insufficient content — the source designates *no* value for a role you
need.** The role exists in the 4-layer model but the source has nothing (or
nothing usable) for it: no error color, no dark mode, no `--leading-*`/
`--weight-*` scale, a value that won't convert (out of gamut, bad unit).
- Flag the gap in the output + report.
- If there is **one principled fill**, apply it *and* flag it: Shell primitives
  (skill plumbing), an error color from a standard `--red-*` scale (pick a
  brand-appropriate red), a missing leading/weight scale copied from
  `assets/tokens/raw.css` and flagged as skill plumbing — not a source value.
  A value that won't convert is emitted as-is and flagged — faithful, visibly
  broken.
- If it's a **conscious product decision**, stop and ask — *"No dark mode in the
  source — fabricate one, or is single-theme intentional?"* Don't invent a
  design choice.
- The reference adapter's stance here is **omit-and-flag**, not auto-fill — it
  omits `--color-danger` and lets you fill the `--red-*` scale in wiring.
  `verify-tokens.mjs` catches the gaps that slip through (missing Typography
  deps, dangling refs, absent `.dark`).

**2. Intent ambiguity — the source fills a role *unclearly*.** It designates
multiple candidates for one role, contradicts itself, or leaves candidates with
no designated choice: "pills for buttons" *and* "radius-md 12px for buttons";
`--color-border` drawn from a palette that defines no border token (candidates
exist — ink-400, a tint, a derived neutral — none designated); card border 0 vs
1px.
- **Stop and ask.** Present the concrete interpretations as options — *"border →
  ink-400 (warm neutral) / orange-100 (tint) / a new derived neutral — which?"*
  — let the designer decide, regenerate on their choice.
- This can't be auto-detected from output alone (verification sees the result,
  not the source's ambiguity), so it must be handled during extraction by
  following this protocol.

**Not a difficulty — just bookkeeping.** Source tokens the 4-layer model has no
role for (animations, z-index, breakpoints, one-off shadows) are neither #1 nor
#2: the source is present and unambiguous, there's just nowhere to put it. Drop
them and note it in the report. Difficulty is about roles you *need*, not values
you can't *place*. Separately, a faithful value that fails a hard external
constraint (WCAG) is a **trade-off**, not an ambiguity — see *접근성 (WCAG)*
below.

Quick sort: **the source designates no value for a needed role → #1. Multiple /
contradictory / none-designated → #2. Nowhere to put it → drop + note.**

## The `.dc.html` reference adapter

`extract-dc.mjs` is the worked example for the `.dc.html` format. Read it as an
instantiation of the principles above; **don't extend it into a universal
converter** — that's the trap. The rest of this file (down through *Trust &
vm*) documents how that one adapter applies the principles to `.dc.html`.

### Why the adapter exists (for `.dc.html` specifically)

A DC `.dc.html` is not directly usable in a Next.js + Tailwind v4 + shadcn
project. Four gaps the adapter closes:

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
                                    [--no-spec | --full-spec] [--strict]
```

- `--out <dir>` — default `<input-dir>/tokens/`.
- `--no-manifest` — write only the 4 CSS files, skip `_manifest.json` and `_report.md`.
- `--no-spec` — emit only Shell primitives; skip the Design Tokens-sourced
  layout/component specs (their values aren't read from the input — see
  `DC_SPEC` below). Use when your DC isn't the `Design Tokens` reference and
  you don't want its structural decisions imposed.
- `--full-spec` — force the Design Tokens-sourced specs even on a mockup /
  non-token input (overrides the auto-skip described under `DC_SPEC`).

Outputs:
- `raw.css` · `semantic.css` · `layout.css` · `component.css`
- `_manifest.json` — provenance + flat token index (machine-readable; also
  `dangling_refs`, `dc_spec_skipped`, `typography_deps_missing`)
- `_report.md` — verification: hex→OKLCH round-trip delta per color, dark-pair completeness, off-ramp literals, dangling `var()` refs, Typography-dep gaps, scale coverage (human-readable — **read it after every run**)

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
   `Design Tokens.dc.html` reference, NOT read from the input** — so they are
   only faithful when the input *is* that reference. Two consequences the
   converter handles: (a) each entry is tagged `shell` (skill plumbing the
   Shell/grid needs — sidebar width, 3-col ratio, …; always emitted) or `dc`
   (the Design Tokens-sourced values above); (b) on a mockup / non-token input
   (no scales extracted), the `dc` group is **auto-skipped** so one doc's
   structural decisions aren't imposed on another (their `var(--space-N)` refs
   would dangle anyway). Override with `--no-spec` (skip always) or
   `--full-spec` (force even on a mockup). If your real source specifies a
   different header height, button radius, or focus ring, edit
   `layout.css`/`component.css` after conversion. `_report.md` §1 notes
   whether the `dc` group was applied or skipped. (The scales — slate,
   spacing, radii, type — are scraped per-file, so they do track the input.)

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

## Other Claude Design sources (SPA bundle, Figma, …)

Claude Design exports more than `.dc.html`. An **SPA bundle** is a directory:
`tokens/*.css` (colors / spacing / radius / typography / fonts), a
`_ds_manifest.json` with a structured `tokens:[]` index, `styles.css`, plus
`components/` and `ui_kits/`. There is **no `.dc.html`, no `[data-theme]`
blocks, no `renderVals()`** — so the `.dc.html` adapter cannot read it (running
it yields an empty/broken scaffold; its own report says so). This is the case
that proves why extraction is a direction: apply the principles, don't force
the wrong adapter.

A bundle is actually *closer* to the target than a `.dc.html` — its tokens are
already CSS custom properties. Map it by applying the principles directly:

- **L1 raw** ← the bundle's base tokens (brand colors, `--space-*`, `--radius-*`,
  `--fs-*`/`--lh-*`/`--fw-*`). Convert hex→OKLCH, px→rem (the bundle is usually
  all hex/px).
- **L2 semantic** ← the bundle's `var()` aliases (`--color-primary:
  var(--orange)`, `--surface-page: var(--bg)`). Complete them to the full
  shadcn role set; preserve editorial roles with no equivalent.
- **L3 layout / L4 component** ← structural/component tokens (`--page-pad`,
  `--gap-cards`, `--shadow-btn`, `--ring`); add Shell primitives.
- **Watch the gaps** — a bundle may be single-theme (no `.dark`, by design —
  e.g. an always-light kids' app), may omit an error color, and almost always
  uses `--fs-*`/`--fw-*` not the `--text-*`/`--weight-*` Typography expects.
  These are faithful to the source; decide deliberately, don't auto-fill.

The bundle's `_ds_manifest.json` `tokens:[]` array (`{name, value, kind,
definedIn}`) is a machine-readable inventory — handy for driving a one-off
adapter script, but you can also hand-map from `tokens/*.css` directly. Either
way, finish with `verify-tokens.mjs` on the result (it reads any `*.css`
layout, so it checks a bundle-assembled dir exactly like a `.dc.html`-derived
one).

## Verification beyond this script

Two layers of verification:

1. **`verify-tokens.mjs`** (this skill, format-independent) — run it on the
   *result* dir whatever produced it (`.dc.html` adapter, SPA-bundle mapping,
   hand-written, the default `assets/tokens/`). Checks dangling `var()` refs,
   Typography deps, dark-pair completeness, WCAG. `--strict` fails on dangling
   refs or WCAG-AA fails.
2. The `.dc.html` adapter *also* self-verifies its own output (`_report.md`) —
   OKLCH math self-check, `var()` ref integrity, dark-pair completeness, WCAG,
   raw-scale coverage, Typography deps. That's the adapter checking itself; for
   any other source, use `verify-tokens.mjs` instead.

Beyond static checks (whether `verify-tokens.mjs` or the adapter's own
`_report.md`), no script proves a browser render. Before trusting token output
in a real app, run the gates the skill itself preaches (Step 6):

1. **CSS parse** — run the files through `lightningcss`/`postcss` to catch
   malformed declarations or `@import`/`@theme` ordering the brace-count can't
   see. (Not bundled — the skill is zero-dep; install ad hoc: `npx lightningcss …`.)
2. **Build + render readback** — wire a fixture Next app with the tokens
   **and** the skill's `Shell`/`Typography`, then `next build` + a Playwright
   smoke that reads `getComputedStyle` for each role in light and dark. This is
   the only thing that actually proves `.dark` flips colors, `@theme inline`
   resolves, and no token the Shell/Typography needs is missing.
3. **`--strict` in CI** — `node verify-tokens.mjs … --strict` (any source)
   exits non-zero on dangling `var()` refs or WCAG-AA failures;
   `node extract-dc.mjs … --strict` (`.dc.html`) *additionally* fails on
   incomplete dark pairs or empty raw-scale coverage. Wire either in so a token
   edit that breaks structure or contrast fails before it ships. (Note:
   `verify-tokens.mjs`'s WCAG check resolves hex/rgb only — on OKLCH token sets
   it reports pairs as unresolved rather than risk a wrong ratio; for OKLCH
   contrast use the adapter's `_report.md` §2 or a browser check.)

The `.dc.html` adapter's `_report.md` §3 round-trip table is a **math
self-check** (same `toOklch` + inverse, confirms no sign/coefficient bug, lands
within Δ ≤ 1/255 per channel). It is *not* a browser-render proof — for
sRGB-in-gamut colors the conclusion happens to hold, but establishing it is
gate 2's job.

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
| `SCAFFOLD: N dangling var() ref(s)` on stdout, `dangling var() refs` in `--strict` / §1 | `layout.css`/`component.css` (from `DC_SPEC`) reference raw tokens the input didn't expose — listed by name (e.g. `--space-7`, `--radius-control`); they render as `unset`. Fires on a full mockup *or* a partial input (e.g. spacing present but missing the step `DC_SPEC` needs). Fix: copy the missing `--space-*`/`--radius-*`/`--text-*` scales from `assets/tokens/raw.css` into the generated `raw.css`, or add the scale arrays to the DC source and regenerate. |
| All scales empty (`raw: 0 slate, … 0 type`) | The DC file is a mockup — its `renderVals()` returns UI data (routes, hero, FAQ…), not token arrays. `semantic.css` still generates from the theme blocks (dark pairs complete); only the raw scales are absent, which surfaces as dangling refs (row above). Feed a token-reference DC, or fill the scales by hand. |
| Structural specs wrong (header height, button radius, …) | `DC_SPEC` `dc`-sourced values are hardcoded from `Design Tokens.dc.html`, not read from your input. Auto-skipped on a mockup; on a real token-reference DC, edit `layout.css`/`component.css` after conversion, or re-run with `--no-spec` to drop them and copy `assets/tokens/component.css` for skill defaults. |
| `Typography deps missing […]` on stdout / §1 | `assets/components/typography.tsx` (Step 4) needs `--text-*`/`--leading-*`/`--weight-*`. The converter emits `--text-*` from DC's typeScale (absent on a mockup), but **never** emits `--leading-*`/`--weight-*` (DC has no such scale) — so those two are flagged on every run. Fix: copy the missing scale(s) from `assets/tokens/raw.css` into the generated `raw.css`. Not a `--strict` failure (the gap is inherent, not a malformed input). |
| Color looks slightly off | Check `_report.md` §2 — any Δ > 1 is flagged. Δ ≤ 1 is visually identical. |
| `text-3xl` doesn't resolve | Type-scale gotcha above — add `--text-3xl` to `raw.css` or use `text-h1`. |
| `bg-destructive` shows indigo | `--color-danger` is a primary placeholder — replace with a real red. |
