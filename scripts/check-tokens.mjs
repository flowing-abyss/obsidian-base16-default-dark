import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const FORBIDDEN = [
  "#1a1a1a", "#484848", "#ffffff",
  "#81a2be", "#8abeb7", "#b5bd68", "#f0c674",
  "#cc6666", "#b294bb", "#de935f", "#969896",
];
const COLOUR_FILES = new Set(["00-palette.css", "01-tokens.css"]);
const IMPORTANT_BASELINE = 100;

// Matches #hex literals and rgb()/rgba()/hsl()/hsla() function literals.
// Outside the colour-definition files, every colour must come from a
// --b16-* token — a raw rgb()/hsla() literal (e.g. for an alpha-blended
// tag background) is just as much a violation as a raw hex.
const COLOUR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\(/g;

// CSS named colours. `(?<![-\w])...(?![-\w])` keeps this from firing on a
// custom-property identifier that merely contains the word (`--color-red`)
// or an unrelated property/value that starts with it (`white-space`) —
// only a standalone colour keyword counts.
const NAMED_COLOUR = new RegExp(
  "(?<![-\\w])(?:" +
    [
      "black", "white", "gray", "grey", "red", "green", "blue", "yellow",
      "orange", "purple", "cyan", "magenta", "maroon", "olive", "lime",
      "aqua", "teal", "navy", "fuchsia", "silver", "pink", "brown",
      "violet", "indigo", "coral", "salmon", "khaki", "beige", "ivory",
      "lavender", "turquoise", "tan", "crimson", "gold",
    ].join("|") +
    ")(?![-\\w])",
  "gi"
);

// Named-colour literals that are exempt because they aren't a themed hue —
// e.g. a structural `color-mix(in srgb, black 50%, transparent)` shadow,
// which is opacity mixing, not a colour choice. Explicit so the exemption
// is visible here rather than surviving by accident of an incomplete regex.
const ALLOWED_NAMED_LITERALS = {
  "50-plugins/bases.css": ["black"],
};

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
let failed = 0;
let important = 0;

for (const f of files) {
  const rel = relative("src", f);
  const css = await readFile(f, "utf8");
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");
  important += (bare.match(/!important/g) ?? []).length;

  for (const bad of FORBIDDEN) {
    if (bare.toLowerCase().includes(bad)) {
      console.error(`FAIL ${rel}: forbidden colour ${bad}`);
      failed++;
    }
  }
  if (!COLOUR_FILES.has(rel)) {
    const allowedNamed = ALLOWED_NAMED_LITERALS[rel] ?? [];
    const namedLiterals = (bare.match(NAMED_COLOUR) ?? []).filter(
      (m) => !allowedNamed.includes(m.toLowerCase())
    );
    const literals = [...(bare.match(COLOUR_LITERAL) ?? []), ...namedLiterals];
    if (literals.length) {
      console.error(
        `FAIL ${rel}: ${literals.length} raw colour literal(s), first ${literals[0]} — use a token`
      );
      failed++;
    }
  }
}

if (important > IMPORTANT_BASELINE) {
  console.error(`FAIL !important count ${important} exceeds baseline ${IMPORTANT_BASELINE}`);
  failed++;
} else {
  console.log(`!important: ${important} (baseline ${IMPORTANT_BASELINE})`);
}

console.log(failed === 0 ? "tokens OK" : `${failed} token failure(s)`);
process.exit(failed === 0 ? 0 : 1);
