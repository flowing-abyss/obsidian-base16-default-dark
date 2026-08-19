// Parity CHECK — a Task-4 acceptance test, NOT an ongoing guard.
//
// =====================================================================
// READ THIS BEFORE relying on this script for anything past Task 4.
//
// What it proves: that splitting src/99-legacy.css into per-layer files
// (Task 4) lost nothing, added nothing, and altered no block's own text -
// i.e. it is a Task-4 ACCEPTANCE TEST for one specific mechanical
// transform (a reorder with no rule-content changes), measured as a
// block-multiset equality against baseline-3.7.23:theme.css.
//
// What it does NOT prove, and why it is expected to start failing once
// Task 5 edits src/: the plan states outright that from Task 6 onward
// parity is broken ON PURPOSE, because the token layer changes colours
// deliberately. This script has no way to tell "an intentional value
// change" apart from "a lost/altered block" - it only knows "this exact
// normalized block no longer exists in baseline-3.7.23" (MISSING) or
// "this exact normalized block exists more than baseline-3.7.23 plus its
// registered waivers account for" (EXTRA/STALE WAIVER). It is NOT a live
// content-safety guard for ongoing work, and nobody should read a later
// failure of this script as "a task broke something" - read it as "this
// script's premise (comparing against the pre-split, pre-recolor
// baseline) no longer applies, which is expected."
//
// Do not generalize this script to survive intentional edits. If future
// tasks need an ongoing content-safety check, that is new design work
// scoped to its own task, not an extension of this one.
//
// Consequently this is a ONE-SHOT acceptance test, run by hand
// (`npm run check:parity`) for as long as it keeps passing. It is
// deliberately NOT part of `npm run check`, `.husky/pre-commit`, or CI -
// wiring a one-shot test that is expected to start failing into a commit
// gate would block every future commit once Task 5/6 lands, not catch a
// regression. When it does start failing on an intentional token-layer
// edit, RETIRE it (delete it, don't try to repair or generalize it to
// keep passing) rather than patching around the failure.
// =====================================================================

import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { normalize, splitTopLevelBlocks } from "./lib/css.mjs";
import { PARITY_WAIVERS } from "./parity-waivers.mjs";

const ref = process.argv[2] ?? "baseline-3.7.23";
const baselineNorm = normalize(
  execFileSync("git", ["show", `${ref}:theme.css`], { encoding: "utf8" }),
);
const builtNorm = normalize(await readFile("theme.css", "utf8"));

// Block-multiset comparison, not a raw string compare: src/ is now split
// into per-layer files whose build order (npm run build concatenates
// src/**/*.css in filename-sort order) is the intended new cascade, not the
// legacy file's line order. A block assigned to a late layer can originate
// earlier in the legacy source than one assigned to an early layer, so the
// built output is a legitimate reordering of the baseline's blocks, not a
// byte-for-byte match. Comparing sorted block lists keeps the guarantee
// this check exists for — nothing lost, nothing added, no block's own text
// altered — without tripping on reordering the split intentionally does.
const baselineBlocks = splitTopLevelBlocks(baselineNorm).sort();
const builtBlocks = splitTopLevelBlocks(builtNorm).sort();

// Multiset diff: count occurrences on each side and report what's out of
// balance, rather than a single string offset (which is meaningless once
// order is allowed to differ).
function counts(blocks) {
  const m = new Map();
  for (const b of blocks) m.set(b, (m.get(b) ?? 0) + 1);
  return m;
}
const baselineCounts = counts(baselineBlocks);
const builtCounts = counts(builtBlocks);
const allKeys = new Set([...baselineCounts.keys(), ...builtCounts.keys()]);

const missing = []; // in baseline, not (enough) in built
const extraDelta = new Map(); // block -> (built count - baseline count), for built > baseline
for (const k of allKeys) {
  const b = baselineCounts.get(k) ?? 0;
  const t = builtCounts.get(k) ?? 0;
  if (t < b) missing.push({ block: k, baseline: b, built: t });
  if (t > b) extraDelta.set(k, t - b);
}

// Apply the registered waiver allowlist (scripts/parity-waivers.mjs). Each
// waiver claims a specific block is legitimately duplicated by an exact
// count (a deliberate order-sensitive-conflict fix — see that file). A
// waiver must match the ACTUAL extra delta exactly:
//   - claimed but actual delta is 0 or absent -> the duplicate this waiver
//     documents is no longer in the build (removed, or the conflict was
//     resolved another way) -> the waiver is stale -> FAIL, so the registry
//     cannot rot.
//   - claimed less than the actual delta -> some of this block's extra
//     copies are unexplained -> FAIL on the unexplained remainder.
//   - claimed more than the actual delta -> the waiver over-claims -> FAIL,
//     so a waiver can't be padded to silently cover future regressions.
//   - claimed equals actual delta exactly -> waiver consumed, remove this
//     block from the extra-diff entirely.
const waiverClaims = new Map(); // block -> total claimed extra count
for (const w of PARITY_WAIVERS) {
  waiverClaims.set(w.block, (waiverClaims.get(w.block) ?? 0) + w.extra);
}

const staleWaivers = []; // registered but the built output doesn't need them (as claimed)
for (const [block, claimed] of waiverClaims) {
  const actual = extraDelta.get(block) ?? 0;
  if (actual !== claimed) {
    staleWaivers.push({ block, claimed, actual });
  } else {
    extraDelta.delete(block);
  }
}

const extra = [...extraDelta.entries()].map(([block, delta]) => ({
  block,
  baseline: baselineCounts.get(block) ?? 0,
  built: builtCounts.get(block) ?? 0,
  delta,
}));

const same = missing.length === 0 && extra.length === 0 && staleWaivers.length === 0;

if (same) {
  console.log(
    `parity OK against ${ref} (${builtBlocks.length} block(s), ${builtNorm.length} normalised chars, ` +
      `${PARITY_WAIVERS.length} waiver(s) applied)`,
  );
  process.exit(0);
}

console.error(`PARITY FAILED against ${ref}`);
console.error(
  `  ${baselineBlocks.length} baseline block(s), ${builtBlocks.length} built block(s)`,
);
for (const { block, baseline, built } of missing) {
  console.error(`  MISSING (baseline x${baseline}, built x${built}): ${block.slice(0, 200)}`);
}
for (const { block, baseline, built } of extra) {
  console.error(`  EXTRA   (baseline x${baseline}, built x${built}): ${block.slice(0, 200)}`);
}
for (const { block, claimed, actual } of staleWaivers) {
  console.error(
    `  STALE WAIVER (registered extra x${claimed}, actual extra x${actual}) in ` +
      `scripts/parity-waivers.mjs: ${block.slice(0, 200)}`,
  );
}
process.exit(1);
