# ARCHITECTURE

Build spec for a cinematic, multi-renderer, scroll-driven site — written so an agent can add
scenes repeatedly without breaking existing ones.

Derived from verified source of: `brunosimon/folio-2025`, `14islands/r3f-scroll-rig`,
`dkaoster/scrolly-video`, `davidhckh/portfolio-2025` (patterns only — not open source),
and the local corpus (`awwwards-3d`, `lattice-drift`, `orbit`, `Webgl-Data-Globe`).
See [RESEARCH.md](RESEARCH.md) for provenance.

---

## 0. The three rules everything else follows

1. **One WebGL context, one render loop, one scroll source.** Never two.
2. **Inputs write `target`. The loop damps `current`. Render reads `current`.** Three layers, never more.
3. **A scene never references another scene.** It owns a weight and a waypoint. That's the whole contract.

Rule 3 is what makes automation safe. Adding scene 08 touches exactly two files: the scene's own
folder, and one line in the manifest.

---

## 1. Application shell

```
index.html                    single document, no router for v1
src/
  kernel/
    state.ts                  motion state singleton (target/current)
    loop.ts                   the single tick, stage-ordered
    scroll.ts                 Lenis + ScrollTrigger bridge
    renderer.ts               the one WebGLRenderer + composer
    viewport.ts               size / dpr / quality tier
    assets.ts                 manifest loader + refcounted cache
    debug.ts                  tweakpane, stats-gl, ?debug gate
  scenes/
    manifest.ts               THE registry — ordered list of scene modules
    01-arrival/
      index.ts                default export: Scene
      scene.glsl              (optional)
      assets.ts               (optional) this scene's asset list
    02-world/
    03-transmission/
  dom/
    sections/                 one <section> per scene, normal HTML/CSS
    overlay/                  cursor, nav, preloader
```

**Why one canvas:** browsers cap live WebGL contexts (~8–16) and resources cannot be shared
across contexts. `r3f-scroll-rig`'s README states this as the explicit reason for its
`<GlobalCanvas>` design. Multi-canvas is the single most common architecture mistake.

**The canvas is `position: fixed`, full-viewport, `z-index: 0`, `pointer-events: none` by default.**
DOM sections scroll over it. Scenes that need pointer input opt in by raising a hit-target div.

---

## 2. How scrolling is represented

One source of truth: **Lenis** drives a normalized `progress` plus per-scene local progress.

```ts
// kernel/scroll.ts
const lenis = new Lenis({ lerp: 0.085, smoothWheel: true, syncTouch: false })

lenis.on('scroll', ({ scroll, limit, velocity, direction }) => {
  state.scroll.value    = scroll
  state.progress.target = limit ? scroll / limit : 0
  state.velocity.target = velocity
  state.direction       = direction || state.direction
  ScrollTrigger.update()                       // Lenis owns rAF, ST just reads
})

gsap.ticker.add((t) => lenis.raf(t * 1000))
gsap.ticker.lagSmoothing(0)                    // never let GSAP skip on a slow frame
```

Rules:
- **GSAP never runs its own rAF for scroll.** `gsap.ticker` is the clock; Lenis is the input.
- **Nothing reads `window.scrollY` directly.** Ever. One reader, one writer.
- `prefers-reduced-motion` → skip Lenis entirely, attach a native `scroll` listener that writes
  the same state fields. Everything downstream is unchanged.

Scroll length is declared by DOM: each section has a real height. No virtual scrolling.

---

## 3. Global motion state

A mutable module singleton of `{current, target, ease}` triples. Not React state, not a store with
subscriptions — those reconcile at 60fps. (`Webgl-Data-Globe` demonstrates the failure: eight
components call `useStore()` with no selector while scroll writes the store every frame.)

```ts
// kernel/state.ts
type Damped = { current: number; target: number; ease: number }
const d = (v = 0, ease = 0.08): Damped => ({ current: v, target: v, ease })

export const state = {
  progress:   d(0, 0.08),
  velocity:   d(0, 0.12),
  pointerX:   d(0, 0.12),
  pointerY:   d(0, 0.12),
  scroll:     { value: 0 },
  direction:  1,
  reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
  quality:    'high' as 'low' | 'medium' | 'high',
  time:       { elapsed: 0, delta: 0 },
}

// frame-rate independent — the naive `cur += (t - cur) * ease` is wrong and will
// run at different speeds on 60Hz vs 144Hz displays (the bug in `orbit`).
export function damp(s: Damped, delta: number) {
  const f = 1 - Math.pow(1 - s.ease, delta * 60)
  s.current += (s.target - s.current) * f
}
```

**Ease reference table** (from `awwwards-3d/references/ARCHITECTURE.md`, matches what reads well):

| what | ease |
|---|---|
| scroll-driven position | 0.08 |
| camera position | 0.06 |
| camera rotation | 0.05 |
| object rotation | 0.10 |
| mouse parallax | 0.12 |
| hover / UI | 0.15 |

Below 0.04 feels broken. Above 0.20 isn't smoothing anything.

---

## 4. How scenes are registered

**One ordered array. That is the entire registry.**

```ts
// scenes/manifest.ts
import arrival from './01-arrival'
import world   from './02-world'

export const scenes = [arrival, world] as const
```

The kernel iterates it. Nothing else knows the list. Adding a scene = one import + one array entry.

Each scene module is an object satisfying a fixed interface:

```ts
export interface Scene {
  id: string
  renderer: 'three' | 'canvas2d' | 'video' | 'dom' | 'none'
  section: string              // CSS selector of its DOM <section>
  assets?: AssetSpec[]         // declared, not loaded
  quality?: { low?: Partial<Config>; medium?: Partial<Config> }

  waypoint?: {                 // only for renderer: 'three'
    landscape: { position: Vec3; focus: Vec3 }
    portrait?: { position: Vec3; focus: Vec3 }
  }

  build(ctx: SceneContext): void | Promise<void>   // create objects, add to shared scene
  enter?(): void
  update?(ctx: TickContext): void                  // called only when weight > 0
  exit?(): void
  dispose(): void                                  // MUST free everything build() made
}
```

`SceneContext` hands over the shared `scene`, `renderer`, `camera`, `assets`, and the scene's own
`weight` object. A scene receives references; it never imports the kernel's internals and never
imports a sibling.

---

## 5. How a scene declares its renderer

The `renderer` field. The kernel dispatches:

| value | kernel does | use for |
|---|---|---|
| `'three'` | adds scene's `Object3D` to the shared scene graph; registers waypoint | real-time 3D, procedural GLSL, product, world |
| `'canvas2d'` | allocates a 2D canvas layer, calls `update` with `ctx.ctx2d` | frame sequences, ASCII, generative 2D |
| `'video'` | mounts a `<video>` + optional decode-to-bitmap path | live-action cinematic footage |
| `'dom'` | no GPU allocation; kernel only drives the section's CSS vars + GSAP timeline | typography, editorial, project lists |
| `'none'` | pure spacer / transition | palate cleanser between worlds |

**A cinematic site legitimately mixes all five.** Do not force Three.js on a scene that is a video
or a paragraph. See the scene→renderer decision table in RESEARCH.md.

---

## 6. How DOM and WebGL communicate

Three channels, each one-directional:

**a) WebGL reads DOM geometry — the tracker.**
Measure the section rect once on mount, then keep it fresh with `ResizeObserver` +
`IntersectionObserver` + a reflow counter. Never call `getBoundingClientRect()` in the render loop.
(`r3f-scroll-rig` states this explicitly: *"Calls `getBoundingClientRect()` once on mount"*.
ScrollyVideo does the opposite and pays a layout read per painted frame.)

```ts
// bump a counter to invalidate all cached rects; trackers recompute on change
state.reflow++
```

**b) DOM reads WebGL state — CSS custom properties.**
The loop writes, at most once per frame, on `:root`:

```
--page-progress     0..1
--scroll-velocity   0..40
--scene-weight-02   0..1
[data-scroll-direction]  up | down
[data-active-scene]      02-world
```

CSS animates off these. No React re-render, no per-element JS writes.

**c) DOM anchored to a 3D point — projection.**
For labels pinned to objects: `camera.project(v)` → screen px → write to a transform.
Batch all projections in one stage, write with `transform: translate3d()` only.

---

## 7. Scene enter / exit

No booleans. **Every scene owns two scalars, `in` and `out`,** and its weight is derived:

```ts
weight = clamp(inValue * (1 - outValue), 0, 1)
```

`in` rises as the scene approaches, `out` rises as it leaves. Both are tweened by that scene's own
ScrollTrigger. This is `davidhckh/portfolio-2025`'s model and it is the correct one because:

- Two scenes can be partially visible simultaneously — crossfades are free.
- A scene reaching `weight === 0` is the unambiguous signal to stop updating and rendering it.
- **No scene needs to know another exists.** No `if (currentScene === 'x')` anywhere.

Lifecycle:

| weight transition | kernel calls |
|---|---|
| `0 → >0` first time | `build()` if lazy, then `enter()` |
| `> 0.001` | `update()` each frame |
| `>0 → 0` | `exit()` |
| `0` for N seconds / route change | `dispose()` if scene opted into unloading |

Threshold is `0.001`, not `0`, so a scene whose weight is a floating-point crumb stops costing.

---

## 8. Asset preloading

**Declared in manifests, loaded in tiers, never loaded ad-hoc inside a scene.**

```ts
// scenes/02-world/assets.ts
export default [
  { id: 'world',   type: 'gltf',    url: '/models/world-compressed.glb', tier: 'critical' },
  { id: 'terrain', type: 'ktx2',    url: '/tex/terrain.ktx',             tier: 'critical' },
  { id: 'sky',     type: 'ktx2',    url: '/tex/sky.ktx',                 tier: 'deferred' },
]
```

Tiers:
- **`critical`** — blocks the preloader. Only scene 01 + the shell should have these.
- **`eager`** — loads during idle right after first paint.
- **`deferred`** — loads when the owning scene's weight first exceeds 0.

One `LoadingManager` drives the preloader bar. Loaders registered once: `GLTFLoader` +
`DRACOLoader` + `KTX2Loader` + `MeshoptDecoder`.

**Then, before revealing scene 01, compile every shader.** Otherwise the first appearance of each
material stalls for 50–300ms. `folio-2025` and `davidhckh` both do this; it is the difference
between "smooth" and "hitchy" and it costs ten lines:

```ts
// kernel/renderer.ts — force-compile ALL variants, including hidden ones
export function compileAll(scene, camera) {
  const hidden = []
  scene.traverse((o) => {
    if (!o.visible) { hidden.push([o, o.visible, o.frustumCulled]); o.visible = true }
    o.frustumCulled = false
  })
  renderer.compile(scene, camera)
  hidden.forEach(([o, v, f]) => { o.visible = v; o.frustumCulled = f })
}
```

**Asset build pipeline** (verified from `brunosimon/folio-2025/scripts/compress.js`):

```bash
# geometry: KTX2 the embedded textures first, then Draco the mesh
gltf-transform etc1s in.glb out.glb --quality 255
gltf-transform draco out.glb out.glb --method edgebreaker \
  --quantization-volume mesh --quantize-position 12 --quantize-normal 6 \
  --quantize-texcoord 6 --quantize-color 2 --quantize-generic 2
```

Standalone textures use `toktx` with a **preset chosen per texture role** — this is the part most
projects get wrong:

| texture role | encode | OETF | channels |
|---|---|---|---|
| colour / albedo | `etc1s --qlevel 255` | `srgb` | `RGB` |
| masks, SDF, single-channel data | `etc1s` | **`linear`** | `R` + `--swizzle r001` |
| normal-ish / quality-critical | `uastc` | `linear` | `RGB` |
| gradient palettes, terrain | `uastc --genmipmap` | as appropriate | `RGB` |

**DOM images are WebP (sharp), GPU textures are KTX2.** Different jobs, different formats. Bruno's
script explicitly excludes `ui/`, `favicons/`, `social/` from the KTX pass.

---

## 9. Asset unloading

**Refcount by asset id.** Copied from `r3f-scroll-rig`'s `store.ts`, which is the best treatment of
this I found in any open-source project:

```ts
acquire(id)   // instances++ ; load if 0 → 1
release(id, { dispose = true })
// instances > 1  → just decrement
// instances → 0  → if dispose: free GPU memory
//                  else:       mark inactive, keep resident, stop rendering
```

The `dispose` vs `deactivate` choice is per-scene and matters:
- **Deactivate** scenes the user will scroll back through (everything on a single page).
- **Dispose** scenes behind a route/world transition they won't return to soon.

`dispose()` must be exhaustive — geometries, materials, *every texture-valued material key*,
render targets, and the composer's internal targets. Traverse and free; do not hand-list.
`awwwards-3d`'s destroy function is the reference implementation, including
`renderer.forceContextLoss()` on final teardown.

---

## 10. Camera transitions

**One camera. Never swap cameras. Never tween the camera directly.**

The camera position is the **weighted average of all scene waypoints**, using the same weights from
§7. GSAP tweens the *weights*; the camera is derived:

```ts
// kernel/loop.ts — camera stage
function cameraStage() {
  let total = 0
  pos.set(0, 0, 0); focus.set(0, 0, 0)

  for (const s of scenes) {
    const w = s.weight.value
    if (w <= 0.001 || !s.waypoint) continue
    const wp = viewport.isLandscape ? s.waypoint.landscape
                                    : (s.waypoint.portrait ?? s.waypoint.landscape)
    pos.addScaledVector(wp.position, w)
    focus.addScaledVector(wp.focus, w)
    total += w
  }
  if (total === 0) total = 1
  pos.divideScalar(total); focus.divideScalar(total)

  camera.position.copy(pos)
  camera.lookAt(focus)
}
```

This is `davidhckh/portfolio-2025`'s architecture and it is the key insight of the whole document:
**camera choreography becomes declarative.** A new scene declares where the camera should be when
it is fully visible; blending between any pair of scenes is automatic and always continuous.

Compare the alternative in `threejs-scroll-scene` — a chain of per-segment `tl.to()` tweens. It
works for five fixed waypoints and becomes unmaintainable at fifteen, because inserting a scene in
the middle rewrites every following segment.

**Pointer parallax is a separate transform.** Put the camera inside a `Group` and let the pointer
rotate/offset the *group*. Scroll owns `camera.position`; pointer owns `parallaxGroup`. They can
never fight. Gate the pointer listener on `!isTouch && !reducedMotion`.

---

## 11. GSAP timeline organization

| concern | owner |
|---|---|
| scroll → scene `in`/`out` weights | one ScrollTrigger per scene, defined **in that scene's file** |
| scroll → any 3D value | tween the `target` of a `Damped`, `ease: 'none'`, `scrub: true` |
| DOM text/element reveals | per-section timeline, `ease` as desired, not scrubbed |
| intro / outro / one-shots | normal timelines — but **write to `state`, never to objects** |

The last row is a real trap. `awwwards-3d`'s own flagship template has a dead intro animation:
`gsap.from(camera.position, { z: 16 })` runs, but the tick overwrites `camera.position.z` from
`state.cameraZ.current` every frame, so nothing visible happens. **If the loop owns a value, only
the loop may write it.** Animate `state.cameraZ.target` instead.

Responsive variants go through `gsap.matchMedia()`, not `if (isMobile)` sprinkled around.

---

## 12. Frame sequences (`renderer: 'canvas2d'`)

**Do not ship 500 JPEGs.** Every open-source frame-sequence implementation I inspected —
`motion-primitives-website`, `canvas-scroll-clip`, `xiaomi-smart-audio-glasses`,
`frameSequenceAnimation` — eagerly decodes every frame into memory before showing anything. At
1920×1080 that is ~8MB of decoded RGBA per frame. 300 frames is 2.4GB. This is *the* recurring
failure of the genre.

**Ship an mp4 and decode it to frames at runtime instead.** `dkaoster/scrolly-video` proves the
approach: stream the file, demux with `mp4box`, decode with `VideoDecoder`, convert each
`VideoFrame` to an `ImageBitmap` and immediately `frame.close()`. You get frame-exact scrubbing
from a file 50× smaller.

If you must ship images:

1. **Windowed loading.** Keep a sliding window of ±N frames around the current index. Load ahead in
   the scroll direction, `close()`/drop behind.
2. **`createImageBitmap(blob)`**, not `new Image()`. Off-thread decode, no layout involvement.
3. **Batch with yields** — load 12, `await Promise.all`, `setTimeout(next, 15)`. (The one good idea
   in `xiaomi-smart-audio-glasses`; borrow the batching, not the code.)
4. **Dedupe draws.** `if (frameIndex === lastDrawn) return`. `motion-primitives-website` does this
   correctly; `xiaomi` writes `lastDrawnFrameRef` and never reads it, redrawing every single tick.
5. **Set `canvas.width/height` on resize only** — assigning it resets the drawing surface.
6. **Pin with CSS `position: sticky`**, not a JS pin. `canvas-scroll-clip` gets this right: tall
   container, sticky inner wrapper. Fewer moving parts than ScrollTrigger `pin: true`.
7. Reduced motion → draw one frame, bind nothing.

---

## 13. Video scrubbing (`renderer: 'video'`)

Never assign `video.currentTime` from a scroll handler. That is a seek per scroll event; it stutters
on every browser and thrashes on Safari. (`motion-primitives-website/src/components/scroll/scroll-video.tsx`
does exactly this — it is the corpus's only video scrub and it is the naive version.)

Use **`dkaoster/scrolly-video`'s three-tier strategy**, verified from its source:

```
targetTime  ← scroll  (the only thing scroll writes)
currentTime ← converges toward targetTime in a single rAF loop
```

| tier | condition | mechanism |
|---|---|---|
| **1. Decoded frames** | WebCodecs available, decode succeeded | hide `<video>`, show `<canvas>`, `drawImage(frames[floor(t * fps)])`. `fps = frames.length / duration` — derived, not assumed. |
| **2. Playback rate** | forward motion, not Safari | `playbackRate = clamp(diff * 4, 1, min(speed, 16))` then `play()`. Read `currentTime` back from the element. **Never seek.** |
| **3. Seek** | jumping, going backwards, or WebKit | `video.currentTime = …`. Necessary because `playbackRate` cannot be negative. Accept that it is the slow path. |

Plus: a `frameThreshold` (~0.1s) convergence epsilon with an overshoot guard, `video.pause()` in
the base case, and **one** `transitioningRaf` handle that is cancelled on completion so loops never
stack.

Constraints to plan around:
- The WebCodecs path in that library is **H.264/AVC only** (it reads the `avcC` box directly).
  HEVC/VP9/AV1 will throw and fall through to tier 2/3.
- iOS requires `muted`, `playsinline`, `preload="auto"`.
- Decoded-frame memory is bounded by video length. Budget it, or window it as in §12.

---

## 14. Three.js scenes (`renderer: 'three'`)

Objects from all `'three'` scenes live in **one shared scene graph**, each under its own `Group`.
The kernel owns the renderer, camera, lights-of-record, and environment.

- `scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture` — cinematic IBL with
  no HDRI download. Cheapest quality win available.
- `ACESFilmicToneMapping`, explicit `toneMappingExposure`.
- Shadows: one shadow-casting light, explicit shadow-camera bounds, tuned `bias`/`normalBias`, and
  a `ShadowMaterial` catcher plane rather than a lit floor.
- `InstancedMesh` for anything repeated. `frustumCulled = false` on instanced meshes whose
  bounding sphere is wrong.
- Pre-allocate `Vector3`/`Quaternion` at module scope. Zero allocation inside the loop.

**Sub-scenes with their own camera/lighting** use scissor rendering rather than a second canvas —
`r3f-scroll-rig/src/renderer-api.ts` is the reference:

```ts
gl.autoClear = false
gl.setScissor(left, top, width, height)
gl.setScissorTest(true)
camera.layers.set(layer)
clearDepth && gl.clearDepth()
gl.render(scene, camera)
gl.setScissorTest(false)
```

This is how a 3D product viewer occupying one DOM box coexists with a full-bleed world in the same
context.

---

## 15. Shaders

- One `.glsl` file per material, imported via `vite-plugin-glsl`. No template literals in TS.
- Uniform naming: `uTime`, `uProgress`, `uWeight`, `uResolution`, `uPointer`. `uWeight` is the
  scene's weight — a shader can fade itself out with no external help.
- Include noise from a known source and cite it (`orbit` vendors Ashima 3D simplex, public domain).
- Precision: `mediump` for anything not depth/position related on mobile.
- **Postprocessing order is not negotiable:**

```
HalfFloat render target
  → RenderPass
  → UnrealBloomPass          (must be in linear HDR)
  → vignette / DOF
  → OutputPass               ← tone map + sRGB conversion happens HERE
  → grain / LUT / chromatic  (display space, after OutputPass)
```

Bloom before `OutputPass`, grain after. Getting this backwards produces washed-out bloom or
gamma-crushed grain. `orbit/src/scene.js` implements it correctly and is worth reading.

**Gate render cost on weight.** Extra render targets, reflections, and passes only run when their
owning scene's weight exceeds 0.001 — `davidhckh` gates a whole render target this way.

---

## 16. Mobile

Detected once at boot into `state.quality`, from `(pointer: coarse)`, screen width, and a
`stats-gl`/renderer-capability probe. Scenes read `state.quality` and merge their `quality.low`
config override. **No scene branches on "is mobile" — it branches on a quality tier**, so a weak
desktop GPU gets the same treatment as a phone.

| | low | medium | high |
|---|---|---|---|
| `pixelRatio` cap | 1.0 | 1.35 | 1.65–2.0 |
| antialias | off | off | off (rely on the composer) |
| shadows | off | 1024 | 2048 |
| bloom | off | on | on |
| grain / LUT | off | on | on |
| instance counts | ×0.4 | ×0.7 | ×1.0 |
| video scrub | tier 3 only | tier 2 | tier 1 |
| frame sequence | half-res frames | half-res | full |
| pointer parallax | disabled | enabled | enabled |

Portrait waypoints are a separate field on the scene (§4) — a camera framing that works in 16:9
will not work in 9:16, and this is not fixable with FOV alone.

`syncTouch: false` in Lenis. Fighting native touch scrolling always loses.

---

## 17. Reduced motion

`prefers-reduced-motion: reduce` is not "same thing, faster". Each renderer gets a real
alternative path:

| renderer | reduced-motion behaviour |
|---|---|
| all | no Lenis; native scroll; no pointer parallax |
| `three` | render **one static frame** per scene state; `IntersectionObserver` snaps the camera to the in-view scene's waypoint instead of scrubbing |
| `canvas2d` | draw a single representative frame; no sequence |
| `video` | show a poster image; no scrub, no autoplay |
| `dom` | opacity transitions only, no transforms |

`orbit` and `threejs-scroll-scene` both implement genuine alternative paths (single static render;
`IntersectionObserver` waypoint snapping) — use them as the pattern. This must be tested, not
assumed: a reduced-motion regression is invisible to anyone not using the setting.

Also handle: `visibilitychange` → stop the loop, and **discard the accumulated delta on resume**
(otherwise one frame advances by however long the tab was hidden).

---

## 18. Performance monitoring

The loop is **explicitly stage-ordered with a numbered schedule**, following `folio-2025`, whose
README documents its whole update graph as numbered stages with declared dependencies:

```
 0  time, input
 1  scroll → progress, velocity
 2  scene weights (in/out → weight)
 3  damp all state
 4  camera (weighted waypoints)
 5  parallax group
10  scene.update() for every scene with weight > 0.001
20  DOM writes (CSS vars, projections) — batched, once
998 render
999 monitor
```

Sparse numbering on purpose — insert a stage without renumbering. Rendering is always last;
monitoring after it. Dependencies are explicit, so ordering bugs (camera reading a stale weight)
become impossible rather than intermittent.

Instrumentation, all behind `?debug`:
- `stats-gl` (GPU timing, not just fps — `folio-2025` uses it over `stats.js`)
- per-stage `performance.now()` accumulation, printed as a table
- draw calls / triangles / programs / textures from `renderer.info`
- a rolling frame-time budget that auto-drops `state.quality` after N consecutive slow frames

---

## 19. Debugging

- `?debug` → Tweakpane panel, auto-populated from each scene's exported `debugParams`.
- `?scene=03` → jump directly to a scene's scroll position; sets all weights so only it is visible.
- `?quality=low` → force a tier.
- `?nomotion` → simulate reduced motion without OS settings.
- `?wireframe`, `?axes`, `?waypoints` → draw camera waypoints as gizmos with labels. Being able to
  *see* the waypoint field is what makes the weighted-average camera tractable.
- Global `error` + `unhandledrejection` handler that writes a visible failure state into the
  preloader instead of leaving a black screen (`awwwards-3d` does this — small, high value).
- WebGL unavailable → `<body class="no-webgl">`, DOM-only fallback styled to still look intentional.

---

## 20. How to add a scene without breaking the others

This is the automation contract. Adding scene `NN` is a fixed, verifiable procedure:

```
1. mkdir src/scenes/NN-name/
2. write index.ts exporting a Scene (copy the closest template)
3. write assets.ts if it needs assets     → tier: 'deferred'
4. add <section id="NN-name"> to dom/sections/
5. add one line to scenes/manifest.ts
6. run `npm run check:scenes`
```

**`check:scenes` is the guardrail** — a script that fails the build if:

- a scene's `id` is not unique or doesn't match its folder
- `section` selector doesn't resolve in the built HTML
- `renderer: 'three'` without a `waypoint`
- `build()` allocates a geometry/material/texture that `dispose()` does not free
  (instrument the loaders in a test harness and diff)
- a scene file imports from `../` another scene
- an asset is `tier: 'critical'` outside scene 01
- total `critical` bytes exceed the budget
- a `.glsl` uniform is declared but never set, or set but never declared

Why this holds together: **scenes are additive-only**. A new scene contributes a weight and a
waypoint to two sums (§7, §10). Sums don't care about order or count. It contributes objects to a
shared graph under its own `Group`. It contributes `update()` work that only runs when visible.
There is no shared mutable list to corrupt, no `switch` on scene id to extend, no camera segment
chain to re-time.

The two things that *would* break this, and are therefore forbidden by the lint step:
- a scene importing another scene
- a scene writing to a value the loop owns

---

## Recommended stack

| layer | choice | why |
|---|---|---|
| build | **Vite** + `vite-plugin-glsl` | universal in this space; every reference uses it |
| language | **TypeScript** | the `Scene` interface is the whole safety story |
| 3D | **three** (latest; `folio-2025` runs 0.183) | ecosystem depth |
| scroll | **Lenis** | 15.5k★, actively maintained, what the studios ship |
| animation | **GSAP** + ScrollTrigger | scrub + matchMedia have no real substitute |
| shell | **vanilla TS**, no framework for v1 | zero reconciliation risk; the whole `Webgl-Data-Globe` failure mode disappears |
| video scrub | port **`scrolly-video`**'s tiering | MIT, verified, solves a genuinely hard problem |
| assets | `@gltf-transform/cli` + `toktx` + `sharp` | `folio-2025`'s exact pipeline |
| debug | `tweakpane` + `stats-gl` | GPU timing, not just fps |
| audio | `howler` (optional) | both `folio-2025` and `davidhckh` use it |

**If React is required** (existing app, shared component library), use **R3F + `@14islands/r3f-scroll-rig`**
rather than rolling it — you get `GlobalCanvas`, the tunnel, refcounted registry, and scissor
viewports for free. The absolute rules then become: always use selectors with the store, read state
via `getState()` inside `useFrame`, and never subscribe a component to a value that changes per
frame.

Vanilla is the recommendation. The scene contract in §4 is not easier in React, and React's
reconciler is a liability in a 60fps render loop.
