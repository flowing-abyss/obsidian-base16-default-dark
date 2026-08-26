import { readFile } from 'node:fs/promises';
import { contrast } from './lib/color.mjs';
import { CONTRAST_WAIVERS } from './contrast-waivers.mjs';

// Self-check: these two pairs are the ones that decided the code-block design,
// so a regression in the maths must fail loudly rather than silently reshape it.
const expect = (a, b, want) => {
  const got = contrast(a, b);
  if (Math.abs(got - want) > 0.02) {
    throw new Error(`contrast(${a},${b}) = ${got.toFixed(3)}, expected ${want}`);
  }
};
expect('#ab4642', '#181818', 3.12);
expect('#ab4642', '#282828', 2.59);
expect('#585858', '#282828', 2.07);
expect('#ffffff', '#000000', 21);

const SURFACES = ['surface-0', 'surface-2', 'surface-3'];

const ROLES = [
  { token: 'text-strong', min: 4.5, on: ['surface-0', 'surface-2', 'surface-3'] },
  { token: 'text-normal', min: 4.5, on: ['surface-0', 'surface-2', 'surface-3'] },
  { token: 'text-muted', min: 4.5, on: ['surface-0', 'surface-2', 'surface-3'] },
  { token: 'text-faint', min: 3, on: ['surface-0', 'surface-2'] },
  { token: 'accent-link', min: 3, on: ['surface-0', 'surface-2'] },
  { token: 'accent-link-ext', min: 3, on: ['surface-0', 'surface-2'] },
  { token: 'accent-tag', min: 3, on: ['surface-0', 'surface-2'] },
  { token: 'accent-code', min: 3, on: ['surface-0', 'surface-2'] },
  { token: 'status-error', min: 3, on: ['surface-0', 'surface-2'] },
  { token: 'status-ok', min: 3, on: ['surface-0', 'surface-2'] },
  { token: 'status-warn', min: 3, on: ['surface-0', 'surface-2'] },
];

// Callout labels sit on a 12% tint of their own colour over surface-0.
// Checking against the bare page would miss the actual pairing, while a
// plain token-vs-surface check would allow a hue whose band dominates the
// page. Keep both relationships inside the narrow visual envelope audited
// for this component.
const CALLOUT_ROLES = [
  'callout-critical',
  'callout-caution',
  'callout-positive',
  'callout-information',
  'callout-guidance',
  'callout-inquiry',
  'callout-structural',
  'callout-code',
  'callout-neutral',
  'callout-toc',
];

const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const rgbToHex = (rgb) =>
  `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
const mix = (foreground, background, alpha) => {
  const fg = hexToRgb(foreground);
  const bg = hexToRgb(background);
  return rgbToHex(fg.map((v, i) => v * alpha + bg[i] * (1 - alpha)));
};

const tokens = await readFile('src/01-tokens.css', 'utf8');
const hexOf = (name) => {
  const m = tokens.match(new RegExp(`--b16-${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`token --b16-${name} is not defined in src/01-tokens.css`);
  return m[1].toLowerCase();
};

// Surfaces are read from the same tokens file as the roles, not hardcoded,
// so a later change to a surface colour can't silently escape this check.
const surfaceHex = Object.fromEntries(SURFACES.map((s) => [s, hexOf(s)]));

const waivers = CONTRAST_WAIVERS;
const waived = new Set(waivers.map((w) => `${w.token}@${w.surface}`));
// Every (role, surface) pair the main loop actually visits, so a dangling
// waiver -- one naming a token/surface combination that was never a real
// pair (a typo, or a role/surface renamed out from under it) -- can be
// told apart from one that's merely stale.
const seenPairs = new Set();

let failed = 0;
for (const role of ROLES) {
  for (const s of role.on) {
    seenPairs.add(`${role.token}@${s}`);
    const ratio = contrast(hexOf(role.token), surfaceHex[s]);
    const key = `${role.token}@${s}`;
    const ok = ratio >= role.min;
    if (ok) {
      // A registered waiver whose pair now passes on its own is stale: the
      // colour was fixed (or the role/surface changed) and nobody removed
      // the waiver. That must fail loudly, the same way check-parity.mjs
      // used to fail on a waiver whose "extra" no longer appeared in the
      // diff — an unused exception is a hole nobody remembers opening.
      if (waived.has(key)) {
        console.error(
          `FAIL ${key} ${ratio.toFixed(2)} >= ${role.min} but is still waived — remove the stale waiver from scripts/contrast-waivers.mjs`,
        );
        failed++;
      }
      continue;
    }
    if (waived.has(key)) {
      const w = waivers.find((x) => `${x.token}@${x.surface}` === key);
      console.log(`WAIVED ${key} ${ratio.toFixed(2)} < ${role.min} — ${w.reason}`);
    } else {
      console.error(`FAIL ${key} ${ratio.toFixed(2)} < ${role.min}`);
      failed++;
    }
  }
}

for (const token of CALLOUT_ROLES) {
  const colour = hexOf(token);
  const page = surfaceHex['surface-0'];
  const band = mix(colour, page, 0.12);
  const labelRatio = contrast(colour, band);
  const bandRatio = contrast(band, page);

  if (labelRatio < 4.5) {
    console.error(`FAIL ${token} label/band ${labelRatio.toFixed(2)} < 4.5`);
    failed++;
  }
  // A minimum alone guarantees legibility but not hierarchy. Labels above
  // this ceiling become nearly as prominent as body text, and repeated
  // collapsed callouts turn into a wall of bright chrome. The limit sits
  // just above the audited caution/guidance roles (~7.03:1).
  if (labelRatio > 7.1) {
    console.error(`FAIL ${token} label/band ${labelRatio.toFixed(2)} > 7.10`);
    failed++;
  }
  if (bandRatio < 1.15 || bandRatio > 1.27) {
    console.error(`FAIL ${token} band/page ${bandRatio.toFixed(2)} outside 1.15–1.27`);
    failed++;
  }
}
// A waiver that never matches any (role, surface) pair guards nothing --
// it reads like a considered decision but was never actually consulted.
// Distinct wording from the stale-waiver message on purpose: "stale" means
// it stopped being needed, "dangling" means it never applied in the first
// place, and whoever reads the output shouldn't have to work out which.
for (const w of waivers) {
  const key = `${w.token}@${w.surface}`;
  if (!seenPairs.has(key)) {
    console.error(
      `FAIL waiver ${key} is dangling — matches no known token/surface combination in ROLES, remove it from scripts/contrast-waivers.mjs`,
    );
    failed++;
  }
}

console.log(failed === 0 ? 'contrast OK' : `${failed} contrast failure(s)`);
process.exit(failed === 0 ? 0 : 1);
