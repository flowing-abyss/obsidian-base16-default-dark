import { readFile } from "node:fs/promises";

const css = await readFile("src/01-tokens.css", "utf8");
const sizes = [1, 2, 3, 4, 5, 6].map((n) => {
  const m = css.match(new RegExp(`--h${n}-size:\\s*([0-9.]+)em`));
  if (!m) throw new Error(`--h${n}-size is not defined in em in src/01-tokens.css`);
  return Number(m[1]);
});

let failed = 0;
for (let i = 0; i < 5; i++) {
  if (sizes[i] < sizes[i + 1]) {
    console.error(`FAIL h${i + 1} (${sizes[i]}em) is smaller than h${i + 2} (${sizes[i + 1]}em)`);
    failed++;
  }
}
// The flat 1.10 step inherited from Obsidian is what made the hierarchy
// unreadable; the top of the scale must carry real size difference.
for (let i = 0; i < 3; i++) {
  const step = sizes[i] / sizes[i + 1];
  if (step < 1.15) {
    console.error(
      `FAIL step h${i + 1}/h${i + 2} = ${step.toFixed(3)} (${sizes[i]}em / ${sizes[i + 1]}em), need >= 1.15`
    );
    failed++;
  }
}
console.log(failed === 0 ? `scale OK: ${sizes.join(" / ")}` : `${failed} scale failure(s)`);
process.exit(failed === 0 ? 0 : 1);
