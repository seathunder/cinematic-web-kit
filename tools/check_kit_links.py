#!/usr/bin/env python3
"""Whole-repo link check for the cinematic-web kit.

Run from the repository root:

    python tools/check_kit_links.py

Why this exists
---------------
This repository was assembled by moving folders around. Moving a folder silently
breaks every relative link that pointed across the boundary, and a broken relative
link in markdown looks exactly like a working one when you read it. Exactly one bug
of that class has already happened here: `](../RESEARCH.md)` inside
`toolkit/docs/EVIDENCE.md` resolved to a nonexistent `toolkit/RESEARCH.md`, and no
amount of proofreading caught it. A script did.

Three independent checks
------------------------
A. LINKS       markdown `](path)` targets. Must resolve. These are the ones a reader
               actually clicks, so a failure here is a real defect.
B. PROSE PATHS inline-code strings that look like paths. Only flagged when the first
               segment names a real top-level folder of *this* repository -- i.e.
               when the author clearly meant a repo-relative path. A string like
               `src/scene.js` inside a teardown of someone else's repo is correct
               prose about their layout, not a broken reference to ours.
C. UNIT NAMES  bare inline-code filenames like `state.ts`. Must match a real file
               somewhere in the authored trees, or be in EXPECTED_EXTERNAL. Guards
               against documenting a module that does not exist -- which has happened
               four times in this project's history. Applied only to `toolkit/` and
               `skill/`, because `research/` and `specs/` are teardowns of other
               people's code and naming their files is the whole point.

Scope
-----
Authored material only: the top-level documents, `toolkit/`, `skill/`, `specs/`,
`research/`, `tools/`. `reference/` is deliberately skipped -- it is third-party
markdown whose internal links point at their own repository layouts. Those links
were already broken on arrival, they are not ours to fix, and fixing them would
mean editing files we have explicitly promised not to modify.

Exit code is 1 if anything fails, so it is usable as a pre-commit gate.
"""

from __future__ import annotations

import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

MD_LINK = re.compile(r"\]\(([^)\s]+?)(?:\s+\"[^\"]*\")?\)")
CODE = re.compile(r"`([^`\n]+?)`")
PATHY = re.compile(r"^[\w./@-]+\.(md|ts|tsx|js|mjs|json|glsl|html|css|py|ps1|txt)$")
HEADING = re.compile(r"^#{1,6}\s+(.*?)\s*$", re.M)
FENCE = re.compile(r"^\s*```")

# Filenames a project scaffolded from this kit would have, but this kit does not.
# Mentioning them in prose is correct, not a broken reference.
EXPECTED_EXTERNAL = {
    "main.ts", "manifest.ts", "assets.ts", "vite.config.ts", "index.html",
    "tsconfig.json", "license.md", "lib.dom.d.ts", "cli.mjs", "package.json",
    "package-lock.json", "style.css", "app.ts", "sw.js", "robots.txt",
    "sitemap.xml", "_headers", "index.ts",
}

# Resolution roots, tried in order after the containing directory.
ROOTS = [ROOT, ROOT / "toolkit", ROOT / "skill"]


def slugify(heading: str) -> str:
    """GitHub-style anchor slug."""
    h = re.sub(r"`|\*|_|\[|\]|\(|\)", "", heading).strip().lower()
    h = "".join(c for c in h if unicodedata.category(c)[0] not in "PS" or c in "- ")
    return re.sub(r"\s+", "-", h).strip("-")


def strip_fences(text: str) -> str:
    """Blank out fenced code blocks so example code is not link-checked."""
    out, inside = [], False
    for line in text.splitlines():
        if FENCE.match(line):
            inside = not inside
            out.append("")
            continue
        out.append("" if inside else line)
    return "\n".join(out)


SKIP_PARTS = {"node_modules", ".git", "__pycache__"}
SKIP_TREES = {"reference"}  # third-party markdown -- not ours to fix. See docstring.


def main() -> int:
    all_md = sorted(
        p for p in ROOT.rglob("*.md")
        if not any(part in SKIP_PARTS for part in p.parts)
    )
    md_files = [p for p in all_md if p.relative_to(ROOT).parts[0] not in SKIP_TREES]
    n_skipped = len(all_md) - len(md_files)

    # Every filename in the authored trees. A bare `foo.ts` / `foo.py` in prose must
    # name one of these -- otherwise it is a module that does not exist.
    units: set[str] = set()
    for tree in ("toolkit", "skill", "tools"):
        d = ROOT / tree
        if d.exists():
            units |= {p.name for p in d.rglob("*") if p.is_file()}

    # Top-level folders of this repo. A prose path starting with one of these is
    # addressing *us* and must resolve; anything else is describing someone else's
    # layout and is left alone.
    own_trees = {p.name for p in ROOT.iterdir() if p.is_dir() and not p.name.startswith(".")}

    bad_links: list[str] = []
    bad_prose: list[str] = []
    bad_units: list[str] = []
    bad_anchors: list[str] = []
    n_links = n_prose = n_units = n_anchors = 0

    for md in md_files:
        raw = md.read_text(encoding="utf-8", errors="replace")
        prose = strip_fences(raw)
        rel = md.relative_to(ROOT).as_posix()
        own_anchors = {slugify(h) for h in HEADING.findall(raw)}
        # Only our own docs are held to the unit-name rule -- see docstring check C.
        check_units = md.relative_to(ROOT).parts[0] in {"toolkit", "skill"}

        links: list[str] = []
        prose_paths: list[str] = []

        for m in MD_LINK.finditer(prose):
            t = m.group(1)
            if t.startswith(("http://", "https://", "mailto:")):
                continue
            if t.startswith("#"):
                n_anchors += 1
                if slugify(t[1:]) not in own_anchors:
                    bad_anchors.append(f"{rel}: #{t[1:]}")
                continue
            links.append(t)

        # Inline-code strings that look like paths.
        for m in CODE.finditer(prose):
            s = m.group(1).strip().rstrip(",.;:")
            is_dir = bool(re.fullmatch(r"[\w./@-]+/", s)) and "/" in s.rstrip("/")
            if not PATHY.match(s) and not is_dir:
                continue
            if "/" in s:
                prose_paths.append(s)
            elif check_units:
                n_units += 1
                if s not in units and s not in EXPECTED_EXTERNAL and not s.endswith(".md"):
                    bad_units.append(f"{rel}: `{s}`")

        def resolves(t: str) -> bool:
            t = t.split("#", 1)[0]
            if not t:
                return True
            if "*" in t:  # glob in prose, e.g. toolkit/docs/kernel/*.md
                return (md.parent / t).parent.exists() or any(
                    (r / t).parent.exists() for r in ROOTS
                )
            return (md.parent / t).exists() or any((r / t).exists() for r in ROOTS)

        for t in links:
            n_links += 1
            if not resolves(t):
                bad_links.append(f"{rel}: {t}")

        for t in prose_paths:
            head = t.lstrip("./").split("/", 1)[0]
            if t.startswith("/") or head not in own_trees:
                continue  # runtime URL, or someone else's layout
            n_prose += 1
            if not resolves(t):
                bad_prose.append(f"{rel}: `{t}`")

    print(f"markdown files : {len(md_files)} checked, {n_skipped} skipped under reference/")
    print(f"authored files : {len(units)} indexed by name")
    print(f"links checked  : {n_links}")
    print(f"prose paths    : {n_prose} repo-relative (of many; the rest describe other repos)")
    print(f"unit names     : {n_units}")
    print(f"anchors        : {n_anchors}")
    print()

    ok = True
    for label, items in (("BROKEN LINKS", bad_links),
                         ("BROKEN REPO-RELATIVE PROSE PATHS", bad_prose),
                         ("UNKNOWN UNIT NAMES", bad_units),
                         ("BROKEN ANCHORS", bad_anchors)):
        if items:
            ok = False
            print(f"{label} ({len(items)}):")
            for i in items:
                print(f"  {i}")
            print()

    print("PASS -- everything resolves" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
