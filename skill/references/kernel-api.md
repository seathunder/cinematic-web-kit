# Kernel API

Exact signatures, transcribed from source at
`C:\Users\HP\Desktop\cinematic-web-references\toolkit\kernel\`.

**If a function is not in this file, open the `.ts`. Do not infer a signature.** Four guides in this
project's history contained invented APIs — `acquire(keys: string[])`, `onQuality`, `setEnabled`,
`initCursor`, `initAnchors` — all of which typecheck as plausible and none of which exist.

Per-unit prose, gotchas, and recipes: `toolkit/docs/kernel/<name>.md`.

---

## `types.ts` — the vocabulary

Imports nothing. Every other file speaks this.

```ts
export type RendererKind = 'three' | 'canvas2d' | 'video' | 'dom' | 'none'
export type QualityTier = 'low' | 'medium' | 'high'

export interface Waypoint {
  position: [number, number, number]
  focus: [number, number, number]
  fov?: number
}

export interface WaypointSet {
  landscape: Waypoint
  portrait?: Waypoint          // omit and landscape is used for both
}

export interface SceneCtx {
  world: THREE.Scene                    // shared world — add here for no pointer parallax
  camera: THREE.PerspectiveCamera       // READ ONLY. Declare a waypoint instead
  parallax: THREE.Group                 // add here to get pointer parallax for free
  renderer: THREE.WebGLRenderer
  assets: AssetRegistry
  state: MotionState
  debug: Debug                          // never null — no-op when ?debug is absent
  layer: number                         // this scene's render layer
  el: HTMLElement | null                // the scene's own element, for dom/canvas2d/video
  frame: { weight: number; local: number; in: number; out: number }
}

export interface SceneDefinition {
  id: string                            // stable; used by ?scene= and data-active-scene
  renderer: RendererKind
  section: string                        // CSS selector for the DOM section it owns
  assets?: string[]                      // keys; build() waits for these
  quality?: QualityTier                  // minimum tier — below it the scene is skipped
  waypoint?: WaypointSet
  viewport?: { selector: string; clearDepth?: boolean }   // scissored render
  ease?: number                          // default 0.08
  ramp?: { enter?: number; exit?: number }                // in VIEWPORT HEIGHTS, default 0.8
  build(ctx: SceneCtx): void | Promise<void>
  enter?(dir: number, ctx: SceneCtx): void
  update?(w: number, ctx: SceneCtx): void
  render?(w: number, ctx: SceneCtx): void                 // canvas2d / video only
  exit?(dir: number, ctx: SceneCtx): void
  dispose(): void
}

export interface SceneInstance {
  def: SceneDefinition
  in: number; out: number; weight: number
  built: boolean; active: boolean
  rect: { top: number; height: number }
  section: HTMLElement | null
  el: HTMLElement | null
  ctx: SceneCtx | null
  privateScene: THREE.Scene | null
  privateCamera: THREE.PerspectiveCamera | null
  viewportEl: HTMLElement | null
}
```

**`ramp` is in viewport heights.** `{ enter: 0.8 }` means the ramp spans 80 % of the screen height,
so it means the same thing on a phone and a 27-inch monitor.

**Always write `satisfies SceneDefinition`, never `: SceneDefinition`.** The annotation widens the
literal and you lose inference on `ctx` inside the methods.

---

## `state.ts` — the single source of truth

Imports nothing but types. The leaf of the dependency graph, deliberately.

```ts
export interface Damped { current: number; target: number; ease: number }

export const damped = (v = 0, ease = 0.08): Damped => ({ current: v, target: v, ease })

export function damp(s: Damped, delta: number): void {
  const f = 1 - Math.pow(1 - s.ease, delta * 60)
  s.current += (s.target - s.current) * f
}

export function snap(s: Damped, v?: number): void      // no damping — jump. Resize/teleport only

export interface MotionState {
  progress: Damped                      // 0..1 down the document, ease 0.08
  velocity: Damped                      // signed, ease 0.12
  pointerX: Damped                      // 0..1, ease 0.06
  pointerY: Damped
  scroll: { value: number; max: number }        // raw px
  direction: 1 | -1
  hovering: boolean
  reducedMotion: boolean
  quality: QualityTier
  paused: boolean
  time: { elapsed: number; delta: number; frame: number }
  pageReflow: number                    // increments on every reflow — cache-invalidation token
  viewport: {
    width: number; height: number; dpr: number; aspect: number
    portrait: boolean
    breakpoint: 'mobile' | 'tablet' | 'desktop'
    touch: boolean
  }
}

export const state: MotionState
export function updateState(delta: number): void       // stage 10. Do not call it yourself

export const clamp  = (v: number, lo = 0, hi = 1) => number
export const range  = (v: number, a: number, b: number) => number   // (v-a)/(b-a), clamped
export const remap  = (v: number, a: number, b: number, c: number, d: number) => number
export const lerp   = (a: number, b: number, t: number) => number
export const smooth = (t: number) => number            // t²(3-2t) — smoothstep
export const bell   = (t: number) => number            // sin(clamp(t)·π) — 0→1→0
```

**`range` is the workhorse.** Almost every "start at x, finish at y" in a scene is a `range` call.

**`bell(local)`** gives you a bell from a ramp — handy when you want an in-and-out *inside* a
section rather than across it.

**`pageReflow`** is how you cache anything derived from layout:

```ts
let cachedRect = { top: 0, height: 0 }
let cachedAt = -1
function rect() {
  if (cachedAt !== state.pageReflow) { cachedRect = measure(el); cachedAt = state.pageReflow }
  return cachedRect
}
```

**Never read `.target` for rendering.** `.target` is the raw, un-smoothed input — correct for hit
testing (a probe reading `.current` puts the ripple ~100 ms behind the cursor, which reads as
sitewide lag), wrong for anything visual.

---

## `loop.ts` — one RAF, 22 stages

```ts
export interface Stage {
  order: number
  name: string
  fn: (delta: number, elapsed: number) => void
  after?: string[]
  enabled?: boolean
}

const MAX_DELTA = 1 / 20                      // clamps tab-switch stalls

export function addStage(stage: Stage): void  // THROWS if an `after` name is not yet registered
export function removeStage(name: string): void
export function setStageEnabled(name: string, on: boolean): void
export function listStages(): { order: number; name: string; enabled: boolean }[]
export function startLoop(): void
export function stopLoop(): void
export function bindVisibility(): () => void  // pauses on document.hidden
```

Bands: **0–99 kernel · 100–899 project · 900–979 DOM/interaction · 980–999 render/diagnostics.**

```ts
addStage({
  order: 300,                 // project band
  name: 'wind',
  after: ['state', 'weights'],
  fn: (delta, elapsed) => { uWind.value = 0.2 + Math.sin(elapsed * 0.4) * 0.1 },
})
```

The throw on a missing `after` is the point: a mis-ordered stage fails at boot with a name, instead
of producing a one-frame-late bug at frame 4000.

---

## `index.ts` — `boot()`

```ts
export interface BootOptions {
  manifest: SceneDefinition[]
  assets?: AssetSpec[]
  renderer?: RendererOptions
  camera?: CameraOptions
  scroll?: Parameters<typeof initScroll>[0]
  onProgress?: (p: number) => void
  onReady?: () => void | Promise<void>        // awaited — the preloader gate lives here
  decoders?: { dracoPath?: string; basisPath?: string }
}

export interface App {
  stage: Stage3D
  assets: AssetRegistry
  scenes: SceneManager
  camera: CameraRig
  debug: Debug
  destroy: () => void
}

export async function boot(opts: BootOptions): Promise<App>
```

Re-exported from `./kernel`, so a project needs one import path:

`./types`, `./state`, `addStage`/`removeStage`/`setStageEnabled`/`listStages`/`startLoop`/`stopLoop`,
`measure`/`requestReflow`/`onReflow`, `scrollTo`/`lenis`/`gsap`/`ScrollTrigger`,
`createStage`/`compileAll`/`renderScissor`/`resetViewport`, `AssetRegistry`/`loadVideo`,
`disposeObject`/`disposeMaterial`/`gpuInfo`/`leakWatch`, `budget`/`BUDGETS`/`detectQuality`,
`readFlags`, `ACTIVE_THRESHOLD`/`dominant`, `printWaypoint`, `THREE`.

**`THREE` is re-exported on purpose** — one three instance per bundle. Two copies of three in one
page produce `instanceof` failures that read as impossible bugs.

---

## `assets.ts` — refcounted loading

```ts
export type AssetKind = 'gltf' | 'texture' | 'ktx2' | 'hdr' | 'video' | 'audio' | 'json'

export interface AssetSpec {
  key: string
  url: string
  kind: AssetKind
  minQuality?: 'low' | 'medium' | 'high'      // skipped below this tier
  weight?: number                              // relative size, for honest progress
}

export class AssetRegistry {
  register(specs: AssetSpec[]): void
  onProgress(cb: (p: number, key: string) => void): void
  has(key: string): boolean
  get<T = unknown>(key: string): T             // THROWS if unknown or not yet loaded
  async acquire<T = unknown>(key: string, quality: 'low' | 'medium' | 'high' = 'high'): Promise<T | null>
  release(key: string, mode: 'dispose' | 'deactivate' = 'deactivate'): void
  progress(): number
  setBudget(keys: string[]): void
  live(): { key: string; instances: number; active: boolean }[]
  disposeAll(): void
}

export function loadVideo(url: string, opts?: { loop?: boolean }): Promise<HTMLVideoElement>
```

**`acquire` takes ONE key and an optional quality — `acquire(key, quality?)`.** It does not take an
array. This is the specific signature that has been invented wrong more than once.

**`get` throws; `acquire` returns `null`.** `get` in `build()` is correct because the scene declared
the key in `assets: []` and the kernel already awaited it. `acquire` is for opportunistic loading
outside that guarantee — and it returns `null` when the tier forbids the asset, so handle it.

**`weight`** makes the progress bar honest. Without it, a 12 MB glTF and a 3 KB JSON each count as
one unit, and your bar sits at 90 % for eight seconds. Set `weight` to roughly the file size in MB.

**`release(key, 'deactivate')` vs `'dispose'`:** `deactivate` keeps it in memory for re-entry
(right for a scene the user will scroll back into); `dispose` frees the GPU resource (right when
you are done with it for good). Default is `deactivate`.

---

## `renderer.ts`

```ts
export interface RendererOptions {
  canvas?: HTMLCanvasElement
  alpha?: boolean
  antialias?: boolean
  clearColor?: number
  tone?: 'aces' | 'agx' | 'neutral' | 'none'
  exposure?: number
  shadows?: boolean
}

export interface Stage3D {
  renderer: THREE.WebGLRenderer
  world: THREE.Scene
  camera: THREE.PerspectiveCamera
  parallax: THREE.Group
  envTexture: THREE.Texture | null
  resize: () => void
  dispose: () => void
}

export function createStage(opts?: RendererOptions): Stage3D
export async function compileAll(...): Promise<void>
export function renderScissor(...): void
export function resetViewport(renderer: THREE.WebGLRenderer): void
```

**Tone mapping:** `aces` is the safe cinematic default. `agx` rolls off highlights more gently and
desaturates less at the top — better for anything with a bright practical light in frame.
`neutral` (Khronos PBR neutral) is for product accuracy, not drama.

**Tone mapping is applied only when rendering to the canvas, not to a render target** —
`three.module.js:7549–7559` and `18345–18355` gate it on `currentRenderTarget === null`. This is why
`OutputPass` must be the last pass before your grade: it is the pass that does the tone map + colour
space conversion that the direct-to-canvas path would have done.

**`compileAll()` before the first visible frame, always.** three compiles lazily on first draw;
without it, the frame a material first appears in stalls 50–300 ms, exactly at the reveal you
art-directed.

---

## `camera.ts`

```ts
export interface CameraOptions {
  fallback?: Waypoint            // used when no scene is active
  parallaxStrength?: number      // world units of group offset
  parallaxTilt?: number          // radians of camera tilt. 0.02–0.06
  ease?: number                  // 0.06–0.12. The camera should be the heaviest thing on the page
  velocityRoll?: number          // 0.01–0.03 → roughly 0.5–1.5°
}

export interface CameraRig {
  update: (delta: number) => void
  snapToTargets: () => void      // no damping. Call after a teleport or a covered cut
  targetPosition: THREE.Vector3
  targetFocus: THREE.Vector3
  fov: Damped
}

export function createCameraRig(
  camera: THREE.PerspectiveCamera,
  parallax: THREE.Group,
  instances: SceneInstance[],
  opts?: CameraOptions,
): CameraRig

export function initCamera(rig: CameraRig): void
// registers addStage({ order: 50, name: 'camera', after: ['weights'] })

export function printWaypoint(camera: THREE.Camera, focus?: THREE.Vector3): string
```

**`snapToTargets()` inside a covered cut.** If you teleport the camera while a transition covers the
screen, the damped rig will spend the next second easing from the old position — visibly, after the
cover lifts. Snap while it is dark.

**Authoring waypoints:** `?debug` → orbit to the shot → `cw.waypoint()` in the console → paste.

---

## `stage.ts` — the scene manager

```ts
export interface SceneManager {
  instances: SceneInstance[]
  setMainRender: (fn: (() => void) | null) => void
  dispose: () => void
}

export interface ManagerOptions {
  stage: Stage3D
  assets: AssetRegistry
  debug: Debug
  manifest: SceneDefinition[]
  only?: string | null                  // ?scene= isolation
  instances?: SceneInstance[]
}

export async function createSceneManager(opts: ManagerOptions): Promise<SceneManager>
```

**`setMainRender` is the postprocessing seam:**

```ts
const post = createPost(app.stage, { bloom: { strength: 0.5 } })
if (post) app.scenes.setMainRender(post.render)      // null when the tier forbids post
```

`createPost` returns `PostChain | null`, so this `if` is the required call pattern, not a
defensive habit.

Also owns **stage 900 `scene-attr`** (writes `data-active-scene` and per-scene weight custom
properties) and **stage 980 `render`**.

---

## `weights.ts`

```ts
export const ACTIVE_THRESHOLD = 0.001
export function measureScene(inst: SceneInstance): void
export function computeWeights(instances: SceneInstance[]): void
export function initWeights(...): void                          // stage 40
export function dominant(instances: SceneInstance[]): SceneInstance | null
```

`0.001`, never `0` — a finished float ramp yields `3e-17`, so `> 0` never deactivates anything. It
also guards the camera's division by `Σ(weight)`.

`dominant()` is the highest-weight active scene: the right input for "which chapter are we in" —
nav highlighting, the page title, a colour theme.

---

## `viewport.ts`

```ts
export function requestReflow(): void                     // coalesced; bumps state.pageReflow
export function onReflow(fn: () => void): () => void      // returns an unsubscribe
export function measureViewport(): void
export function measure(el: HTMLElement): { top: number; height: number }
export function initViewport(): () => void                // stage 30
```

**Call `requestReflow()` after anything that changes document height** — fonts loading, an accordion
opening, images without dimensions settling. Scene rects are cached, so without it every scroll
range is silently wrong and it looks like the scroll trigger points are off.

**`--vh`** is published because `100vh` lies on mobile — browser chrome makes it taller than the
visible area, so a `100vh` hero is cut off. Use `calc(var(--vh) * 100)`.

---

## `quality.ts`

```ts
export interface QualityBudget {
  dpr: number; antialias: boolean; shadows: boolean; postprocessing: boolean
  density: number; shadowMap: number; anisotropy: number; maxActiveScenes: number
}

export const BUDGETS: Record<QualityTier, QualityBudget>
export const budget = (): QualityBudget => BUDGETS[state.quality]
export function detectQuality(): QualityTier              // deviceMemory + hardwareConcurrency
export function createWatchdog(...): void                 // stage 995. Demotes only
```

| | dpr | antialias | shadows | post | density | shadowMap | aniso | maxActiveScenes |
|---|---|---|---|---|---|---|---|---|
| low | 1 | false | false | false | 0.25 | 0 | 1 | 2 |
| medium | 1.5 | false | true | true | 0.6 | 1024 | 2 | 3 |
| high | 2 | true | true | true | 1 | 2048 | 4 | 4 |

**Call `budget()` at the point of use. Never cache it in a module-scope const** — the tier can
change under you, and a cached budget silently ignores the demotion.

---

## `scroll.ts`

```ts
export let lenis: Lenis | null

export interface ScrollOptions {
  duration?: number          // default 1.1; forced to 0 under reducedMotion
  wheelMultiplier?: number
  syncTouch?: boolean
  wrapper?: HTMLElement
  content?: HTMLElement
}

export function initScroll(opts?: ScrollOptions): () => void
export function scrollTo(
  target: string | number | HTMLElement,
  opts?: { offset?: number; duration?: number; immediate?: boolean },   // duration default 1.2
): void
export function stopScroll(): void
export function startScroll(): void
export function initPointer(el?: HTMLElement | Window): () => void
export { gsap, ScrollTrigger }
```

**All three bridge lines are required** — omit any one and you get misfiring triggers, judder, or
desync:

```ts
lenis.on('scroll', ScrollTrigger.update)
gsap.ticker.add((t) => lenis.raf(t * 1000))
gsap.ticker.lagSmoothing(0)
```

**`stopScroll()` while a modal or a transition owns the screen.** Letting a user scroll behind a
cover means they arrive somewhere unexpected when it lifts.

**`syncTouch`** is off by default and should usually stay off — hijacking native touch scrolling is
the fastest way to make a site feel broken on a phone.

---

## `dispose.ts`

```ts
export function disposeMaterial(m: THREE.Material | THREE.Material[]): void
export function disposeObject(root: THREE.Object3D, opts?: { detach?: boolean }): void
export function gpuInfo(renderer: THREE.WebGLRenderer): {...}      // geometries, textures, programs, calls
export function leakWatch(renderer: THREE.WebGLRenderer, label: string, tolerance?: number): void
```

**`disposeObject` walks the tree and frees geometries, materials, and every texture-valued
property.** Removing an object from the scene frees nothing — `remove()` unparents; the VRAM stays
allocated. This is law 8, and the leak is invisible in a JS heap snapshot because the bytes are on
the GPU.

**`leakWatch(renderer, 'scene-03')`** samples `gpuInfo` and warns if counts grow past `tolerance`
(default 4) across enter/exit cycles. Scroll through the site twice with it on; if a count climbs,
the scene's `dispose` is not symmetric with its `build`.

---

## `debug.ts`

```ts
export interface DebugFlags {
  enabled: boolean; stats: boolean
  scene: string | null
  quality: QualityTier | null
  nomotion: boolean; wireframe: boolean; axes: boolean; waypoints: boolean
}

export function readFlags(search?: string): DebugFlags

export interface Debug {
  flags: DebugFlags
  slider(label: string, obj: object, key: string, opts?: { min?: number; max?: number; step?: number }): () => void
  color(label: string, obj: object, key: string): () => void
  toggle(label: string, obj: object, key: string): () => void
  button(label: string, fn: () => void): () => void
  monitor(label: string, read: () => number | string): () => void
  folder(name: string): Debug
  bindScenes(instances: SceneInstance[]): void
  log(...args: unknown[]): void
  dispose(): void
}

export async function createDebug(
  flags: DebugFlags, renderer, world, instances,
): Promise<Debug>
```

**When `?debug` is absent, `createDebug` returns `nullDebug` — every method a no-op returning a
no-op.** So a scene never branches on whether debug exists:

```ts
build(ctx) {
  ctx.debug.slider('fog density', fog, 'density', { min: 0, max: 0.2 })   // safe in production
}
```

That is the whole design goal: debug instrumentation you never have to remove, and therefore never
have to re-add when the client asks for a tweak three weeks later.

**Tweakpane needs `@tweakpane/core` installed** — `Pane.addFolder` fails without the peer.

Flags: `?debug` `?stats` `?scene=03` `?quality=low` `?nomotion` `?wireframe` `?axes` `?waypoints`.

---

Related: `architecture.md` (why these boundaries) · `modules-api.md` ·
`toolkit/docs/kernel/*.md` (nine sections each) · `toolkit/docs/EVIDENCE.md` (line-numbered
verification for every three.js claim above).
