# Agent Instructions

Brutalist Obsidian theme built on the Base16 Default Dark color scheme.

## Source layout

`theme.css` is a **build artifact** — never edit it by hand. The sources live in `src/`,
one file per concern, and the filename sort order IS the cascade order:

```
src/00-palette.css  01-tokens.css  02-base.css
    10-headings.css 11-text.css 12-lists.css 13-blockquote.css
    20-callouts.css 21-tables.css 22-code.css 23-math.css 24-embeds.css
    25-mermaid.css 26-canvas.css 27-graph.css 30-editor.css
    40-chrome.css 41-modals.css 41-settings.css 42-mobile.css
    50-plugins/{bases,calendar,longform,misc,quick-switcher,quickadd,tabbed,tasks}.css
```

`npm run build` concatenates them into the readable development artifact `theme.css`.
`npm run build:dist` additionally produces the minified release artifact
`dist/theme.css`; never edit or commit that ignored directory. `npm run check` builds and
then runs every gate (source lint, bundle structure, tokens, contrast, scale, variable
resolution, dead tokens, and minified semantic structure). The pre-commit hook runs
`npm run check` and refuses the commit if it fails.

Edit `src/`, run `npm run check`, commit the sources **and** the regenerated `theme.css`
together.

## Design invariants

- Prefer Obsidian public custom properties for values. Target stable semantic classes and
  data attributes; internal Obsidian/plugin DOM selectors require verification against the
  live DOM.
- Define authored colors only in `src/00-palette.css` and `src/01-tokens.css`. Consume
  colors elsewhere through semantic `--b16-*` tokens.
- Use lightness primarily to communicate importance and hue to communicate semantic kind.
- Do not use one accent hue for conflicting semantic meanings. Related manifestations of
  the same role may share a color family.
- Surface, border, and text tokens are separate roles and are not interchangeable.
- Do not increase selector specificity unless required to override verified Obsidian or
  plugin CSS.
- Avoid `:has()` when a stable class or data-attribute alternative exists. Document why it
  is necessary when used.
- Every new `!important` must have an adjacent comment naming the competing rule or the
  runtime evidence that requires it.
- Verify selector changes against the live Obsidian DOM and computed styles.
- Verify rendering changes in Live Preview and Reading View where applicable.
- Capture relevant before/after screenshot frames. Changes to shared tokens or global
  components require the full screenshot suite.
- Before removing a selector, verify that its Obsidian/plugin DOM no longer exists or
  provide runtime-coverage evidence.
- Keep plugin-owned semantics in the plugin's supported configuration when possible.
  Do not replace a plugin's intentional state, highlight, or color contract with a
  theme-side selector merely to fix one composition.

## Obsidian CLI

[Obsidian CLI](https://obsidian.md/help/cli) controls the running app from the terminal.
Use the repository wrappers for normal theme development: they handle the theme cache,
DOM settling, and bounded screenshot capture.

```shell
npm run reload
npm run shots
```

Use raw CLI commands for targeted diagnostics:

```shell
obsidian vault="Obsidian" eval code="app.vault.getFiles().length"
obsidian vault="Obsidian" dev:dom selector=".abyss-panel-view" text
obsidian vault="Obsidian" dev:css selector=".abyss-panel-view" prop=color
obsidian vault="Obsidian" dev:screenshot path=screenshot.png
obsidian vault="Obsidian" devtools
```

Reload a community plugin only after rebuilding that plugin. The Micropatches plugin ID is
`micropatches`:

```shell
obsidian vault="Obsidian" plugin:reload id=micropatches
```

When a plugin configuration change affects rendered Markdown, do not restart Obsidian.
Close the affected note, reload the plugin, then reopen the note so both CodeMirror
decorations and Reading View post-processors are rebuilt from the new configuration.

## Releasing a new version

1. Make sure the working tree is clean and `npm run check` passes.

2. Run the appropriate release script — it bumps `package.json`, `manifest.json`, `versions.json`, commits, tags, and pushes everything:

   ```bash
   npm run release:patch   # 3.1.0 → 3.1.1 (bug fixes, style tweaks)
   npm run release:minor   # 3.1.0 → 3.2.0 (new features)
   npm run release:major   # 3.1.0 → 4.0.0 (breaking changes)
   ```

   The tag workflow verifies the readable artifact, builds `dist/theme.css`, and uploads
   that minified file to the GitHub Release as `theme.css`.
