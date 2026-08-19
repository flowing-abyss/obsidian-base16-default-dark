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
import { readFile, writeFile } from "node:fs/promises";

const src = await readFile("src/99-legacy.css", "utf8");

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
      const selector = src
        .slice(0, start)
        .split(/}|\*\//)
        .pop()
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 120);
      blocks.push({ line: startLine, selector });
    }
  }
}

if (depth !== 0) {
  console.error(`PARSE ERROR: unbalanced braces, ending depth ${depth}`);
  process.exit(1);
}

// Re-read a previous inventory (if any) to carry forward target/kind
// annotations across regenerations. Keyed by line number, NOT selector
// text: selector text is not unique in this file (e.g. ".theme-dark"
// alone opens 254 blocks), so keying by selector would silently
// mis-restore one block's annotation onto a different block that shares
// its selector text. A block's starting line is unique and, since this
// script never rewrites src/99-legacy.css, stable across runs.
const existing = new Map();
try {
  const prev = await readFile(".docs/inventory.tsv", "utf8");
  for (const row of prev.split("\n").slice(1)) {
    if (!row) continue;
    const [prevLine, , target, kind] = row.split("\t");
    if (prevLine) existing.set(Number(prevLine), { target, kind });
  }
} catch {}

const rows = blocks.map((b) => {
  const p = existing.get(b.line) ?? { target: "", kind: "" };
  return [b.line, b.selector, p.target ?? "", p.kind ?? ""].join("\t");
});

await writeFile(
  ".docs/inventory.tsv",
  ["line\tselector\ttarget\tkind", ...rows].join("\n") + "\n",
);

const unassigned = rows.filter((r) => r.split("\t")[2] === "").length;
console.log(`${blocks.length} blocks, ${unassigned} unassigned`);
if (process.argv.includes("--check") && unassigned > 0) {
  console.error(`INVENTORY INCOMPLETE: ${unassigned} block(s) without a target`);
  process.exit(1);
}
