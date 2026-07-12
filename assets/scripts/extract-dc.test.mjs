// extract-dc.test.mjs — contract test for the DC → tokens converter.
//
// Zero-dep (Node 20+ builtins only): node:test, node:assert, node:fs,
// node:child_process. Runs the converter as a subprocess against the committed
// `__fixtures__/mini.dc.html` and asserts the contract — which tokens are
// emitted, in what shape — rather than exact OKLCH bytes (the runtime math
// self-check already proves fidelity; this locks the *mapping* contract).
//
//   node --test assets/scripts/extract-dc.test.mjs
//
// If the contract changes (a new role, scale, or emitted token), update both
// this file and the fixture.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const CONVERTER = path.join(SCRIPT_DIR, "extract-dc.mjs");
const FIXTURE = path.join(SCRIPT_DIR, "__fixtures__", "mini.dc.html");

function runConverter(outDir, extra = []) {
  return spawnSync(process.execPath, [CONVERTER, FIXTURE, "--out", outDir, ...extra], {
    encoding: "utf8",
  });
}

// Runs the converter once into a clean temp dir and returns its outputs.
function buildOutputs() {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "extract-dc-test-"));
  const res = runConverter(out);
  const read = (f) => fs.readFileSync(path.join(out, f), "utf8");
  return { out, res, read };
}

test("exits 0 and emits all six artifacts", () => {
  const { out, res } = buildOutputs();
  try {
    assert.equal(res.status, 0, `converter failed: ${res.stderr}`);
    for (const f of ["raw.css", "semantic.css", "layout.css", "component.css", "_manifest.json", "_report.md"]) {
      assert.ok(fs.existsSync(path.join(out, f)), `missing ${f}`);
    }
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("raw.css materializes every scale as OKLCH / rem, never NaNrem", () => {
  const { out, read } = buildOutputs();
  try {
    const raw = read("raw.css");
    assert.match(raw, /--slate-50:/);
    assert.match(raw, /--slate-900:/);
    assert.match(raw, /--brand-primary:/);
    assert.match(raw, /--space-1:/);
    assert.match(raw, /--space-4:/);
    assert.match(raw, /--radius-control:/);
    assert.match(raw, /--radius-pill:\s*9999px/);
    assert.match(raw, /--text-h1:/);
    assert.match(raw, /--white:\s*oklch\(1 0 0\)/);
    assert.match(raw, /--black:\s*oklch\(0 0 0\)/);
    // colors are OKLCH; spacing/radii are rem or the pill sentinel
    assert.match(raw, /--slate-50:\s*oklch\(/);
    assert.doesNotMatch(raw, /NaNrem/, "pxToRem emitted a NaN value");
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("semantic.css maps DC vars to shadcn roles with :root + .dark, omits danger", () => {
  const { out, read } = buildOutputs();
  try {
    const sem = read("semantic.css");
    assert.match(sem, /:root\s*\{/);
    assert.match(sem, /\.dark\s*\{/);
    assert.match(sem, /--color-background:/);
    assert.match(sem, /--color-primary:/);
    assert.match(sem, /--color-primary-foreground:/);
    assert.match(sem, /--color-muted-foreground:/);
    // preserved DC roles (no shadcn equivalent)
    assert.match(sem, /--color-heading:/);
    assert.match(sem, /--color-primary-soft:/);
    // danger is intentionally omitted (DC has no error color) — no *declaration*
    // of it. (The header comment names it as omitted; that line is fine.)
    assert.doesNotMatch(sem, /--color-danger\s*:/);
    // unprefixed aliases so base-ui internals keep resolving
    assert.match(sem, /--primary:\s*var\(--color-primary\)/);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("layout.css carries the Shell-consumed structural tokens", () => {
  const { out, read } = buildOutputs();
  try {
    const layout = read("layout.css");
    assert.match(layout, /--header-height:/);
    assert.match(layout, /--sidebar-width:/);
    assert.match(layout, /--grid-3col-ratio:/);
    assert.match(layout, /--footer-height:/);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("manifest records provenance + complete dark pairs + omitted danger", () => {
  const { out, read } = buildOutputs();
  try {
    const m = JSON.parse(read("_manifest.json"));
    assert.equal(m.source_file, "mini.dc.html");
    assert.ok(m.source_sha, "source_sha missing");
    assert.equal(m.dark_pairs_complete, true);
    assert.equal(m.dark_missing.length, 0);
    const omitted = m.omitted_roles.map((o) => o.out);
    assert.ok(omitted.includes("--color-danger"));
    assert.ok(m.counts.slate > 0);
    assert.ok(m.counts.spacing > 0);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("report proves color fidelity (worst round-trip Δ ≤ 1) and dark parity", () => {
  const { out, read } = buildOutputs();
  try {
    const report = read("_report.md");
    assert.match(report, /dark 쌍 완전성\*\*: ✅/);
    const m = report.match(/최대 Δ:\s*\*\*([\d.]+)\*\*/);
    assert.ok(m, "worst-Δ line not found");
    assert.ok(Number(m[1]) <= 1, `round-trip Δ ${m[1]} exceeds 1 (math regression)`);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test("--strict still fails on the WCAG-AA muted-foreground pair (light)", () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "extract-dc-test-"));
  try {
    const res = runConverter(out, ["--strict"]);
    assert.notEqual(res.status, 0, "--strict should exit non-zero on a WCAG fail");
    assert.match(res.stderr, /WCAG AA fail/);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});
