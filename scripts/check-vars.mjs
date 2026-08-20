import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { OBSIDIAN_VARS } from "./obsidian-vars.mjs";
import { VAR_EXEMPTIONS } from "./var-exemptions.mjs";

// Proves every var(--x) reference in src/ resolves to something: a variable
// the theme itself declares, one Obsidian genuinely supplies at runtime (see
// obsidian-vars.mjs for how that set was captured), or an explicitly
// reasoned exemption below. Nothing else in this build catches a var()
// pointed at a name nobody defines — check-tokens.mjs only proves no raw
// colour literal escapes the token layer, which says nothing about whether
// a --b16-* (or any other) reference actually resolves. That gap is exactly
// how `--h1-color`, `--font-color`, `--hover-accent` and (earlier in this
// rebuild) `--font-heading-theme` all shipped and stayed invisible to
// `npm run check` until a human noticed a computed style.

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (e.name.endsWith(".css")) out.push(p);
  }
  return out;
}

const files = await walk("src");

// Every custom property the theme declares anywhere in src/ — a var(--x)
// reference is fine as long as SOME rule sets --x, regardless of which file,
// since 21-source-file concatenation order is a cascade question, not a
// definition-visibility one.
const declared = new Set();
// Every var(--x) reference, with enough detail to report where it lives.
const references = []; // { name, file, line }

const DECLARE_RE = /(--[a-zA-Z0-9-]+)\s*:/g;
// Matched over the whole file text (not per line, see below) and
// case-insensitively: `var(` is legal as `VAR(` per the CSS spec, and
// prettier is free to wrap a long declaration so the `var(--name` pair no
// longer shares a line — e.g.
//   box-shadow: 0 0 0 1px
//       var(
//         --b16-border-strong-…
//       );
// A per-line regex misses that reference entirely, silently. Matching over
// the full text (with comments already stripped above) survives the wrap.
const VAR_REF_RE = /var\(\s*(--[\w-]+)/gi;

for (const f of files) {
  const rel = relative(".", f);
  const raw = await readFile(f, "utf8");
  const bare = raw.replace(/\/\*[\s\S]*?\*\//g, "");

  for (const m of bare.matchAll(DECLARE_RE)) declared.add(m[1]);

  for (const m of bare.matchAll(VAR_REF_RE)) {
    const line = bare.slice(0, m.index).split("\n").length;
    references.push({ name: m[1], file: rel, line });
  }
}

const known = new Set([...declared, ...OBSIDIAN_VARS]);
const exempted = new Map(VAR_EXEMPTIONS.map((e) => [e.name, e.reason]));

let failed = 0;
const usedExemptions = new Set();
const referencedNames = new Set(references.map((r) => r.name));

for (const ref of references) {
  if (known.has(ref.name)) continue;
  if (exempted.has(ref.name)) {
    usedExemptions.add(ref.name);
    continue;
  }
  console.error(
    `FAIL ${ref.file}:${ref.line} var(${ref.name}) — not declared in src/, not a known Obsidian variable, and not in scripts/var-exemptions.mjs`
  );
  failed++;
}

// An exemption that no longer matches any reference (the CSS was fixed or
// removed) is stale — the same discipline check-contrast.mjs applies to
// waivers, so an accepted exception doesn't quietly outlive the reference
// it was written for.
for (const e of VAR_EXEMPTIONS) {
  if (!referencedNames.has(e.name)) {
    console.error(
      `FAIL exemption ${e.name} is stale — no longer referenced anywhere in src/, remove it from scripts/var-exemptions.mjs`
    );
    failed++;
  } else if (known.has(e.name)) {
    console.error(
      `FAIL exemption ${e.name} is stale — now declared in src/ or resolved by Obsidian on its own, remove it from scripts/var-exemptions.mjs`
    );
    failed++;
  }
}

console.log(
  `${referencedNames.size} referenced, ${declared.size} theme-declared, ${OBSIDIAN_VARS.length} known Obsidian, ${usedExemptions.size} exempted`
);
console.log(failed === 0 ? "vars OK" : `${failed} var failure(s)`);
process.exit(failed === 0 ? 0 : 1);
