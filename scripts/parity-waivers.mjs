// Registered exceptions to the block-multiset parity check.
//
// check-parity.mjs proves the built theme.css and the baseline contain the
// exact same multiset of normalized blocks. That is a strong guarantee, but
// it is occasionally *wrong* to enforce literally: an order-sensitive
// cascade conflict (two blocks with equal specificity, differing values,
// same !important-ness) can require duplicating the later-cascade winner
// into a second file so the split's new file order reproduces the legacy
// line-order winner. That duplicate is deliberate and correct, but it makes
// the built output carry one more copy of that block's normalized text than
// the baseline does — an "EXTRA" that a bare multiset compare must reject.
//
// Each entry below names one such deliberately-extra block. check-parity.mjs
// subtracts these from the raw multiset diff before judging pass/fail, and
// ALSO fails if a registered waiver's extra count doesn't actually appear in
// the diff — so a waiver that stops being needed (e.g. because a later task
// removes the duplicate, or reorders layers so it's no longer required)
// fails the build instead of silently rotting on the list.
//
// Fields:
//   - block: the exact normalize()d block text (selector{declarations}) that
//     is legitimately duplicated. Must match splitTopLevelBlocks() output
//     verbatim.
//   - extra: how many MORE copies the built output legitimately carries
//     than the baseline (built count - baseline count). Almost always 1.
//   - file: the src/ file the duplicate was added to.
//   - reason: why the duplicate exists (the cascade conflict, in one line).
export const PARITY_WAIVERS = [
  {
    block:
      '.markdown-source-view.mod-cm6.is-readable-line-width .cm-line{padding:0}',
    extra: 1,
    file: "src/22-code.css",
    reason:
      "Legacy line 797 (12-lists.css) beat the .HyperMD-codeblock padding:12px rule " +
      "(legacy line 234, 22-code.css) on a same-specificity (0,4,0) tie because it " +
      "came later in the legacy file. The split loads 12-lists.css before " +
      "22-code.css, which would flip the winner, so the winning rule is duplicated " +
      "at the end of 22-code.css to restore the legacy result. See task-4-report.md.",
  },
];
