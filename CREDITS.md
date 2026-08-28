# Credits and third-party licences

Everything in `reference/` was written by someone else. This file records what it is, where it came
from, and what its licence permits.

**Verification method:** the licence column reflects the actual `LICENSE` file inside each local copy,
read directly — not the README, not a badge, not a generated index. Origin URLs were fetched over HTTP
and confirmed to resolve. Where a URL could not be confirmed, the row says so rather than guessing.

---

## 1. Reference repositories — `reference/repos/`

| local folder | origin | licence (from the LICENSE file) | commercial reuse |
|---|---|---|---|
| `awwwards-3d` | [tsogjavklann/awwwards-3d](https://github.com/tsogjavklann/awwwards-3d) — **verified** | MIT (`Copyright (c) 2026 awwwards-3d skill authors`) | yes, with attribution |
| `lattice-drift` | [Kavtuai/lattice-drift](https://github.com/Kavtuai/lattice-drift) — **verified** | MIT (`Copyright (c) 2026 Lattice Drift contributors`) | yes, with attribution |
| `orbit` | [Dilip-kumar-22/orbit](https://github.com/Dilip-kumar-22/orbit) — **verified** | MIT (`Copyright (c) 2026 Dilip Kumar`) | yes, with attribution |
| `motion-primitives-website` | [itsjwill/motion-primitives-website](https://github.com/itsjwill/motion-primitives-website) — **verified** | MIT **declared** in `package.json` and the README, but **the local copy contains no LICENSE file** | yes; obtain the licence text from upstream before reusing |
| `Webgl-Data-Globe` | its `package.json` points at `https://github.com/shehzadres/globe3d`, which **returns HTTP 404**. Origin unconfirmed | MIT (`Copyright (c) 2025 Globe3D Contributors`) | licence text is present and MIT; the upstream repository could not be located |
| `threejs-scroll-scene` | **not recorded locally.** No origin URL anywhere in the copy; `LICENSE` names `Grant Mantek` | MIT (`Copyright (c) 2026 Grant Mantek`) | licence text is present and MIT; origin unconfirmed |

### Two corrections to earlier notes

- `research/index/LICENSE_INDEX.md` lists `motion-primitives-website` as "MIT License". The licence is
  MIT *by declaration*, but there is **no LICENSE file** in the local copy. The index was generated
  from metadata; this table was read from the files.
- A seventh folder, `cinematic-scroll-skill`, was dropped from this bundle. It downloaded as **zero
  files** — the upstream repository is 882 MB and the fetch never completed. Upstream is
  [MustBeSimo/cinematic-scroll-skill](https://github.com/MustBeSimo/cinematic-scroll-skill), listed in
  `specs/RESEARCH.md`. Nothing was analysed from it and no claim in this repository depends on it.

---

## 2. Third-party skill packages — `reference/skills/`

Seventeen skill packages (32 files) by other authors, harvested for comparison during research.

```
dembrandt-motion-and-storytelling          leonxlnx-soft-skill
ecnu-icalk-custom-scroll-hijacking         majiayu000-gsap-scrolltrigger
gabrielmoreira-design-systems              nexu-io-sprite-animation
henryalouf-scroll-experience               petekp-explainer-visuals
heymegabyte-11-motion-and-interaction      ratnesh-maurya-scroll-experience
ingpoc-scroll-storyteller                  schmandarine-web-motion
kevinzai-interactive-landing                sergeyramas-3d-animation-creator
                                            simota-flow
                                            travisjneuman-ui-animation
                                            yonatangross-scroll-driven-animations
```

**Licence status: unclear for all but one.** Only
`heymegabyte-11-motion-and-interaction-system` mentions licensing at all. The remaining sixteen carry
no licence file and no licence statement.

**Treat all of them as all-rights-reserved.** They are here as prior art — to read, to compare
approaches against, to cite. Do not copy text or code from them into the toolkit, the skill, or client
work without tracing the specific package to its author and checking terms.

---

## 3. The excluded reference

**`https://github.com/davidhckh/portfolio-2025` is not in this repository, and must not be added.**

Its `license.md` restricts use to *"personal and educational purposes only"*, requires attribution to
David Heckhoff and `https://david-hckh.com`, and states that *"Commercial use, resale, or
redistribution of this project or substantial portions of it is prohibited without prior written
permission from the author."*

| allowed | not allowed |
|---|---|
| reading it to understand an approach | copying any file, whole or in part |
| reimplementing a technique from scratch | copying a function, shader, or config block |
| citing it in research notes | shipping any of it to a paying client |

Four patterns were learned from it and independently reimplemented in `toolkit/kernel/` from the maths
up: in/out scene weights, weighted-average waypoint cameras, a parallax group held separate from the
camera, and scene precompilation. **The reimplementation is the deliverable. The original code is not
present here and must never be pasted in.**

Recorded at `toolkit/docs/EVIDENCE.md` §8.1 (with the licence quoted), `toolkit/BIBLE.md`,
`specs/RESEARCH.md`, and as Absolute Rule 3 in `skill/SKILL.md`.

---

## 4. Runtime and build dependencies

Declared in `package.json`; not vendored here. All permit commercial use in client sites.

| package | licence |
|---|---|
| three | MIT |
| gsap 3.13+ | GSAP standard "no-charge" licence — covers client sites, including former Club plugins. Does **not** cover reselling the animation itself as a product |
| lenis | MIT |
| mp4box | BSD-3-Clause |
| vite, typescript, tweakpane, @tweakpane/core, stats-gl, vite-plugin-glsl | MIT / Apache-2.0 |
| sharp | Apache-2.0 |
| @gltf-transform/cli, gltfpack | MIT |
| ffmpeg-static, ffprobe-static | wrappers are MIT; **the ffmpeg binary is LGPL or GPL depending on build.** Fine as a build-time tool; do not bundle a GPL build into a shipped binary |
| gh-pages | MIT |

---

## 5. Assets

No third-party visual or audio assets are included in this repository.

When you add them to a project, keep a `CREDITS.md` in that project with source and licence per file.
The four recurring traps:

- **Fonts** need a *web* licence with a pageview tier that covers the client. A desktop licence does
  not permit `@font-face`. This is the most commonly violated licence in web work.
- **3D models** marked "free for personal use" are not usable in client work. CC0 and CC-BY are.
- **Audio** licences on freesound vary **per file** — CC0, CC-BY, and non-commercial all coexist there.
- **Client-supplied material** — get written confirmation they hold the rights.
