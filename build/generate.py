#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = ["markdown>=3.5"]
# ///
"""Minimal static site generator for a date-named markdown diary.

Reads ``posts/*.md`` -- where each filename IS the entry's date/title
(``YYYY-MM-DD``, optionally ``YYYY-MM-DD-HHmm``, optionally with a trailing
``-slug``) -- and renders a clean static site into ``_site/``:

    index.html    all entries, newest first, grouped by year -> month
    <name>.html   one page per entry, with older/newer navigation
    style.css     copied verbatim from build/style.css

The only third-party dependency is ``markdown`` (``pip install markdown``).
Everything else is the standard library.
"""

from __future__ import annotations

import re
import shutil
from dataclasses import dataclass
from datetime import datetime
from html import escape
from pathlib import Path

import markdown

# --- Configuration -----------------------------------------------------------

SITE_TITLE = "Journal"   # <- change to taste (e.g. your name, or "日记")
SITE_LANG = "zh"         # <- html lang attribute

ROOT = Path(__file__).resolve().parent.parent
POSTS_DIR = ROOT / "posts"
STYLE_SRC = ROOT / "build" / "style.css"
OUT_DIR = ROOT / "_site"

# --- Filename parsing --------------------------------------------------------

# YYYY-MM-DD, with an optional -HHmm time and an optional -slug. Deliberately
# tolerant so the blog can grow past daily entries without code changes.
NAME_RE = re.compile(
    r"^(?P<y>\d{4})-(?P<m>\d{2})-(?P<d>\d{2})"
    r"(?:[-_ ](?P<H>\d{2})(?P<M>\d{2}))?"
    r"(?:[-_](?P<slug>.+))?$"
)

MONTHS = [
    "", "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]

# --- Content cleanup (cheap insurance for Obsidian-sourced notes) ------------

FRONTMATTER_RE = re.compile(r"\A---\r?\n.*?\r?\n---\r?\n", re.DOTALL)
EMBED_RE = re.compile(r"!\[\[[^\]]+\]\]")               # ![[image]] -> dropped
WIKILINK_RE = re.compile(r"\[\[([^\]|]+)(?:\|([^\]]+))?\]\]")  # [[a|b]] -> b


def clean(text: str) -> str:
    text = FRONTMATTER_RE.sub("", text, count=1)
    text = EMBED_RE.sub("", text)
    text = WIKILINK_RE.sub(lambda m: m.group(2) or m.group(1), text)
    return text


def render_body(text: str) -> str:
    # nl2br: single newlines become <br>, which reads better for journal prose.
    return markdown.markdown(
        clean(text),
        extensions=["extra", "sane_lists", "nl2br"],
        output_format="html5",
    )


# --- Model -------------------------------------------------------------------

@dataclass
class Post:
    name: str          # filename stem; also the URL stem (<name>.html)
    title: str         # heading shown on the page
    sort_key: tuple    # for newest-first ordering
    year: int | None
    month: int | None
    html: str          # rendered body

    @property
    def url(self) -> str:
        return f"{self.name}.html"


def parse_name(stem: str) -> tuple[str, tuple, int | None, int | None]:
    """Return (title, sort_key, year, month) for a post filename stem."""
    mo = NAME_RE.match(stem)
    if not mo:
        # Not date-shaped: still publish it, titled and sorted by its name.
        # First key element 0 keeps these below dated posts (which use 1).
        return stem, (0, stem), None, None

    y, m, d = int(mo["y"]), int(mo["m"]), int(mo["d"])
    if mo["H"] is not None:
        H, M = int(mo["H"]), int(mo["M"])
        title = f"{y:04d}-{m:02d}-{d:02d} {H:02d}:{M:02d}"
        when = datetime(y, m, d, H, M)
    else:
        title = f"{y:04d}-{m:02d}-{d:02d}"
        when = datetime(y, m, d)
    if mo["slug"]:
        title = f"{title} · {mo['slug'].replace('-', ' ')}"
    return title, (1, when.timestamp()), y, m


def load_posts() -> list[Post]:
    posts: list[Post] = []
    for path in sorted(POSTS_DIR.glob("*.md")):
        title, sort_key, year, month = parse_name(path.stem)
        html = render_body(path.read_text(encoding="utf-8"))
        posts.append(Post(path.stem, title, sort_key, year, month, html))
    posts.sort(key=lambda p: p.sort_key, reverse=True)  # newest first
    return posts


# --- Rendering ---------------------------------------------------------------

def page(title: str, body: str) -> str:
    """Wrap inner HTML (trusted) in the page shell."""
    return (
        "<!DOCTYPE html>\n"
        f'<html lang="{SITE_LANG}">\n<head>\n'
        '<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
        f"<title>{escape(title)}</title>\n"
        '<link rel="stylesheet" href="style.css">\n'
        "</head>\n<body>\n<main>\n" + body + "\n</main>\n</body>\n</html>\n"
    )


def build_index(posts: list[Post]) -> str:
    parts = [f'<h1 class="site-title">{escape(SITE_TITLE)}</h1>']
    cur_year: object = object()   # sentinels so the first post emits a header
    cur_month: object = object()
    open_list = False

    def close() -> None:
        nonlocal open_list
        if open_list:
            parts.append("</ul>")
            open_list = False

    for p in posts:
        if p.year != cur_year:
            close()
            cur_year = p.year
            cur_month = object()
            parts.append(f'<h2 class="year">{p.year if p.year is not None else "Other"}</h2>')
        if p.month != cur_month:
            close()
            cur_month = p.month
            if p.month is not None:
                parts.append(f'<h3 class="month">{MONTHS[p.month]}</h3>')
            parts.append('<ul class="entries">')
            open_list = True
        parts.append(f'<li><a href="{escape(p.url)}">{escape(p.title)}</a></li>')
    close()
    return "\n".join(parts)


def build_post(posts: list[Post], i: int) -> str:
    p = posts[i]
    newer = posts[i - 1] if i > 0 else None          # more recent
    older = posts[i + 1] if i + 1 < len(posts) else None

    def link(post: Post | None, cls: str, fmt: str) -> str:
        if post is None:
            return "<span></span>"
        return f'<a class="{cls}" href="{escape(post.url)}">{escape(fmt.format(post.title))}</a>'

    return (
        '<nav class="post-nav top"><a href="index.html">← all entries</a></nav>\n'
        '<article>\n'
        f'<h1 class="post-title">{escape(p.title)}</h1>\n'
        f"{p.html}\n"
        '</article>\n'
        '<nav class="post-nav bottom">\n'
        f'{link(older, "older", "← {0}")}\n'
        '<a class="home" href="index.html">all entries</a>\n'
        f'{link(newer, "newer", "{0} →")}\n'
        '</nav>'
    )


# --- Build -------------------------------------------------------------------

def main() -> None:
    if not POSTS_DIR.exists():
        raise SystemExit(f"posts directory not found: {POSTS_DIR}")

    posts = load_posts()

    if OUT_DIR.exists():
        shutil.rmtree(OUT_DIR)
    OUT_DIR.mkdir(parents=True)

    (OUT_DIR / "index.html").write_text(page(SITE_TITLE, build_index(posts)), encoding="utf-8")
    for i, p in enumerate(posts):
        html = page(f"{p.title} — {SITE_TITLE}", build_post(posts, i))
        (OUT_DIR / p.url).write_text(html, encoding="utf-8")

    if STYLE_SRC.exists():
        shutil.copyfile(STYLE_SRC, OUT_DIR / "style.css")

    print(f"Built {len(posts)} post(s) -> {OUT_DIR}")


if __name__ == "__main__":
    main()
