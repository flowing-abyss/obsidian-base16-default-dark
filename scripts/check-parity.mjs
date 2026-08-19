import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { normalize } from "./lib/css.mjs";

const ref = process.argv[2] ?? "baseline-3.7.23";
const baseline = normalize(
  execFileSync("git", ["show", `${ref}:theme.css`], { encoding: "utf8" }),
);
const built = normalize(await readFile("theme.css", "utf8"));

if (baseline === built) {
  console.log(`parity OK against ${ref} (${built.length} normalised chars)`);
  process.exit(0);
}

let i = 0;
while (i < baseline.length && baseline[i] === built[i]) i++;
console.error(`PARITY FAILED against ${ref} at normalised offset ${i}`);
console.error(`  baseline: ...${baseline.slice(Math.max(0, i - 60), i + 60)}`);
console.error(`  built:    ...${built.slice(Math.max(0, i - 60), i + 60)}`);
console.error(`  lengths: baseline ${baseline.length}, built ${built.length}`);
process.exit(1);
