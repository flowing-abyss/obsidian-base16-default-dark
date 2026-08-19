// Semantic normalisation for parity checking: strips everything a formatter is
// allowed to change (comments, whitespace, quote style, hex case) so that a
// mechanical file split can be proven to preserve meaning. Lowercasing can in
// principle mask a difference inside a content: string; that is accepted here
// because both sides of the comparison come from the same source text.
//
// The tightened-separator character class covers every punctuation character
// this repo's prettier config (printWidth: 100) is observed to wrap or pad
// when a line is reformatted:
//   { } ; : , > ~ +   — declaration/selector punctuation (original set)
//   ( )               — added: prettier wraps long :is()/:not()/:where()
//                        argument lists and long calc()/var() nesting by
//                        breaking right after "(" and before ")", e.g.
//                        `:not(\n    .a,\n    .b\n  )`.
// Verified empirically (see scripts/test-normalize.mjs) that prettier does
// NOT insert padding/wrapping around other candidate characters in CSS it
// produces for this codebase: attribute-selector brackets ([ ]) and the
// arithmetic +/- inside calc() are left unpadded or already carry the
// single space CSS requires, which \s+ collapse below already normalises;
// media-query parens are covered by the same ( ) handling as selector
// parens. No other separator character was observed to gain or lose
// adjacent whitespace under this repo's prettier/stylelint config.
export function normalize(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/['"]/g, '"')
    .replace(/\s+/g, " ")
    .replace(/\s*([{};:,>~+()])\s*/g, "$1")
    .replace(/;}/g, "}")
    .trim()
    .toLowerCase();
}

// Splits already-normalize()d CSS (single line, comments stripped, quotes
// unified to ") into its top-level blocks — "selector{...}" units, where a
// nested block (e.g. a whole @media query containing its own selector
// blocks) counts as ONE unit, using the same depth-past-zero rule
// inventory.mjs's block walker uses on raw source.
//
// This exists for check-parity.mjs, once splitting src/99-legacy.css into
// per-layer files (Task 4 of the typography rebuild) is factored in: that
// split deliberately reorders blocks relative to the legacy file (a block
// grouped into a late-cascade file like 40-chrome.css can originate from
// earlier in the legacy source than one that lands in an early file like
// 11-text.css — see the split's own inventory). A plain baseline===built
// string compare is therefore not the right equivalence for a split build:
// it would fail on every legitimate reorder, not just on an actual lost,
// duplicated, or altered block. Comparing the SORTED block lists instead
// keeps exactly the guarantee check-parity exists to provide — no block
// missing, no block added, no block's own text changed — while tolerating
// the reordering the split intentionally performs. A string is tracked (not
// just brace depth) because a `content: "{"` declaration value could
// otherwise be miscounted as a real brace; none exists in this theme today,
// but the walker stays correct if one is ever added.
export function splitTopLevelBlocks(normalized) {
  const blocks = [];
  let depth = 0;
  let cursor = 0;
  let inString = false;

  for (let i = 0; i < normalized.length; i++) {
    const c = normalized[i];
    if (inString) {
      if (c === "\\") {
        i++;
        continue;
      }
      if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === "{") {
      depth++;
    } else if (c === "}") {
      depth--;
      if (depth === 0) {
        blocks.push(normalized.slice(cursor, i + 1).trim());
        cursor = i + 1;
      }
    }
  }

  const trailing = normalized.slice(cursor).trim();
  if (trailing) blocks.push(trailing);

  return blocks;
}
