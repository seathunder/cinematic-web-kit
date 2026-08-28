# Cinematic Web Kit

A local, offline, zero-cost production system for building cinematic scroll-driven websites — plus
the research corpus it was derived from.

Everything here runs on one machine. No paid service, no licence fee, no server.

```
cinematic-web-kit/
├── toolkit/        THE PRODUCT — the kernel, the modules, the BIBLE
├── skill/          the Claude Code skill that drives it
├── specs/          the design documents and source briefs
├── research/       analysis of the reference corpus
├── reference/      THIRD-PARTY code and docs — read, do not ship
├── tools/          verification and research helpers
└── Projects/       generated sites go here
```

---

## Start here

| you want to | read |
|---|---|
| understand the whole system | [toolkit/BIBLE.md](toolkit/BIBLE.md) |
| build a site with Claude | [skill/SKILL.md](skill/SKILL.md) — install per [skill/INSTALL.md](skill/INSTALL.md) |
| know why it is built this way | [specs/ARCHITECTURE.md](specs/ARCHITECTURE.md) |
| look up one function | [toolkit/docs/](toolkit/docs/) — 25 guides, nine sections each |
| copy a working scene | [skill/references/recipes.md](skill/references/recipes.md) — 15 recipes |
| fix something broken | [skill/references/troubleshooting.md](skill/references/troubleshooting.md) |
| price a job | [skill/references/business.md](skill/references/business.md) |
| check what is actually verified | [toolkit/docs/EVIDENCE.md](toolkit/docs/EVIDENCE.md) |

---

## What each folder is

### `toolkit/` — the product

The thing that gets used. 25 TypeScript units, all authored here, all typechecking clean.

```
toolkit/
├── kernel/       14 units — loop, state, scroll, weights, camera, renderer, stage,
│                 viewport, quality, assets, dispose, debug, types, index
├── modules/      11 units — post, cursor, audio, transition, text-split, instancing,
│                 frame-sequence, video-scrub, raycast, dom-bridge, preloader
├── docs/         one nine-section guide per unit, plus PATTERNS.md and EVIDENCE.md
├── BIBLE.md      the index into all 25 guides
├── shaders/      EMPTY — GLSL library not yet written
├── templates/    EMPTY — project and scene templates not yet written
├── scripts/      EMPTY — the cw CLI not yet written
└── presets/      EMPTY
```

**Verified:** `tsc -p toolkit/tsconfig.json` exits 0. Every `.ts` file here is byte-identical to the
copy that check was run against, so the result transfers — but you need `npm install` first, since
`node_modules/` is not in the bundle.
**Not verified:** no project scaffolded from this has ever been `npm run build`-ed in a browser.
`toolkit/docs/EVIDENCE.md` §10 records this gap deliberately — do not read the clean typecheck as
"it runs".

### `skill/` — the Claude Code skill

`SKILL.md` routes; ten reference files carry the depth (architecture, kernel API, modules API, syntax,
art direction, design thinking, fullstack, recipes, troubleshooting, business). ~5,100 lines.

Install it by copying into `~/.claude/skills/` — see [skill/INSTALL.md](skill/INSTALL.md).

### `specs/` — the design documents

- `ARCHITECTURE.md` — the build spec, 20 sections
- `RESEARCH.md` — the reference survey, with verified repository URLs and licences
- `briefs/` — the three source documents this project started from

### `research/` — analysis of the corpus

- `analysis/` — a teardown per downloaded repository
- `index/` — cross-cutting indexes (patterns, technology, assets, licences, what to steal)
- `snippets/` — extracted code fragments kept for citation

### `reference/` — third-party, quarantined

Six repositories and seventeen skill packages by other authors. **Read them; do not ship them.**
Licences and the boundary rule: [reference/README.md](reference/README.md), inventory in
[CREDITS.md](CREDITS.md).

### `tools/`

- `check_kit_links.py` — whole-repo link check: every markdown link, every repo-relative path in
  prose, every bare module name. Run it after moving or renaming anything.
- `check_skill_links.py` — the narrower check for the *installed* skill at
  `~/.claude/skills/cinematic-web`. Re-run after editing any skill file.
- `make_zip.py` — repackages the kit, then reopens the archive to verify it.
- `ghcheck.py`, `ghraw.py`, `ghsearch.py` — GitHub inspection over plain HTTP, for environments with
  no `gh` and no `jq`.
- `download/` — the PowerShell scripts that fetched the corpus. Kept for provenance.

### `Projects/`

Where generated sites live. `package.json` declares it as an npm workspace root.

---

## Setup

```bash
npm install
```

If `sharp` or `ffmpeg-static` are missing afterwards, npm 11 blocked their install scripts:

```bash
npm rebuild sharp ffmpeg-static --foreground-scripts
```

Then confirm the toolkit is intact:

```bash
npx tsc -p toolkit/tsconfig.json
```

`node_modules/` is **not** included in this bundle — 602 MB, and fully regenerable from
`package-lock.json`.

---

## The rules that matter most

Six, out of the ten in `skill/SKILL.md`:

1. **Inputs write `.target`; the loop damps `.current`; render reads `.current`.** Never write
   `.current` from an input handler.
2. **Frame-rate independence is not optional.** `f = 1 - Math.pow(1 - ease, delta * 60)`. A naive lerp
   runs **2.4× faster** on a 144 Hz monitor than on a 60 Hz one.
3. **`weight` blends, `local` scrubs.** Confusing them makes an animation play forward then rewind —
   the single most common bug in the system.
4. **One RAF loop.** Everything registers a stage; nothing starts its own.
5. **Scenes never reference each other, and never write the camera.** They declare a waypoint; the rig
   averages.
6. **Words are DOM.** Text in a texture is not selectable, indexable, translatable, or accessible.

And the one legal rule: **never copy code from `github.com/davidhckh/portfolio-2025`.** It is not open
source — personal and educational use only, commercial use prohibited. Its *patterns* were
reimplemented from scratch in `toolkit/kernel/`; its code appears nowhere in this repository and must
never be pasted into client work. `toolkit/docs/EVIDENCE.md` §8.1 quotes the licence.

---

## Licensing

Two separate questions, and they have different answers:

- **Material authored here** — `toolkit/`, `skill/`, `specs/`, `research/`, `tools/`. See
  [LICENSE.md](LICENSE.md). No open-source licence has been applied, which means all rights are
  reserved by default. That is deliberate: this is commercial tooling.
- **Material in `reference/`** — belongs to its authors, under its own licences. See
  [CREDITS.md](CREDITS.md).
"# cinematic-web-kit" 
