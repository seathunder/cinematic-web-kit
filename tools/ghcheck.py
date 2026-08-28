#!/usr/bin/env python
"""Verify GitHub repos: existence, metadata, and top-level tree. Read-only."""
import json, sys, urllib.request, urllib.error

API = "https://api.github.com"
HDRS = {"Accept": "application/vnd.github+json", "User-Agent": "research-agent"}


def get(url):
    req = urllib.request.Request(url, headers=HDRS)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        return {"__error__": f"HTTP {e.code}"}
    except Exception as e:
        return {"__error__": f"{type(e).__name__}: {e}"}


def check(slug):
    r = get(f"{API}/repos/{slug}")
    if "__error__" in r:
        print(f"\n### {slug}  ==> UNAVAILABLE ({r['__error__']})")
        return
    lic = (r.get("license") or {}).get("spdx_id") or "NONE"
    print(f"\n### {slug}")
    print(f"url       : {r['html_url']}")
    print(f"desc      : {r.get('description')}")
    print(f"stars/fork: {r['stargazers_count']}/{r['forks_count']}   watchers={r['subscribers_count']}")
    print(f"lang      : {r.get('language')}   size={r['size']}KB   license={lic}")
    print(f"created   : {r['created_at'][:10]}   pushed={r['pushed_at'][:10]}   archived={r['archived']}")
    print(f"topics    : {','.join(r.get('topics') or [])}")
    print(f"homepage  : {r.get('homepage')}")

    langs = get(f"{API}/repos/{slug}/languages")
    if "__error__" not in langs:
        tot = sum(langs.values()) or 1
        print("langs%    : " + ", ".join(f"{k} {100*v//tot}%" for k, v in
                                         sorted(langs.items(), key=lambda x: -x[1])[:6]))

    br = r.get("default_branch", "main")
    tree = get(f"{API}/repos/{slug}/git/trees/{br}?recursive=1")
    if "__error__" in tree:
        print("tree      : " + tree["__error__"])
        return
    paths = [t["path"] for t in tree.get("tree", []) if t["type"] == "blob"]
    print(f"files     : {len(paths)}  (truncated={tree.get('truncated')})")
    skip = ("node_modules/", ".git/", "package-lock", "yarn.lock", "pnpm-lock")
    code = [p for p in paths if not any(s in p for s in skip)]
    # show interesting code/asset files
    interesting = [p for p in code if p.lower().endswith(
        (".js", ".jsx", ".ts", ".tsx", ".glsl", ".vert", ".frag", ".vs", ".fs",
         ".json", ".html", ".css", ".scss", ".md", ".glb", ".gltf", ".hdr", ".exr",
         ".mp4", ".webm", ".ktx2", ".basis", ".py", ".mjs"))]
    for p in interesting[:110]:
        sz = next((t.get("size") for t in tree["tree"] if t["path"] == p), "")
        print(f"  {p}  [{sz}]")
    if len(interesting) > 110:
        print(f"  ... +{len(interesting)-110} more")
    # count heavy asset dirs
    imgs = [p for p in paths if p.lower().endswith((".jpg", ".jpeg", ".png", ".webp", ".avif"))]
    if imgs:
        print(f"images    : {len(imgs)} (e.g. {imgs[:3]})")


if __name__ == "__main__":
    for slug in sys.argv[1:]:
        check(slug)
