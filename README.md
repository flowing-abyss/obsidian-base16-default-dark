# Base16 Default Dark

[![Available in Obsidian](https://img.shields.io/badge/Available%20in%20Obsidian-7C3AED?logo=obsidian&logoColor=white&style=flat-square)](https://community.obsidian.md/themes/base16-default-dark)
[![Release](https://img.shields.io/github/v/release/flowing-abyss/obsidian-base16-default-dark?style=flat-square&label=release&color=blue)](https://github.com/flowing-abyss/obsidian-base16-default-dark/releases)
[![Downloads](https://img.shields.io/github/downloads/flowing-abyss/obsidian-base16-default-dark/total?style=flat-square&label=downloads&color=blue)](https://github.com/flowing-abyss/obsidian-base16-default-dark/releases)
[![License](https://img.shields.io/github/license/flowing-abyss/obsidian-base16-default-dark?style=flat-square&color=lightgrey)](LICENSE)

**Brutalist. Engineering-grade. Focus-first.**

A no-nonsense Obsidian theme built on the legendary [Base16 Default Dark](https://github.com/chriskempson/base16) color scheme, designed for serious academic research and deep work. Minimal distractions, maximum clarity, pure terminal aesthetics.

![Theme Preview](https://github.com/flowing-abyss/obsidian-base16-default-dark/blob/main/assets/theme.png)

## Setup

### Recommended fonts

The theme pairs well with the IBM Plex family, IBM Plex Sans, IBM Plex Serif, and IBM Plex Mono, along with Noto Color Emoji for emoji.

1. Install [Local Fonts](https://github.com/flowing-abyss/obsidian-local-fonts) from Community Plugins.
2. Download the [prebuilt font pack](https://flowing-abyss.com/local-fonts.zip) and unzip it into a `fonts` folder in your vault root.
3. In Settings, under Local Fonts, assign each role as follows.

| Role | Font |
|---|---|
| Text / Interface | IBM Plex Sans |
| Headings | IBM Plex Serif |
| Monospace | IBM Plex Mono |
| Emoji | Noto Color Emoji |

Fonts load straight from your vault through the plugin's own settings, instead of a CSS snippet or `!important` hack.

### Heading level gutter

Hover a heading to reveal its exact `H1`–`H6` level in the left gutter. For a persistent structural gutter in long-form notes, add the `heading-levels` CSS class to the note properties:

```yaml
cssclasses:
  - heading-levels
```

The labels stay outside the text column and behave identically in Live Preview and Reading view.

## Installation

Available in Obsidian's [Community Themes](https://community.obsidian.md/themes/base16-default-dark).

## License

MIT
