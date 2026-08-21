// Registered exceptions to check-vars.mjs.
//
// check-vars.mjs proves every var(--x) reference in src/ resolves to a name
// that either the theme itself declares or that a live Obsidian instance
// supplies (see obsidian-vars.mjs for how that second set was captured).
// Occasionally a reference is legitimate anyway: a variable a community
// plugin supplies only conditionally (e.g. only while its own view is open,
// so it never appeared in the single-snapshot capture), or one documented
// by a plugin's own README that was not installed in the capture vault.
//
// Each entry names one such deliberately-accepted reference. Do not add an
// entry to silence a genuine typo or a leftover from a rename — fix the CSS
// instead. This list is checked, not a general-purpose allowlist.
//
// Fields:
//   - name: the custom property name, including its leading "--".
//   - reason: why it is legitimate despite not being in either known set.
export const VAR_EXEMPTIONS = [
  {
    name: "--zoom-multiplier",
    reason:
      "Obsidian declares this on .canvas-wrapper and Canvas edge labels consume it while zooming; the variable was absent from the captured root-variable snapshot because it is scoped to the Canvas view.",
  },
];
