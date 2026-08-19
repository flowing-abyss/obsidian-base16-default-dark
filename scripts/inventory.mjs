// Builds a machine-checked inventory of every top-level (depth-0) block in
// src/99-legacy.css, so the Task 4 split can be verified to drop nothing.
//
// The depth walk below deliberately tracks comment and string state, not
// just braces: src/99-legacy.css contains a commented-out selector
// (`/* .foo:has(...) { */`) whose `{` has no matching `}` inside the
// comment. A naive brace counter that does not skip comment/string content
// would count that stray `{` as a real depth increment and misattribute
// every block after it for the rest of the file. Verified empirically:
// the file has 358 `{` and 357 `}` in raw text, and exactly one `{`
// appears inside a `/* ... */` comment — stripping comment/string content
// before counting brings the real top-level block count back into balance.
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { normalize } from "./lib/css.mjs";

const SRC_PATH = "src/99-legacy.css";
const OUT_PATH = ".docs/inventory.tsv";

const src = await readFile(SRC_PATH, "utf8");

const blocks = [];
let depth = 0;
let start = 0;
let line = 1;
let startLine = 1;
let state = "normal"; // "normal" | "comment" | "string"
let stringQuote = "";

for (let i = 0; i < src.length; i++) {
  const c = src[i];
  if (c === "\n") line++;

  if (state === "comment") {
    if (c === "*" && src[i + 1] === "/") {
      state = "normal";
      i++; // consume the trailing "/"
    }
    continue;
  }

  if (state === "string") {
    if (c === "\\") {
      i++; // skip escaped character, including an escaped quote
      continue;
    }
    if (c === stringQuote) state = "normal";
    continue;
  }

  // state === "normal"
  if (c === "/" && src[i + 1] === "*") {
    state = "comment";
    i++;
    continue;
  }
  if (c === "'" || c === '"') {
    state = "string";
    stringQuote = c;
    continue;
  }
  if (c === "{") {
    if (depth === 0) {
      startLine = line;
      start = i;
    }
    depth++;
  } else if (c === "}") {
    depth--;
    if (depth === 0) {
      const rawSelector = src.slice(0, start).split(/}|\*\//).pop();
      const selector = rawSelector.replace(/\s+/g, " ").trim().slice(0, 120);
      // Reformat-resistant identity for this block: the untruncated selector
      // text plus the full "{ ... }" body, run through the same normalize()
      // check-parity.mjs uses to prove meaning is preserved. This survives
      // prettier/stylelint --fix rewrapping (which lint-staged runs on every
      // commit, and which npm run format / lint:fix run on demand) because
      // normalize() strips exactly the whitespace/quote/comment differences
      // those tools introduce. It deliberately does NOT survive an actual
      // content edit, which is the point: an edited block gets a new key and
      // correctly fails to match anything carried forward.
      const blockKey = normalize(rawSelector + src.slice(start, i + 1));
      blocks.push({ line: startLine, selector, blockKey });
    }
  }
}

if (depth !== 0) {
  console.error(`PARSE ERROR: unbalanced braces, ending depth ${depth}`);
  process.exit(1);
}

// Two source signatures, both computed over the CURRENT file, used to decide
// whether a previous inventory can be trusted at all:
//   - rawHash: sha256 of the file's exact bytes. Changes on every edit,
//     including a pure reformat (prettier rewrapping a long selector list).
//   - normalizedHash: sha256 of normalize(src) — the same normalisation
//     check-parity.mjs relies on to prove a mechanical split is lossless.
//     A meaning-preserving reformat leaves this unchanged; a real content
//     edit changes it.
const rawHash = createHash("sha256").update(src).digest("hex");
const normalizedHash = createHash("sha256").update(normalize(src)).digest("hex");

// Re-read a previous inventory (if any) to carry forward target/kind
// annotations across regenerations.
//
// Carry-forward is keyed by blockKey (see above), NOT by line number and NOT
// by selector text. Two problems ruled those out:
//   - Selector text is not unique in this file (e.g. ".theme-dark" alone
//     opens 254 blocks), so keying by selector could restore one block's
//     annotation onto a different block that merely shares its selector.
//   - Line number is unique but NOT stable: lint-staged runs
//     `prettier --write` + `stylelint --fix` on src/**/*.css on every commit
//     (and `npm run format` / `npm run lint:fix` do the same on demand), and
//     those tools rewrap long selector lists, which moves line numbers
//     without changing meaning. Keying by line silently mis-restores
//     annotations onto whichever unrelated block happens to start on the old
//     line number after such a reformat — confirmed empirically: after a
//     reformat, 36/303 rows kept a stale target/kind that belonged to a
//     different block.
//
// Before trusting ANY carry-forward, the recorded rawHash/normalizedHash are
// checked against the current file:
//   - rawHash matches           -> file byte-identical to last run; trivial.
//   - rawHash differs but
//     normalizedHash matches    -> pure reformat; every block's blockKey is
//                                   unchanged, so carry-forward via blockKey
//                                   is exact and safe.
//   - both differ                -> the file's actual content changed. Do
//                                   NOT attempt to salvage any row — even a
//                                   blockKey match could be a false positive
//                                   here (e.g. two blocks share text, as the
//                                   file's two known "drop" duplicates do,
//                                   and an edit could reorder or add/remove
//                                   an occurrence). Refuse ALL carry-forward
//                                   and fail loudly; the inventory must be
//                                   re-classified by hand.
let prevRawHash = null;
let prevNormalizedHash = null;
let sourceChanged = false;
const carryForward = new Map(); // blockKey -> queue of {target, kind}

try {
  const prev = await readFile(OUT_PATH, "utf8");
  const prevLines = prev.split("\n");
  for (const l of prevLines) {
    const rawMatch = l.match(/^# source-raw-sha256: ([0-9a-f]{64})$/);
    if (rawMatch) prevRawHash = rawMatch[1];
    const normMatch = l.match(/^# source-normalized-sha256: ([0-9a-f]{64})$/);
    if (normMatch) prevNormalizedHash = normMatch[1];
  }

  if (prevRawHash !== null) {
    if (prevRawHash === rawHash) {
      // Byte-identical file: trust every row.
    } else if (prevNormalizedHash === normalizedHash) {
      // Reformat only: trust every row (matched below by blockKey).
    } else {
      sourceChanged = true;
    }
  }

  if (!sourceChanged) {
    const dataLines = prevLines.filter((l) => l && !l.startsWith("#"));
    for (const row of dataLines.slice(1)) {
      // skip the "line\tselector\ttarget\tkind\tblockkey" header
      const [, , target, kind, blockKey] = row.split("\t");
      if (!blockKey) continue;
      if (!carryForward.has(blockKey)) carryForward.set(blockKey, []);
      carryForward.get(blockKey).push({ target: target ?? "", kind: kind ?? "" });
    }
  }
} catch {}

const rows = blocks.map((b) => {
  const queue = carryForward.get(b.blockKey);
  const p = queue?.length ? queue.shift() : { target: "", kind: "" };
  return [b.line, b.selector, p.target ?? "", p.kind ?? "", b.blockKey].join("\t");
});

const header = [
  `# source-raw-sha256: ${rawHash}`,
  `# source-normalized-sha256: ${normalizedHash}`,
  "line\tselector\ttarget\tkind\tblockkey",
];

await writeFile(OUT_PATH, [...header, ...rows].join("\n") + "\n");

if (sourceChanged) {
  console.error(
    `SOURCE CHANGED: ${SRC_PATH} does not match the file the previous ` +
      `${OUT_PATH} was generated from (raw and normalised hashes both ` +
      `differ). Refusing to carry forward any target/kind annotation — ` +
      `re-classify from scratch.`,
  );
  process.exit(1);
}

const unassigned = rows.filter((r) => r.split("\t")[2] === "").length;
console.log(`${blocks.length} blocks, ${unassigned} unassigned`);
if (process.argv.includes("--check") && unassigned > 0) {
  console.error(`INVENTORY INCOMPLETE: ${unassigned} block(s) without a target`);
  process.exit(1);
}
