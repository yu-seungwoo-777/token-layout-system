// verify-tokens.test.mjs — contract test for the format-independent verifier.
//
// Zero-dep (Node 20+ builtins only): node:test, node:assert, node:fs,
// node:path, node:os, node:child_process. Runs verify-tokens.mjs as a
// subprocess against (a) the skill's canonical assets/tokens and (b) a
// crafted broken dir written into a temp directory.
//
//   node --test assets/scripts/verify-tokens.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const VERIFIER = path.join(SCRIPT_DIR, "verify-tokens.mjs");
const CANONICAL = path.join(SCRIPT_DIR, "..", "tokens"); // assets/tokens

function runVerifier(dir, extra = []) {
  return spawnSync(process.execPath, [VERIFIER, dir, ...extra], { encoding: "utf8" });
}

// A minimal broken token set: a dangling var() ref (strict failure) and no
// --text-*/--leading-*/--weight-* (Typography-dep warning).
function writeBrokenDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "verify-tokens-test-"));
  fs.writeFileSync(
    path.join(dir, "raw.css"),
    ":root {\n  --orange: #FB8C42;\n  --ink: #4A3B2A;\n}\n"
  );
  fs.writeFileSync(
    path.join(dir, "semantic.css"),
    ":root {\n  --color-primary: var(--orange);\n  --color-foreground: var(--never-defined);\n}\n"
  );
  return dir;
}

test("clean pass on the canonical assets/tokens (4-layer, --strict green)", () => {
  const res = runVerifier(CANONICAL, ["--strict"]);
  assert.equal(res.status, 0, `--strict should pass on canonical tokens: ${res.stderr}`);
  assert.match(res.stdout, /dangling var\(\) refs: ✅ none/);
  // the canonical set defines the full Typography scale
  assert.match(res.stdout, /Typography deps: ✅ all present/);
});

test("flags a dangling var() ref and fails --strict", () => {
  const dir = writeBrokenDir();
  try {
    const res = runVerifier(dir, ["--strict"]);
    assert.notEqual(res.status, 0, "--strict should exit non-zero on a dangling ref");
    assert.match(res.stderr, /dangling var\(\) refs/);
    // default run still exits 0 but warns about the dangling ref + Typography deps
    const warn = runVerifier(dir);
    assert.equal(warn.status, 0);
    assert.match(warn.stdout, /dangling var\(\) refs: ❌/);
    assert.match(warn.stdout, /Typography deps: ⚠ missing/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("reads any *.css layout, not just the 4 canonical names", () => {
  // A Claude Design SPA-bundle-style layout: colors.css + spacing.css. The
  // verifier must read whatever *.css is present and report the Typography-dep
  // gap (these files don't define --text-*/--leading-*/--weight-*).
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "verify-tokens-test-"));
  try {
    fs.writeFileSync(
      path.join(dir, "colors.css"),
      ":root {\n  --primary: #FB8C42;\n  --on-primary: #FFFFFF;\n}\n"
    );
    fs.writeFileSync(
      path.join(dir, "spacing.css"),
      ":root {\n  --gap: 16px;\n}\n"
    );
    const res = runVerifier(dir);
    assert.equal(res.status, 0, `converter failed: ${res.stderr}`);
    assert.match(res.stdout, /2 files/);
    assert.match(res.stdout, /Typography deps: ⚠ missing/);
    assert.match(res.stdout, /dangling var\(\) refs: ✅ none/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
