# THE BIBLE

**The cinematic web toolkit — what every unit is, when to use it, and the rules that must not be broken.**

This document is the entry point. It is written for a future agent (or a future you) with no memory
of how any of this was built. Read this file first, then read only the guide for the unit you need.

- Reference library root: `toolkit/`
- Per-unit guides: [`toolkit/docs/kernel/`](docs/kernel/) and [`toolkit/docs/modules/`](docs/modules/)
- Composition patterns and art direction: [`docs/PATTERNS.md`](docs/PATTERNS.md)
- Verified facts, with evidence: [`docs/EVIDENCE.md`](docs/EVIDENCE.md)
- Client projects: `Projects/` (npm workspace)

Status: 14 kernel files + 11 modules, all compiling clean under
`npx --no-install tsc -p toolkit/tsconfig.json` (strict, `noUnusedLocals`, `noUnusedParameters`).

---

## 1. The ten laws

These are not style preferences. Each one exists because breaking it produced a specific bug that
took real time to find. Everything else in the toolkit follows from them.

### Law 1 — Inputs write `.target`. The loop damps `.current`. Rendering reads `.current`.

```ts
state.pointerX.target = x        // input handler
damp(state.pointerX, delta)      // one stage, once per frame
mesh.position.x = state.pointerX.current * 2   // render
```

Never damp inside an event handler: `pointermove` fires at the pointer's polling rate, not the
frame rate, so the easing speed becomes a function of the user's mouse.

### Law 2 — Damping must be frame-rate independent.

```ts
const f = 1 - Math.pow(1 - ease, delta * 60)
s.current += (s.target - s.current) * f
```

The naive `current += (target - current) * ease` closes **2.4× faster at 144Hz than at 60Hz**. That
is the single most common reason a site feels "right on my machine, sluggish on the client's" — or
the reverse, twitchy on a gaming monitor. `damp()` in `kernel/state.ts` is the only correct form.

### Law 3 — Scenes never reference each other, and never write to the shared camera.

A scene declares a `waypoint`. The camera is the **weighted average of every active waypoint**:

```
position = Σ(waypointᵢ × weightᵢ) / Σ(weightᵢ)
```

Consequence: inserting or deleting a scene never re-times its siblings. This is the difference
between a site you can revise for a client in ten minutes and one where every change breaks the
timing of everything after it.

### Law 4 — `weight` and `local` are different numbers.

| | shape | value at start / middle / end | use for |
|---|---|---|---|
| `ctx.frame.weight` | bell | 0 → 1 → 0 | blending: opacity, scale, bloom, camera influence |
| `ctx.frame.local` | ramp | 0 → 0.5 → 1 | scrubbing: timelines, video, frame sequences |

Confusing them is the most common scene bug. Symptom of using `weight` to scrub: the animation
plays forward then rewinds itself as the section leaves. Symptom of using `local` to blend: the
scene never fades out.

`weight = clamp(in × (1 − out))`.

### Law 5 — Never measure layout inside the loop.

`getBoundingClientRect()` forces a synchronous layout. Doing it per element per frame is what makes
a page feel heavy for no visible reason.

Measure once into **document space** (`rect.top + window.scrollY`), cache it, and convert to
viewport space each frame by subtracting the scroll value the kernel already has. Re-measure only
when `state.pageReflow` changes.

### Law 6 — Loop order is declared, not hoped for.

```ts
addStage({ order: 970, name: 'picker', after: ['scenes'], fn })
```

`after` is an assertion checked at registration: it **throws** if the dependency is not registered.
A silent ordering bug (picker running before camera, so hit tests use last frame's matrices) is
invisible; a throw at boot is not.

### Law 7 — Every GPU allocation has a matching disposal, and disposal is refcounted.

Three does not garbage-collect VRAM. A geometry, a texture and a program stay resident until
`.dispose()`. `disposeObject()` walks ~25 texture slots per material plus ShaderMaterial uniforms
plus light shadow maps, using `Set`s so a shared resource is disposed exactly once.

Distinguish **deactivate** (keep in VRAM, stop updating — the default) from **dispose** (free it,
only worth it above ~15MB and only behind a one-way transition).

`VideoFrame` and `ImageBitmap` hold memory the JS GC does not manage. Every one that leaves a cache
must be `.close()`d, and the leak will not appear in a JS heap snapshot.

### Law 8 — Quality tiers demote only, and DPR is the biggest lever.

GPU cost scales with the **square** of DPR. Going 2 → 1.5 is a 44% pixel reduction and usually
invisible. Never promote at runtime: a device that stuttered once will stutter again, and
oscillating quality is worse than either level.

### Law 9 — There are five renderer kinds, and `three` is not the answer to everything.

`'three' | 'canvas2d' | 'video' | 'dom' | 'none'`. A text-and-images editorial section should be
`dom`. A scrubbed film sequence should be `video`. Reaching for WebGL where CSS suffices costs a
context, a compile, and battery.

### Law 10 — Reduced motion is a hard requirement, not a checkbox.

`state.reducedMotion` is read at boot and forced by `?nomotion`. It must mean **no motion** — set
the end state, do not "animate faster". Every module in this toolkit honours it; scenes must too.

---

## 2. The loop

One `requestAnimationFrame`. Every subsystem is a numbered stage. `delta` is clamped to `1/20`s so
a backgrounded tab cannot teleport the camera on return.

| order | name | registered by | purpose |
|---:|---|---|---|
| 0 | `time` | `kernel/loop.ts` | `state.time.elapsed / delta / frame` |
| 5 | `preloader` | `modules/preloader.ts` | damp the displayed percentage |
| 10 | `state` | `kernel/index.ts` (boot) | `updateState()` — damps progress, velocity, pointer |
| 20 | `scroll` | `kernel/scroll.ts` | read Lenis, derive `direction` and `velocity` |
| 30 | `viewport` | `kernel/viewport.ts` | apply a pending resize once, coalesced |
| 40 | `weights` | `kernel/weights.ts` | `in`/`out`/`weight` per scene; fire enter/exit |
| 45 | `instance-time` | `modules/instancing.ts` | one uniform write for every GPU-animated field |
| 50 | `camera` | `kernel/camera.ts` | weighted-average waypoints + parallax + roll |
| 60 | `scenes` | `kernel/stage.ts` | `update(w, ctx)` then `render(w, ctx)` per active scene |
| 900 | `scene-attr` | `kernel/stage.ts` | `data-active-scene` on `<html>` |
| 900 | `dom-bridge` | `modules/dom-bridge.ts` | ~6 CSS custom properties, changed-value guarded |
| 910 | `anchors` | `modules/dom-bridge.ts` | project 3D points to DOM elements |
| 920 | `reveal` | `modules/dom-bridge.ts` | `data-revealed` on in-view elements |
| 930 | `cursor` | `modules/cursor.ts` | custom cursor dot + ring |
| 935 | `magnetic` | `modules/cursor.ts` | elements leaning toward the pointer |
| 940 | `audio` | `modules/audio.ts` | analyser bands + `--audio-level` |
| 941 | `audio-scroll-filter` | `modules/audio.ts` | low-pass follows scroll speed |
| 970 | `picker` | `modules/raycast.ts` | throttled hover/click raycast |
| 980 | `render` | `kernel/stage.ts` | the draw call (or `post.render`) |
| 985 | `transition` | `modules/transition.ts` | full-screen wipe quad, `autoClear = false` |
| 995 | `watchdog` | `kernel/index.ts` (boot) | demote quality on sustained frame overrun |
| 998 / 999 | `debug-*` | `kernel/debug.ts` | Tweakpane monitors, stats |

**Reserved bands.** 0–99 kernel. 100–899 free for project scenes. 900–979 DOM/interaction overlays.
980–999 render and diagnostics. Put your own stages in 100–899 unless they must run after the draw.

---

## 3. Choosing a technique

### How should this section put pixels on screen?

| the section is… | `renderer` | why |
|---|---|---|
| type, images, a grid, a footer | `dom` | CSS is faster, accessible, and indexable. No context, no compile. |
| a scrubbed live-action shot | `video` | one decoder beats 240 PNGs; see the encode rules |
| a scrubbed *transparent* or stylised sequence | `video`→frame-sequence | alpha video is not portable; a two-tier ImageBitmap window is |
| a 2D generative/particle overlay | `canvas2d` | no GPU state to manage, trivially disposable |
| 3D geometry, lighting, materials | `three` | the only reason to pay for a WebGL context |
| a pure scroll-driven CSS moment | `none` | the scene exists only to own a scroll range and fire enter/exit |

### How should this thing be animated?

| the motion is a function of… | do it | cost |
|---|---|---|
| scroll position | `ctx.frame.local` → `tl.progress()` | free, reversible, scrubbable |
| scene presence | `ctx.frame.weight` | free |
| pointer | `state.pointerX.current` | free |
| time only, one object | `update()` in JS | negligible |
| **time and identity, many objects** | **`gpuAnimate()`** | one uniform write per frame regardless of N |
| a discrete event (click, enter) | GSAP timeline `.play()` | fine |

The dividing line: CPU matrix composition is ~16 multiplies per instance. Acceptable once at build
for a static layout; fatal every frame at 20,000 instances. **If the motion is a function of time
and identity, it belongs in the vertex shader.**

### How many draw calls can I afford?

A draw call costs the CPU roughly **0.05–0.2 ms**. 500 separate meshes is 25–100 ms per frame of
driver overhead **with the GPU idle**. Merge static geometry; instance repeated geometry; never ship
a scene that loads 300 individual meshes from a glTF without checking the count.

### Which transition?

See [`docs/modules/transition.md`](docs/modules/transition.md) for the full catalogue. Short version:

| kind | reads as | good for |
|---|---|---|
| `fade` | a cut in time | anything, always safe |
| `wipe` | a page turn / camera pan | moving between two places |
| `dissolve` | erosion, memory | dreams, decay, the passage of time |
| `iris` | a lens, an eye, focus | arrival at a subject, old-film feel |
| `ink` | brush, paper, sumi-e | the samurai world; anything hand-made |
| `glitch` | signal loss, technology | transmissions, corruption, sci-fi |

---

## 4. Index of every unit

### Kernel — `toolkit/kernel/` (import through `kernel/index.ts`)

| unit | one line | guide |
|---|---|---|
| `state.ts` | the damped motion state every other unit reads | [guide](docs/kernel/state.md) |
| `loop.ts` | the single rAF and its ordered stages | [guide](docs/kernel/loop.md) |
| `viewport.ts` | coalesced resize, `pageReflow`, measure-once | [guide](docs/kernel/viewport.md) |
| `scroll.ts` | Lenis + the exact GSAP/ScrollTrigger bridge | [guide](docs/kernel/scroll.md) |
| `renderer.ts` | the WebGL renderer, world, camera, parallax group | [guide](docs/kernel/renderer.md) |
| `camera.ts` | weighted-average waypoint camera | [guide](docs/kernel/camera.md) |
| `weights.ts` | `in`/`out`/`weight` per scene from scroll position | [guide](docs/kernel/weights.md) |
| `types.ts` | `SceneDefinition`, `SceneCtx` — the contract | [guide](docs/kernel/types.md) |
| `assets.ts` | refcounted loader for glTF/KTX2/HDR/video | [guide](docs/kernel/assets.md) |
| `dispose.ts` | complete VRAM teardown | [guide](docs/kernel/dispose.md) |
| `quality.ts` | tiers, budgets, the demote-only watchdog | [guide](docs/kernel/quality.md) |
| `stage.ts` | the scene manager: build, activate, render, tear down | [guide](docs/kernel/stage.md) |
| `debug.ts` | `?debug` URL flags, Tweakpane, stats | [guide](docs/kernel/debug.md) |
| `index.ts` | `boot()` — wires all of the above in the right order | [guide](docs/kernel/index.md) |

### Modules — `toolkit/modules/` (opt in per project)

| unit | one line | guide |
|---|---|---|
| `post.ts` | bloom → DOF → OutputPass → grade, in that order | [guide](docs/modules/post.md) |
| `dom-bridge.ts` | CSS custom properties, 3D→DOM anchors, reveals | [guide](docs/modules/dom-bridge.md) |
| `video-scrub.ts` | scroll-scrubbed video, three strategies | [guide](docs/modules/video-scrub.md) |
| `frame-sequence.ts` | two-tier image sequence that fits in RAM | [guide](docs/modules/frame-sequence.md) |
| `preloader.ts` | progress, minimum display time, audio gate | [guide](docs/modules/preloader.md) |
| `transition.ts` | full-screen shader wipes between worlds | [guide](docs/modules/transition.md) |
| `text-split.ts` | measured line/word/char splitting + reveals | [guide](docs/modules/text-split.md) |
| `cursor.ts` | custom cursor and magnetic elements | [guide](docs/modules/cursor.md) |
| `instancing.ts` | instanced fields, GPU animation, particles | [guide](docs/modules/instancing.md) |
| `raycast.ts` | cheap picking, plane probes, screen↔world | [guide](docs/modules/raycast.md) |
| `audio.ts` | unlock, music, SFX, ducking, analyser bands | [guide](docs/modules/audio.md) |

---

## 5. The shape of a project

```
Projects/client-name/
  index.html            sections with the ids the manifest points at
  src/
    main.ts             boot({ manifest, assets })
    manifest.ts         the ordered list of SceneDefinitions
    styles/
    scenes/
      00-arrival/index.ts
      01-world/index.ts
      …
    kernel/             COPIED IN, not symlinked
    modules/            only the ones this project uses
  public/
    decoders/           draco + basis, copied by `cw decoders`
    media/
  vite.config.ts
```

The kernel is **copied** into each project, not linked. A client deliverable has to build standalone
from its own repo years later, with no reference to this folder.

A scene is a folder with an `index.ts` that default-exports a `SceneDefinition`. Adding one means
adding a `<section>` and one line in `manifest.ts`. Nothing else in the project changes — that is
Law 3 paying for itself.

---

## 6. Reading the guides

Every guide has the same nine sections, so you can jump straight to the one you need:

1. **Purpose** — what it is for, in two sentences
2. **When to use it** — the situations it is the right answer to
3. **When NOT to use it** — the situations where it is the wrong answer, and what to use instead
4. **Signature** — the exact exported API, copied from the source
5. **Inputs** — every option, with the default and what the default is chosen for
6. **Outputs** — what you get back, what it writes to `state`, what it publishes to the DOM
7. **Transitions and applications** — the effects it produces and the moments it belongs in
8. **Gotchas** — the specific failures, with symptoms
9. **Recipe** — copy-paste code that works

---

## 7. Licensing

Everything in `toolkit/` is original code written for this project. It may be shipped in commercial
client work without attribution.

**One hard exclusion.** `https://github.com/davidhckh/portfolio-2025` is **not** open source. Its
`license.md` limits use to personal and educational purposes, requires attribution to David
Heckhoff and https://david-hckh.com, and prohibits commercial use, resale, or redistribution
without written permission. Several architectural *ideas* in this toolkit were validated by reading
it — in/out weights, weighted-average waypoints, a parallax group, scene precompilation. Ideas are
not copyrightable and every line here is an independent implementation. **Never copy code from that
repository into a client project.**

Runtime dependencies and their licences: three (MIT), GSAP 3.13+ (standard licence, all former Club
plugins now free), Lenis (MIT), mp4box.js (BSD-3-Clause), Vite (MIT), Tweakpane (MIT), stats-gl
(MIT), sharp (Apache-2.0), gltfpack (MIT), ffmpeg-static (binary is GPL/LGPL — a build-time tool
only, never bundled into a deliverable).
