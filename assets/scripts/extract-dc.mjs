#!/usr/bin/env node
// ------------------------------------------------------------------ //
// extract-dc.mjs — Claude Design `.dc.html` → 4-layer token CSS.
//
// A DC `.dc.html` carries design tokens in two trusted, machine-readable
// places: the `[data-theme="light|dark"]` CSS-variable blocks (semantic
// colors) and the `renderVals()` JS arrays in `<script data-dc-script>`
// (raw scales — slate ramp, spacing, type, radii, brand colors). Neither
// is directly usable in a Next.js + Tailwind v4 + shadcn project:
// selectors are `[data-theme]` not `:root`/`.dark`, names are editorial
// (`--bg`, `--heading`) not shadcn (`--color-background`), colors are
// hex/rgba not OKLCH, and the raw scales live in JS, not CSS.
//
// This script performs that conversion reproducibly and emits:
//   <out>/raw.css         L1 — DC scales materialized (OKLCH / rem)
//   <out>/semantic.css    L2 — DC semantic vars → shadcn --color-* roles
//   <out>/layout.css      L3 — DC structural dimensions + Shell primitives
//   <out>/component.css   L4 — DC component specs (radius/spacing roles)
//   <out>/_manifest.json  machine-readable provenance + token index
//   <out>/_report.md      human-readable verification
//
// Zero dependencies — Node 20+ builtins only (fs, path, vm, crypto).
//
// Verification performed by this script (see _report.md): OKLCH math
// self-check (hex→OKLCH→hex round-trip), var() ref integrity (every var()
// in the emitted CSS must be defined somewhere in it — catches DC_SPEC
// layout/component refs into absent scales, whether the input is a full
// mockup or just missing one step), dark pair completeness, WCAG contrast on
// foreground/background pairs, raw-scale coverage. What it does NOT do: run
// a real CSS parser, a Next build, or a browser render — see
// references/dc-to-tokens.md → "Verification beyond this script" for the
// recommended gates (lightningcss, next build, Playwright getComputedStyle).
//
// Usage:
//   node extract-dc.mjs <input.dc.html> [--out <dir>] [--no-manifest] [--strict]
//
// Trust assumption: the input is a Claude Design artifact you control.
// `vm` is NOT a hardened security sandbox (per Node docs); it is used
// here only to evaluate the trusted DC logic class for its data, with a
// context that exposes no fs/network/process. Do not run this against
// untrusted `.dc.html`. See references/dc-to-tokens.md → "Trust & vm".
// ------------------------------------------------------------------ //
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createHash } from "node:crypto";

const GENERATOR = "extract-dc.mjs v1";

// unparsable colors (hsl/lab/...) collected for the report; emitted verbatim.
const unparsable = new Set();

// ============================ CLI ================================== //
function parseArgs(argv) {
  const args = argv.slice(2);
  if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
    return { help: true };
  }
  const input = args.find((a) => !a.startsWith("--"));
  const outIdx = args.indexOf("--out");
  const out = outIdx !== -1 ? args[outIdx + 1] : null;
  return {
    input,
    out,
    manifest: !args.includes("--no-manifest"),
    strict: args.includes("--strict"),
  };
}

const HELP = `extract-dc.mjs — DC .dc.html → 4-layer token CSS

  node extract-dc.mjs <input.dc.html> [--out <dir>] [--no-manifest] [--strict]

  --out <dir>     output directory (default: <input-dir>/tokens)
  --no-manifest   skip writing _manifest.json and _report.md
  --strict        exit non-zero if dark pairs incomplete, WCAG fails, or raw
                  scale coverage is empty (for CI)`;

// ===================== color: hex/rgba → OKLCH ===================== //
// sRGB → linear-light → OKLCH (Björn Ottosson's space, the format shadcn's
// Tailwind v4 themes ship in). OKLCH is wider-gamut than sRGB, so a
// hex→OKLCH→hex round-trip is not bit-exact; we round OKLCH to 3dp and
// verify the round-trip lands within ±1/255 per channel in _report.md
// (a math self-check — NOT a browser-render proof; see header note).
function parseHex(hex) {
  let h = String(hex).replace("#", "").trim();
  if (h.length === 3)
    h = h.split("").map((c) => c + c).join("");
  if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return null;
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function normalizeHex(hex) {
  let h = String(hex).replace("#", "").trim().toLowerCase();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return /^[0-9a-f]{6}$/.test(h) ? `#${h}` : null;
}

// Accept "#fff", "#ffffff", "rgb(..)", "rgba(..)". Throws on anything else
// (hsl/lab/...) — callers wrap in toOklch which falls back to verbatim.
function parseColor(str) {
  const s = String(str).trim();
  const m = s.match(/^rgba?\(([^)]+)\)$/i);
  if (m) {
    const p = m[1].split(",").map((x) => x.trim());
    return {
      rgb: [parseFloat(p[0]) / 255, parseFloat(p[1]) / 255, parseFloat(p[2]) / 255],
      a: p[3] !== undefined ? parseFloat(p[3]) : 1,
    };
  }
  const ints = parseHex(s);
  if (!ints) throw new Error(`unparseable color: ${str}`);
  return { rgb: [ints[0] / 255, ints[1] / 255, ints[2] / 255], a: 1 };
}

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const linearToSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

function linearToOklch(r, g, b) {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
  const C = Math.sqrt(a * a + bb * bb);
  // H is meaningless when C ≈ 0 (achromatic); snap to 0 so pure grays/white
  // don't get a spurious ~89.9° from atan2 of ~0,~0 floats.
  const H = C < 1e-4 ? 0 : (() => {
    let h = (Math.atan2(bb, a) * 180) / Math.PI;
    return h < 0 ? h + 360 : h;
  })();
  return { L, C, H };
}

function oklchToLinearSrgb(L, C, H) {
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h);
  const bb = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * bb;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * bb;
  const s_ = L - 0.0894841775 * a - 1.291485548 * bb;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  };
}

// Returns an oklch(...) string. If str is not hex/rgba (hsl/lab/...), falls
// back to emitting str verbatim and records it for the report — never throws.
function toOklch(str) {
  try {
    const { rgb, a } = parseColor(str);
    const lin = rgb.map(srgbToLinear);
    const { L, C, H } = linearToOklch(lin[0], lin[1], lin[2]);
    const f = (x) => Number(x.toFixed(3));
    const fh = (x) => Number(x.toFixed(1));
    return a < 1
      ? `oklch(${f(L)} ${f(C)} ${fh(H)} / ${a})`
      : `oklch(${f(L)} ${f(C)} ${fh(H)})`;
  } catch {
    unparsable.add(String(str));
    return String(str);
  }
}

function oklchRoundtripHex(oklchStr) {
  const m = oklchStr.match(/^oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
  if (!m) return null;
  const { r, g, b } = oklchToLinearSrgb(+m[1], +m[2], +m[3]);
  const to255 = (c) => Math.round(Math.max(0, Math.min(1, linearToSrgb(c))) * 255);
  return [to255(r), to255(g), to255(b)];
}

function roundtripDelta(str) {
  if (!normalizeHex(str) && !/^rgba?\(/i.test(str)) return { delta: NaN, back: null };
  const back = oklchRoundtripHex(toOklch(str));
  if (!back) return { delta: NaN, back: null };
  const { rgb } = parseColor(str);
  const in255 = [rgb[0] * 255, rgb[1] * 255, rgb[2] * 255];
  const delta = Math.max(
    Math.abs(in255[0] - back[0]),
    Math.abs(in255[1] - back[1]),
    Math.abs(in255[2] - back[2])
  );
  return { delta, back };
}

// WCAG relative luminance + contrast ratio (operates on hex/rgba source).
function relLuminance(str) {
  const { rgb } = parseColor(str);
  const lin = rgb.map(srgbToLinear);
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}
function contrastRatio(fgHex, bgHex) {
  let l1, l2;
  try {
    l1 = relLuminance(fgHex);
    l2 = relLuminance(bgHex);
  } catch {
    return NaN;
  }
  const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

// ===================== DC HTML parsing ============================= //
function readSource(file) {
  const src = fs.readFileSync(file, "utf8");
  return { src, sha: createHash("sha256").update(src).digest("hex").slice(0, 16) };
}

function parseThemeBlocks(src) {
  const out = { light: {}, dark: {} };
  // Note: `[^}]*` truncates a block body at the first `}`. CSS color values
  // never contain `}`; the only realistic risk is an inline url("…{…}") data
  // URI in a theme var, which DC token blocks don't carry. Documented limit.
  const re = /\[data-theme\s*=\s*["']?(light|dark)["']?\]\s*\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(src))) {
    for (const decl of m[2].split(";")) {
      const i = decl.indexOf(":");
      if (i < 0) continue;
      const name = decl.slice(0, i).trim();
      const val = decl.slice(i + 1).trim();
      if (name.startsWith("--") && val) out[m[1]][name] = val;
    }
  }
  return out;
}

function extractDcScript(src) {
  const m = src.match(/<script[^>]*data-dc-script[^>]*>([\s\S]*?)<\/script>/i);
  return m ? m[1] : "";
}

function evalRenderVals(scriptSrc) {
  if (!scriptSrc) return { vals: {}, warning: "no <script data-dc-script> found — raw scales empty (semantic.css still generated from CSS blocks)" };
  class DCLogic {
    constructor(props) {
      this.props = props || {};
      this.state = {};
    }
    setState() {}
    set() {}
    forceUpdate() {}
    componentDidMount() {}
    componentDidUpdate() {}
    componentWillUnmount() {}
    renderVals() {
      return {};
    }
  }
  const noop = () => null;
  const sandbox = {
    DCLogic,
    console,
    React: { createElement: noop, Fragment: "_f", isValidElement: () => false },
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  try {
    vm.runInContext(scriptSrc + "\n;globalThis.__DC = Component;", sandbox, { timeout: 2000 });
  } catch (e) {
    return { vals: {}, warning: `DC logic eval failed: ${e.message}` };
  }
  const C = sandbox.__DC;
  if (typeof C !== "function")
    return { vals: {}, warning: "DC script did not define class Component" };
  let inst;
  try {
    inst = new C({});
  } catch (e) {
    return { vals: {}, warning: `DC Component construction threw: ${e.message}` };
  }
  let vals;
  try {
    vals = inst.renderVals();
  } catch (e) {
    return { vals: {}, warning: `renderVals() threw: ${e.message}` };
  }
  if (vals && typeof vals.then === "function")
    return { vals: {}, warning: "renderVals() returned a Promise — async is not supported" };
  return { vals: vals || {} };
}

// ===================== scale extractors =========================== //
function extractSlate(vals) {
  return (Array.isArray(vals.slateRamp) ? vals.slateRamp : []).map((c) => ({
    step: c.step, hex: c.hex, usage: c.usage || "",
  }));
}
function extractSpacing(vals) {
  return (Array.isArray(vals.spacing) ? vals.spacing : []).map((s, i) => ({
    n: i + 1, px: s.px, usage: s.usage || "",
  }));
}
function extractRadii(vals) {
  const keyOf = (name) => {
    const l = String(name).toLowerCase();
    if (l.startsWith("sm")) return "sm";
    if (l.includes("control")) return "control";
    if (l.includes("card")) return "card";
    if (l.includes("surface")) return "surface";
    if (l.includes("pill")) return "pill";
    return null;
  };
  return (Array.isArray(vals.radii) ? vals.radii : [])
    .map((r) => ({ key: keyOf(r.name), name: r.name, px: r.px, usage: r.usage || "" }))
    .filter((r) => r.key);
}
function extractType(vals) {
  const keyOf = (label) => {
    const l = String(label).toLowerCase();
    if (l.includes("display") || l.includes("hero")) return "display";
    if (l.startsWith("h1")) return "h1";
    if (l.startsWith("h2")) return "h2";
    if (l.startsWith("h3")) return "h3";
    if (l.includes("lead")) return "lead";
    if (l.includes("body")) return "body";
    if (l.includes("small")) return "small";
    if (l.includes("caption")) return "caption";
    if (l.includes("mono")) return "mono";
    return null;
  };
  return (Array.isArray(vals.typeScale) ? vals.typeScale : [])
    .map((t) => ({ key: keyOf(t.label), label: t.label, rem: t.rem, weight: t.weight }))
    .filter((t) => t.key);
}

// ===================== unit helpers =============================== //
function pxToRem(px) {
  const n = parseFloat(px);
  // parseFloat(undefined/garbage) → NaN; without this a malformed DC value
  // would silently emit "NaNrem". Fall back to the original token so the gap
  // is visible in the output rather than hidden behind a bogus value.
  if (!Number.isFinite(n)) return String(px);
  return `${(n / 16).toFixed(5).replace(/\.?0+$/, "")}rem`;
}
function radiusVal(px) {
  if (px === "999px") return "9999px"; // pill → Tailwind radius-full convention
  return pxToRem(px);
}

// ===================== CSS block formatter ======================== //
// `  --name:   value;` with the value column aligned across the block.
function declBlock(header, entries) {
  const widest = Math.max(1, ...entries.map((e) => e.name.length));
  const lines = entries.map((e) => {
    const pad = " ".repeat(widest - e.name.length + 1);
    const c = e.comment ? `; /* ${e.comment} */` : ";";
    return `  ${e.name}:${pad}${e.value}${c}`;
  });
  return `${header} {\n${lines.join("\n")}\n}\n`;
}

const fileHeader = (title, sourceName, sha) =>
  `/* ---- ${title} ------------------------------------------------------ *
 * GENERATED from ${sourceName} (sha256:${sha}) by ${GENERATOR}.
 * Do not edit by hand — re-run the extractor. Edits belong in the DC
 * source, then regenerate. See references/dc-to-tokens.md.
 * ------------------------------------------------------------------ */\n`;

// ===================== semantic mapping =========================== //
// DC semantic var → shadcn --color-* role. kind:
//   "color"  resolve via raw token where DC value coincides, else OKLCH literal
//   "soft"   rgba tint → brand-soft token (light) / OKLCH literal (dark)
//   "shadow" box-shadow value, emitted verbatim (not a color)
const SEMANTIC_ROLES = [
  { out: "--color-background", dc: "--bg", kind: "color" },
  { out: "--color-foreground", dc: "--text", kind: "color" },
  { out: "--color-card", dc: "--surface", kind: "color" },
  { out: "--color-card-foreground", dc: "--strong", kind: "color" },
  { out: "--color-popover", dc: "--surface", kind: "color" },
  { out: "--color-popover-foreground", dc: "--strong", kind: "color" },
  { out: "--color-border", dc: "--border", kind: "color" },
  { out: "--color-input", dc: "--border", kind: "color" },
  { out: "--color-ring", dc: "--primary", kind: "color" },
  { out: "--color-muted", dc: "--surface2", kind: "color" },
  { out: "--color-muted-foreground", dc: "--muted", kind: "color", note: "DC muted text — VERIFY CONTRAST (report §2)" },
  { out: "--color-primary", dc: "--primary", kind: "color" },
  { out: "--color-primary-hover", dc: "--secondary", kind: "color", note: "DC --secondary is primary's hover (darker indigo)" },
  { out: "--color-primary-foreground", dc: "--onprimary", kind: "color" },
  { out: "--color-secondary", dc: "--surface2", kind: "color", note: "shadcn secondary bg ≠ DC secondary" },
  { out: "--color-secondary-foreground", dc: "--strong", kind: "color" },
  { out: "--color-accent", dc: "--surface2", kind: "color", note: "shadcn accent bg (hover) ≠ DC teal accent" },
  { out: "--color-accent-foreground", dc: "--strong", kind: "color" },
  { out: "--color-heading", dc: "--heading", kind: "color", note: "preserved DC role" },
  { out: "--color-strong", dc: "--strong", kind: "color", note: "preserved DC role" },
  { out: "--color-highlight", dc: "--accent", kind: "color", note: "DC teal accent (badges); shadcn accent bg is separate" },
  { out: "--color-primary-soft", dc: "--primarySoft", kind: "soft", note: "preserved DC role" },
  { out: "--color-accent-soft", dc: "--accentSoft", kind: "soft", note: "preserved DC role" },
  { out: "--shadow-card", dc: "--shadow", kind: "shadow", note: "box-shadow, not a color (structural literal in L2)" },
];

// Roles intentionally NOT emitted (DC has no source for them). The report
// flags these so the project knows to supply them.
const OMITTED_ROLES = [
  { out: "--color-danger", reason: "DC defines no error color — add a --red-* raw scale + this role" },
  { out: "--color-danger-foreground", reason: "pairs with --color-danger (DC has no error color)" },
];

// DC name → raw brand-soft token, light + dark.
const SOFT_NAME_OF = {
  "--primarySoft": { light: "--brand-primary-soft", dark: "--brand-primary-soft-dark" },
  "--accentSoft": { light: "--brand-accent-soft", dark: "--brand-accent-soft-dark" },
};
const BRAND_TOKEN_OF = {
  "--primary": "--brand-primary",
  "--secondary": "--brand-secondary",
  "--accent": "--brand-accent",
};

// DC layout & component specs DC states in prose but does NOT expose via
// renderVals arrays. Documented constant with DC-section citation per value.
// layout: Shell primitive tokens are appended (not DC-sourced) so DC output
// is a drop-in for the skill's Shell — see references/dc-to-tokens.md.
const DC_SPEC = {
  layout: [
    ["--container-max", "70rem", "DC §12: column max-width 70rem (1120px)"],
    ["--container-prose", "46rem", "DC §4/§12: prose measure"],
    ["--form-width", "40rem", "DC §12: form 640px"],
    ["--header-height", "4rem", "DC Design Tokens top bar height:4rem (64px)"],
    ["--section-pad-y", "var(--space-7)", "DC §6 spacing step 7 (44px)"],
    ["--section-pad-y-mobile", "1.75rem", "DC §6: mobile 28px (between scale steps)"],
    ["--section-pad-x", "var(--space-5)", "DC §6 spacing step 5 (24px)"],
    ["--gutter", "1rem", "DC §12: gutter"],
    ["--column-gap", "var(--space-6)", "DC §6 spacing step 6 (34px)"],
    ["--footer-height", "var(--space-7)", "Shell primitive — DC has no footer spec"],
    ["--sidebar-width", "16rem", "Shell primitive — DC defines no sidebar"],
    ["--sidebar-width-collapsed", "4rem", "Shell primitive"],
    ["--grid-3col-ratio", "1fr 3fr 1fr", "Shell primitive — 3-col track ratio"],
    ["--layout-gap", "var(--space-5)", "Shell primitive — consumed by Shell mainGrid"],
    ["--container-padding-x", "var(--space-5)", "Shell primitive — consumed by Shell mainGrid"],
  ],
  component: [
    ["--button-radius", "var(--radius-control)", "DC §5/§8: all controls 10px"],
    ["--button-min-height", "var(--space-7)", "DC §8/§14: 44px touch target"],
    ["--button-padding-x", "1.375rem", "DC §8: 22px (between space-4 18 / space-5 24)"],
    ["--button-font-weight", "700", "DC §8: primary 700"],
    ["--card-radius", "var(--radius-card)", "DC §5/§11: cards 12px"],
    ["--card-padding", "var(--space-4)", "DC §11: 18px = space-4"],
    ["--card-border-width", "1px", "DC §11: 1px border"],
    ["--badge-radius", "var(--radius-pill)", "DC §5/§10: badges/chips pill"],
    ["--input-radius", "var(--radius-control)", "DC §5/§8: controls 10px"],
    ["--input-min-height", "var(--space-7)", "DC §14: 44px touch target"],
    ["--focus-ring-width", "2px", "DC §14: outline 2px"],
    ["--focus-ring-offset", "2px", "DC §14: offset 2px"],
    ["--touch-target", "var(--space-7)", "DC §14: min 44×44"],
  ],
};

// ===================== resolver =================================== //
// Maps a DC value → var() reference when it lands exactly on a raw token
// (slate ramp / brand / white / black), else a literal OKLCH. Keeps the
// var()-indirection wherever DC's own values coincide with the raw scale.
function makeResolver({ slate, brandLight, brandDark }) {
  const slateByHex = {};
  for (const c of slate) {
    const n = normalizeHex(c.hex);
    if (n) slateByHex[n] = c.step;
  }
  const brandByHex = {};
  for (const [tok, v] of Object.entries(brandLight)) {
    const n = normalizeHex(v.hex);
    if (n) brandByHex[n] = tok;
  }
  for (const [tok, v] of Object.entries(brandDark)) {
    const n = normalizeHex(v.hex);
    if (n) brandByHex[n] = tok;
  }
  return function resolve(val) {
    const n = normalizeHex(val);
    if (n === "#ffffff") return { ref: "var(--white)", literal: false };
    if (n === "#000000") return { ref: "var(--black)", literal: false };
    if (n && slateByHex[n]) return { ref: `var(--slate-${slateByHex[n]})`, literal: false };
    if (n && brandByHex[n]) return { ref: `var(${brandByHex[n]})`, literal: false };
    return { ref: toOklch(val), literal: true };
  };
}

// Resolve one semantic role's value for one mode.
function resolveRole(role, val, mode, resolver, rawSoft, literals) {
  if (role.kind === "shadow") {
    // box-shadow is a structural value, not a color — emitted verbatim in
    // EITHER mode. Track both; the old `mode === "dark"` guard dropped the
    // light-mode shadow row from §6.
    literals.push({ role: role.out, mode, reason: "box-shadow (not a color)" });
    return val;
  }
  if (role.kind === "soft") {
    const names = SOFT_NAME_OF[role.dc];
    if (names) {
      if (mode === "light" && rawSoft[names.light]) return `var(${names.light})`;
      if (mode === "dark" && rawSoft[names.dark]) return `var(${names.dark})`;
    }
    literals.push({ role: role.out, mode, reason: "soft tint not in raw" });
    return toOklch(val);
  }
  // "color" kind: resolver returns literal:true when the hex doesn't coincide
  // with a materialized raw token (slate/brand/white/black). That happens in
  // EITHER mode — dark neutrals off the slate ramp when the ramp is present,
  // OR any role when the ramp is empty (mockup DC files whose renderVals()
  // returns UI data). Track both modes; the old `mode === "dark"` guard
  // silently dropped light-mode literals, so §6 under-reported whenever slate
  // coverage was empty.
  const { ref, literal } = resolver(val);
  if (literal) literals.push({ role: role.out, mode, reason: "off materialized raw scale (slate/brand/white/black)" });
  return ref;
}

// ===================== emitters =================================== //
function emitRaw({ slate, spacing, radii, type, brandLight, softLight }) {
  const entries = [];
  for (const c of slate) entries.push({ name: `--slate-${c.step}`, value: toOklch(c.hex), comment: c.usage || undefined });
  for (const [k, v] of Object.entries(brandLight)) entries.push({ name: k, value: toOklch(v.hex), comment: v.role || undefined });
  for (const [k, v] of Object.entries(softLight)) if (v) entries.push({ name: k, value: toOklch(v) });
  entries.push({ name: "--white", value: "oklch(1 0 0)" });
  entries.push({ name: "--black", value: "oklch(0 0 0)" });
  for (const s of spacing) entries.push({ name: `--space-${s.n}`, value: pxToRem(s.px), comment: `${s.px}${s.usage ? ` · ${s.usage}` : ""}` });
  for (const r of radii) entries.push({ name: `--radius-${r.key}`, value: radiusVal(r.px), comment: r.usage || undefined });
  if (type.length) {
    const byKey = Object.fromEntries(type.map((t) => [t.key, t]));
    for (const t of type) entries.push({ name: `--text-${t.key}`, value: t.rem, comment: `${t.label} · w${t.weight}` });
    // Tailwind-standard aliases so the skill's own assets (Typography uses
    // text-xl/text-2xl; globals.css exposes --text-xl/2xl) keep resolving.
    // Defining ANY --text-* replaces Tailwind's default scale (gotcha #9);
    // alias the nearest DC step rather than leave them undefined. xl/2xl are
    // approximate (DC has no 1.25/1.5rem step).
    const alias = (name, key, why) =>
      byKey[key] ? entries.push({ name: `--text-${name}`, value: byKey[key].rem, comment: `alias of --text-${key} (${why})` }) : null;
    alias("xs", "caption", "Tailwind text-xs");
    alias("sm", "small", "Tailwind text-sm");
    alias("base", "body", "Tailwind text-base");
    alias("lg", "lead", "Tailwind text-lg");
    alias("xl", "lead", "Tailwind text-xl — DC has no 1.25rem, nearest lead");
    alias("2xl", "h2", "Tailwind text-2xl — DC has no 1.5rem, nearest h2");
  }
  return declBlock(":root", entries);
}

function emitSemantic({ themes, resolver, rawSoft, report }) {
  const rootEntries = [];
  const darkEntries = [];
  const darkMissing = [];
  const literals = [];
  for (const role of SEMANTIC_ROLES) {
    const lv = themes.light[role.dc];
    const dv = themes.dark[role.dc];
    if (lv === undefined) continue;
    if (dv === undefined) darkMissing.push(role.dc);
    rootEntries.push({ name: role.out, value: resolveRole(role, lv, "light", resolver, rawSoft, literals), comment: role.note });
    if (dv !== undefined) darkEntries.push({ name: role.out, value: resolveRole(role, dv, "dark", resolver, rawSoft, literals), comment: role.note });
  }
  report.darkMissing = darkMissing;
  report.literals = literals;
  const aliases = [
    "--primary", "--background", "--foreground", "--border", "--input", "--ring",
    "--card", "--popover", "--muted", "--muted-foreground", "--secondary", "--accent",
  ].map((n) => ({ name: n, value: `var(--color-${n.slice(2)})` }));
  return (
    `/* DC → shadcn roles. ${SEMANTIC_ROLES.length} roles mapped; OMITTED (DC has no source): ` +
    OMITTED_ROLES.map((o) => o.out).join(", ") + " — see _report.md §4. */\n" +
    declBlock(":root", rootEntries) +
    "\n" +
    declBlock(".dark", darkEntries) +
    "\n/* unprefixed aliases — base-ui/shadcn internals read var(--primary) etc. directly */\n" +
    declBlock(":root,\n.dark", aliases)
  );
}

function emitLayout() {
  return declBlock(":root", DC_SPEC.layout.map(([n, v, why]) => ({ name: n, value: v, comment: why })));
}
function emitComponent() {
  return declBlock(":root", DC_SPEC.component.map(([n, v, why]) => ({ name: n, value: v, comment: why })));
}

// ===================== dangling-ref check ========================= //
// Self-consistency check on the converter's OWN output: every var(--token)
// referenced across the four emitted files must be defined in one of them.
// The footgun is DC_SPEC — it emits var(--space-N)/var(--radius-*) refs that
// only resolve if the input DC actually exposed those scales. A mockup DC
// (renderVals returns UI data, not scales) OR a partial token set leaves
// those refs pointing at undefined tokens, which render as 'unset'. The old
// §1 warning only fired when ALL scales were empty; this catches the partial
// case too (e.g. spacing present but missing the exact step DC_SPEC needs).
// Scope is deliberately the converter's own files — it can't know which
// tokens the consuming project fills in separately, so it only flags refs
// that nothing in the emitted output defines.
function findDanglingRefs(fileMap) {
  const strip = (body) => body.replace(/\/\*[\s\S]*?\*\//g, "");
  const defined = new Set();
  for (const body of Object.values(fileMap)) {
    for (const m of strip(body).matchAll(/(--[a-z0-9-]+)\s*:/g)) defined.add(m[1]);
  }
  const dangling = [];
  const seen = new Set();
  for (const [file, body] of Object.entries(fileMap)) {
    for (const m of strip(body).matchAll(/var\(\s*(--[a-z0-9-]+)/g)) {
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

// ===================== manifest + report ========================== //
function emitManifest({ sourceName, sha, themes, slate, spacing, radii, type, brandLight, report }) {
  const tokens = [];
  const push = (name, value, layer, category, mode, role, darkValue) =>
    tokens.push({ name, value, layer, category, mode, role: role || undefined, dark_value: darkValue });
  for (const c of slate) push(`--slate-${c.step}`, toOklch(c.hex), "L1", "color", "light", c.usage);
  for (const [k, v] of Object.entries(brandLight)) push(k, toOklch(v.hex), "L1", "color", "light", v.role);
  for (const s of spacing) push(`--space-${s.n}`, pxToRem(s.px), "L1", "spacing", "light", s.usage);
  for (const r of radii) push(`--radius-${r.key}`, radiusVal(r.px), "L1", "radius", "light", r.usage);
  for (const t of type) push(`--text-${t.key}`, t.rem, "L1", "font-size", "light", t.label);
  for (const role of SEMANTIC_ROLES) {
    const lv = themes.light[role.dc];
    const dv = themes.dark[role.dc];
    if (lv === undefined) continue;
    // only colors round-trip through OKLCH; soft/shadow are structural values
    const store = (v) => (role.kind === "color" ? toOklch(v) : v);
    push(role.out, store(lv), "L2", role.kind === "shadow" ? "shadow" : "color", "light", role.note, dv !== undefined ? store(dv) : undefined);
  }
  return {
    source_file: sourceName,
    source_sha: sha,
    extracted_at: new Date().toISOString(),
    generator: GENERATOR,
    rounding: "oklch 3dp (L,C) / 1dp (H); H=0 when C<1e-4",
    warning: report.warning || undefined,
    omitted_roles: OMITTED_ROLES,
    dark_pairs_complete: report.darkMissing.length === 0,
    dark_missing: report.darkMissing,
    dangling_refs: [...new Set((report.dangling || []).map((d) => d.name))],
    counts: {
      slate: slate.length, brand: Object.keys(brandLight).length, spacing: spacing.length,
      radii: radii.length, type: type.length, semantic_roles: SEMANTIC_ROLES.length,
    },
    tokens,
  };
}

// Foreground/background role pairs whose contrast the report checks.
const CONTRAST_PAIRS = [
  ["--color-foreground", "--color-background"],
  ["--color-muted-foreground", "--color-background"],
  ["--color-card-foreground", "--color-card"],
  ["--color-popover-foreground", "--color-popover"],
  ["--color-primary-foreground", "--color-primary"],
  ["--color-secondary-foreground", "--color-secondary"],
  ["--color-accent-foreground", "--color-accent"],
];

function emitReport({ sourceName, sha, themes, slate, spacing, radii, type, brandLight, report }) {
  const roleToDc = Object.fromEntries(SEMANTIC_ROLES.map((r) => [r.out, r.dc]));
  const hexOf = (roleOut, mode) => {
    const dc = roleToDc[roleOut];
    return dc ? themes[mode][dc] : undefined;
  };
  const L = [];
  L.push(`# DC → Tokens 변환 검증 리포트`);
  L.push(``);
  L.push(`- **소스**: \`${sourceName}\` (sha256 \`${sha}\`)`);
  L.push(`- **생성자**: ${GENERATOR} · **생성일**: ${new Date().toISOString()}`);
  if (report.warning) L.push(`- ⚠️ **경고**: ${report.warning}`);
  L.push(``);
  L.push(`## 1. 요약`);
  L.push(``);
  L.push(`| 계층 | 항목 수 |`);
  L.push(`|---|---|`);
  L.push(`| L1 raw — slate / brand / spacing / radii / type | ${slate.length} / ${Object.keys(brandLight).length} / ${spacing.length} / ${radii.length} / ${type.length} |`);
  L.push(`| L2 semantic roles (emit) / omitted | ${SEMANTIC_ROLES.length} / ${OMITTED_ROLES.length} |`);
  const darkOk = report.darkMissing.length === 0;
  L.push(``);
  L.push(`- **dark 쌍 완전성**: ${darkOk ? "✅" : "❌ 누락 " + report.darkMissing.join(", ")}`);
  L.push(`- ℹ️ **구조/컴포넌트 값(DC_SPEC)은 \`Design Tokens.dc.html\` 기준 상수** — header-height·button radius·focus ring 등을 이 파일에서 발췌해 모든 입력에 적용. 입력 DC가 다르면 값이 다를 수 있으니 layout.css/component.css를 재확인할 것.`);
  const lowCoverage = slate.length === 0 && spacing.length === 0 && radii.length === 0 && type.length === 0;
  if (lowCoverage) L.push(`- ⚠️ **raw 스케일 비어 있음** — renderVals에서 slate/spacing/radii/type를 얻지 못함. semantic.css는 정상이나 raw 계층이 빈 상태로 설치될 수 있음.`);
  const dangling = report.dangling || [];
  if (dangling.length) {
    const danglingTokens = [...new Set(dangling.map((d) => d.name))];
    L.push(`- ⚠️ **${danglingTokens.length}개 단절 \`var()\` 참조** — layout.css/component.css가 raw.css에 정의되지 않은 토큰을 참조해 렌더 시 \`unset\`으로 처리됨: ${danglingTokens.map((t) => `\`${t}\``).join(", ")}. 해결: 기본 \`assets/tokens/raw.css\`에서 누락 스케일(\`--space-*\`·\`--radius-*\`·\`--text-*\`)을 보충하거나, DC 소스에 scale 배열을 추가 후 재변환.`);
  }
  if (unparsable.size) L.push(`- ⚠️ **변환 불가 색** (원문 그대로 방출): ${[...unparsable].map((s) => `\`${s}\``).join(", ")}`);
  L.push(``);

  // 2. WCAG contrast (runs before color-fidelity because it's the higher-risk gate)
  L.push(`## 2. WCAG 대비 (foreground/background 쌍)`);
  L.push(``);
  L.push(`AA 기준: 본문 4.5:1, 큰 텍스트(18pt+/14pt bold) 3.0:1. DC 원본 값으로 계산.`);
  L.push(``);
  L.push(`| 쌍 | 모드 | 비율 | AA 본문 | AA 큰텍스트 |`);
  L.push(`|---|---|---|---|---|`);
  const wcagFails = [];
  for (const [fg, bg] of CONTRAST_PAIRS) {
    for (const mode of ["light", "dark"]) {
      const fgh = hexOf(fg, mode);
      const bgh = hexOf(bg, mode);
      if (!fgh || !bgh) continue;
      const r = contrastRatio(fgh, bgh);
      if (Number.isNaN(r)) continue;
      const aaNormal = r >= 4.5;
      const aaLarge = r >= 3.0;
      if (!aaNormal) wcagFails.push(`${fg}/${bg} (${mode}) = ${r.toFixed(2)}:1`);
      const mark = aaNormal ? "✅" : aaLarge ? "🟡" : "❌";
      L.push(`| \`${fg}/${bg}\` | ${mode} | ${r.toFixed(2)}:1 | ${aaNormal ? "✅" : "❌"} | ${aaLarge ? "✅" : "❌"} ${mark} |`);
    }
  }
  L.push(``);
  if (wcagFails.length) {
    L.push(`> ⚠️ **WCAG 실패**: ${wcagFails.join("; ")}. 특히 \`--color-muted-foreground\`는 shadcn이 폼 설명·메뉴 부제·작은 도움말에 쓰는 슬롯. DC 원본 색이 본문 대비 기준에 못 미침 — DC 값을 그대로 둘지, 더 진한 slate(예: slate-500)로 재매핑할지 결정. references/dc-to-tokens.md §"접근성" 참조.`);
  } else {
    L.push(`> ✅ 모든 측정 쌍이 AA 본문 기준 통과.`);
  }
  L.push(``);

  // 3. color fidelity (math self-check)
  L.push(`## 3. 컬러 변환 수학 자기검증 (hex → OKLCH → hex 왕복)`);
  L.push(``);
  L.push(`**이것은 변환 수학의 자기검증일 뿐, 브라우저 렌더 증명이 아님.** 같은 \`toOklch\`·역변환으로 돌아와 채널당 Δ(0–255)를 잰다. Δ≤1이면 수학에 부호/계수 오류가 없음을 확인. 브라우저가 OKLCH를 원본 hex와 동일하게 렌더하는지는 Playwright getComputedStyle readback으로 별도 검증해야 함(아래 §7).`);
  L.push(``);
  L.push(`| 항목 | 원본 | OKLCH | 왕복 | Δ |`);
  L.push(`|---|---|---|---|---|`);
  const colorSources = [
    ...slate.map((c) => [`--slate-${c.step}`, c.hex]),
    ...Object.entries(brandLight).map(([k, v]) => [k, v.hex]),
  ];
  for (const [dc, val] of Object.entries(themes.light)) if (normalizeHex(val)) colorSources.push([dc, val]);
  const seen = new Set();
  let worst = 0;
  for (const [name, hex] of colorSources) {
    const key = `${name}:${hex}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const { delta, back } = roundtripDelta(hex);
    if (Number.isNaN(delta)) continue;
    worst = Math.max(worst, delta);
    const backHex = back ? `#${back.map((c) => c.toString(16).padStart(2, "0")).join("")}` : "—";
    L.push(`| \`${name}\` | \`${hex}\` | \`${toOklch(hex)}\` | \`${backHex}\` | ${delta.toFixed(1)} |`);
  }
  L.push(``);
  L.push(`> 최대 Δ: **${worst.toFixed(1)}** (≤1 = 수학 정상)`);
  L.push(``);

  // 4. omitted + mapping
  L.push(`## 4. 의도적 누락 역할 (DC에 소스 없음)`);
  L.push(``);
  L.push(`| 역할 | 사유 |`);
  L.push(`|---|---|`);
  for (const o of OMITTED_ROLES) L.push(`| \`${o.out}\` | ${o.reason} |`);
  L.push(``);
  L.push(`## 5. 시맨틱 매핑 (DC → shadcn)`);
  L.push(``);
  L.push(`| DC 변수 | → 산출 토큰 | light | dark | 비고 |`);
  L.push(`|---|---|---|---|---|`);
  for (const role of SEMANTIC_ROLES)
    L.push(`| \`${role.dc}\` | \`${role.out}\` | \`${themes.light[role.dc] ?? "—"}\` | \`${themes.dark[role.dc] ?? "—"}\` | ${role.note || ""} |`);
  L.push(``);

  // 6. literals
  L.push(`## 6. 리터럴 처리 (raw 스케일에 없어 OKLCH/원문 리터럴로 둔 값)`);
  L.push(``);
  if (report.literals.length === 0) L.push(`(없음)`);
  else {
    L.push(`| 토큰 | 모드 | 사유 |`);
    L.push(`|---|---|---|`);
    for (const l of report.literals) L.push(`| \`${l.role}\` | ${l.mode} | ${l.reason} |`);
  }
  L.push(``);
  L.push(`semantic.css는 \`src/styles/tokens/\`에 있어 grep guard(\`src/components\`만 스캔) 대상 밖 — 리터럴 허용.`);

  // 7. raw coverage
  L.push(``);
  L.push(`## 7. raw 스케일 구체화`);
  L.push(``);
  L.push(`### spacing · radii · type — _report.md 상단 요약 + _manifest.json counts 참조`);
  L.push(``);
  L.push(`### slate ramp`);
  L.push(`| 토큰 | hex | OKLCH | 용도 |`);
  L.push(`|---|---|---|---|`);
  for (const c of slate) L.push(`| \`--slate-${c.step}\` | ${c.hex} | ${toOklch(c.hex)} | ${c.usage} |`);

  // 8. next steps + verification beyond this script
  L.push(``);
  L.push(`## 8. 다음 단계 + 추가 검증(이 스크립트 밖)`);
  L.push(``);
  L.push(`1. 4개 CSS를 \`src/styles/tokens/\`에 두고 \`globals.css\`에서 import.`);
  L.push(`2. 누락 역할 추가: \`--red-*\` raw 스케일 + \`--color-danger/-danger-foreground\` (DC에 에러 색 없음).`);
  L.push(`3. WCAG 실패가 있으면 \`--color-muted-foreground\`를 더 진한 slate로 재매핑 검토(§2).`);
  L.push(`4. 보존 DC 역할을 Tailwind 유틸리티로 쓰려면 \`globals.css\` \`@theme inline\`에 노출 — references/dc-to-tokens.md 참조.`);
  L.push(`5. **이 스크립트가 잡지 못하는 것**(정적 생성만 수행):`);
  L.push(`   - **CSS 파서 검증**: \`lightningcss\`/\`postcss\`로 4파일 파싱 (잘못된 선언·@import 순서).`);
  L.push(`   - **빌드/렌더**: DC 출력 + Shell/Typography를 단 fixture Next 앱에 넣고 \`next build\` + Playwright \`getComputedStyle\` readback(light/dark) — \`.dark\` 전환·\`@theme inline\` 해석·토큰 누락을 런타임에서 확인.`);
  L.push(`   - **Shell 토큰 커버리지**: 본 출력의 layout.css가 Shell/grid.css가 읽는 토큰을 모두 정의하는지(이 스크립트는 Shell primitive를 함께 내보내도록 조치함).`);
  return L.join("\n");
}

// ===================== main ======================================= //
function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.input) {
    process.stderr.write(HELP + "\n");
    process.exit(args.help ? 0 : 1);
  }
  const inputFile = path.resolve(args.input);
  if (!fs.existsSync(inputFile)) {
    process.stderr.write(`✗ input not found: ${inputFile}\n`);
    process.exit(1);
  }
  const outDir = path.resolve(args.out || path.join(path.dirname(inputFile), "tokens"));
  fs.mkdirSync(outDir, { recursive: true });

  const { src, sha } = readSource(inputFile);
  const sourceName = path.basename(inputFile);
  const themes = parseThemeBlocks(src);
  const { vals, warning } = evalRenderVals(extractDcScript(src));

  const slate = extractSlate(vals);
  const spacing = extractSpacing(vals);
  const radii = extractRadii(vals);
  const type = extractType(vals);

  // brand primitives (light from brandColors; dark from theme block)
  const brandLight = {};
  const brandDark = {};
  for (const b of Array.isArray(vals.brandColors) ? vals.brandColors : []) {
    const tok = BRAND_TOKEN_OF[b.token];
    if (tok) brandLight[tok] = { hex: b.hex, role: b.role };
  }
  for (const [dc, tok] of Object.entries(BRAND_TOKEN_OF))
    if (!brandLight[tok] && themes.light[dc]) brandLight[tok] = { hex: themes.light[dc], role: `${dc} (theme block)` };
  for (const [dc, tok] of Object.entries(BRAND_TOKEN_OF))
    if (themes.dark[dc]) brandDark[`${tok}-dark`] = { hex: themes.dark[dc], role: `${dc} dark` };

  // softs (omit absent ones — don't call toOklch on undefined)
  const softLight = {};
  if (themes.light["--primarySoft"]) softLight["--brand-primary-soft"] = themes.light["--primarySoft"];
  if (themes.light["--accentSoft"]) softLight["--brand-accent-soft"] = themes.light["--accentSoft"];
  const softDark = {};
  if (themes.dark["--primarySoft"]) softDark["--brand-primary-soft-dark"] = themes.dark["--primarySoft"];
  if (themes.dark["--accentSoft"]) softDark["--brand-accent-soft-dark"] = themes.dark["--accentSoft"];

  // raw holds light primitives + named dark variants (so .dark can var() them)
  const rawBrandLight = { ...brandLight, ...brandDark };
  const rawSoft = { ...softLight, ...softDark };

  const resolver = makeResolver({ slate, brandLight: rawBrandLight, brandDark });
  const report = { warning };
  const rawCss = emitRaw({ slate, spacing, radii, type, brandLight: rawBrandLight, softLight: rawSoft });
  const semanticCss = emitSemantic({ themes, resolver, rawSoft, report });
  const layoutCss = emitLayout();
  const componentCss = emitComponent();

  const files = { "raw.css": rawCss, "semantic.css": semanticCss, "layout.css": layoutCss, "component.css": componentCss };
  // Self-consistency: flag var() refs in the emitted CSS that no emitted file
  // defines (mostly DC_SPEC refs into absent scales). Surfaced in §1, stdout,
  // the manifest, and --strict — see findDanglingRefs.
  const dangling = findDanglingRefs(files);
  report.dangling = dangling;
  for (const [name, body] of Object.entries(files)) {
    fs.writeFileSync(path.join(outDir, name), fileHeader(`${name} —`, sourceName, sha) + "\n" + body + "\n");
  }

  let strictFailures = [];
  if (args.manifest) {
    const manifest = emitManifest({ sourceName, sha, themes, slate, spacing, radii, type, brandLight: rawBrandLight, report });
    fs.writeFileSync(path.join(outDir, "_manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
    fs.writeFileSync(path.join(outDir, "_report.md"), emitReport({ sourceName, sha, themes, slate, spacing, radii, type, brandLight: rawBrandLight, report }) + "\n");
  }

  // console summary
  const out = (s) => process.stdout.write(s + "\n");
  out(`✓ DC → tokens  ${sourceName} → ${outDir}/`);
  out(`  raw: ${slate.length} slate, ${Object.keys(rawBrandLight).length} brand, ${spacing.length} spacing, ${radii.length} radii, ${type.length} type`);
  out(`  semantic: ${SEMANTIC_ROLES.length} roles (${OMITTED_ROLES.length} omitted), dark pairs ${report.darkMissing.length === 0 ? "complete ✅" : "MISSING ❌ " + report.darkMissing}`);
  if (report.warning) out(`  ⚠ ${report.warning}`);
  if (unparsable.size) out(`  ⚠ unparsable colors emitted verbatim: ${[...unparsable].join(", ")}`);
  if (dangling.length) {
    const uniq = [...new Set(dangling.map((d) => d.name))];
    out(`  ⚠ SCAFFOLD: ${dangling.length} dangling var() ref(s) [${uniq.length} unique] — layout/component reference tokens not defined in raw.css: ${uniq.join(", ")}`);
    out(`    these render as 'unset' — fill the missing raw scales before Step 6`);
  }

  if (args.strict) {
    if (report.darkMissing.length) strictFailures.push("dark pairs incomplete");
    if (slate.length === 0 && spacing.length === 0 && radii.length === 0 && type.length === 0)
      strictFailures.push("raw scale coverage empty");
    if (dangling.length) {
      const uniq = [...new Set(dangling.map((d) => d.name))];
      strictFailures.push(`dangling var() refs: ${uniq.join(", ")}`);
    }
    // WCAG fail check
    const roleToDc = Object.fromEntries(SEMANTIC_ROLES.map((r) => [r.out, r.dc]));
    for (const [fg, bg] of CONTRAST_PAIRS) {
      for (const mode of ["light", "dark"]) {
        const fgh = roleToDc[fg] ? themes[mode][roleToDc[fg]] : undefined;
        const bgh = roleToDc[bg] ? themes[mode][roleToDc[bg]] : undefined;
        if (!fgh || !bgh) continue;
        const r = contrastRatio(fgh, bgh);
        if (!Number.isNaN(r) && r < 4.5) strictFailures.push(`WCAG AA fail ${fg}/${bg} (${mode}) ${r.toFixed(2)}:1`);
      }
    }
    if (strictFailures.length) {
      process.stderr.write(`✗ --strict failures:\n  - ${strictFailures.join("\n  - ")}\n`);
      process.exit(1);
    }
  }
}

main();
