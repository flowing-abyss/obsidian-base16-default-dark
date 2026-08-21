# Agent Instructions

Brutalist Obsidian theme built on the Base16 Default Dark color scheme.

## Source layout

`theme.css` is a **build artifact** — never edit it by hand. The sources live in `src/`,
one file per concern, and the filename sort order IS the cascade order:

```
src/00-palette.css  01-tokens.css  02-base.css
    10-headings.css 11-text.css 12-lists.css 13-blockquote.css
    20-callouts.css 21-tables.css 22-code.css 23-math.css 24-embeds.css
    30-editor.css   40-chrome.css 41-modals.css 41-settings.css
    50-plugins/*.css
```

`npm run build` concatenates them into `theme.css`. `npm run check` builds and then runs
every gate (lint, normalize test, tokens, contrast, scale, vars). The pre-commit hook runs
`npm run check` and refuses the commit if it fails.

Edit `src/`, run `npm run check`, commit the sources **and** the regenerated `theme.css`
together.

## Releasing a new version

1. Make sure the working tree is clean and `npm run check` passes.

2. Run the appropriate release script — it bumps `package.json`, `manifest.json`, `versions.json`, commits, tags, and pushes everything:
   ```bash
   npm run release:patch   # 3.1.0 → 3.1.1 (bug fixes, style tweaks)
   npm run release:minor   # 3.1.0 → 3.2.0 (new features)
   npm run release:major   # 3.1.0 → 4.0.0 (breaking changes)
   ```
