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
# ------------------------------------------------------------------
set -uo pipefail

DIRS="src/components"
PATTERN='[0-9]+px|#[0-9a-fA-F]{3}\b|#[0-9a-fA-F]{6}\b|rgba?\(|hsla?\('
fail=0

echo "── 1/3  grep guard (no raw px/hex in components) ────────────"
if grep -rnE "$PATTERN" $DIRS 2>/dev/null; then
  echo "❌ hardcoded values found — replace with token references (var(--…) or Tailwind scale)"
  fail=1
else
  echo "✅ grep guard: none"
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
