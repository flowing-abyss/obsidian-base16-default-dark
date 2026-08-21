import { mkdir, readFile, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import postcss from "postcss";
import * as sass from "sass";

const INPUT = "theme.css";
const OUTPUT = "dist/theme.css";

function structure(css, from) {
  const sequence = [];
  const root = postcss.parse(css, { from });

  root.walk((node) => {
    if (node.type === "rule") sequence.push(["rule"]);
    else if (node.type === "atrule") sequence.push(["atrule", node.name]);
    else if (node.type === "decl") sequence.push(["decl", node.prop, node.important]);
  });

  return sequence;
}

function kib(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

const expanded = await readFile(INPUT, "utf8");
const compiled = sass.compileString(expanded, {
  syntax: "css",
  style: "compressed",
  logger: sass.Logger.silent,
}).css;
const banner = "/*! Base16 Default Dark for Obsidian | MIT License | Generated from src/ */";
const minified = `${banner}\n${compiled.trim()}\n`;

const expandedStructure = structure(expanded, INPUT);
const minifiedStructure = structure(minified, OUTPUT);
if (JSON.stringify(expandedStructure) !== JSON.stringify(minifiedStructure)) {
  throw new Error("minified CSS structure differs from theme.css");
}

const expandedBytes = Buffer.byteLength(expanded);
const minifiedBytes = Buffer.byteLength(minified);
if (minifiedBytes >= expandedBytes) {
  throw new Error("minified CSS is not smaller than theme.css");
}

await mkdir("dist", { recursive: true });
await writeFile(OUTPUT, minified);

const saved = (((expandedBytes - minifiedBytes) / expandedBytes) * 100).toFixed(1);
console.log(
  `built ${OUTPUT}: ${kib(expandedBytes)} -> ${kib(minifiedBytes)} (${saved}% smaller), ` +
    `${expandedStructure.length} structural nodes, gzip ${kib(gzipSync(minified).byteLength)}`,
);
