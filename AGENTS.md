# Agent Instructions

Brutalist Obsidian theme built on the Base16 Default Dark color scheme. Single file: `theme.css`. Version tracked in `manifest.json` and `versions.json`.

## Releasing a new version

Always use npm scripts — never bump versions or tags manually:

```bash
npm run release:patch   # 3.1.0 → 3.1.1 (bug fixes, style tweaks)
npm run release:minor   # 3.1.0 → 3.2.0 (new features)
npm run release:major   # 3.1.0 → 4.0.0 (breaking changes)
```

Each script updates `manifest.json`, `versions.json`, commits, tags, and pushes automatically.
