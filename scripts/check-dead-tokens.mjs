import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import postcss from 'postcss';
import { DEAD_TOKEN_EXEMPTIONS } from './dead-token-exemptions.mjs';

async function walk(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else if (entry.name.endsWith('.css')) files.push(path);
  }
  return files;
}

const TOKEN_RE = /^--b16-[\w-]+$/;
const VAR_RE = /var\(\s*(--b16-[\w-]+)/gi;
const declared = new Map(); // token -> [{ file, line }]
const referenced = new Map(); // token -> [{ file, line }]

function remember(map, name, location) {
  const locations = map.get(name) ?? [];
  locations.push(location);
  map.set(name, locations);
}

for (const file of await walk('src')) {
  const css = await readFile(file, 'utf8');
  const root = postcss.parse(css, { from: file });
  const rel = relative('.', file);

  root.walkDecls((decl) => {
    const location = { file: rel, line: decl.source?.start?.line ?? 1 };
    if (TOKEN_RE.test(decl.prop)) remember(declared, decl.prop, location);

    for (const match of decl.value.matchAll(VAR_RE)) {
      // `--x: var(--x, fallback)` does not make --x live by itself. An alias
      // (`--x: var(--y)`) does: --y is genuinely consumed by --x.
      if (match[1] !== decl.prop) remember(referenced, match[1], location);
    }
  });

  // var() is legal in at-rule parameters as well as declaration values.
  root.walkAtRules((atRule) => {
    const location = { file: rel, line: atRule.source?.start?.line ?? 1 };
    for (const match of atRule.params.matchAll(VAR_RE)) {
      remember(referenced, match[1], location);
    }
  });
}

let failed = 0;
const exemptions = new Map();
for (const exemption of DEAD_TOKEN_EXEMPTIONS) {
  if (!exemption?.name || !exemption?.reason) {
    console.error('FAIL every dead-token exemption needs non-empty name and reason');
    failed++;
    continue;
  }
  if (exemptions.has(exemption.name)) {
    console.error(`FAIL duplicate dead-token exemption ${exemption.name}`);
    failed++;
    continue;
  }
  exemptions.set(exemption.name, exemption.reason);
}

for (const [name, locations] of declared) {
  if (referenced.has(name)) {
    if (exemptions.has(name)) {
      console.error(
        `FAIL exemption ${name} is stale — the token is now referenced in src/, remove it from scripts/dead-token-exemptions.mjs`,
      );
      failed++;
    }
    continue;
  }
  if (exemptions.has(name)) {
    console.log(`EXEMPT ${name} — ${exemptions.get(name)}`);
    continue;
  }
  const first = locations[0];
  console.error(`FAIL ${first.file}:${first.line} ${name} is declared but never used in var()`);
  failed++;
}

for (const name of exemptions.keys()) {
  if (!declared.has(name)) {
    console.error(`FAIL exemption ${name} is stale — the token is not declared anywhere in src/`);
    failed++;
  }
}

const live = [...declared.keys()].filter((name) => referenced.has(name)).length;
console.log(
  `${declared.size} --b16-* declared, ${live} internally used, ${exemptions.size} externally exempted`,
);
console.log(failed === 0 ? 'dead tokens OK' : `${failed} dead-token failure(s)`);
process.exit(failed === 0 ? 0 : 1);
