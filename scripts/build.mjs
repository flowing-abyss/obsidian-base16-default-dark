import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

const SRC = "src";
const OUT = "theme.css";

async function collect(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name, "en"));
  const files = [];
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) files.push(...(await collect(p)));
    else if (e.name.endsWith(".css")) files.push(p);
  }
  return files;
}

const files = await collect(SRC);
if (files.length === 0) throw new Error("no sources found in src/");

const parts = [
  "/* Base16 Default Dark for Obsidian",
  " * GENERATED FILE — DO NOT EDIT.",
  " * Edit the sources in src/ and run `npm run build`.",
  " */",
  "",
];

for (const f of files) {
  parts.push(`/* ===== ${relative(SRC, f)} ===== */`, "");
  parts.push((await readFile(f, "utf8")).trim(), "");
}

await writeFile(OUT, parts.join("\n") + "\n");
console.log(`built ${OUT} from ${files.length} source file(s)`);
