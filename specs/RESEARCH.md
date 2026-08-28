# Cinematic Web Research

Reference survey behind [ARCHITECTURE.md](ARCHITECTURE.md). Every repo below was opened and its
actual source or manifest read — not just its README. Verification level is marked per entry.

**Verification key:** `SRC` = read implementation files · `MANIFEST` = read package.json/README/license · `META` = existence + metadata confirmed only.

---

## Executive summary

Six findings that shaped the architecture:

1. **The genre's hard problems are solved in exactly three places, and none of them is a portfolio.**
   Camera choreography → `davidhckh/portfolio-2025`. DOM↔WebGL binding → `14islands/r3f-scroll-rig`.
   Video scrubbing → `dkaoster/scrolly-video`. Asset pipeline + loop scheduling → `brunosimon/folio-2025`.
   Everything else in this document is either a variation or a cautionary tale.

2. **Frame sequences are unsolved in open source.** Five independent implementations
   (`motion-primitives-website`, `canvas-scroll-clip`, `xiaomi-smart-audio-glasses`,
   `frameSequenceAnimation`, `sections-guide.md`) all eagerly decode every frame before showing
   anything. None windows, none uses `createImageBitmap`, none frees. The correct answer is to stop
   shipping image sequences and decode an mp4 at runtime instead (ARCHITECTURE §12–13).

3. **Video scrubbing is unsolved in the local corpus and solved well exactly once online.**
   The corpus's only implementation assigns `video.currentTime` inside a scroll handler.
   `scrolly-video` modulates `playbackRate` to converge instead, and falls back through three
   tiers. That distinction is the whole difference between smooth and stuttering.

4. **The best-looking repo in the corpus has the worst performance architecture.**
   `Webgl-Data-Globe` has an exemplary folder taxonomy and reconciles its entire React tree 60×/sec
   because eight components call Zustand hooks with no selector. Folder structure is not architecture.

5. **READMEs lie in both directions.** `Relaxkartikey` advertises "Free open-source" with no LICENSE
   file. `davidhckh/portfolio-2025` looks like a normal open-source portfolio and is explicitly
   not licensed for reuse. `folio-2025`'s package.json says ISC while its `license.md` is MIT.

6. **"Cinematic website" is a poisoned search term.** The top GitHub results are 0–14★ tutorial
   clones, several shipping Apple's copyrighted assets, most with no license. All real references
   were found by searching for *techniques* and *people*, not experiences.

**One architecture does not fit all scenes.** The recommendation is a single kernel hosting five
renderer types — not Three.js everywhere.

---

## Local corpus

`reference/repos/` — **6 repos, not 7.** A seventh, `cinematic-scroll-skill`, downloaded as zero files
and was dropped from this bundle entirely; the upstream repo is 882MB, which explains the failed
ingest. Nothing here depends on it. See `CREDITS.md` §1.

| repo | what it is | grade | keep | drop |
|---|---|---|---|---|
| **awwwards-3d** `SRC` | Claude Code skill: 8 reference docs (PATTERNS 1657 lines, ANTI_PATTERNS 670), 4 self-contained HTML templates, 4 Draco GLBs | **S** | target/current damping model, ease table, render order, exhaustive dispose, `body.no-webgl`, error→preloader | its own `coin-scroll.html` intro is **dead code** — `gsap.from(camera.position)` fights the tick that overwrites `position.z` every frame |
| **lattice-drift** `SRC` | React + imperative Three.js, zero re-renders | **A** | `motionState` singleton, the Lenis↔GSAP bridge, CSS-var bridge, `MathUtils.damp`, real reduced-motion fallback, full dispose | `MeshStandardMaterial({vertexColors:true})` on an `InstancedMesh` using `setColorAt` — `IcosahedronGeometry` has no `color` attribute, so shards likely render black. `instanceColor` alone suffices |
| **orbit** `SRC` | 384-LOC vanilla procedural shader world, single CONFIG object | **A−** | postprocessing order (bloom → OutputPass → grade), reduced motion = one static frame, native scroll on purpose, OKLCH→linear palette, fresnel-rim-only bloom | frame-rate-dependent lerp: `curZ += (targetZ - curZ) * ease` |
| **Webgl-Data-Globe** `SRC` | R3F + drei + zustand globe with `director/` scene system | **B** | `CameraRig` (`useFrame` + `getState()`, no subscription, module-level scratch vectors), `sceneActivator` early-return, threshold table | **60fps whole-tree reconciliation** (8 selectorless store hooks); textures **hotlinked from `raw.githubusercontent.com/mrdoob/three.js`**; `timelineManager` is dead code; no KTX2/Draco/AdaptiveDpr |
| **threejs-scroll-scene** `SRC` | 137-line minimal scroll→camera rail | **B** | the clearest possible waypoint intro; `IntersectionObserver` reduced-motion snapping | per-segment `tl.to()` chain — inserting a scene re-times every following segment; no Lenis, no damping, no dispose |
| **motion-primitives-website** `SRC` | Next.js component library incl. `scroll-video` + `scroll-orchestrator` | **C** | frame-index dedupe (`if (frameIndex !== currentFrame.current)`) | `video.currentTime = …` inside a `scroll` listener — the naive video scrub; eager `new Image()` for every frame |
| ~~cinematic-scroll-skill~~ | **empty locally** | — | see remote entry | — |

`skills/` — 17 folders, most partially extracted (several contain a single md or a PNG).
`simota-flow` is the only complete one. `sergeyramas-3d-animation-creator` exists in full as the
installed `anthropic-skills:3d-animation-creator`. Its frame-sequence guidance repeats the same
eager `new Image()` loop; treat with the same skepticism as §12.

All six are **MIT**.

---

## The four references that matter

### 1. brunosimon/folio-2025
**https://github.com/brunosimon/folio-2025** · 1.8k★ · **MIT** (`license.md`; package.json wrongly says ISC) · three 0.183 · `SRC`

Grade **S**. The current state of the art in explorable 3D worlds, by the person who defined the genre.

- **A numbered, dependency-ordered game loop, documented in the README.** Stages 0–14, then 998
  (Rendering), 999 (Monitoring); every system lists its dependencies in parentheses
  (`Lighting (DayCycles, View)`, `Foliage (VisualVehicle, View)`). Sparse numbering so stages can be
  inserted. This is ARCHITECTURE §18 verbatim.
- **`scripts/compress.js` is a real asset pipeline**: `gltf-transform etc1s --quality 255` then
  `gltf-transform draco --method edgebreaker --quantize-position 12 --quantize-normal 6
  --quantize-texcoord 6 --quantize-color 2`, plus `toktx` with **per-texture-role presets** chosen
  by regex (ETC1S+sRGB+RGB for colour, ETC1S+linear+R+`--swizzle r001` for masks, UASTC for
  quality-critical), plus `sharp`→WebP for DOM images with `ui/ favicons/ social/` excluded from
  the GPU pass.
- Stack worth copying: `@dimforge/rapier3d` (physics), `camera-controls`, `stats-gl` (GPU timing),
  `tweakpane` + camerakit, `howler`, `seedrandom`, `normalize-wheel`, `vite-plugin-restart`.
- Content shape signals a full world: `terrain/`, `foliage/foliageSDF`, `interactivePoints/`,
  `achievements/`, `jukebox/`, `whispers/`, `career/`, day/year cycles, weather, tornado.

**Don't copy:** in `compress.js`, `ktx2File` and `dracoFile` are the same string, so the Draco pass
reads and writes one path and the intermediate is lost; `spawn` is never awaited, so N files spawn N
concurrent processes.

Also verified from the same author (`META` unless noted): 
`folio-2019` 4.7k★ MIT **https://github.com/brunosimon/folio-2019** (the car-driving world) ·
`my-room-in-3d` 4.5k★ **https://github.com/brunosimon/my-room-in-3d** (baked-lighting isometric room — the cheapest route to cinematic quality) ·
`infinite-world` 628★ **https://github.com/brunosimon/infinite-world** ·
`organic-sphere` 249★ **https://github.com/brunosimon/organic-sphere** and
`webgl-black-hole` 284★ **https://github.com/brunosimon/webgl-black-hole** (procedural GLSL) ·
`three.js-tsl-sandbox` 206★ **https://github.com/brunosimon/three.js-tsl-sandbox** (WebGPU/TSL, pushed 2026-08) ·
`doom-portal-in-webgl` 162★ **https://github.com/brunosimon/doom-portal-in-webgl** (render-target portals) ·
`threejs-template-complex` 293★ **https://github.com/brunosimon/threejs-template-complex** `MANIFEST` — **UNLICENSED and stale** (three 0.141, vite 2); its Experience-singleton pattern is widely copied but take the pattern, not the repo.

### 2. 14islands/r3f-scroll-rig
**https://github.com/14islands/r3f-scroll-rig** · v8.15.0 · ISC (package.json) · `SRC`

Grade **S**. Production studio library. The definitive answer to Hybrid DOM + WebGL.

- **One `<GlobalCanvas>` outside the router**, with the reason stated: contexts are capped and
  resources can't be shared across them.
- **`<UseCanvas>` tunnel** — a DOM component injects children into the global canvas while mounted.
- **`useTracker()`** — tracks "proxy" DOM elements. `getBoundingClientRect()` **once on mount**,
  then `IntersectionObserver` + `ResizeObserver` + a `pageReflow` counter. No per-frame layout reads.
- **`store.ts` is the best asset/scene lifecycle code I found anywhere**: `canvasChildren` keyed
  registry with `instances` refcount; `removeFromCanvas(key, dispose)` chooses between *free the GPU
  memory* and *mark inactive but keep resident*. ARCHITECTURE §9 is this.
- **`renderer-api.ts`** — `renderScissor` / `renderViewport` with `gl.setScissorTest` +
  `camera.layers.set(layer)` + `gl.autoClear = false`. This is how you get N independent
  camera/lighting setups in one context. ARCHITECTURE §14.
- **Demand rendering** — `globalRenderQueue` + `requestRender(layers)` + `invalidate()`; render only
  what asked. `globalPriority` gives explicit `useFrame` ordering (R3F's equivalent of Bruno's stages).
- `scaleMultiplier` — the DOM-pixels→three-units conversion, the thing everyone reinvents badly.

**Don't copy:** its own README documents the gotchas — HMR breaks for inline `<UseCanvas>` children,
and props are not reactive through the tunnel without explicit tunnelling. Also `import create from 'zustand'`
is the v3/v4 API.

### 3. dkaoster/scrolly-video
**https://github.com/dkaoster/scrolly-video** · v0.0.25 · **MIT** · `SRC`

Grade **S** for its one problem. 587-line core, deps `mp4box` + `ua-parser-js`.

Three tiers, chosen at runtime, with `targetTime`/`currentTime` separation — the same two-layer
model as §3 damping, applied to time:

1. **WebCodecs** (`src/videoDecoder.js`, adapted from the official w3c/webcodecs mp4 demux sample):
   streaming `fetch` → `reader.read()` loop → `mp4box.appendBuffer(buf)` with `buf.fileStart`, so
   demux happens *while downloading*. `onSamples` → `EncodedVideoChunk({type: sample.is_sync ? 'key' : 'delta'})`
   → `decoder.decode()`. Output handler does `createImageBitmap(frame, {resizeQuality:'low'})` then
   **`frame.close()`** — the correct handoff. Then it hides the `<video>`, appends a `<canvas>`, and
   paints `frames[floor(currentTime * frameRate)]` where `frameRate = frames.length / duration`.
2. **`playbackRate`** — `clamp(diff * 4, 1, min(transitionSpeed, 16))` then `play()`; reads
   `currentTime` back off the element. **Never seeks.**
3. **`currentTime`** — only for jumps, reverse (no negative playbackRate), and WebKit
   (`isSafari` via ua-parser). Source comment calls it "the inefficient method."

Also: `frameThreshold` epsilon + `hasPassedThreshold` overshoot guard, `video.pause()` in the base
case, one cancellable `transitioningRaf`, and on decode failure `frames = []` + `video.load()` to
degrade into tier 2/3.

**Don't copy:** the WebCodecs path is **H.264/AVC only** — it reads `stsd.entries[0].avcC` directly,
so HEVC/VP9/AV1 throw. `paintCanvasFrame` assigns `canvas.width/height` and calls
`getBoundingClientRect()` **every painted frame** (surface reset + layout read per frame — do it on
resize). Decoded `ImageBitmap`s for the whole video are held simultaneously with no `close()` on
teardown. Completion is detected by `decodeQueueSize <= 0` plus a 500ms `setTimeout` — fragile.

### 4. davidhckh/portfolio-2025
**https://github.com/davidhckh/portfolio-2025** · 844★ · **NOT OPEN SOURCE** · three 0.181 · `SRC`

Grade **S** for architecture, **license-blocked for reuse**. `license.md`: "personal and educational
purposes only"; attribution to David Heckhoff + https://david-hckh.com required in source, README,
*and any public deployment*; credit notices may not be removed; "Commercial use, resale, or
redistribution … is prohibited without prior written permission." **Study the patterns, write your
own code, do not copy files.**

Its four ideas are the backbone of ARCHITECTURE §7 and §10:

- **in/out scene weights.** `sceneWeightsInOut = { hero: {in:1, out:0}, … }`, and on `gsap.ticker`:
  `weight = clamp(inOut.in * (1 - inOut.out), 0, 1)`. Scenes never reference each other.
- **Weighted-average waypoint camera.** `weightedAverage(points, weights)` accumulates
  `x/y/z × w`, divides by total, guards `total === 0 → 1`. GSAP tweens the **weights**; the camera
  is derived. Separate `points.landscape` / `points.portrait` chosen by `sizes.isLandscape`.
- **`parallaxGroup` separation.** `PerspectiveCamera(38, …, 0.01, 100)` lives inside a `Group`;
  scroll drives `camera.position`, pointer drives the group, via `gsap.ticker.deltaRatio()` with a
  ±0.05 deadzone and `isTouch()` gating. They can't fight.
- **`compileScene()`** — force all invisible children visible + `frustumCulled = false`, call
  `renderer.compile()`, restore. Compiles every shader variant during the preloader. Plus
  weight-gated render targets (`if (sceneWeights.about > 0.001) renderTarget.render()`) and
  `project(point)` → screen px for DOM anchored to 3D.

Also relevant to a character/samurai sequence: `src/three/objects/avatar/{index,animations,face,hologram,hologram-material}`.

---

## The 12 families, and what fills each

| # | family | best reference | grade | verdict |
|---|---|---|---|---|
| 1 | **Canvas frame sequence** | `m5kr1pka/canvas-scroll-clip` **https://github.com/m5kr1pka/canvas-scroll-clip** 117★ MIT `SRC` | **C+** | Zero-deps, TS, correct CSS `sticky` pinning. But `Promise.all` over *every* frame before first draw; no DPR math; `setScrollableArea` overrides the user's option. **No memory-safe reference exists in open source.** |
| 2 | **Video scrubbing** | `dkaoster/scrolly-video` | **S** | Solved. Port the tiering. |
| 3 | **DOM + GSAP cinematic** | `awwwards-3d` docs + `simota-flow` skill | **A** | Well covered; least risky family. |
| 4 | **Real-time Three.js** | `brunosimon/folio-2025`, `orbit` | **S / A−** | Solved. |
| 5 | **React Three Fiber** | `14islands/r3f-scroll-rig` | **S** | Use it *if* React is mandatory. `Webgl-Data-Globe` is the counter-example of R3F done casually. |
| 6 | **Procedural GLSL world** | `orbit` `SRC`; `brunosimon/organic-sphere`, `webgl-black-hole` `META` | **A−** | Corpus has a complete small example incl. correct postprocessing order. |
| 7 | **3D product storytelling** | `r3f-scroll-rig` `ViewportScrollScene` | **A** | Scissor viewport + own camera per DOM box is the right mechanism. |
| 8 | **Video texture + 3D** | — | — | **No strong open-source reference found.** Mechanically simple (`VideoTexture` + `requestVideoFrameCallback`); combine §13's tiering with a `VideoTexture`. Flagged as build-from-scratch. |
| 9 | **Hybrid DOM + WebGL** | `14islands/r3f-scroll-rig` | **S** | Solved, definitively. |
| 10 | **Explorable 3D world** | `brunosimon/folio-2019` 4.7k★ MIT, `folio-2025`, `my-room-in-3d` 4.5k★ | **S** | Solved. `my-room-in-3d` is the highest quality-per-byte via baked lighting. |
| 11 | **Data-driven world** | `vasturiano/globe.gl` **https://github.com/vasturiano/globe.gl** 3.1k★ · `vasturiano/3d-force-graph` **https://github.com/vasturiano/3d-force-graph** 6.3k★ `META` | **A** | Mature. Relevant only if a scene visualises real data. |
| 12 | **WebXR / immersive** | `aframevr/aframe` **https://github.com/aframevr/aframe** 17.6k★ MIT `META` | — | **Not relevant** to this project. Excluded deliberately, not overlooked. |

Adjacent, verified, and useful:
`darkroomengineering/lenis` **https://github.com/darkroomengineering/lenis** 15.5k★ `META` — the scroll dependency ·
`darkroomengineering/tempus` **https://github.com/darkroomengineering/tempus** 330★ `META` — "one rAF for your whole app"; the same single-loop thesis as §18 if you'd rather not lean on `gsap.ticker` ·
`darkroomengineering/satus` **https://github.com/darkroomengineering/satus** 980★ `META` — studio Next.js starter ·
`Tresjs/tres` **https://github.com/Tresjs/tres** 3.7k★ `META` — Vue's R3F. (`troisjs/trois` 4.5k★ is **archived** — don't.)

---

## Ranked references — learn / don't copy

| # | repo | learn | do NOT copy |
|---|---|---|---|
| 1 | **brunosimon/folio-2025** | numbered dependency-ordered loop; per-role texture presets; Draco quantization numbers | the same-path Draco in/out; unawaited `spawn` |
| 2 | **14islands/r3f-scroll-rig** | GlobalCanvas; tunnel; refcounted dispose-vs-deactivate; scissor viewports; measure-once tracking | tunnel prop non-reactivity; zustand v3 import |
| 3 | **dkaoster/scrolly-video** | three-tier scrub; `playbackRate` convergence; `VideoFrame`→`ImageBitmap`→`close()` | H.264-only assumption; per-frame canvas resize + `getBoundingClientRect`; unbounded bitmap retention |
| 4 | **davidhckh/portfolio-2025** | in/out weights; weighted-average waypoints; parallaxGroup; `compileScene` | **the code itself — license forbids it** |
| 5 | **awwwards-3d** (local) | target/current model; ease table; render order; dispose; error→preloader | its dead intro animation |
| 6 | **brunosimon/my-room-in-3d** | baked lighting as a quality strategy | — (`META` only; verify before deeper use) |
| 7 | **lattice-drift** (local) | motionState singleton; Lenis↔GSAP bridge; CSS-var bridge | `vertexColors:true` on `InstancedMesh` |
| 8 | **orbit** (local) | postprocessing order; reduced-motion single frame; native-scroll-on-purpose | frame-rate-dependent lerp |
| 9 | **Webgl-Data-Globe** (local) | `CameraRig`'s `getState()`-in-`useFrame`; scene threshold table | selectorless store hooks; hotlinked textures; dead `timelineManager` |
| 10 | **Ph4NToMgg/xiaomi-smart-audio-glasses** **https://github.com/Ph4NToMgg/xiaomi-smart-audio-glasses** `SRC` · **NO LICENSE** | batched progressive loading (12 at a time, `await`, `setTimeout(…, 15)`) with narrative status text | everything else — `lastDrawnFrameRef` written but never read (redraws every tick); rAF loop torn down and rebuilt on every scroll event; `scrollProgress` in React state |

---

## Flagged: license problems

Do not vendor code from these.

| repo | issue |
|---|---|
| **https://github.com/davidhckh/portfolio-2025** | Explicitly non-commercial, attribution-mandatory, redistribution prohibited. Best architecture found; legally study-only. |
| **https://github.com/brunosimon/threejs-template-complex** | `UNLICENSED` in package.json |
| **https://github.com/andrewwoan/abigail-bloom-portolio-bokoko33** 537★ `MANIFEST` | MIT, but README relays the original creator's request not to reuse *this exact idea*. Also stale: three 0.141, vite 2, asscroll. Ethical flag, not a legal one. |
| **https://github.com/Relaxkartikey/prior-gsap-animation-portfolio-website-template** | README says "Free open-source"; **no LICENSE file**. 945 frames, 132MB. |
| **https://github.com/atishaytuli07/frameSequenceAnimation** | No license; 3161 frames, 154MB; tutorial clone of Doze Studios |
| **https://github.com/HarshalTarwale/Apple-Vision-Pro-Website-Clone** · **https://github.com/Vedantd2003/ApplevisionWeb** · **https://github.com/rex009x/gsap_macbook_landing** | No license, and they **ship Apple's copyrighted assets**. The latter two share identical asset files — both copies of the same tutorial. |
| **https://github.com/KaranChandekar/interactive-3d-portfolio** · **https://github.com/IHANsaja/immersive-portfolio** · **https://github.com/salonyranjan/VertexFlow** · **https://github.com/Plattnericus/ThreeJS_Portfolio** · **https://github.com/Dieg0arc/3D-scrolling-practice** | 0–14★, no license, nothing architecturally novel |
| **https://github.com/KubeezMedia/kubeez-scroll-world-video** 523★ | No license despite visibility |

`MustBeSimo/cinematic-scroll-skill` **https://github.com/MustBeSimo/cinematic-scroll-skill** 30★ MIT
`META` — 882MB, 521 files, 62KB SKILL.md. Notable for a `bench/` suite profiling real
Awwwards-tier sites (apple.com, lusion.co, obys.agency, basement.studio, bruno-simon.com,
activetheory.net, locomotive.ca, pudding.cool, polestar, porsche, nike, gucci). Worth mining for
measured data later; too large to ingest wholesale.

---

## Scene-by-scene renderer strategy

| scene | content | renderer | why not something else |
|---|---|---|---|
| **01 Arrival** | cinematic opening, logo/title resolve, first camera push | `three` | Needs to hand off continuously into 02. A video here would cut. |
| **02 World** | atmospheric environment, scroll-driven camera flight | `three` | The core of the site. Baked lighting (`my-room-in-3d` approach) over real-time GI. |
| **03 Transmission** | live-action / rendered footage scrub | `video` | Frames you can't generate in real time. Tier 1 WebCodecs, poster on reduced motion. |
| **04 Artifact** | interactive product/object, orbit + hotspots | `three` in a **scissor viewport** | Own camera + lighting + env map inside one DOM box; §14. |
| **05 Dissolution** | procedural shader field, transformation/disassembly | `three` + GLSL | Geometry-free; noise + fresnel rim, weight-gated bloom (`orbit`'s chain). |
| **06 Character** | samurai / figure sequence, choreographed reveal | **`three` if interactive, `video` if not** | Decide by whether the camera must respond to pointer. If it's a fixed shot, a scrubbed video is cheaper and looks better. Don't default to 3D. |
| **07 Editorial** | typography choreography, manifesto | `dom` | Zero GPU cost, real text, accessible, selectable. Using WebGL text here is the classic mistake. |
| **08 Index** | project showcase, hover→WebGL image effects | `dom` + `three` hybrid | DOM owns layout and links; canvas draws effects tracked to the DOM rects (§6a). |
| **09 Departure** | outro, camera pull-back to void | `three` | Reuses 02's graph at low weight; near-zero incremental cost. |
| transitions | between "worlds" | `none` spacers + weight crossfade | The in/out weight model (§7) makes crossfades free. No transition machinery needed. |

**Renderer decision rule.** In order:
1. Is it text or layout? → `dom`.
2. Is it footage you cannot generate at runtime? → `video`.
3. Does it need to respond to pointer/state in 3D space? → `three`.
4. Is it a fixed camera path over pre-rendered imagery? → `video` (decoded), **not** a frame sequence.
5. Is it 2D generative? → `canvas2d`.

---

## Gaps to close during the build

1. **Memory-safe frame sequences** — no reference exists. Implement windowed loading + `createImageBitmap` per §12, or avoid the family entirely via §13.
2. **Video texture inside a 3D scene** — family 8 has no strong reference. Compose `scrolly-video`'s tiering with `THREE.VideoTexture` + `requestVideoFrameCallback`.
3. **`check:scenes` lint** (ARCHITECTURE §20) — the automation guardrail; nothing off-the-shelf does this.
4. **`my-room-in-3d`'s baking workflow** — verified only at `META`. Read its source before committing to baked lighting.
5. **`MustBeSimo/cinematic-scroll-skill` `bench/results`** — measured profiles of real award-winning sites; the only empirical data source found. Sample it, don't clone 882MB.
