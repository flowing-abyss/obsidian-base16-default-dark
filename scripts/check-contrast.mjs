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
  { token: 'status-error-text', min: 4.5, on: ['surface-0', 'surface-2'] },
  { token: 'status-ok', min: 3, on: ['surface-0', 'surface-2'] },
  { token: 'status-warn', min: 3, on: ['surface-0', 'surface-2'] },
  { token: 'code-comment', min: 4.5, on: ['surface-0', 'surface-2'] },
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
const rgbaOf = (name) => {
  const m = tokens.match(
    new RegExp(
      `--b16-${name}:\\s*rgba\\(\\s*(\\d+)\\s*,\\s*(\\d+)\\s*,\\s*(\\d+)\\s*,\\s*([\\d.]+)\\s*\\)`,
    ),
  );
  if (!m) throw new Error(`token --b16-${name} is not an rgba() value in src/01-tokens.css`);
  return { rgb: m.slice(1, 4).map(Number), alpha: Number(m[4]) };
};
const composite = ({ rgb, alpha }, background) => {
  const bg = hexToRgb(background);
  return rgbToHex(rgb.map((v, i) => v * alpha + bg[i] * (1 - alpha)));
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
      // the waiver. An unused exception is a hole nobody remembers opening,
      // so it must fail as soon as the colour no longer needs it.
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
  const railRatio = contrast(mix(colour, page, 0.65), page);

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
  if (railRatio < 2.8 || railRatio > 4.6) {
    console.error(`FAIL ${token} rail/page ${railRatio.toFixed(2)} outside 2.80–4.60`);
    failed++;
  }
}

// Binary controls should communicate opposite states with equal visual
// strength. The pale thumb must remain distinct on both rails, while neither
// rail is allowed to become the loudest object in the settings page.
const toggleRatios = ['toggle-off', 'toggle-on'].map((token) => ({
  token,
  page: contrast(hexOf(token), surfaceHex['surface-0']),
  thumb: contrast(hexOf(token), hexOf('text-normal')),
}));
for (const state of toggleRatios) {
  if (state.page < 5 || state.page > 5.5) {
    console.error(`FAIL ${state.token}/page ${state.page.toFixed(2)} outside 5.00–5.50`);
    failed++;
  }
  if (state.thumb < 2.2 || state.thumb > 2.6) {
    console.error(`FAIL ${state.token}/thumb ${state.thumb.toFixed(2)} outside 2.20–2.60`);
    failed++;
  }
}
if (Math.abs(toggleRatios[0].page - toggleRatios[1].page) > 0.03) {
  console.error(
    `FAIL toggle peers differ by ${Math.abs(toggleRatios[0].page - toggleRatios[1].page).toFixed(2)} contrast points`,
  );
  failed++;
}

// Inline code is a compact semantic chip: its text is deliberately vivid,
// while its field is only one surface step above the page.
const inlineCodeText = contrast(hexOf('accent-code'), hexOf('surface-1'));
const inlineCodeField = contrast(hexOf('surface-1'), hexOf('surface-0'));
if (inlineCodeText < 6 || inlineCodeText > 7.5) {
  console.error(`FAIL inline-code text/field ${inlineCodeText.toFixed(2)} outside 6.00–7.50`);
  failed++;
}
if (inlineCodeField < 1.05 || inlineCodeField > 1.15) {
  console.error(`FAIL inline-code field/page ${inlineCodeField.toFixed(2)} outside 1.05–1.15`);
  failed++;
}

// Highlights are intentionally more salient than passive chrome, but their
// interaction states must rise monotonically and preserve effortless text
// reading. This protects both against accidental glare and against making a
// true highlight look muddy.
const highlightSpecs = [
  ['highlight-bg', 1.6, 1.85],
  ['highlight-bg-hover', 1.7, 1.95],
  ['highlight-bg-confirmed', 2, 2.3],
];
const highlightRatios = [];
for (const [token, min, max] of highlightSpecs) {
  const field = composite(rgbaOf(token), hexOf('surface-0'));
  const fieldRatio = contrast(field, hexOf('surface-0'));
  const textRatio = contrast(hexOf('text-strong'), field);
  highlightRatios.push(fieldRatio);
  if (fieldRatio < min || fieldRatio > max) {
    console.error(`FAIL ${token} field/page ${fieldRatio.toFixed(2)} outside ${min.toFixed(2)}–${max.toFixed(2)}`);
    failed++;
  }
  if (textRatio < 7) {
    console.error(`FAIL ${token} text/field ${textRatio.toFixed(2)} < 7.00`);
    failed++;
  }
}
if (!(highlightRatios[0] < highlightRatios[1] && highlightRatios[1] < highlightRatios[2])) {
  console.error(`FAIL highlight states are not strictly increasing: ${highlightRatios.map((v) => v.toFixed(2)).join(' < ')}`);
  failed++;
}

const tagField = composite(rgbaOf('tag-bg'), hexOf('surface-0'));
const tagFieldRatio = contrast(tagField, hexOf('surface-0'));
const tagTextRatio = contrast(hexOf('accent-tag'), tagField);
if (tagFieldRatio < 1.25 || tagFieldRatio > 1.4) {
  console.error(`FAIL tag field/page ${tagFieldRatio.toFixed(2)} outside 1.25–1.40`);
  failed++;
}
if (tagTextRatio < 5.5 || tagTextRatio > 8) {
  console.error(`FAIL tag text/field ${tagTextRatio.toFixed(2)} outside 5.50–8.00`);
  failed++;
}

// Quotes without annotation metadata, TOC and layout callouts share one
// neutral hierarchy: a quiet band, normal title text and a muted icon. This
// is intentionally tested as a component relationship rather than as three
// nearly identical grey endpoints.
const neutralBand = mix(hexOf('callout-neutral'), hexOf('surface-0'), 0.12);
const neutralTitleRatio = contrast(hexOf('text-normal'), neutralBand);
const neutralIconRatio = contrast(hexOf('text-muted'), neutralBand);
if (neutralTitleRatio < 9 || neutralTitleRatio > 12) {
  console.error(
    `FAIL neutral-callout title/band ${neutralTitleRatio.toFixed(2)} outside 9.00–12.00`,
  );
  failed++;
}
if (neutralIconRatio < 6.5 || neutralIconRatio > 9) {
  console.error(
    `FAIL neutral-callout icon/band ${neutralIconRatio.toFixed(2)} outside 6.50–9.00`,
  );
  failed++;
}

// Tabbed deliberately adds no surface of its own. Inactive labels must remain
// effortless to scan on the page, while the shared hover/focus/active button
// rail is allowed one stronger step without becoming a banner.
const tabbedIdleRatio = contrast(hexOf('text-muted'), hexOf('surface-0'));
const tabbedActiveRatio = contrast(hexOf('text-normal'), hexOf('surface-0'));
const tabbedRailRatio = contrast(hexOf('accent-link'), hexOf('surface-0'));
if (tabbedIdleRatio < 6.5 || tabbedIdleRatio > 9) {
  console.error(
    `FAIL tabbed inactive-label/page ${tabbedIdleRatio.toFixed(2)} outside 6.50–9.00`,
  );
  failed++;
}
if (tabbedActiveRatio < 10 || tabbedActiveRatio > 13) {
  console.error(
    `FAIL tabbed active-label/panel ${tabbedActiveRatio.toFixed(2)} outside 10.00–13.00`,
  );
  failed++;
}
if (tabbedRailRatio < 5.5 || tabbedRailRatio > 8) {
  console.error(
    `FAIL tabbed active-rail/panel ${tabbedRailRatio.toFixed(2)} outside 5.50–8.00`,
  );
  failed++;
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
