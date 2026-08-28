#!/usr/bin/env python
"""GitHub repo search. Usage: ghsearch.py "query" [sort] [limit]"""
import json, sys, urllib.parse, urllib.request, urllib.error

API = "https://api.github.com/search/repositories"
HDRS = {"Accept": "application/vnd.github+json", "User-Agent": "research-agent"}


def search(q, sort="stars", limit=25):
    params = {"q": q, "sort": sort, "order": "desc", "per_page": str(limit)}
    url = f"{API}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers=HDRS)
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            data = json.load(r)
    except urllib.error.HTTPError as e:
        print(f"<<HTTP {e.code}>> {e.read()[:200]}")
        return
    print(f"\n@@@ QUERY: {q}   (total={data.get('total_count')})")
    for it in data.get("items", []):
        lic = (it.get("license") or {}).get("spdx_id") or "NONE"
        desc = (it.get("description") or "")[:110].replace("\n", " ")
        print(f"{it['stargazers_count']:>6}* {it['full_name']:<52} {lic:<12} "
              f"{(it.get('language') or '-'):<12} push={it['pushed_at'][:7]}")
        print(f"        {desc}")


if __name__ == "__main__":
    q = sys.argv[1]
    sort = sys.argv[2] if len(sys.argv) > 2 else "stars"
    lim = int(sys.argv[3]) if len(sys.argv) > 3 else 25
    search(q, sort, lim)
