# Blog Sync (Obsidian plugin)

Copies the selected note into your blog repo's `posts/` folder and (optionally)
commits & pushes it, so it deploys via GitHub Actions automatically.

Desktop only — it uses Node's filesystem and runs `git`.

## Build

Requires Node.js.

```sh
cd obsidian-plugin
npm install
npm run build      # type-checks, then produces main.js
```

For live development use `npm run dev` (rebuilds on change).

## Install into your vault

Copy the build output into a plugin folder inside your vault:

```sh
VAULT="/path/to/your/vault"
mkdir -p "$VAULT/.obsidian/plugins/blog-sync"
cp manifest.json main.js "$VAULT/.obsidian/plugins/blog-sync/"
```

Or symlink, so rebuilds are picked up automatically:

```sh
ln -s "$(pwd)/manifest.json" "$VAULT/.obsidian/plugins/blog-sync/manifest.json"
ln -s "$(pwd)/main.js"       "$VAULT/.obsidian/plugins/blog-sync/main.js"
```

Then in Obsidian: **Settings → Community plugins** (turn off Restricted Mode the
first time), enable **Blog Sync**, open its settings, and set **Blog repo path**
to your locally-cloned blog repo — the folder that contains `posts/`.

## Use

- Open a note and run **"Publish current note to blog"** from the command palette
  (Cmd/Ctrl-P), or
- Right-click a note — or a multi-file selection — in the file explorer →
  **Publish to blog**.

Naming: if the note is named like `2026-06-18` (or `2026-06-18-1430`) that exact
name is kept; otherwise the entry is stamped with the current date (and a `-HHmm`
time only if today's file already exists, so nothing is overwritten).

With **Auto commit & push** enabled, the post is committed and pushed for you and
GitHub Actions deploys it. Turn it off to copy only and push yourself.

## Settings

| Setting | Meaning |
| --- | --- |
| **Blog repo path** | Absolute path to the cloned blog repo (contains `posts/`). |
| **Posts subfolder** | Folder inside the repo to write into (default `posts`). |
| **Auto commit & push** | Run `git add/commit/push` after copying (default on). |
| **Commit message** | Template; `{name}` is replaced with the entry name. |

## Notes

- Git shell quoting uses POSIX syntax; on Windows, repo paths with spaces may need
  adjustment.
- Pushing assumes the repo's `main` branch tracks a remote you can push to. If a
  push is rejected (e.g. the remote moved on), pull/rebase in the repo and re-run.
