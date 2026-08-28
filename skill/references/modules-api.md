# Modules API

Exact signatures, transcribed from source at
`C:\Users\HP\Desktop\cinematic-web-references\toolkit\modules\`.

Every module is optional. Delete any one and nothing else breaks. Per-unit prose and recipes:
`toolkit/docs/modules/<name>.md`.

---

## `post.ts` — bloom, DOF, grade

```ts
export type GradeKey =
  | 'uGrain' | 'uVignette' | 'uVignetteSoft' | 'uAberration'
  | 'uContrast' | 'uSaturation' | 'uBrightness' | 'uTintStrength' | 'uFade'

export interface BloomOptions { strength?: number; radius?: number; threshold?: number; half?: boolean }
export interface DofOptions   { focus?: number; aperture?: number; maxblur?: number }
export interface PostOptions  { bloom?: BloomOptions | false; dof?: DofOptions | false
                                grade?: Partial<Record<GradeKey, number>>; samples?: number }

export interface PostChain {
  composer: EffectComposer
  bloom: UnrealBloomPass | null
  bokeh: BokehPass | null
  grade: ShaderPass
  set(key: GradeKey, value: number): void
  get(key: GradeKey): number
  setTint(shadow: THREE.ColorRepresentation, highlight: THREE.ColorRepresentation): void
  render(): void
  resize(): void
  dispose(): void
}

export function createPost(stage: Stage3D, opts?: PostOptions): PostChain | null
export function createSelectiveBloom(stage: Stage3D, layer: number, opts?: BloomOptions):
  { render(draw: () => void): void; dispose(): void }
export function bindVelocityToGrade(post: PostChain,
  opts?: { aberration?: number; vignette?: number; grain?: number }): void
```

**`createPost` returns `null`** when `budget().postprocessing` is false. The call pattern is always:

```ts
const post = createPost(app.stage, { bloom: { strength: 0.45, threshold: 0.85 } })
if (post) app.scenes.setMainRender(post.render)
```

### Pass order is non-negotiable

```
HalfFloat target → RenderPass → UnrealBloomPass → BokehPass → OutputPass → GradePass
```

`OutputPass` does the tone map and colour-space conversion that the direct-to-canvas path would
have done — three only applies tone mapping when `currentRenderTarget === null`
(`three.module.js:7549–7559`, `18345–18355`). So:

- **Bloom before `OutputPass`** — it must operate on linear HDR values. After it, bloom either does
  nothing (nothing exceeds the threshold) or blows out.
- **The grade after `OutputPass`** — you are grading display-referred pixels, which is what a
  colourist does.
- **FXAA, if you use it, after `OutputPass`.** It is a perceptual filter on final pixels.

### Jaggies under postprocessing

`antialias: true` on the renderer does **nothing** once you render through a composer:
`EffectComposer.js:69` creates its target with only `{ type: HalfFloatType }`, and
`RenderTarget.js:63` defaults `samples: 0`. The fix is `samples` on the composer target, not FXAA:

```ts
createPost(stage, { samples: 4 })    // real MSAA. Costs fill rate; looks correct
```

### The grade is where the film look lives

```ts
post.setTint(0x1a2740, 0xffd9a0)      // cool shadows, warm highlights — teal/orange, two uniforms
post.set('uGrain', 0.045)             // 0.03–0.06. Above 0.08 it reads as noise
post.set('uVignette', 0.35)
post.set('uAberration', 2.0)          // in pixels. 4+ is a stylistic statement
```

**Two-colour grading is how film stocks actually differ.** It costs two `vec3` uniforms and beats
any LUT you will find for free.

`bindVelocityToGrade(post)` ties aberration, vignette, and grain to scroll speed — motion-dependent
lens character, four lines, and it does more for perceived quality than another pass.

**`uFade`** is a full-screen fade-to-black inside the grade. Use it for the cheapest possible cut;
`transition.ts` for anything with shape.

**Bloom is the most-abused pass.** `strength` above ~0.8 with a low `threshold` is the "everything
glows" look that reads as amateur. Raise the threshold instead so only genuine highlights bloom.
`half: true` halves the bloom resolution and is almost always invisible.

---

## `cursor.ts` — custom cursor and magnetics

```ts
export interface CursorOptions {
  el?: HTMLElement
  dotEase?: number         // default 0.35 — the fastest damped thing on the page
  ringEase?: number        // default 0.1
  stretch?: number         // default 0.08 — velocity-driven squash
  attribute?: string       // default 'data-cursor'
  publish?: boolean        // default false
}

export interface Cursor {
  root: HTMLElement
  setState(state: string | null): void
  setText(text: string | null): void
  snapTo(el: HTMLElement | null): void
  hide(): void
  show(): void
  enabled: boolean
  dispose(): void
}

export function createCursor(opts?: CursorOptions): Cursor
export function initMagnetic(
  selector?: string,                                    // default '[data-magnetic]'
  opts?: { strength?: number; radius?: number; ease?: number },   // 0.22, 140, 0.14
): () => void
```

### The attribute contract — read this, do not guess it

| attribute | on | value |
|---|---|---|
| `data-cursor-active` | `<html>` | `"true"` — a **boolean**, meaning the custom cursor is running |
| `data-cursor-state` | the cursor **root** | the state name (`"view"`, `"drag"`, `"sound"`) |

They are on **different elements**. `data-cursor-active` is the switch for hiding the native cursor;
`data-cursor-state` is what you style the ring off.

```html
<a href="/work" data-cursor="view">Work</a>
<button data-cursor-snap>Enter</button>
<a data-magnetic="0.3">Contact</a>          <!-- per-element strength override -->
```

```css
[data-cursor-active] * { cursor: none; }
/* MANDATORY exception — a text field with no caret is broken, not stylish */
[data-cursor-active] input,
[data-cursor-active] textarea,
[data-cursor-active] [contenteditable] { cursor: auto; }

[data-cursor-state='view'] .cursor__ring { transform: scale(2.4); }
```

**Gate on capability, not width:** `@media (hover: hover) and (pointer: fine)`. A width query gives
a custom cursor to a tablet with a stylus and withholds it from a small laptop.

**`snapTo(el)` divides by a 40 px ring base constant.** If you restyle the ring's base size, that
constant is what makes the snap fit; changing the CSS alone makes snapped rings the wrong size.

**Cursor state should come from the picker, not from CSS hover**, when the target is 3D:

```ts
picker.add(katana, { onEnter: () => cursor.setState('view'), onLeave: () => cursor.setState(null) })
```

**`state.reducedMotion` disables the cursor and magnetics entirely.** Do not defeat this.

---

## `audio.ts` — one context, and six platform rules

```ts
export interface AudioOptions { volume?: number          // 0.7
                                storageKey?: string | null   // 'cw-muted'
                                fftSize?: number         // 1024 → 512 bins at ~43 Hz
                                reactive?: boolean }

export interface PlayOptions { volume?: number; rate?: number; pan?: number
                               loop?: boolean; fade?: number }

export interface MusicHandle {
  el: HTMLAudioElement
  play(fadeSeconds?: number): Promise<void>       // default 2
  pause(fadeSeconds?: number): void               // default 1
  setVolume(v: number, seconds?: number): void
  dispose(): void
}

export interface AudioSystem {
  readonly context: AudioContext | null
  readonly unlocked: boolean
  readonly muted: boolean
  unlock(): Promise<void>                         // SYNCHRONOUSLY inside a gesture handler
  bindUnlockGesture(): () => void
  loadSfx(key: string, url: string): Promise<void>
  play(key: string, opts?: PlayOptions): void     // silently ignored before unlock, by design
  music(url: string, opts?: { volume?: number; loop?: boolean }): MusicHandle
  setVolume(v: number, seconds?: number): void
  mute(on?: boolean): boolean
  duck(amount: number, seconds: number): void
  readonly level: number; readonly bass: number
  readonly mid: number;   readonly treble: number
  setLowpass(hz: number, seconds?: number): void  // 20000 open, 400 underwater
  bindScrollFilter(opts?: { minHz?: number; maxHz?: number }): void
  dispose(): void
}

export function createAudio(opts?: AudioOptions): AudioSystem
```

### The six rules. Every failure is silent.

1. **The context starts suspended.** `resume()` must be called **synchronously inside** a
   click/keydown/touch handler — *not* from a promise chained off one, because the user-activation
   flag is consumed asynchronously. `onclick = () => audio.unlock()` works;
   `onclick = async () => { await x; audio.unlock() }` does not. **This is why the preloader has a
   gate** — it is not a design flourish, it is the only reliable unlock point.
2. **One context for the life of the page.** Safari has historically allowed only a handful and does
   not reclaim them quickly. One-per-sound works in development and dies on the client's iPhone.
3. **Never assign `gain.value` while sound plays.** A step in gain is a waveform discontinuity — you
   hear a click. Use `setTargetAtTime`, which reaches ~95 % after **three** time constants, hence
   `seconds / 3` everywhere.
4. **Long audio streams, short audio decodes.** `music()` uses `<audio>` +
   `createMediaElementSource`; `loadSfx` decodes to an `AudioBuffer`. Getting it backwards either
   stalls the page (decoding 4 MB) or adds ~100 ms of latency to a click.
5. **`crossOrigin = 'anonymous'`** on any media element routed through WebAudio — without it a
   cross-origin file taints the graph and outputs **silence with no error**.
6. **Never autoplay; always a visible, persisted mute.**

Also: `decodeAudioData` **detaches** the ArrayBuffer (single use). An `AudioBufferSourceNode` is
single-use — create one per `play()`. **iOS needs a 1-sample silent buffer** played through the
context to stay awake; `unlock()` does this, and removing it "because it does nothing" breaks iOS.
`bin → Hz` is `bin * sampleRate / fftSize`.

### The two highest-value calls

```ts
audio.bindScrollFilter({ minHz: 600, maxHz: 20000 })
```

Scroll fast, the mix muffles; stop, it opens. One `.value` write per frame, and it produces a
remarkably strong sense of *being in a space you are moving through*. Do this before any other sound
work.

```ts
update(w) { lantern.intensity = 1.2 + audio.bass * 2.5 * w }
```

Three band numbers per frame turn the score into animation input.

Publishes `--audio-level` on `<html>` (so a meter needs no JS) and `data-audio-muted`.
Stage 940 `audio`, stage 941 `audio-scroll-filter`.

---

## `transition.ts` — covered cuts

```ts
export type TransitionKind = 'fade' | 'wipe' | 'dissolve' | 'iris' | 'ink' | 'glitch'
// MODE = 0..5 in the shader, same order

export interface TransitionOptions {
  duration?: number; ease?: string; angle?: number
  color?: THREE.ColorRepresentation; lockScroll?: boolean; softness?: number
}

export interface TransitionLayer {
  cover(kind?: TransitionKind, opts?: TransitionOptions): Promise<void>
  reveal(kind?: TransitionKind, opts?: TransitionOptions): Promise<void>
  run(fn: () => void | Promise<void>, kind?: TransitionKind, opts?: TransitionOptions): Promise<void>
  // …
}

export function createTransitionLayer(stage: Stage3D): TransitionLayer
export function navigateWithTransition(url: string, layer?: TransitionLayer, kind?: TransitionKind): Promise<void>
export function createScrollCut(layer: TransitionLayer,
  opts?: { kind?: TransitionKind; from?: number; to?: number; onCovered?: () => void }): void
  // from 0.45, to 0.55
```

**`run()` is the whole point.** It covers, runs your function while nothing is visible, then reveals:

```ts
await layer.run(async () => {
  await swapWorld()              // dispose one world, build another
  camera.snapToTargets()         // teleport WITHOUT a visible ease
  audio.setLowpass(400, 0.01)
  post!.setTint(0x2a1810, 0xffe8c0)
  document.documentElement.dataset.world = 'ash'
}, 'ink', { duration: 1.2 })
```

**Five changes behind one cover reads as one event.** That is the only place you may change all the
rules at once — and it is what makes a transition between *worlds* feel like a cut in a film rather
than a page change.

**`navigateWithTransition`** uses `document.startViewTransition` where available and falls back to
the shader layer.

**Pick a vocabulary of two kinds and stay in it.** Six different transitions is a showreel of
transitions, not a film.

| direction | pair |
|---|---|
| Japanese, brush, ink | `ink` + `fade` |
| editorial, graphic | `wipe` + `fade` |
| classical, filmic | `iris` + `dissolve` |
| technological, broken | `glitch` + `wipe` |
| atmospheric, dreamlike | `dissolve` + `fade` |

**`lockScroll` while covered**, and `picker.setEnabled(false)` — a user who scrolls or clicks behind
a cover arrives somewhere unexpected when it lifts.

Stage 985.

---

## `text-split.ts` — lines, words, chars

```ts
export type SplitMode = 'lines' | 'words' | 'chars'
export interface SplitOptions { modes?: SplitMode[]; mask?: boolean; prefix?: string
                                responsive?: boolean; aria?: boolean }
export interface SplitText { root: HTMLElement
                             lines: HTMLElement[]; words: HTMLElement[]; chars: HTMLElement[]
                             refresh(): void; revert(): void }
export function splitText(target: string | HTMLElement, opts?: SplitOptions): SplitText

export interface TextRevealOptions { level?: SplitMode; duration?: number; stagger?: number
                                     y?: number; rotate?: number; fade?: boolean
                                     ease?: string; reverse?: boolean }
export type Timeline = ReturnType<typeof gsap.timeline>
export function textTimeline(split: SplitText, opts?: TextRevealOptions): Timeline   // PAUSED
export function initSplits(selector?: string, opts?: SplitOptions): Map<string, SplitText>
```

**`textTimeline` returns a *paused* timeline on purpose.** You drive it — `.play()` from `enter()`,
or `.progress(local)` to scrub. A timeline that autoplays on creation fires while the text is still
off-screen.

**`mask: true`** wraps each line in `overflow: hidden` so type can rise from behind a hard edge. It
is the single best-looking text reveal and it needs the wrapper.

**Split by lines by default.** Per-character reveals on a paragraph are the most-overused effect on
the web; save chars for a title of three or four words.

**`responsive: true` re-splits on resize** — mandatory for anything using `lines`, because line
breaks change with width and a stale split leaves words stranded mid-line.

**`aria: true`** keeps the original text available to screen readers. Splitting a heading into 40
`<span>`s otherwise makes it unreadable to assistive technology.

Generated elements carry `--i` (index) and `--n` (total), so a CSS-only stagger needs no JS:

```css
.line { transition-delay: calc(var(--i) * 60ms); }
```

---

## `instancing.ts` — many things, cheaply

```ts
export const instanceTime: { value: number }          // stage 45

export interface InstancedField {
  mesh: THREE.InstancedMesh
  count: number
  set(i: number, t: InstanceTransform): void
  commit(): void                                       // ONE upload for all writes
  relayout(fn: (i: number, n: number) => InstanceTransform): void
  matrixOf(i: number, out: THREE.Matrix4): THREE.Matrix4
  dispose(opts?: { keepAssets?: boolean }): void
}
export function createInstancedField(opts: InstancedFieldOptions): InstancedField

export interface GpuAnimateOptions {
  glsl: string
  attributes?: Record<string, THREE.InstancedBufferAttribute>
  uniforms?: Record<string, { value: unknown }>
  space?: 'local' | 'view'
  cacheKey?: string                                    // REQUIRED if you use it twice
}
export function gpuAnimate<M extends THREE.Material>(material: M, opts: GpuAnimateOptions): M

export function createParticleField(opts: ParticleFieldOptions): ParticleField
export const layouts: { fibonacciSphere; scatterPlane; jitteredGrid; alongCurve }
```

### The rule

**If the motion is a function of time and per-instance identity, it belongs on the GPU.**

| | CPU (`set` + `commit`) | GPU (`gpuAnimate`) |
|---|---|---|
| per frame | one `Matrix4` compose (~16 multiplies) per instance, then upload | **one uniform write, regardless of N** |
| 10 000 instances | 160 000 multiplies + a 640 KB upload every frame | one float |
| use when | motion depends on unpredictable state | motion is `f(time, id)` |

```ts
gpuAnimate(material, {
  glsl: `
    float phase = aSeed * 6.283;
    transformed.x += sin(uTime * 1.4 + phase) * aSway;
    transformed.y += cos(uTime * 0.9 + phase) * aSway * 0.4;
  `,
  attributes: { aSeed, aSway },
  uniforms: { uTime: instanceTime, uWind },
  cacheKey: 'grass-sway',
})
```

### Two hard requirements

**1. `customProgramCacheKey`.** three caches compiled programs by material config; two materials with
different `onBeforeCompile` injections and the same config get the **same** program. Symptom: *your
second field animates like the first.* `gpuAnimate` sets it from `cacheKey` — pass a distinct one
per injection.

**2. Where you inject.** The two chunks, verified by running node:

```
begin_vertex   → declares  vec3 transformed = vec3( position );
project_vertex → declares  vec4 mvPosition, applies instanceMatrix under #ifdef USE_INSTANCING
```

So `space: 'local'` writes `transformed` (before the instance matrix); `space: 'view'` operates in
view space and needs `(viewMatrix * vec4(offset, 0.0)).xyz` — **`w = 0.0`**, because it is a
direction, not a position. `w = 1.0` adds the camera translation to your offset and everything
drifts when the camera moves.

### Gotchas

- **`commit()` once per frame, not per `set()`.** Each commit is a full buffer upload.
- **Shadow maps do not see `onBeforeCompile` injections** — the depth material is separate. A
  GPU-animated mesh casts a **static** shadow. Options: accept it, disable the caster, or inject the
  same GLSL into `customDepthMaterial`.
- **`gl_PointSize` is driver-capped** (`ALIASED_POINT_SIZE_RANGE`, commonly 1024, reportedly as low
  as 63 on some mobile GPUs). Points cannot rotate. Transparent particles need
  `depthWrite: false`, or they punch holes in each other.
- **Scale counts by `budget().density`.** A field that ignores it will not run on the low tier.
- **Picking an instance:** the intersection carries `instanceId`; read the transform back with
  `field.matrixOf(id, m)`.

---

## `frame-sequence.ts` — image sequences without 2 GB of RAM

```ts
export interface FrameSequenceOptions {
  src: (i: number) => string
  count: number
  window?: number            // decoded frames held either side of the playhead
  sparse?: number
  concurrency?: number       // default 6
  canvas?: HTMLCanvasElement
  onFrame?: (i: number) => void
  onProgress?: (p: number) => void
}
export interface FrameSequence {
  ready: Promise<void>; complete: boolean
  texture: THREE.Texture
  count: number; width: number; height: number
  seek(p: number): void                        // 0..1 — feed it ctx.frame.local
  progress(): number
  dispose(): void
}
export function createFrameSequence(opts: FrameSequenceOptions): FrameSequence
```

### The arithmetic that makes this module exist

1920 × 1080 × 4 bytes = **8.29 MB per decoded frame**. × 240 frames = **1.99 GB**. Every
open-source frame-sequence implementation surveyed for this toolkit decodes eagerly and therefore
allocates that.

**Two tiers:** all frames held as encoded `Blob`s (40–80 KB each — ~15 MB for 240 frames) plus a
**sliding window** of decoded `ImageBitmap`s around the playhead. Scrubbing is instant; memory is
bounded.

- **`createImageBitmap()` decodes off the main thread.** `new Image()` + `onload` does not, so it
  stutters the frame it lands on.
- **Every `ImageBitmap` needs `.close()`.** It holds memory the JS GC does not manage — invisible in
  a heap snapshot.
- **`window`** trades memory for scrub-back smoothness. 12–24 is usually right.

Use this over `video-scrub` for **alpha** and for **line art** (no codec mush on hand-drawn edges).
Encode frames with libwebp, q80–85.

---

## `video-scrub.ts` — scroll-driven video

```ts
export type ScrubStrategy = 'webcodecs' | 'rate' | 'seek'
export interface ScrubOptions { strategy?: ScrubStrategy; cacheSize?: number; lookahead?: number
                                maxRate?: number; canvas?: HTMLCanvasElement
                                onFrame?: (t: number) => void }
export interface VideoScrub {
  strategy: ScrubStrategy
  ready: Promise<void>
  duration: number
  texture: THREE.Texture
  width: number; height: number
  seek(p: number): void                       // 0..1 — feed it ctx.frame.local
  dispose(): void
}
export function createVideoScrub(url: string, opts?: ScrubOptions): VideoScrub
export function pickStrategy(): ScrubStrategy
```

`pickStrategy()`: `seek` on WebKit, `rate` elsewhere, for the low tier or when `VideoDecoder` is
missing; otherwise `webcodecs`.

### Encoding is most of the battle

x264's default `keyint` is **250**. Seeking to an arbitrary time decodes from the previous keyframe,
so with a 250-frame GOP a scrub decodes up to 250 frames per seek. **`-g 10` is the difference
between smooth and unusable.**

```bash
ffmpeg -i in.mov -c:v libx264 -crf 22 -g 10 -bf 0 -pix_fmt yuv420p -movflags +faststart -an out.mp4
```

`-bf 0` (no B-frames) removes decode reordering. `+faststart` puts the moov atom first so playback
can begin before the file finishes downloading. `-an` — the audio track is dead weight in a scrub.

**Every `VideoFrame` needs `.close()`.** Same invisible-leak class as `ImageBitmap`.

---

## `raycast.ts` — picking, and the maths helpers

```ts
export interface PickHandlers {
  onEnter?: (hit: THREE.Intersection) => void
  onLeave?: () => void                          // no argument — nothing to report on a leave
  onMove?: (hit: THREE.Intersection) => void
  onClick?: (hit: THREE.Intersection) => void   // only if the pointer moved < 8px between down and up
  proxy?: THREE.Object3D                        // test this; handlers still get the real object
  always?: boolean                              // object moves on its own — re-test every tick
  cursor?: string                               // writes data-cursor-state on <html> while hovered
  priority?: number                             // higher wins over nearer
}
export interface Picker {
  add(object: THREE.Object3D, handlers: PickHandlers): () => void   // returns unregister
  readonly hovered: THREE.Object3D | null
  readonly hit: THREE.Intersection | null
  setEnabled(on: boolean): void
  dispose(): void
}
export interface PickerOptions { el?: HTMLElement; layer?: number
                                 hz?: number              // default 30
                                 pointsThreshold?: number }  // default 0.1 world units
export function createPicker(camera: THREE.Camera, opts?: PickerOptions): Picker

export function createPlaneProbe(camera: THREE.Camera, plane?: THREE.Plane): {
  read(out?: THREE.Vector3): THREE.Vector3 | null      // from the RAW pointer
  at(x: number, y: number, out?: THREE.Vector3): THREE.Vector3 | null
  plane: THREE.Plane
}
export function worldToScreen(point, camera, out?): { x; y; z; visible }
export function screenToWorld(clientX, clientY, distance: number, camera, out?): THREE.Vector3
export function visibleSizeAt(distance: number, camera: THREE.PerspectiveCamera): { width; height }
```

### Four rules

1. **Only registered objects.** `intersectObjects(scene.children, true)` tests **every triangle** of
   every mesh whose bounding sphere is hit. A 120k-triangle character = **120,000** ray/triangle
   tests, on a `pointermove` that fires up to 120×/s = 14.4M intersections per second to answer one
   boolean.
2. **Only when something changed.** `hz: 30` — imperceptible, half the cost of 60. The handler sets
   a dirty flag; the stage does the work.
3. **Test a proxy, not the art.** A 12-triangle box instead of 120,000. **120,000 → 12, one line.**
   The biggest single win available.
4. **World matrices must be current.** `Object3D.raycast` reads `matrixWorld`, which three refreshes
   only inside `renderer.render()`. A picker running before the render stage tests **last frame's**
   transforms — "the hitbox lags the model". This module calls `updateWorldMatrix(true, false)`
   itself: `true` walks *up* so a parent's animation counts, `false` skips descending because
   `Object3D.raycast` refreshes children.

**`visible = false` does NOT stop raycasting.** Very common mystery-hit source. Unregister, or
`setEnabled(false)`.

**Use the raw pointer for hit testing.** `createPlaneProbe.read()` reads `pointerX.target`
deliberately — `.current` trails ~100 ms and puts the ripple behind the cursor, which reads as
sitewide lag.

**`createPlaneProbe` is what you actually want, most of the time.** One ray/plane intersection —
about a dozen floating-point ops, no geometry, no traversal. Anything following the pointer across a
surface should use this, not a giant invisible plane plus a raycast.

**`screenToWorld` takes a *distance*, not a "z".** A screen position is a **ray**; you must say how
far along it. `visibleSizeAt` is `height = 2 · tan(fov · π / 360) · distance` — the one-liner for
fitting a plane exactly to the viewport.

**`picker.setEnabled(false)` during transitions.** Otherwise users click a fade.

Stage 970, `after: ['scenes']`.

---

## `dom-bridge.ts` — GL ↔ CSS

```ts
export interface BridgeOptions { sceneWeights?: boolean; precision?: number; root?: HTMLElement }
export function initDomBridge(opts?: BridgeOptions): void         // stage 900

export function createAnchors(camera: THREE.Camera): {
  add(el: HTMLElement, target: THREE.Object3D | THREE.Vector3,
      opts?: { offset?: THREE.Vector3; cull?: boolean; scaleWithDepth?: boolean }): () => void
  clear(): void
  dispose(): void
}                                                                  // stage 910

export function initReveal(instances: SceneInstance[],
  opts?: { selector?: string; stagger?: number }): void            // stage 920, '[data-reveal]'
```

Publishes on `<html>`: `--page-progress`, `--scroll-velocity`, `--scroll-speed`, `--pointer-x`,
`--pointer-y`, `--vh`, `--audio-level`, `--scene-<id>`; attributes `data-scroll-direction`,
`data-scrolling`, `data-quality`, `data-active-scene`.

**Precision capped at 3 decimals** — a full-precision float written every frame invalidates style on
every listener for a change no one can see.

**`createAnchors` is how you label 3D objects with real HTML.** Law 10: words are DOM. Accessible,
selectable, translatable, and crisp at any DPR — none of which is true of text drawn into a texture.

```ts
const anchors = createAnchors(ctx.camera)
anchors.add(labelEl, katana, { offset: new THREE.Vector3(0, 0.4, 0), cull: true })
```

`cull: true` hides the element when the point is behind the camera. Without it, labels for things
behind you pile up in a corner.

**Use `--vh`, not `100vh`.** Mobile browser chrome makes `100vh` taller than the visible viewport,
so a `100vh` hero is cut off on exactly the devices most of your traffic uses.

---

## `preloader.ts` — the gate

```ts
export interface PreloaderOptions {
  el?: string             // '[data-preloader]'
  counter?: string        // '[data-preloader-count]'
  minMs?: number
  gate?: boolean          // require a click before starting
  enter?: string          // '[data-preloader-enter]'
  outDuration?: number
  onTick?: (p: number) => void
}
export interface Preloader { set(p: number): void; done(): void; hide(): void; destroy(): void }
export function createPreloader(opts?: PreloaderOptions): Preloader
export function preloaderHooks(pre: Preloader): { onProgress: (p: number) => void
                                                  onReady: () => Promise<void> }
```

```ts
const pre = createPreloader({ gate: true, minMs: 1200 })
const app = await boot({ manifest, assets, ...preloaderHooks(pre) })
```

**`gate: true` is mandatory if there is audio.** The click is the only reliable place to `resume()`
an `AudioContext` synchronously. It is also where `compileAll()` hides.

**`minMs`** stops the preloader flashing for 80 ms on a warm cache, which looks like a bug. 800–1400
is the range where it reads as a deliberate beat rather than a wait.

**Never fake the progress.** Drive it from `assets.progress()` with real `weight` values, or ship no
preloader at all. A fake bar that jumps to 90 % and sits there is worse than nothing.

---

Related: `kernel-api.md` · `recipes.md` (working scenes) · `troubleshooting.md` ·
`toolkit/docs/modules/*.md` (nine sections each) · `toolkit/docs/EVIDENCE.md`.
