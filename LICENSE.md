# Licence

## Material authored in this repository

`toolkit/`, `skill/`, `specs/`, `research/`, `tools/`, and the top-level documents.

**No open-source licence has been applied. All rights reserved.**

That is the deliberate default, not an oversight. Under copyright, work with no licence attached is
all-rights-reserved automatically — which is what you want for commercial tooling you intend to use in
paid client work. Applying MIT to this repository would let anyone, including a competitor, take the
kernel and the skill and use them commercially.

### If you later want to publish part of it

Pick per folder, not for the whole repository:

| folder | consideration |
|---|---|
| `toolkit/kernel/` + `toolkit/modules/` | **the asset.** Keep it reserved. This is the thing that makes the work repeatable and fast |
| `skill/` | reserved. It encodes the same knowledge in instruction form |
| `specs/`, `research/` | harmless to publish; also the strongest possible portfolio artefact. MIT or CC-BY both work |
| `tools/` | trivial helpers. MIT if you want |

If you do publish something, add a `LICENSE` file **inside that folder** so the boundary is
unambiguous, and leave this file in place at the root.

### In client contracts

State which of the two you are doing, because they are different deals:

> Reusable framework code remains the property of the developer and is licensed to the client for use
> in this project.

or

> All code produced under this agreement transfers to the client on final payment.

The first is normal in this field and no client has reason to object — they are buying a site, not a
framework. The second is worth more money and you should charge for it.

---

## Material authored by others

`reference/` — every item belongs to its author, under its own licence. Inventory, verified licences,
and the reuse boundary: [CREDITS.md](CREDITS.md).

Runtime and build dependencies are declared in `package.json`, not vendored here. Their licences are
listed in [CREDITS.md](CREDITS.md) §4.

---

## The one hard exclusion

`github.com/davidhckh/portfolio-2025` is **not** open source. Personal and educational use only;
commercial use, resale, and redistribution prohibited without written permission. Its code is not in
this repository and must not be added. Patterns learned from it were reimplemented from scratch.

Full text of the finding: `toolkit/docs/EVIDENCE.md` §8.1. Summary and the allowed/not-allowed table:
[CREDITS.md](CREDITS.md) §3.
