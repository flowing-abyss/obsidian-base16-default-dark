// Cascade-conflict CHECK — a Task-4 acceptance test, NOT an ongoing guard.
//
// =====================================================================
// READ THIS BEFORE relying on this script for anything past Task 4.
//
// What it proves: that splitting src/99-legacy.css into per-layer files
// (Task 4) did not silently flip which rule wins a same-specificity tie,
// as measured against baseline-3.7.23:theme.css — i.e. it is a Task-4
// ACCEPTANCE TEST for one specific mechanical transform (a reorder with no
// rule-content changes).
//
// What it does NOT prove, and why it will stop being runnable once Task 5
// starts editing src/: it matches each LEGACY block to a built block by
// EXACT normalized content (scripts/lib/css.mjs's normalize(), the same
// equivalence check-parity.mjs uses). The instant a later task changes a
// selector or a value on purpose — which is the explicit point of Tasks
// 5-14, several of which deliberately rewrite these very rules — that
// block no longer matches anything in baseline-3.7.23, and this script
// exits 1 with "N legacy block(s) have no corresponding built block". It
// has no way to tell "an intentional edit changed this rule" apart from
// "this rule regressed"; it only knows "this exact text no longer exists
// in baseline-3.7.23". It is NOT a live cascade-safety guard for ongoing
// work, and nobody should read a later failure of this script as "a task
// broke the cascade" — read it as "this script's premise (comparing
// against the pre-split baseline) no longer applies, which is expected."
//
// Do not generalize this script to survive intentional edits — that was
// explicitly ruled out in the Task-4 review follow-up. If future tasks
// need an ongoing cascade-safety check, that is new design work scoped to
// its own task, not an extension of this one.
//
// Consequently this is a ONE-SHOT acceptance test, run by hand
// (`npm run check:cascade`) for as long as it keeps passing. It is
// deliberately NOT part of `npm run check`, `.husky/pre-commit`, or CI —
// wiring a one-shot test that is expected to start failing into a commit
// gate would block every future commit once Task 5 lands, not catch a
// regression. When it does start failing on Task 5's first intentional
// rule edit, RETIRE it (delete it, don't try to repair or generalize it
// to keep passing) rather than patching around the failure.
// =====================================================================
//
// How the acceptance test works: splitting reorders blocks relative to the
// legacy file (11,751 block-level order inversions - see task-4-report.md).
// Reordering only changes what the browser renders when two declarations'
// properties can CONFLICT (propertiesConflict() in scripts/lib/cascade.mjs
// - same property, or overlapping shorthand/longhand, e.g. `padding` vs
// `padding-left`), on selectors of EQUAL specificity, with DIFFERENT
// values, and matching !important-ness - CSS then picks whichever appears
// later in the stylesheet, and the split can change which one that is.
// This script finds every such "candidate" pair (comparing the built
// theme.css's order against baseline-3.7.23's legacy order), then either:
//   - categorizes it via scripts/lib/cascade.mjs's classifyCandidate(): a
//     set of bulk rules, each tagged "structural" (provable from CSS
//     semantics or a verified hard architectural invariant) or "empirical"
//     (rests on an observation about how a specific plugin renders in this
//     vault, checked live where noted - see that file's comments for
//     exactly what was and wasn't verified), or
//   - looks it up in scripts/cascade-triage.mjs, a registry of pairs that
//     needed individual judgment (verdict "dismissed" or "fixed" - "fixed"
//     entries are additionally VERIFIED below, not just asserted, by
//     confirming the fix's duplicate rule actually appears after the
//     conflict in the built output).
// Any candidate that is neither auto-categorized nor registered FAILS.
//
// Run: node scripts/check-cascade.mjs

import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { normalize } from "./lib/css.mjs";
import {
  parseBlocks,
  parseDeclarations,
  splitTopLevelCommas,
  specificity,
  compareSpecificity,
  propertiesConflict,
  classifyCandidate,
} from "./lib/cascade.mjs";
import { CASCADE_TRIAGE } from "./cascade-triage.mjs";

const REF = "baseline-3.7.23";

const baselineSrc = execFileSync("git", ["show", `${REF}:theme.css`], { encoding: "utf8" });
const builtSrc = await readFile("theme.css", "utf8");

function blockKey(b) {
  return normalize(b.selectorText + "{" + b.body + "}");
}

const legacyBlocksRaw = parseBlocks(baselineSrc);
const builtBlocksRaw = parseBlocks(builtSrc);

// Match each legacy block to its occurrence(s) in the built output by
// normalized content. Queue-based (first legacy occurrence -> first built
// occurrence, in order), so a legitimately-duplicated block (see
// scripts/parity-waivers.mjs) still matches its single legacy origin to
// ONE of its built occurrences (the first available) for general candidate
// detection - the "fixed" verification below separately checks ALL built
// occurrences of a triaged pair's blocks, not just the queue-assigned one.
const builtKeyIndex = new Map(); // key -> all built indices, for the "fixed" verification
builtBlocksRaw.forEach((b, idx) => {
  const k = blockKey(b);
  if (!builtKeyIndex.has(k)) builtKeyIndex.set(k, []);
  builtKeyIndex.get(k).push(idx);
});
const builtQueue = new Map();
for (const [k, idxs] of builtKeyIndex) builtQueue.set(k, [...idxs]);

let unmatched = 0;
const legacyBlocks = legacyBlocksRaw.map((b, legacyIndex) => {
  const k = blockKey(b);
  const q = builtQueue.get(k);
  const builtIndex = q && q.length ? q.shift() : -1;
  if (builtIndex === -1) unmatched++;
  return { ...b, legacyIndex, builtIndex, key: k };
});

if (unmatched > 0) {
  console.error(
    `check-cascade: ${unmatched} legacy block(s) have no corresponding built block.\n\n` +
      `This is very likely NOT a cascade regression - see the header comment in this file. ` +
      `This script compares against baseline-3.7.23 by exact normalized content; once a later ` +
      `task intentionally edits a rule this script covered, that block stops matching anything ` +
      `in the pre-split baseline and this check becomes unrunnable BY DESIGN. If you're on Task ` +
      `4 and seeing this, run check:parity first - it will explain what's actually missing.`,
  );
  process.exit(1);
}

// Flatten every block into per-selector, per-declaration records.
const records = [];
for (const blk of legacyBlocks) {
  const selectors = splitTopLevelCommas(blk.selectorText);
  const decls = parseDeclarations(blk.body);
  for (const sel of selectors) {
    const sp = specificity(sel);
    for (const d of decls) {
      records.push({
        legacyIndex: blk.legacyIndex,
        builtIndex: blk.builtIndex,
        line: blk.line,
        selector: sel,
        specificity: sp,
        prop: d.prop,
        value: d.value,
        important: d.important,
      });
    }
  }
}

// Candidate declaration pairs: legacy-earlier vs legacy-later, CONFLICTING
// properties (propertiesConflict - same name, or overlapping shorthand/
// longhand), equal specificity, differing value, matching !important, AND
// the built order inverts them (built puts the legacy-earlier one after
// the legacy-later one) - only inverted pairs can possibly flip a winner.
const declPairs = [];
for (let i = 0; i < records.length; i++) {
  for (let j = i + 1; j < records.length; j++) {
    let x = records[i];
    let y = records[j];
    if (x.legacyIndex === y.legacyIndex) continue;
    let earlier = x,
      later = y;
    if (earlier.legacyIndex > later.legacyIndex) [earlier, later] = [later, earlier];
    if (!propertiesConflict(earlier.prop, later.prop)) continue;
    if (compareSpecificity(earlier.specificity, later.specificity) !== 0) continue;
    if (earlier.value === later.value) continue;
    if (earlier.important !== later.important) continue;
    if (!(earlier.builtIndex > later.builtIndex)) continue; // not actually inverted
    declPairs.push({ earlier, later });
  }
}

// Group to distinct (legacy block, legacy block) pairs - the unit a human
// reviews and a rule/registry entry covers. A block pair can now carry
// MULTIPLE distinct (aProp, bProp) conflicts (shorthand vs longhand means
// earlier.prop and later.prop aren't necessarily equal), so each is tracked
// as its own {aProp, bProp} entry rather than a single shared prop set.
const blockPairs = new Map();
for (const { earlier, later } of declPairs) {
  const key = earlier.legacyIndex + ":" + later.legacyIndex;
  if (!blockPairs.has(key)) {
    blockPairs.set(key, {
      aLine: earlier.line,
      bLine: later.line,
      aSelectors: new Set(),
      bSelectors: new Set(),
      conflicts: new Map(), // "aProp>bProp" -> {aProp, bProp}
    });
  }
  const p = blockPairs.get(key);
  p.aSelectors.add(earlier.selector);
  p.bSelectors.add(later.selector);
  p.conflicts.set(`${earlier.prop}>${later.prop}`, { aProp: earlier.prop, bProp: later.prop });
}

const pairs = [...blockPairs.values()].map((p) => ({
  aLine: p.aLine,
  bLine: p.bLine,
  aSelectors: [...p.aSelectors].sort(),
  bSelectors: [...p.bSelectors].sort(),
  conflicts: [...p.conflicts.values()],
}));

// Registry lookup: exact match on (aSelectors set, bSelectors set, aProp, bProp).
// A registered entry with a single "prop" field matches when aProp===bProp===prop
// (the common case); entries may also give aProp/bProp explicitly for a
// shorthand/longhand conflict.
function findTriage(pair, aProp, bProp) {
  const aSet = pair.aSelectors.join(" ");
  const bSet = pair.bSelectors.join(" ");
  return CASCADE_TRIAGE.find((t) => {
    const tAProp = t.aProp ?? t.prop;
    const tBProp = t.bProp ?? t.prop;
    return (
      tAProp === aProp &&
      tBProp === bProp &&
      [...t.aSelectors].sort().join(" ") === aSet &&
      [...t.bSelectors].sort().join(" ") === bSet
    );
  });
}

const dismissedStructural = [];
const dismissedEmpirical = [];
const dismissedByRegistry = [];
const fixed = [];
const unreviewed = [];

for (const pair of pairs) {
  const bulk = classifyCandidate(pair);
  if (bulk) {
    if (bulk.kind === "structural") dismissedStructural.push({ ...pair, rule: bulk.tag });
    else dismissedEmpirical.push({ ...pair, rule: bulk.tag });
    continue;
  }
  // Not covered by a bulk rule - every distinct (aProp, bProp) conflict on
  // this block pair needs its own registry entry.
  for (const { aProp, bProp } of pair.conflicts) {
    const t = findTriage(pair, aProp, bProp);
    if (!t) {
      unreviewed.push({ ...pair, aProp, bProp });
    } else if (t.verdict === "fixed") {
      fixed.push({ ...pair, aProp, bProp, reason: t.reason });
    } else {
      dismissedByRegistry.push({ ...pair, aProp, bProp, reason: t.reason });
    }
  }
}

// Verify every "fixed" verdict is actually present in the CURRENT built
// output, rather than trusting the registry's assertion. A "fixed" entry
// claims: the legacy-later block (the historical, correct winner) has some
// duplicate appearing in built theme.css AFTER the legacy-earlier block's
// (the historical loser's) last occurrence - i.e. the winner's rule still
// wins the tie in the actual built cascade order, not just historically.
// Without this, removing the fix's duplicate (restoring the original
// regression) would still print "cascade OK" - only check:parity's STALE
// WAIVER would catch it, and the two gates would depend on each other to
// notice the same regression instead of each verifying it independently.
const fixFailures = [];
for (const f of fixed) {
  const loserBlock = legacyBlocks.find((b) => b.line === f.aLine);
  const winnerBlock = legacyBlocks.find((b) => b.line === f.bLine);
  if (!loserBlock || !winnerBlock) {
    fixFailures.push({ ...f, reason2: "could not locate the legacy block(s) by line number" });
    continue;
  }
  const loserBuiltPositions = builtKeyIndex.get(loserBlock.key) ?? [];
  const winnerBuiltPositions = builtKeyIndex.get(winnerBlock.key) ?? [];
  if (loserBuiltPositions.length === 0 || winnerBuiltPositions.length === 0) {
    fixFailures.push({ ...f, reason2: "one of the two blocks no longer exists in the built output at all" });
    continue;
  }
  const lastLoser = Math.max(...loserBuiltPositions);
  const lastWinner = Math.max(...winnerBuiltPositions);
  if (!(lastWinner > lastLoser)) {
    fixFailures.push({
      ...f,
      reason2: `the historical winner's last built occurrence (index ${lastWinner}) does not come after ` +
        `the historical loser's last built occurrence (index ${lastLoser}) - the fix's duplicate is ` +
        `missing or was removed, and the original regression is back.`,
    });
  }
}

console.log(`check-cascade against ${REF} (Task-4 acceptance test - see header comment):`);
console.log(`  ${legacyBlocks.length} legacy block(s), ${records.length} selector-declaration record(s)`);
console.log(`  ${pairs.length} candidate block-pair(s) (order-inverted, conflicting props, same specificity/importance, diff value)`);
console.log(`  dismissed (bulk rule, structural): ${dismissedStructural.length}`);
console.log(`  dismissed (bulk rule, empirical):  ${dismissedEmpirical.length}`);
console.log(`  dismissed (registry, reviewed):    ${dismissedByRegistry.length}`);
console.log(`  fixed (registered, verified):      ${fixed.length - fixFailures.length}`);

const failed = unreviewed.length > 0 || fixFailures.length > 0;

if (!failed) {
  console.log("cascade OK - every candidate pair is either provably/observably non-overlapping, or a verified fix.");
  process.exit(0);
}

if (fixFailures.length > 0) {
  console.error(`\nCASCADE CHECK FAILED: ${fixFailures.length} registered "fixed" verdict(s) NOT actually verified.`);
  for (const f of fixFailures) {
    console.error(`[legacy line ${f.aLine} -> ${f.bLine}] aProp=${f.aProp} bProp=${f.bProp}`);
    console.error(`  ${f.reason2}`);
  }
}

if (unreviewed.length > 0) {
  console.error(`\nCASCADE CHECK FAILED: ${unreviewed.length} unreviewed candidate pair(s).`);
  console.error(
    "Each of these needs either a bulk rule in scripts/lib/cascade.mjs (classifyCandidate) " +
      "or an entry in scripts/cascade-triage.mjs.\n",
  );
  for (const p of unreviewed) {
    console.error(`[legacy line ${p.aLine} -> ${p.bLine}] aProp=${p.aProp} bProp=${p.bProp}`);
    console.error(`  A: ${p.aSelectors.join(" | ")}`);
    console.error(`  B: ${p.bSelectors.join(" | ")}`);
  }
}
process.exit(1);
