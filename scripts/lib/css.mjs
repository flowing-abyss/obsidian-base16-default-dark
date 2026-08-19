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
