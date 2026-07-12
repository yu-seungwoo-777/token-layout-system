#!/usr/bin/env node
// ------------------------------------------------------------------ //
// verify-tokens.mjs — format-independent 4-layer token verifier.
//
// The companion to the skill's "extract tokens from your design source"
// DIRECTION. Extraction is a direction (the source format varies — .dc.html,
// Claude Design SPA bundle, Figma, hand-written), so it can't be one frozen
// tool. But VERIFICATION must run to count (gotcha #8: "actually run it"), and
// the checks are the same whatever the source was. This script is that
// reusable, format-independent verifier: point it at any 4-layer tokens
// directory and it checks structural integrity, the Typography cross-asset
// dependency, dark-pair completeness, and WCAG contrast.
//
// It deliberately does NOT extract or convert anything — it only inspects CSS
// that already exists. Pair it with whatever produced the tokens: the .dc.html
// reference adapter (extract-dc.mjs), a hand-mapping of an SPA bundle, a Figma
// export, or the skill's default assets/tokens/*.css.
//
// Zero dependencies — Node 20+ builtins only.
//
//   node verify-tokens.mjs <tokens-dir> [--strict] [--report]
//
// Checks:
//   1. dangling var() refs      — every var(--x) resolves to a defined token
//   2. Typography deps          --text-*/--leading-*/--weight-* present if
//                                 assets/components/typography.tsx is used
//   3. dark-pair completeness   :root tokens missing a .dark value (if .dark
//                                 exists) — incomplete dark mode
//   4. WCAG contrast             fg/bg role pairs below AA 4.5:1 (best-effort:
//                                 only pairs whose values resolve to a color)
//
// --strict exits non-zero on dangling refs or WCAG-AA failures (the
// hard-errors). Typography-dep and dark-pair gaps are warnings (they may be
// intentional — no dark mode by design, no Typography used).
// ------------------------------------------------------------------ //
import fs from "node:fs";
import path from "node:path";

const GENERATOR = "verify-tokens.mjs v1";

// Foreground/background role pairs to contrast-check (shadcn convention; only
// checked when both resolve to a parseable color in :root).
const CONTRAST_PAIRS = [
  ["--color-foreground", "--color-background"],
  ["--color-muted-foreground", "--color-background"],
  ["--color-card-foreground", "--color-card"],
  ["--color-popover-foreground", "--color-popover"],
  ["--color-primary-foreground", "--color-primary"],
];

// Typography.tsx (skill Step-4 asset) references these. Warn if absent — the
// converter never emits leading/weight, and a hand-mapping may miss them.
const TYPOGRAPHY_DEPS = {
  text: ["--text-2xl", "--text-xl", "--text-lg", "--text-base", "--text-sm"],
  leading: ["--leading-tight", "--leading-normal", "--leading-relaxed"],
  weight: ["--weight-bold", "--weight-medium", "--weight-normal"],
};

// ============================ CLI ================================== //
function parseArgs(argv) {
  const args = argv.slice(2);
  if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
    return { help: true };
  }
  const input = args.find((a) => !a.startsWith("--"));
  return {
    input,
    strict: args.includes("--strict"),
    report: args.includes("--report"),
  };
}

const HELP = `verify-tokens.mjs — format-independent 4-layer token verifier

  node verify-tokens.mjs <tokens-dir> [--strict] [--report]

  <tokens-dir>    directory of token CSS. Reads every *.css in it — works on
                  the skill's raw/semantic/layout/component.css, a Claude
                  Design SPA bundle (colors.css/spacing.css/…), or any layout.
  --strict        exit non-zero on dangling var() refs or WCAG-AA failures
  --report        also write _verify-report.md into <tokens-dir>`;

// ===================== color parsing (sRGB only) ================== //
// Used only for WCAG contrast. Accepts #hex / rgb() / rgba(). Anything else
// (oklch, hsl, named) → null (pair skipped). oklch→contrast needs a perceptual
// luminance the browser computes; we don't replicate it here, so oklch values
// are reported as "unresolved" rather than risk a wrong ratio.
function parseHex(hex) {
  let h = String(hex).replace("#", "").trim();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return null;
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function parseColor(str) {
  const s = String(str).trim();
  const m = s.match(/^rgba?\(([^)]+)\)$/i);
  if (m) {
    const p = m[1].split(",").map((x) => x.trim());
    return [parseFloat(p[0]), parseFloat(p[1]), parseFloat(p[2])]; // 0-255
  }
  const ints = parseHex(s);
  if (!ints) return null;
  return ints;
}
const srgbToLinear = (c) => {
  const x = c / 255;
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
};
function relLuminance(rgb255) {
  const [r, g, b] = rgb255.map(srgbToLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrastRatio(fg, bg) {
  const a = parseColor(fg);
  const b = parseColor(bg);
  if (!a || !b) return null;
  const l1 = relLuminance(a);
  const l2 = relLuminance(b);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

// ===================== CSS parsing ================================= //
function stripComments(body) {
  return body.replace(/\/\*[\s\S]*?\*\//g, "");
}

// Extract `--name: value;` declarations under a given selector block.
// `selector` is matched as a literal substring at block open (e.g. ":root",
// ".dark"). Returns { name: value }.
function declarationsFor(body, selector) {
  const out = {};
  const re = new RegExp(
    // selector ... { body } — body truncated at first matching close brace
    // (CSS token values never contain `}`).
    `${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`,
    "g"
  );
  let m;
  while ((m = re.exec(body))) {
    for (const decl of m[1].split(";")) {
      const i = decl.indexOf(":");
      if (i < 0) continue;
      const name = decl.slice(0, i).trim();
      const val = decl.slice(i + 1).trim();
      if (name.startsWith("--") && val) out[name] = val;
    }
  }
  return out;
}

// Resolve a token value through var() chains using a definitions map.
// Returns the resolved value (a literal if fully resolved) or null.
function resolveVar(value, defs, seen = new Set()) {
  const s = String(value).trim();
  const m = s.match(/^var\(\s*(--[a-z0-9-]+)(?:\s*,\s*([^)]+))?\)/i);
  if (!m) return s; // already a literal
  const name = m[1];
  const fallback = m[2];
  if (seen.has(name)) return fallback || null; // cycle → fallback/none
  seen.add(name);
  if (defs[name] === undefined) return fallback || null;
  return resolveVar(defs[name], defs, seen);
}

// ===================== checks ====================================== //
function readTokensDir(dir) {
  // Read every *.css in the dir — the whole point of a format-independent
  // verifier is that it doesn't assume the skill's raw/semantic/layout/
  // component file names. A Claude Design SPA bundle ships colors.css /
  // spacing.css / …; a Figma export may ship one file; the skill default
  // ships the four canonical names. All are valid inputs.
  const files = {};
  for (const name of fs.readdirSync(dir).sort()) {
    if (name.endsWith(".css")) files[name] = fs.readFileSync(path.join(dir, name), "utf8");
  }
  return files;
}

function findDanglingRefs(fileMap) {
  const defined = new Set();
  for (const body of Object.values(fileMap)) {
    for (const m of stripComments(body).matchAll(/(--[a-z0-9-]+)\s*:/g)) defined.add(m[1]);
  }
  const dangling = [];
  const seen = new Set();
  for (const [file, body] of Object.entries(fileMap)) {
    for (const m of stripComments(body).matchAll(/var\(\s*(--[a-z0-9-]+)/g)) {
      const name = m[1];
      if (defined.has(name)) continue;
      const key = `${file}:${name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      dangling.push({ file, name });
    }
  }
  return dangling;
}

function findMissingTypographyDeps(fileMap) {
  const defined = new Set();
  for (const body of Object.values(fileMap)) {
    for (const m of stripComments(body).matchAll(/(--[a-z0-9-]+)\s*:/g)) defined.add(m[1]);
  }
  const missing = {};
  for (const [group, names] of Object.entries(TYPOGRAPHY_DEPS)) {
    const m = names.filter((n) => !defined.has(n));
    if (m.length) missing[group] = m;
  }
  return missing;
}

// :root COLOR ROLES that have no .dark counterpart (only when a .dark block
// exists). Scoped to --color-* on purpose: raw primitives (--gray-*, --space-*,
// --radius-* …) live in :root only by design and shouldn't be flagged.
function darkPairGaps(fileMap) {
  const combined = stripComments(Object.values(fileMap).join("\n"));
  if (!/\.dark\s*\{/.test(combined)) return { hasDark: false, gaps: [] };
  const root = declarationsFor(combined, ":root");
  const dark = declarationsFor(combined, ".dark");
  const gaps = [];
  for (const name of Object.keys(root)) {
    if (name.startsWith("--color-") && !(name in dark)) gaps.push(name);
  }
  return { hasDark: true, gaps };
}

// WCAG contrast on the standard fg/bg pairs (best-effort: only pairs whose
// values resolve to a hex/rgb color). `root` = :root declarations.
function contrastFails(rootDefs) {
  const fails = [];
  const oks = [];
  const unresolved = [];
  for (const [fg, bg] of CONTRAST_PAIRS) {
    if (!(fg in rootDefs) || !(bg in rootDefs)) continue; // role not used here
    const fv = resolveVar(rootDefs[fg], rootDefs);
    const bv = resolveVar(rootDefs[bg], rootDefs);
    const r = contrastRatio(fv, bv);
    if (r === null) {
      unresolved.push({ fg, bg, reason: "value not a parseable sRGB color (oklch/hsl/named?)" });
    } else if (r < 4.5) {
      fails.push({ fg, bg, ratio: r });
    } else {
      oks.push({ fg, bg, ratio: r });
    }
  }
  return { fails, oks, unresolved };
}

// ===================== report ====================================== //
function emitReport({ dir, fileMap, dangling, typoMissing, dark, contrast }) {
  const L = [];
  L.push(`# Token verification report`);
  L.push(``);
  L.push(`- **디렉터리**: \`${dir}\` · **검사기**: ${GENERATOR}`);
  L.push(`- **파일**: ${Object.keys(fileMap).join(", ") || "(없음)"}`);
  L.push(``);
  L.push(`## 1. 단절 \`var()\` 참조 (구조 정합성)`);
  if (!dangling.length) L.push(`- ✅ 없음 — 모든 \`var()\`가 정의된 토큰을 가리킴.`);
  else {
    const uniq = [...new Set(dangling.map((d) => d.name))];
    L.push(`- ❌ **${dangling.length}개** [${uniq.length} unique]: ${uniq.map((t) => `\`${t}\``).join(", ")}`);
    L.push(`  - 렌더 시 \`unset\`. 정의되지 않은 토큰을 참조하거나 raw 스케일이 빠진 것.`);
  }
  L.push(``);
  L.push(`## 2. Typography 의존 토큰`);
  const typoEntries = Object.entries(typoMissing);
  if (!typoEntries.length) L.push(`- ✅ \`--text-*\`·\`--leading-*\`·\`--weight-*\` 모두 present — Typography(Step 4) 사용 가능.`);
  else {
    const detail = typoEntries.map(([g, n]) => `${g}: ${n.map((t) => `\`${t}\``).join(", ")}`).join(" / ");
    L.push(`- ⚠️ 누락: ${detail}. Typography를 안 쓰면 무시해도 됨; 쓰면 \`assets/tokens/raw.css\`에서 보충.`);
  }
  L.push(``);
  L.push(`## 3. dark-pair 완전성`);
  if (!dark.hasDark) L.push(`- ℹ️ \`.dark\` 블록 없음 — 단일 테마(의도적일 수 있음).`);
  else if (!dark.gaps.length) L.push(`- ✅ 모든 \`:root\` 토큰이 \`.dark\`에 짝을 가짐.`);
  else L.push(`- ⚠️ \`.dark\`에 없는 \`:root\` 토큰 ${dark.gaps.length}개: ${dark.gaps.slice(0, 20).map((t) => `\`${t}\``).join(", ")}${dark.gaps.length > 20 ? " …" : ""}`);
  L.push(``);
  L.push(`## 4. WCAG 대비 (foreground/background)`);
  if (!contrast.fails.length && !contrast.unresolved.length && !contrast.oks.length)
    L.push(`- ℹ️ 측정할 역할 쌍이 없음 (shadcn \`--color-*\` 역할 미사용).`);
  else {
    if (contrast.oks.length) L.push(`- ✅ 통과: ${contrast.oks.map((p) => `\`${p.fg}/${p.bg}\` ${p.ratio.toFixed(2)}:1`).join(", ")}`);
    if (contrast.fails.length) L.push(`- ❌ AA 미달(<4.5:1): ${contrast.fails.map((p) => `\`${p.fg}/${p.bg}\` ${p.ratio.toFixed(2)}:1`).join(", ")}`);
    if (contrast.unresolved.length) L.push(`- ℹ️ 미측정(oklch/hsl/명명색 등 비-sRGB): ${contrast.unresolved.map((p) => `\`${p.fg}/${p.bg}\``).join(", ")}`);
  }
  return L.join("\n") + "\n";
}

// ===================== main ======================================== //
function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.input) {
    process.stderr.write(HELP + "\n");
    process.exit(args.help ? 0 : 1);
  }
  const dir = path.resolve(args.input);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    process.stderr.write(`✗ not a directory: ${dir}\n`);
    process.exit(1);
  }
  const fileMap = readTokensDir(dir);
  if (!Object.keys(fileMap).length) {
    process.stderr.write(`✗ no *.css found in ${dir}\n`);
    process.exit(1);
  }

  const dangling = findDanglingRefs(fileMap);
  const typoMissing = findMissingTypographyDeps(fileMap);
  const dark = darkPairGaps(fileMap);
  const rootDefs = declarationsFor(stripComments(Object.values(fileMap).join("\n")), ":root");
  const contrast = contrastFails(rootDefs);

  const out = (s) => process.stdout.write(s + "\n");
  out(`✓ verify-tokens  ${dir}/  (${Object.keys(fileMap).length} file${Object.keys(fileMap).length === 1 ? "" : "s"})`);
  out(`  dangling var() refs: ${dangling.length ? `❌ ${dangling.length} (${[...new Set(dangling.map((d) => d.name))].join(", ")})` : "✅ none"}`);
  const typoEntries = Object.entries(typoMissing);
  out(`  Typography deps: ${typoEntries.length ? `⚠ missing [${typoEntries.map(([g, n]) => `${g} (${n.length})`).join(", ")}]` : "✅ all present"}`);
  out(`  dark-pair gaps: ${!dark.hasDark ? "— (no .dark block)" : dark.gaps.length ? `⚠ ${dark.gaps.length}` : "✅ none"}`);
  out(`  WCAG AA: ${contrast.fails.length ? `❌ ${contrast.fails.length} fail` : contrast.oks.length ? "✅ measured pairs pass" : "— (no resolvable pairs)"}`);

  if (args.report) {
    fs.writeFileSync(
      path.join(dir, "_verify-report.md"),
      emitReport({ dir, fileMap, dangling, typoMissing, dark, contrast })
    );
    out(`  → wrote _verify-report.md`);
  }

  const failures = [];
  if (dangling.length) failures.push(`dangling var() refs (${dangling.length})`);
  if (contrast.fails.length) failures.push(`WCAG AA fails (${contrast.fails.length})`);
  if (args.strict && failures.length) {
    process.stderr.write(`✗ --strict failures:\n  - ${failures.join("\n  - ")}\n`);
    process.exit(1);
  }
}

main();
