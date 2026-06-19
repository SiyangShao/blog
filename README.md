# Journal

A minimal, plain-markdown diary. One file per entry in [`posts/`](posts), named by
date (`YYYY-MM-DD.md`). On every push, GitHub Actions builds a small static site and
GitHub Pages serves it. No framework, no front-matter required.

## Writing

Create a file in `posts/` whose **name is the date** (the date is the title):

```
posts/2026-06-18.md
```

The body is plain markdown. Push it and it's live. Optional name variants also work:

- `posts/2026-06-18-1430.md` — add a time (`HH:mm`), e.g. for multiple entries a day
- `posts/2026-06-18-trip.md` — add a short slug after the date

## How it builds

[`build/generate.py`](build/generate.py) reads `posts/*.md`, sorts newest-first,
groups them by **year → month**, and writes a static site into `_site/`. Its one
dependency, `markdown`, is declared inline in the script (PEP 723) and installed on
demand by `uv run`. The whole theme is one file, [`build/style.css`](build/style.css).

Preview locally before pushing — [uv](https://docs.astral.sh/uv/) reads the script's
inline dependencies and provisions Python + `markdown` automatically:

```sh
uv run build/generate.py
python -m http.server -d _site 8000     # open http://localhost:8000
```

> No uv? Fall back to `pip install markdown && python build/generate.py`.

## One-time GitHub Pages setup

After the first push to GitHub, open **Settings → Pages → Build and deployment →
Source** and choose **GitHub Actions**. Every push to `main` then deploys
automatically; the live URL shows up in the Actions run and on the Pages settings page.

## Publishing from Obsidian

[`obsidian-plugin/`](obsidian-plugin) is a small Obsidian plugin that copies the
selected note into this repo's `posts/` folder and (optionally) commits & pushes it,
so it deploys automatically. See [`obsidian-plugin/README.md`](obsidian-plugin/README.md)
for build & install steps.

## Customizing

- **Site title / language:** edit `SITE_TITLE` / `SITE_LANG` at the top of `build/generate.py`.
- **Look & feel:** edit `build/style.css` (light/dark are handled via `prefers-color-scheme`).
