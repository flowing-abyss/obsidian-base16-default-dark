// Self-checking test for scripts/lib/css.mjs's normalize().
//
// check-parity.mjs's entire safety net rests on the assumption that
// normalize() treats CSS that a formatter may legitimately reflow (line
// wraps, re-indentation, collapsed multi-line rules) as identical to its
// original form. This script asserts that directly, using pairs where the
// "mangled" side reproduces a real reformatting prettier performs on this
// repo's own stylesheet (see the paren-wrap case, reproduced from
// src/99-legacy.css around the `:not(.is-grabbing, ...)` selector via
// `npx prettier --config .prettierrc --write` on a scratch copy).
//
// Run: node scripts/test-normalize.mjs

import { normalize } from "./lib/css.mjs";

const cases = [
  {
    name: "collapse a multi-line selector onto one line",
    a: `
      &.is-hidden-frameless:not(.is-grabbing, .is-fullscreen, .show-sidebar-header-buttons)
        .mod-top
        .workspace-tab-header-container {
        -webkit-app-region: no-drag;
      }
    `,
    b: `&.is-hidden-frameless:not(.is-grabbing, .is-fullscreen, .show-sidebar-header-buttons) .mod-top .workspace-tab-header-container { -webkit-app-region: no-drag; }`,
  },
  {
    // Reproduces the exact prettier output that broke the pre-fix
    // normalize(): a long :not() argument list gets a newline right after
    // "(" and right before ")".
    name: "wrap a long :not(...) argument list across lines (paren wrap)",
    a: `body.is-hidden-frameless:not(.is-grabbing-very-long-name, .is-fullscreen-very-long-name, .show-sidebar-header-buttons-also-long) {
  color: red;
}`,
    b: `body.is-hidden-frameless:not(
    .is-grabbing-very-long-name,
    .is-fullscreen-very-long-name,
    .show-sidebar-header-buttons-also-long
  ) {
  color: red;
}`,
  },
  {
    name: "re-indent a block (2-space vs 4-space vs tabs)",
    a: `.parent {
  .child {
    color: blue;
  }
}`,
    b: `.parent {
\t.child {
\t\t\tcolor:    blue;
\t}
}`,
  },
  {
    name: "calc()/var() nesting wrapped across lines",
    a: `.el { width: calc(var(--a, 10px) + var(--b, 20px) - var(--c, 30px)); }`,
    b: `.el {
  width: calc(
    var(--a, 10px) +
      var(--b, 20px) -
      var(--c, 30px)
  );
}`,
  },
];

let failures = 0;

for (const { name, a, b } of cases) {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) {
    console.log(`OK   ${name}`);
  } else {
    failures++;
    console.error(`FAIL ${name}`);
    console.error(`  a: ${na}`);
    console.error(`  b: ${nb}`);
  }
}

if (failures > 0) {
  console.error(`\n${failures}/${cases.length} normalize() case(s) failed`);
  process.exit(1);
}

console.log(`\nall ${cases.length} normalize() cases passed`);
