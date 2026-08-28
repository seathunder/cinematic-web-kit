#!/usr/bin/env python3
"""Zip the kit for hand-off or backup.

    python tools/make_zip.py                     -> ../cinematic-web-kit.zip
    python tools/make_zip.py D:/out/kit.zip      -> that path

Excludes the same things `.gitignore` does: node_modules (602 MB, regenerable from
package-lock.json), build output, __pycache__, OS junk, and the contents of Projects/.
Everything under reference/ IS included -- it is the third-party corpus and the whole
point of shipping it is that it travels with the research that cites it.

Verifies the archive after writing by reopening it and running testzip(), because a
truncated zip looks fine on disk. Two files in the original corpus turned out to be
failed downloads masquerading as archives; the lesson stuck.
"""

from __future__ import annotations

import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUT = ROOT.parent / f"{ROOT.name}.zip"

SKIP_DIRS = {"node_modules", ".git", "__pycache__", "dist", ".vite", "temp_zips", ".idea"}
SKIP_FILES = {".DS_Store", "Thumbs.db", "desktop.ini", ".env", ".env.local"}
SKIP_SUFFIX = {".pyc", ".tsbuildinfo", ".swp"}


def included(p: Path) -> bool:
    rel = p.relative_to(ROOT)
    if any(part in SKIP_DIRS for part in rel.parts):
        return False
    if p.name in SKIP_FILES or p.suffix in SKIP_SUFFIX:
        return False
    # Projects/ ships as an empty folder, not with whatever is in it locally.
    if rel.parts[0] == "Projects" and p.name != ".gitkeep":
        return False
    return True


def main() -> int:
    out = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else DEFAULT_OUT

    files = sorted(p for p in ROOT.rglob("*") if p.is_file() and included(p))
    raw = sum(p.stat().st_size for p in files)

    if out.exists():
        print(f"overwriting {out}")

    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for p in files:
            # Nest under the folder name so extracting does not spray into cwd.
            z.write(p, Path(ROOT.name) / p.relative_to(ROOT))

    # Verify by reopening. Never trust a write you have not read back.
    with zipfile.ZipFile(out) as z:
        bad = z.testzip()
        n = len(z.namelist())

    packed = out.stat().st_size
    print(f"\n{out}")
    print(f"  files      : {n}  (source: {len(files)})")
    print(f"  uncompressed: {raw / 1024 / 1024:.2f} MB")
    print(f"  compressed  : {packed / 1024 / 1024:.2f} MB  ({packed / raw:.0%})")
    print(f"  integrity   : {'OK' if bad is None else f'CORRUPT at {bad}'}")

    ok = bad is None and n == len(files)
    if not ok and n != len(files):
        print(f"  MISMATCH    : archive has {n} entries, expected {len(files)}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
