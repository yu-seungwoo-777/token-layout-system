# base-ui / Tailwind v4 gotchas

Hard-won traps from building the reference implementation. Most cost real debugging time and none are caught by `tsc` or `grep` — read before you repeat them.

## 1. The `@theme inline` self-reference: what actually makes dark mode work

To get a dark-mode-aware `bg-primary` utility, define the role token in `semantic.css` (`:root` + `.dark`) and re-declare it inside `@theme inline`:
```css
/* semantic.css */
:root { --color-primary: var(--blue-600); }
.dark { --color-primary: var(--blue-500); }
/* globals.css */
@theme inline { --color-primary: var(--color-primary); }
```
What actually carries the dark-mode flip is **not** the `inline` keyword — it's the **self-referential `var()`**. A `--color-primary: var(--color-primary)` declaration is invalid at computed-value time (a CSS cycle), so the value Tailwind bakes into the `@theme` block is effectively a no-op. The real values come from `:root` and `.dark` in `semantic.css`, where `.dark` wins by source order on `<html class="dark">`. Compile-verified on Tailwind v4.1 and v4.3: the CSS output is byte-identical with or without `inline` for this self-referential shape.

`inline` **does** matter elsewhere — when a `@theme` value is a concrete literal or a non-self-referential `var(--other)`, `inline` controls whether the utility inlines the value or emits its own variable. But for the self-referential `var(--same-name)` pattern this skill ships, `inline` is decorative. Keep it (it documents intent and future-proofs against a refactor that breaks the self-reference), but don't believe it's load-bearing here — that misdiagnosis was real and shipped in earlier versions of this gotcha, and it misleads anyone trying to debug dark mode by toggling `inline`.

The part that *is* load-bearing: the `:root` + `.dark` pair in `semantic.css`, and importing `semantic.css` (not just `raw.css`) before the `@theme` block in `globals.css` so the cascade resolves correctly.

## 2. Dark class must live on `<html>`, not a container

Portaled components (Dialog, DropdownMenu, Select, Tooltip, Sheet) render at `<body>` root, **outside** your Shell tree. They inherit `.dark` only because it's on `<html>`. Put the theme class on a nested div and every portal will render in light mode while the page is dark. Verified: toggling `.dark` with a dialog open flips the *portal's* background live.

## 3. base-ui is stricter than Radix about composition

`DropdownMenuLabel` (= `Menu.GroupLabel`) throws `MenuGroupContext is missing` unless it's inside a `DropdownMenuGroup`. Radix-era shadcn tolerated a bare label; base-ui does not. This passes `grep`, `tsc`, AND `next build` (the menu only renders when opened) — **only the Playwright smoke catches it.** When composing any base-ui menu/group/radio part, wrap it in its required parent.

## 4. `render={<Button/>}` remaps `data-slot`

Triggers composed via base-ui's `render` prop (`<DialogTrigger render={<Button/>}>`) take the Button's `data-slot="button"`, not `dialog-trigger`. Don't rely on `[data-slot="dialog-trigger"]` in tests/styles — target by role or text instead.

## 5. Token *value* mismaps are invisible to every static gate

`--input-height: var(--space-8)` is perfectly valid — but `--space-8` is `4rem`, making inputs 64px (double the intended 32px). Nothing flags a token that points at a real-but-wrong value. Sanity-check control heights against each other after wiring (input should match button `h-8`). Prefer mapping to the scale step that equals the original shadcn value.

## 6. Responsive without px in the grep'd dirs

Media-query px (`@media (max-width:1024px)`) inside `src/components/**` would trip the grep guard. Do responsive with Tailwind's breakpoint prefixes in the TSX instead (`grid-cols-1 md:grid-cols-[…] lg:grid-cols-[…]`) — the px lives in generated CSS, never in your source. Grid column ratios go through arbitrary values that reference tokens: `md:grid-cols-[var(--sidebar-width)_minmax(0,1fr)]`.

## 7. Sidebar divider follows the content-facing edge

A sidebar's border must sit on the side touching the content, or the divider lands on the screen edge. Compute it from position: `layout === "twoRight" ? "border-l" : "border-r"`.

## 8. A written-but-unrun smoke test is false safety

The runtime gate only has value when it executes. Creating `smoke.spec.ts` +
`playwright.config.ts` and then skipping `playwright install` / not running it
gives a green-looking repo that has verified *nothing* about runtime behavior —
the portal never opened, so the throw never fired. Observed directly: a build
that only wrote the spec and reasoned "the API looks runtime-safe" shipped a
bare `DropdownMenuLabel` (gotcha #3) that throws on open. Install chromium once
and make the run part of the gate; treat an unexecuted spec as a failing check.

## 9. `--scale-*: initial` (namespace reset), not partial override, drops the rest of a scale

Earlier versions of this gotcha claimed that redefining `--text-sm` through `--text-2xl` in `@theme` causes `text-xs`/`text-3xl`/`text-4xl` to silently disappear. **Compile-verified on Tailwind v4.1 and v4.3: that's wrong.** Partially overriding entries in a namespace **merges** with the defaults — the untouched entries (`--text-xs`, `--text-3xl`, `--text-4xl`) still resolve to Tailwind's defaults. You can see both sets in the output: the overridden entries emit literal values, the default ones emit `var(--text-3xl)` etc., and both work.

What *does* drop the rest of a scale is an explicit **namespace reset**:
```css
@theme {
  --text-*: initial;   /* this is the actual footgun */
  --text-sm: 0.875rem;
  /* ... */
}
```
`--text-*: initial` tells Tailwind to discard the entire `--text-*` namespace before re-adding what follows. Now `text-xs`/`text-3xl`/`text-4xl` really do stop resolving — silently, no error. This is sometimes the intended trade (one deliberate scale, no stray sizes) but it's a trap if you didn't mean it. The skill's `raw.css` does **not** do this — it only overrides specific entries, so the default scale stays intact. If you ever reach for `--scale-*: initial` to "clean up" the defaults, that's the moment to also re-add every entry you still need.

## 10. A `columns`/`sidebarPosition` prop without matching content leaves an empty grid track

`Shell`'s grid track sizing must be driven by whether `sidebar`/`aside`
content was actually **passed**, not just by the `columns`/`sidebarPosition`
props requesting a slot. Compute layout from `sidebar != null` /
`aside != null` (see `resolveLayout` in `shell.tsx`) rather than from the
props alone — otherwise `columns={2}` with no `sidebar` reserves a
`--sidebar-width` track with nothing in it.

## 11. Theme toggle needs persistence for production

A local-state toggle resets to light on every navigation and its mount effect can force `.dark` off. For a real system, persist to `localStorage` and apply the class via an inline `<script>` in the root layout **before** hydration to avoid a flash of the wrong theme (FOUC). Fine to skip in a demo, but flag it.

## 12. OKLCH is not a stylistic choice — it's what makes opacity modifiers honest

shadcn's Tailwind v4 themes ship colors in OKLCH, and `raw.css` follows suit. The reason isn't trendiness: Tailwind v4 compiles every opacity modifier (`bg-primary/50`, `text-danger/80`) to `color-mix(in oklab, var(--token) N%, transparent)`. `oklab` is a *perceptual* mixing space — when the source color is already OKLCH, the mix stays in the same space and the lightened/darkened result is what you'd expect by eye. When the source is `hsl(...)`, the browser converts HSL→oklab on the fly, and the perceptual midpoint between two HSL values is *not* the HSL midpoint you'd predict — light/dark variants of the "same" hue drift apart in saturation and lightness in ways that only show up at the `/50`-style usages shadcn leans on heavily.

This is invisible to every gate in the pipeline (the value parses, the utility compiles, the page renders *something*). It surfaces only as a design review where "the hover state looks off in dark mode." So: when adding new colors to `raw.css`, write them in OKLCH from the start. Convert existing HSL with a calculator (`oklch.com` or the CSS `color()` function in DevTools), don't eyeball it — `hsl(221 83% 53%)` and a guessed `oklch(0.5 0.2 260)` are not the same blue. If you mix formats in one file, the inconsistency compounds at every opacity step.
## How these gates decay over time (read at month 3, not day 1)

The pipeline is tuned for *setup-time* correctness; over a project's life it
decays along known paths, none of which turn a gate red:

- **Letter-vs-spirit drift.** `w-[4.25rem]`, `mt-[3vh]`, and numeric inline
  styles (`style={{ width: 68 }}` renders as px with no "px" in source) all
  pass the literal grep while being exactly the one-off magic values the
  token system exists to prevent. `verify.sh` now surfaces these as a
  non-blocking drift warning — treat a growing warning list as the signal.
- **Literal migration into the token layer.** `src/styles/**` legitimately
  holds literals, so pressure pushes one-off values there as fake tokens
  (`--hero-card-height-mobile`). The gate stays green while the 4-layer
  structure degrades into a constants file. Review token diffs for "tokens"
  with exactly one consumer.
- **Layer skipping.** A component referencing `var(--gray-500)` directly
  bypasses the semantic layer with no literal in sight. `verify.sh`'s
  layer rule now fails raw-*palette* references from components; extend
  its prefix list when you add palettes.
- **Smoke route-list rot.** New pages don't add themselves to
  `smoke.spec.ts`. The coverage-parity test now fails when a static route
  exists on disk that the smoke never walks; dynamic routes still need
  hand-added concrete paths.
- **Verify gets skipped.** As `next build` slows, running `verify.sh` less
  often is gotcha #8 applied to the whole pipeline. Wire it into CI so
  skipping stops being an option.
