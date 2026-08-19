// Individually-reviewed cascade candidate pairs that scripts/lib/cascade.mjs's
// bulk categorical rules (classifyCandidate) don't cover, so a human judgment
// call is recorded here instead of re-derived every run.
//
// scripts/check-cascade.mjs computes every candidate pair fresh from the
// current src/ + baseline-3.7.23, categorizes each with classifyCandidate(),
// and for anything that comes back uncategorized, requires an exact-match
// entry here (by selector-set + property) or FAILS the build. That is the
// point of this file: a NEW uncategorized candidate - e.g. introduced by a
// later task's edits - fails loudly instead of being silently absorbed.
//
// Fields:
//   - aSelectors / bSelectors: the exact selector text (as extracted by
//     scripts/lib/cascade.mjs's parseBlocks + splitTopLevelCommas) of the
//     legacy-earlier (a) and legacy-later (b) rule.
//   - prop: the conflicting CSS property, when aProp === bProp (the common
//     case - most conflicts are exact-name, e.g. "padding" vs "padding").
//   - aProp / bProp: use instead of `prop` when the conflict is between a
//     shorthand and a longhand (or two different longhands under the same
//     shorthand family - see propertiesConflict() in scripts/lib/cascade.mjs),
//     e.g. aProp: "padding", bProp: "padding-left".
//   - verdict: "fixed" (the split's reordering flipped the legacy winner;
//     fixed by duplicating the winning rule - see scripts/parity-waivers.mjs
//     for the matching parity waiver) or "dismissed" (reviewed and confirmed
//     the two selectors cannot match the same element, for a reason too
//     specific to generalize into a bulk rule).
//   - reason: why.
export const CASCADE_TRIAGE = [
  {
    aSelectors: [".theme-dark .markdown-source-view.mod-cm6 .HyperMD-codeblock"],
    bSelectors: [".markdown-source-view.mod-cm6.is-readable-line-width .cm-line"],
    prop: "padding",
    verdict: "fixed",
    reason:
      "The one genuine order-sensitive conflict Task 4 found (legacy line 235 vs 797, both " +
      "specificity (0,4,0)). Legacy order let 'padding:0' (legacy 797) win over " +
      "'padding:12px' (legacy 234/235) on every individual .cm-line, including code-block " +
      "lines. The split loads 12-lists.css (source of the winner) before 22-code.css, which " +
      "would flip the winner. Fixed by duplicating the winning rule at the end of " +
      "src/22-code.css; see scripts/parity-waivers.mjs and task-4-report.md.",
  },
  {
    aSelectors: [".theme-dark .markdown-source-view.mod-cm6 .HyperMD-codeblock"],
    bSelectors: [
      ".folded-line-emphasis .cm-line:has(.cm-fold-indicator.is-collapsed)",
      ".folded-line-emphasis .markdown-preview-view .is-collapsed:not(.callout-fold)",
    ],
    aProp: "background-color",
    bProp: "background",
    verdict: "dismissed",
    reason:
      "Live-checked (obsidian eval): of 11 .cm-fold-indicator elements rendered in the test " +
      "vault's active note, 0 were inside a .HyperMD-codeblock line - all were on " +
      "HyperMD-header-* lines. Code-block lines aren't individually foldable the way heading/" +
      "list lines are in this Obsidian version, so '.cm-line:has(.cm-fold-indicator.is-collapsed)' " +
      "shouldn't ever match a .HyperMD-codeblock line. This is an empirical, sampled observation " +
      "(not exhaustive over every possible document state), too narrow a fact to generalize into " +
      "a bulk rule - recorded here individually instead.",
  },
  {
    aSelectors: [".theme-dark hr"],
    bSelectors: [".callout :is(h1, h2, h3, h4, h5, h6)"],
    aProp: "border-color",
    bProp: "border",
    verdict: "dismissed",
    reason:
      "Tag mismatch the automated rightmostTag() heuristic can't see: it treats the rightmost " +
      "compound ':is(h1, h2, h3, h4, h5, h6)' as a wildcard (any tag) because it doesn't parse " +
      "tag names out of :is() argument lists, so it can't rule this pair out on its own. " +
      "Manually verified instead: 'hr' is not one of h1-h6, so '.theme-dark hr' and " +
      "'.callout :is(h1, h2, h3, h4, h5, h6)' can never match the same element.",
  },
];
