# Build workflow — the seven steps in detail

This file expands the workflow sketch in `SKILL.md`. Read the section for
the step you're on; you don't need the whole file up front. **If the
SKILL.md summary and this file disagree, this file is correct and the
SKILL.md sketch is stale — fix the summary to match.** The summary exists
to route readers; the detail lives here.

## 0. Scaffold

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

## 1. Token layer — copy, don't hand-write

Copy the four files in `assets/tokens/` to `src/styles/tokens/`:
- **raw.css** — primitives only (OKLCH color scales, `--space-1..8`,
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

## 2. Shell + primitives — copy from assets

Copy `assets/components/layout/` (`shell.tsx`, `header.tsx`, `footer.tsx`,
`sidebar.tsx`, `grid.css`) to `src/components/layout/`. Structure:
- `grid.css` — the outer **CSS Grid Template Areas** (`header`/`main`/
  `footer` rows), sized entirely from `src/styles/tokens/layout.css` (note:
  two different files, both about "layout" — the token file defines
  dimensions, this one consumes them for structure). Grid Template Areas is
  the reference choice because it lets the header/main/footer regions stay
  addressable by name; it's a structural decision independent of the token
  principle, so a flexbox column driven by the same tokens is an equally
  valid substitute if you don't need named regions.
- `shell.tsx` — cva-driven column grid; imports `@/components/ui/sheet` for
  the mobile drawer (a legit `registryDependency`, not a self-containment
  violation).

`Shell` props:
```ts
columns?: 1 | 2 | 3                       // default 1
sidebarPosition?: "left" | "right" | "none"
sidebarCollapsed?: boolean                // default false; shrink desktop sidebar to
                                          //   --sidebar-width-collapsed (icon-rail mode).
                                          //   No effect below md (sidebar is in the Sheet
                                          //   drawer there). Ignored on columns === 3.
header?, footer?, sidebar?, aside?: React.ReactNode
sidebarTitle?: string                     // mobile Sheet a11y title
```

## 3. Responsive (already wired in shell.tsx)

`3col → (lg) 2col → (md) 1col + Sheet`; `2col → (md) 1col + Sheet`. Tailwind
default breakpoints only; **no custom breakpoints, no media-query px in
components** (gotcha #6). Below `md` the sidebar hides and opens via the
shadcn `Sheet`.

## 4. Atomic components — add via CLI, then retrofit

```
npx shadcn@latest add button input badge card
```
The generated files **fail the grep guard immediately** (e.g. `ring-[3px]`,
`rounded-[min(var(--radius-md),10px)]`). Retrofit each per
`references/shadcn-retrofit.md` (before/after table). Then add the Typography
component (not shipped by shadcn) — copy `assets/components/typography.tsx`;
it references the raw `text-*`/`--leading-*`/`--weight-*` scale.

**Why no retrofitted `button.tsx`/`input.tsx` in `assets/`.** The shadcn CLI's
output varies across versions and across the `style` selected at `init`
(`base-nova` vs. a Radix-based style emit different class strings, data-slot
names, and composition rules). A frozen "retrofitted" component would either
need constant re-capture or — worse — drift into a wrong reference that gets
pasted verbatim. So this skill ships the **method** (`shadcn-retrofit.md`'s
before/after table + the grep-then-fix loop) and trusts the retrofit to be
re-applied to whatever the CLI actually produced at this point in time. The
style-agnostic parts (tokens, Shell, grid, verify pipeline) are the assets
that *do* get copied verbatim.

## 5. Interactive components — the real test

```
npx shadcn@latest add dialog dropdown-menu select switch tabs tooltip
```
Re-run the grep guard and retrofit (same table). These exercise **portals,
focus, and base-ui composition rules** — where the subtle bugs live. Read
`references/gotchas.md` before wiring them (esp. #2 portal dark, #3
`DropdownMenuGroup` requirement, #4 `render` data-slot).

## 6. Verify — three complementary gates, and actually *run* them

Copy `assets/playwright.config.ts` and `assets/e2e/smoke.spec.ts`. The spec
ships with an **empty `routes` array and a guard test that fails until you
populate it** — list every page that renders a Shell or an interactive
component (gotcha #8: a spec pointing at routes that don't exist, or an empty
list that passes everything, both verify nothing). Build those demo pages
first if you haven't — at minimum one route per `columns` variant plus one
per interactive component, so the smoke actually opens every overlay. Then
install Playwright **including the browser**, and run `scripts/verify.sh`:
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

**The runtime gate runs against the production build, not `next dev`.** Dev
mode skips tree-shaking, RSC serialization, and dynamic-import resolution —
all failure modes that only surface once you ship. `verify.sh` builds once
and `playwright.config.ts` serves the artifact via `npm run start`, so the
runtime gate covers what production users actually run.

**Optional 4th gate: a static token-resolution check.** The grep guard catches
literals; the Playwright smoke catches things that throw. Neither catches a
*silent* regression where someone repoints a component token at the wrong
rung of the raw/semantic scale — e.g. `--input-height: var(--space-7)` instead
of `var(--space-6)` — because the reference is syntactically valid and nothing
errors. That class of bug is real but rare enough that it's not part of the
default three-gate pipeline above; add a fourth gate only if you've hit it or
expect to (e.g. a design system with many contributors editing tokens
directly). Two options, either is fine:
- A small script that resolves each component token's full `var()` chain down
  to a concrete pixel value and diffs it against an expected value — cheap,
  runs before the build step, so it fails fast.
- A Playwright assertion comparing `getBoundingClientRect()` of two controls
  that should render at the same size (e.g. Button vs. Input height) — catches
  it against the real rendered DOM, at the cost of needing a full build first.
Whichever you add, prove it actually works the same way you proved the smoke
test does: deliberately mis-map a token, run the check, confirm it fails with
a useful message, then fix it and confirm it passes.
