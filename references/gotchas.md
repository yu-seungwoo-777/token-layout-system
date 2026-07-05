# base-ui / Tailwind v4 gotchas

Hard-won traps from building the reference implementation. Most cost real debugging time and none are caught by `tsc` or `grep` — read before you repeat them.

## 1. `@theme inline` self-reference is the whole trick

To get a dark-mode-aware `bg-primary` utility, define the role token in `semantic.css` (`:root` + `.dark`) and reference it from `@theme inline`:
```css
/* semantic.css */
:root { --color-primary: var(--blue-600); }
.dark { --color-primary: var(--blue-500); }
/* globals.css */
@theme inline { --color-primary: var(--color-primary); }
```
`inline` means the utility emits `var(--color-primary)` and Tailwind does **not** write its own `--color-primary` — so no circular definition, and `.dark` overrides win. Without `inline`, Tailwind bakes the light value in and dark mode won't flip.

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

## 9. `@theme inline` redefining a Tailwind scale drops the rest of it

If `raw.css` redefines `--text-sm` through `--text-2xl` on a custom scale
(rather than adding new names), Tailwind's default entries for names you
*didn't* touch in that same scale family — `text-xs`, `text-3xl`, `text-4xl`,
etc. — disappear, because `@theme inline` replaces the scale rather than
merging into it. This is usually the intended trade (one deliberate scale,
no stray sizes), but it's a silent one: nothing errors, a class like
`text-4xl` just stops resolving. If you need it, either add it explicitly to
`raw.css`'s scale or keep it as a Tailwind default by not touching that key.

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