// Registered exceptions to check-contrast.mjs's role/surface minimums.
//
// check-contrast.mjs proves every text/accent/status role token clears its
// WCAG contrast minimum against every surface it appears on. That is a
// strong guarantee, but base16's own palette occasionally cannot clear it
// without breaking the palette itself (e.g. the base16 red used for
// status-error): the fix is not to raise the colour, it's to record why not.
//
// Each entry below names one such deliberately-accepted shortfall.
// check-contrast.mjs prints it as WAIVED instead of FAIL when the ratio is
// still below the minimum, and ALSO fails the check if a registered waiver's
// pair no longer needs it — i.e. the ratio now passes on its own — so a
// waiver that stops being necessary (e.g. because a later task lightens the
// token) fails the build instead of silently rotting on the list.
//
// Fields:
//   - token: the --b16-{token} role name (matches ROLES[].token in
//     check-contrast.mjs, e.g. "status-error").
//   - surface: the --b16-{surface} name it's checked against (e.g.
//     "surface-2").
//   - reason: why the shortfall is accepted (in one line).
export const CONTRAST_WAIVERS = [
  {
    token: "status-error",
    surface: "surface-2",
    reason:
      "base16 base08 is inherently dark; error text inside blocks is rendered on surface-0 instead, and on surface-2 the colour is used only for rails and icons adjacent to a high-contrast label",
  },
];
