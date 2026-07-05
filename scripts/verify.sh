#!/usr/bin/env bash
# ------------------------------------------------------------------
# verify.sh — three-layer gate for a token layout system.
# Run from the Next.js project root.
#
#   1. grep guard  — no hardcoded px/hex in components (STATIC)
#   2. next build  — types + prerender (COMPILE)
#   3. playwright  — open every overlay, fail on runtime errors (RUNTIME)
#
# The three layers are complementary: the dropdown "MenuGroupContext is
# missing" bug passes grep AND build AND tsc — only step 3 catches it,
# because it only throws when the portal actually opens.
#
# Step 3 runs against the PRODUCTION build (`next start`), not `next dev`:
# dev skips optimizations (tree-shaking, RSC serialization, dynamic-import
# resolution) that only fail once you ship. Building once and serving the
# artifact means the runtime gate covers what production users actually
# run. Don't switch webServer.command back to "npm run dev" unless you
# also accept the dev-only blind spot.
# ------------------------------------------------------------------
# Deliberately no `set -e`: all three gates must run even when an earlier
# one fails, so a single pass reports every failure at once.
set -uo pipefail

# src/app is guarded too: App Router pages/layouts render as much UI as
# src/components, and leaving them unscanned shrinks the guard's coverage
# as the project grows. Token *definition* files stay in src/styles/**,
# which is deliberately not listed here.
DIRS=("src/components" "src/app")
# px, hex (3–8 digits: #rgb/#rgba/#rrggbb/#rrggbbaa), and any CSS color
# function literal — rgb/hsl and the wide-gamut ones (oklch/oklab/lab/lch),
# so a raw oklch() pasted into a component is caught, not just legacy hex.
PATTERN='[0-9]+px|#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|oklch\(|oklab\(|lab\(|lch\(|color\('
fail=0

# Raw-palette prefixes that components must never reference directly —
# colors go through the semantic layer (--color-*), or the layer structure
# is dead even though no literal appears. Extend when you add palettes to
# raw.css. Dimension raw tokens (--space-*, --radius-*, --text-*) are fine
# to reference: they're scales, not roles.
LAYER_PATTERN='\(--(gray|blue|red|green|yellow|white|black)'

# Warn-only drift signals: rem/vh/em arbitrary values and numeric inline
# styles are legal (no px literal) but are one-off magic values dodging the
# token system — surface them without blocking the build.
DRIFT_PATTERN='\[[0-9][0-9.]*(rem|em|vh|vw|ch|svh|dvh)\]|style=\{\{[^}]*:\s*-?[0-9]'

echo "── 1/3  grep guard (static) ─────────────────────────────────"
if grep -rnE "$PATTERN" "${DIRS[@]}" 2>/dev/null; then
  echo "❌ hardcoded values found — replace with token references (var(--…) or Tailwind scale)"
  fail=1
else
  echo "✅ literals: none"
fi
if grep -rnE "$LAYER_PATTERN" "${DIRS[@]}" 2>/dev/null; then
  echo "❌ raw-palette token referenced from a component — route colors through the semantic layer (--color-*)"
  fail=1
else
  echo "✅ layer rule: no raw-palette references"
fi
if grep -rnE "$DRIFT_PATTERN" "${DIRS[@]}" 2>/dev/null; then
  echo "⚠️  drift warning (non-blocking): one-off rem/vh values or numeric inline styles — consider tokens"
else
  echo "✅ drift signals: none"
fi

echo "── 2/3  next build (types + prerender) ──────────────────────"
if npm run build >/tmp/tls-build.log 2>&1; then
  echo "✅ build ok"
else
  echo "❌ build failed:"; tail -20 /tmp/tls-build.log; fail=1
fi

echo "── 3/3  playwright interaction smoke (runtime errors) ───────"
if npx playwright test >/tmp/tls-e2e.log 2>&1; then
  echo "✅ e2e ok"
else
  echo "❌ e2e failed:"; tail -25 /tmp/tls-e2e.log; fail=1
fi

echo "────────────────────────────────────────────────────────────"
if [ "$fail" -eq 0 ]; then echo "ALL GREEN ✅"; else echo "FAILURES ABOVE ❌"; fi
exit $fail
