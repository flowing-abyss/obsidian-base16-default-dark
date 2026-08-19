// Semantic normalisation for parity checking: strips everything a formatter is
// allowed to change (comments, whitespace, quote style, hex case) so that a
// mechanical file split can be proven to preserve meaning. Lowercasing can in
// principle mask a difference inside a content: string; that is accepted here
// because both sides of the comparison come from the same source text.
export function normalize(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/['"]/g, '"')
    .replace(/\s+/g, " ")
    .replace(/\s*([{};:,>~+])\s*/g, "$1")
    .replace(/;}/g, "}")
    .trim()
    .toLowerCase();
}
