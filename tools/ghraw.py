#!/usr/bin/env python
"""Fetch raw file(s) from GitHub. Usage: ghraw.py owner/repo ref path [path...]

ref may be "auto" to try main/master/dev/develop in order (uses no API quota).
"""
import sys, urllib.request, urllib.error

HDRS = {"User-Agent": "research-agent"}
BRANCHES = ("main", "master", "dev", "develop")
_resolved = {}


def fetch(slug, ref, path):
    url = f"https://raw.githubusercontent.com/{slug}/{ref}/{path}"
    req = urllib.request.Request(url, headers=HDRS)
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            return r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return f"<<HTTP {e.code} for {url}>>"
    except Exception as e:
        return f"<<{type(e).__name__}: {e}>>"


def raw(slug, ref, path):
    if ref != "auto":
        return fetch(slug, ref, path)
    if slug in _resolved:
        return fetch(slug, _resolved[slug], path)
    for br in BRANCHES:
        out = fetch(slug, br, path)
        if not out.startswith("<<HTTP 404"):
            _resolved[slug] = br
            return out
    return f"<<not found on any of {BRANCHES}: {slug}/{path}>>"


if __name__ == "__main__":
    slug, ref = sys.argv[1], sys.argv[2]
    for p in sys.argv[3:]:
        body = raw(slug, ref, p)
        br = _resolved.get(slug, ref)
        print(f"\n{'='*78}\n=== {slug}@{br} :: {p}\n{'='*78}")
        print(body)
