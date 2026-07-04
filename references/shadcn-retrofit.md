# shadcn → token retrofit

shadcn's CLI generates components against its own defaults. Two problems to fix on every `add`:

1. **Palette classes** (`bg-primary`, `bg-destructive`…) already resolve to your tokens *if* your `@theme inline` exposes those color names — so they mostly work as-is. The exceptions worth rewriting for intent are hover/danger states.
2. **Hardcoded px** — shadcn (especially the `base-nova` / `@base-ui` style) ships arbitrary values like `ring-[3px]`, `rounded-[min(var(--radius-md),10px)]`, `h-[18.4px]`, `min-w-[96px]`. These fail the grep guard and must be tokenized. **This is not optional cleanup — the freshly generated files fail `verify.sh` out of the box.**

Re-run the grep guard after **every** `shadcn add`:
```
grep -rnE "[0-9]+px|#[0-9a-fA-F]{6}" src/components/ui
```

## Atomic components — before / after

| Component | before (shadcn default) | after (token) |
|---|---|---|
| button (base) | `rounded-lg` | `rounded-[var(--button-radius)]` |
| button default | `hover:bg-primary/80` | `hover:bg-primary-hover` |
| button destructive | `bg-destructive/10 text-destructive hover:bg-destructive/20 …` | `bg-danger text-danger-foreground hover:bg-danger/90 focus-visible:ring-danger/40` |
| button size default/lg | `px-2.5` | `px-(--button-padding-x)` |
| button xs/sm/icon | `rounded-[min(var(--radius-md),10px)]` / `,12px)]` | `rounded-[var(--button-radius)]` |
| badge | `rounded-4xl` | `rounded-[var(--badge-radius)]` |
| badge | `px-2 py-0.5` | `px-(--badge-padding-x) py-(--badge-padding-y)` |
| badge | `focus-visible:ring-[3px]` | `focus-visible:ring-3` |
| input | `h-8` | `h-(--input-height)` |
| input | `rounded-lg` | `rounded-[var(--input-radius)]` |
| card | `rounded-xl`, `rounded-t/b-xl` | `rounded-[var(--card-radius)]`, `rounded-t/b-[var(--card-radius)]` |
| card | `[--card-spacing:--spacing(4)]` / `--spacing(3)` | `[--card-spacing:var(--card-padding)]` / `var(--space-3)` |

## Interactive components — before / after

| Component | before | after |
|---|---|---|
| switch (track) | `h-[18.4px] w-[32px] h-[14px] w-[24px]` | `h-[var(--switch-height)] w-[var(--switch-width)] …-sm` (add `--switch-*` tokens) |
| switch (thumb) | `translate-x-[calc(100%-2px)]` | `translate-x-[calc(100%-var(--switch-thumb-inset))]` |
| tooltip (arrow) | `translate-y-[calc(-50%-2px)]`, `rounded-[2px]` | `-translate-y-1/2`, `rounded-[var(--radius-sm)]` |
| tabs (list) | `p-[3px]` | `p-1` |
| tabs (trigger) | `h-[calc(100%-1px)]`, `ring-[3px]` | `h-full`, `ring-3` |
| tabs (underline) | `after:bottom-[-5px]` | `after:-bottom-1` |
| select (sm) | `rounded-[min(var(--radius-md),10px)]` | `rounded-[var(--radius-md)]` |
| dropdown (sub) | `min-w-[96px]` | `min-w-24` |

**Rule of thumb for each px value:**
- On the raw scale already? → Tailwind scale utility (`ring-3`, `p-1`, `min-w-24`, `h-full`).
- A real design value used in >1 place, or an odd magic number? → add a `--<component>-*` token to `component.css` and reference it (`h-[var(--switch-height)]`).
- A tiny cosmetic nudge (a 1–2px offset)? → drop it or round to the nearest scale step; not worth a token.

## Why palette classes already "just work"

`@theme inline { --color-primary: var(--color-primary); … }` registers the utility (`bg-primary`) but — because of `inline` — does **not** emit its own `--color-primary`, so the value comes solely from `semantic.css` (`:root` + `.dark`). shadcn components that use `bg-primary` therefore pick up your tokens and flip in dark mode with zero edits. You only hand-edit classes where you want *different* intent (hover-hover, solid danger) or to kill hardcoded px.
