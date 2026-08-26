import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';
import valueParser from 'postcss-value-parser';
import * as sass from 'sass';

const INPUT = 'theme.css';
const OUTPUT = 'dist/theme.css';

function structure(css, from) {
  const root = postcss.parse(css, { from });
  const selector = (input) => selectorParser().processSync(input, { lossless: false });
  const value = (input) => {
    const nodes = valueParser(input).nodes;
    const canonicalValueNodes = (inputNodes) =>
      inputNodes.flatMap((node) => {
        if (node.type === 'space' || node.type === 'comment') return [];
        if (node.type === 'function') {
          return [['function', node.value.toLowerCase(), canonicalValueNodes(node.nodes)]];
        }
        if (node.type === 'word') {
          // Sass's compressed form joins multiplication to the following
          // numeric token (`* 10.5` -> `*10.5`). Keep operator/token boundaries
          // semantic so expanded and compressed spellings compare equally.
          const multiplied = node.value.match(/^\*(.+)$/);
          if (multiplied) {
            return [
              ['word', '*'],
              ...canonicalValueNodes([{ type: 'word', value: multiplied[1] }]),
            ];
          }
          const number = node.value.match(
            /^([+-]?(?:\d*\.\d+|\d+\.?\d*)(?:e[+-]?\d+)?)([a-z%]*)$/i,
          );
          if (number) return [['number', Number(number[1]), number[2].toLowerCase()]];
        }
        return [[node.type, node.value]];
      });
    return canonicalValueNodes(nodes);
  };

  // Compare the semantic tree, not merely the number and kinds of nodes.
  // The old flat sequence did not include selectors, at-rule parameters or
  // declaration values, so `.a { color: red }` and `.b { color: blue }`
  // appeared identical. Compiling the same input in expanded and compressed
  // modes first lets Sass perform the same legal normalisation on both sides;
  // any difference that remains is a real minification regression.
  const canonical = (node) => {
    if (node.type === 'root') {
      return [
        'root',
        node.nodes
          .filter(
            (child) =>
              child.type !== 'comment' && !(child.type === 'atrule' && child.name === 'charset'),
          )
          .map(canonical),
      ];
    }
    if (node.type === 'rule') {
      return [
        'rule',
        selector(node.selector),
        node.nodes.filter((child) => child.type !== 'comment').map(canonical),
      ];
    }
    if (node.type === 'atrule') {
      return [
        'atrule',
        node.name,
        value(node.params),
        node.nodes?.filter((child) => child.type !== 'comment').map(canonical) ?? null,
      ];
    }
    if (node.type === 'decl') {
      return ['decl', node.prop, value(node.value), node.important];
    }
    throw new Error(`unsupported CSS node type ${node.type}`);
  };

  return canonical(root);
}

function kib(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

const expanded = await readFile(INPUT, 'utf8');
const expandedCompiled = sass.compileString(expanded, {
  syntax: 'css',
  style: 'expanded',
  logger: sass.Logger.silent,
}).css;
const compiled = sass.compileString(expanded, {
  syntax: 'css',
  style: 'compressed',
  logger: sass.Logger.silent,
}).css;
const banner = '/*! Base16 Default Dark for Obsidian | MIT License | Generated from src/ */';
const minified = `${banner}\n${compiled.trim()}\n`;

const expandedStructure = structure(expandedCompiled, `${INPUT} (Sass expanded)`);
const minifiedStructure = structure(minified, OUTPUT);
function firstDifference(left, right, path = 'root') {
  if (!Array.isArray(left) || !Array.isArray(right)) {
    return Object.is(left, right) ? null : { path, left, right };
  }
  if (left.length !== right.length) {
    return { path: `${path}.length`, left: left.length, right: right.length };
  }
  for (let i = 0; i < left.length; i++) {
    const difference = firstDifference(left[i], right[i], `${path}[${i}]`);
    if (difference) {
      if (
        !difference.context &&
        typeof left[0] === 'string' &&
        ['rule', 'atrule', 'decl', 'function'].includes(left[0])
      ) {
        difference.context = { left, right };
      }
      return difference;
    }
  }
  return null;
}

const difference = firstDifference(expandedStructure, minifiedStructure);
if (difference) {
  throw new Error(
    `minified CSS differs at ${difference.path}: ` +
      `${JSON.stringify(difference.left)} !== ${JSON.stringify(difference.right)}` +
      (difference.context ? `\n${JSON.stringify(difference.context)}` : ''),
  );
}

const expandedBytes = Buffer.byteLength(expanded);
const minifiedBytes = Buffer.byteLength(minified);
if (minifiedBytes >= expandedBytes) {
  throw new Error('minified CSS is not smaller than theme.css');
}

await mkdir('dist', { recursive: true });
await writeFile(OUTPUT, minified);

const saved = (((expandedBytes - minifiedBytes) / expandedBytes) * 100).toFixed(1);
console.log(
  `built ${OUTPUT}: ${kib(expandedBytes)} -> ${kib(minifiedBytes)} (${saved}% smaller), ` +
    `semantic structure verified, gzip ${kib(gzipSync(minified).byteLength)}`,
);
