#!/usr/bin/env python3
"""Verify path references inside the cinematic-web skill.

Two independent checks:

  A. LINKS -- markdown links `](path)` plus inline-code paths that contain a
     separator (references/x.md, toolkit/docs/EVIDENCE.md, kernel/state.ts).
     These are navigational and MUST resolve.

  B. UNIT NAMES -- bare inline-code filenames (`state.ts`, `post.ts`). These are
     prose, not links, but a bare toolkit unit name that does not exist anywhere
     in toolkit/kernel or toolkit/modules is an invented module, which is the
     exact class of error this project has hit before. Names that belong to a
     generated project or a third party are declared in EXPECTED_EXTERNAL.

Exit 1 on any broken link or any unrecognised unit name.
"""
import re
import sys
from pathlib import Path

SKILL = Path(r"C:/Users/HP/.claude/skills/cinematic-web")
PROJECT = Path(r"C:/Users/HP/Desktop/cinematic-web-references")
TOOLKIT = PROJECT / "toolkit"

MD_LINK = re.compile(r"\]\(([^)\s]+?)(?:\s+\"[^\"]*\")?\)")
CODE = re.compile(r"`([^`\n]+?)`")
PATHY = re.compile(r"^[\w./-]+\.(md|ts|tsx|js|mjs|json|glsl|html|css)$")

# Bare filenames that are deliberately not toolkit units.
EXPECTED_EXTERNAL = {
    # files a generated project has, not the toolkit
    "main.ts", "manifest.ts", "assets.ts", "vite.config.ts",
    "index.html", "tsconfig.json",
    "README.md", "CREDITS.md",
    # third-party
    "license.md", "lib.dom.d.ts",
}

broken_links: list[tuple[str, str, str]] = []
unknown_units: list[tuple[str, str]] = []
n_links = 0
n_units = 0

# every unit that really exists in the toolkit
UNITS = {p.name: p.relative_to(PROJECT).as_posix()
         for p in TOOLKIT.rglob("*.ts")}
DOCS = {p.name for p in SKILL.rglob("*.md")}


def link_candidates(ref: str, src: Path) -> list[Path] | None:
    if ref.startswith(("http://", "https://", "#", "mailto:")):
        return None
    ref = ref.split("#", 1)[0].split("?", 1)[0]
    if not ref:
        return None
    if ref.startswith(("toolkit/", "RESEARCH", "ARCHITECTURE")):
        return [PROJECT / ref]
    if ref.startswith("references/"):
        return [SKILL / ref]
    # kernel/state.ts and modules/audio.ts are cited relative to the toolkit root
    return [src.parent / ref, SKILL / ref, SKILL / "references" / ref, TOOLKIT / ref]


for f in sorted(SKILL.rglob("*.md")):
    rel = f.relative_to(SKILL).as_posix()
    text = f.read_text(encoding="utf-8")

    links: set[str] = {m.group(1) for m in MD_LINK.finditer(text)}
    bare: set[str] = set()

    for m in CODE.finditer(text):
        v = m.group(1).strip()
        if not PATHY.match(v):
            continue
        (links if "/" in v else bare).add(v)

    for ref in sorted(links):
        cands = link_candidates(ref, f)
        if cands is None:
            continue
        n_links += 1
        if not any(c.exists() for c in cands):
            broken_links.append((rel, "link", ref))

    for name in sorted(bare):
        if name in EXPECTED_EXTERNAL:
            continue
        n_units += 1
        if name.endswith(".md"):
            # a sibling skill doc, or a top-level project doc (RESEARCH.md, BIBLE.md)
            if name not in DOCS and not (PROJECT / name).exists():
                unknown_units.append((rel, name))
        elif name not in UNITS:
            unknown_units.append((rel, name))

print(f"links checked:      {n_links}")
print(f"unit names checked: {n_units}")

ok = True
if broken_links:
    ok = False
    print(f"\nBROKEN LINKS: {len(broken_links)}")
    for src, kind, ref in broken_links:
        print(f"  {src}  ->  {ref}")
if unknown_units:
    ok = False
    print(f"\nUNRECOGNISED UNIT NAMES: {len(unknown_units)}")
    for src, name in unknown_units:
        print(f"  {src}  ->  {name}")

if not ok:
    sys.exit(1)
print("\nall links resolve; every unit name maps to a real toolkit file")
