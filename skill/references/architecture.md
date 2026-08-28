# Architecture

How the system is put together, why each boundary is where it is, and what data flows where.
Read this once before writing any scene.

---

## 1. The shape of it

```
                    ┌───────────────────────────────────────────┐
   input            │  ONE requestAnimationFrame (kernel/loop)  │
  ────────►         │  22 numbered stages, dependency-asserted  │
  scroll            └──────────────────┬────────────────────────┘
  pointer                              │
  resize          writes .target        │ damps .current
  visibility      ─────────────►  ┌────▼────────────────┐
                                  │  state (MotionState) │  single source of truth
                                  └────┬─────────────────┘
                                       │ read-only downstream
        ┌──────────────────────────────┼───────────────────────────────┐
        │                              │                               │
  ┌─────▼──────┐              ┌────────▼────────┐            ┌─────────▼────────┐
  │  weights   │              │  camera rig     │            │  dom-bridge      │
  │ in/out→w   │─────────────►│ Σ(wp·w)/Σ(w)    │            │ CSS vars + attrs │
  └─────┬──────┘              └────────┬────────┘            └─────────┬────────┘
        │                              │                               │
  ┌─────▼──────────────────────────────▼──────┐              ┌─────────▼────────┐
  │  scenes: build/enter/update/exit/dispose  │              │  CSS does the    │
  │  each isolated; none references another   │              │  rest, no JS     │
  └─────┬─────────────────────────────────────┘              └──────────────────┘
        │
  ┌─────▼───────────────┐     ┌──────────────┐
  │ render (one canvas) │────►│ post chain   │
  └─────────────────────┘     └──────────────┘
```

Every arrow is one-directional. There is no arrow that goes back up. That is the whole design.

---

## 2. The three-layer rule

| layer | owns | may read | may never |
|---|---|---|---|
| **kernel** (14 files) | the loop, state, scroll, viewport, weights, camera, renderer, assets, quality, disposal, debug | nothing above it | know a project exists. No file in `kernel/` may import from `modules/` or `scenes/` |
| **modules** (11 files) | optional capabilities — post, cursor, audio, transitions, text, instancing, scrubbing, picking, DOM bridge | the kernel | import another module, except where documented (`cursor` ← `raycast` maths) |
| **project** (`scenes/`, `main.ts`, `index.html`, `styles/`) | this specific site | everything | be imported *by* the kernel or a module |

**Why this matters practically:** you can delete `modules/audio.ts` from a project and nothing else
breaks. You can copy `kernel/` into a completely different site untouched. Every guide in
`toolkit/docs/` is a unit you can take or leave.

`kernel/state.ts` imports **nothing but types**. It is the leaf of the dependency graph, deliberately
— everything reads it, so it may read nothing. An early version had `state.ts` importing `loop.ts`
for the delta, which created a circular import that Vite resolved into `undefined` at module-eval
time. The fix was to pass `delta` in as an argument: `updateState(delta)`.

---

## 3. Target/current damping — law 1 and law 2

```ts
export interface Damped { current: number; target: number; ease: number }

export function damp(s: Damped, delta: number): void {
  const f = 1 - Math.pow(1 - s.ease, delta * 60)
  s.current += (s.target - s.current) * f
}
```

**Three roles, never mixed:**

| who | does what |
|---|---|
| event handlers | write `.target`. Only. |
| stage 10 (`state`) | `damp()` every value, once |
| everything else | read `.current` |

An event handler that writes `.current` is a discontinuity — a visible jump — and it also means two
things now decide the value in one frame, so the bug is not reproducible.

**The `Math.pow`.** The naive `cur += (target - cur) * 0.1` applies the ease *per frame*, so it runs
at the monitor's refresh rate. Time to close 90 % of the gap is `n = ln(0.1)/ln(0.9) ≈ 21.85`
frames — **0.364 s at 60 Hz, 0.152 s at 144 Hz. 2.4× faster** on the nicer monitor. The site you
art-directed on a 60 Hz laptop feels twitchy on the client's gaming monitor and you cannot see why.
`Math.pow(1 - ease, delta * 60)` normalises the ease to *per-1/60th-second*, so the settle time is
the same on any display.

**`MAX_DELTA = 1/20`** clamps the delta. Return to a tab after 30 seconds and the raw delta is 30;
without the clamp every damped value teleports and every physics-ish integration explodes.

**Ease values are art direction, not tuning.** See `art-direction.md` §6 for the table. The short
version: camera 0.06–0.12 (heaviest thing on the page), cursor dot 0.35 (lightest).

---

## 4. Scene weights — laws 4, 5, 7

Each scene owns a DOM section. `measureScene` records its `top` and `height` once per reflow. Each
frame, stage 40 computes two independent ramps:

```
in  = range(scrollY, sectionTop - vh * enterRamp, sectionTop + vh * 0.25)   // 0 → 1 arriving
out = range(scrollY, sectionBottom - vh * 0.25, sectionBottom + vh * exitRamp)  // 0 → 1 leaving
weight = clamp(in * (1 - out))
local  = range(scrollY, sectionTop - vh, sectionBottom)
```

**`weight` is a bell. `local` is a ramp.** Plot them: `weight` rises, plateaus at 1, falls;
`local` rises monotonically 0→1 across the whole section.

| you want | use | because |
|---|---|---|
| a fade in and out, opacity, presence, blend | **`weight`** | it is a bell — symmetric arrival and departure |
| a video timeline, a scrubbed animation, a progress readout | **`local`** | it is monotonic — scroll down, it goes up |

Scrubbing a timeline with `weight` plays your shot forward and then **rewinds it** as the section
leaves. This is the single most common bug in the whole system, and it looks like "the animation is
buggy" rather than "I read the wrong number".

**Why scenes never reference each other.** A crossfade between scene 3 and scene 4 is not code — it
is scene 3's `out` ramp overlapping scene 4's `in` ramp. Both scenes are written as if they were the
only scene on the page. Add a tenth scene between them and neither changes.

**`ACTIVE_THRESHOLD = 0.001`.** A float ramp that has finished does not produce `0.0`; it produces
something like `3e-17`. `weight > 0` therefore keeps every scene that has ever been visible alive
for the life of the page — you notice at scene six when the frame rate has quietly halved. It also
protects the camera rig, which divides by `Σ(weight)`.

**`ramp: { enter, exit }`** is in **viewport heights**, not pixels — so it means the same thing on a
phone and a 4K monitor. 0.8 is a good default; longer ramps (1.2+) read as slower, more expensive
transitions; shorter (0.3) read as cuts.

---

## 5. The camera — law 6

No scene ever writes `camera.position`. A scene declares where the camera should be *if it were the
only scene*:

```ts
waypoint: {
  landscape: { position: [0, 1.4, 3.2], focus: [0, 1.1, 0], fov: 32 },
  portrait:  { position: [0, 1.4, 4.8], focus: [0, 1.1, 0], fov: 42 },
}
```

Stage 50 computes the weighted average over all active scenes:

```
position = Σ(waypointᵢ.position × weightᵢ) / Σ(weightᵢ)
focus    = Σ(waypointᵢ.focus    × weightᵢ) / Σ(weightᵢ)
fov      = Σ(waypointᵢ.fov      × weightᵢ) / Σ(weightᵢ)
```

then damps toward it and calls `lookAt(focus)`.

**What this buys you:** the camera travel between two shots is free and automatic. You never
animate a camera path. You place two shots and the overlap of their weight bells *is* the move. The
`ease` on the rig controls how much weight the camera has; the ramp lengths control how long the
move takes.

**Portrait is a separate waypoint, not a scale factor.** A phone is not a narrow desktop. The
correct portrait shot is usually further back and wider-lensed, and sometimes it is a completely
different angle. This is a compositional decision, so it gets a compositional control.

**`parallax` is a `THREE.Group`, not the camera.** Pointer parallax moves the *group* the world
hangs from, plus a small camera tilt. Moving the camera itself would fight the waypoint average
and desync anything that reads camera position. Add anything that should react to the pointer to
`ctx.parallax`; add anything that should not to `ctx.world`.

**`velocityRoll`** applies 0.5–1.5° of Z roll proportional to scroll velocity. It is two lines and
it is the cheapest "a human is operating this camera" signal available.

**Authoring:** `?debug` gives you orbit controls; `cw.waypoint()` in the console prints a
paste-ready literal. Hand-writing camera coordinates twice is a waste of a life.

---

## 6. Scene lifecycle

```
registered ──► measured ──► (weight > 0.001) ──► build() ──► enter(+1)
                  ▲                                              │
                  │                                          update(w) ×N
              reflow                                             │
                  │                                          exit(±1)
                  └──────────── (weight < 0.001) ◄────────────────┘
                                       │
                                  dispose()  (only on teardown or budget eviction)
```

| hook | when | rules |
|---|---|---|
| `build(ctx)` | once, the first time `weight` crosses the threshold, **after** the scene's declared `assets` resolve. May be `async` | create geometry, materials, DOM. Resolve every lookup here — never `getObjectByName` per frame |
| `enter(dir, ctx)` | each time the scene becomes active. `dir` is +1 scrolling down, −1 up | one-shots: `tl.play()`, `audio.play()`. **Check `dir`** — entering from below usually wants a different beat |
| `update(w, ctx)` | every frame while active, after the camera | mutate what you built. Never allocate. Never `setState`. Never `getBoundingClientRect` |
| `render(w, ctx)` | `canvas2d` / `video` scenes only | the kernel does not draw these for you |
| `exit(dir, ctx)` | on deactivation | pause timelines, release pointer captures |
| `dispose()` | teardown, or eviction under `maxActiveScenes` | free **everything** `build` created. Law 8 |

**Assets are refcounted.** `assets.acquire(key)` increments; `release(key)` decrements. Two scenes
declaring the same texture share one upload. A scene's `dispose` releases its own; the registry
frees the GPU resource when the count hits zero. This is why `dispose` must be symmetric with
`build` — an unreleased asset is a leak that a JS heap snapshot will not show you, because the bytes
are in VRAM.

---

## 7. Five renderer kinds

```ts
export type RendererKind = 'three' | 'canvas2d' | 'video' | 'dom' | 'none'
```

This enum is the most important design decision in the toolkit, because it is the one that stops
everything becoming a shader.

| kind | the kernel gives you | you provide | cost |
|---|---|---|---|
| `three` | the shared `world`, `camera`, `parallax`, and a render slot | objects added to `ctx.world` or `ctx.parallax` | a draw pass |
| `canvas2d` | a sized, DPR-correct `<canvas>` in `ctx.el` | a `render(w, ctx)` that draws | 2D raster |
| `video` | the element/texture plumbing | a `render` that blits, or a texture on a plane | decode |
| `dom` | weight, local, `enter`/`exit`, and `ctx.el` | HTML and CSS | ~nothing |
| `none` | weight and local, no surface at all | event logic | nothing |

**A `dom` scene is a first-class scene.** It gets weights, waypoints (so the 3D camera keeps moving
behind it), lifecycle hooks, and a place in the arc. Half the sections on a good cinematic site
should be `dom`. A site that is nine `three` scenes is a tech demo, and it will not run on a phone.

**`viewport: { selector, clearDepth }`** renders a `three` scene scissored into a specific element's
box instead of full-screen. That is how you get an inline 3D panel next to text without a second
renderer or a second context.

---

## 8. Stages, and why `after:` beats numbers

```ts
export interface Stage {
  order: number
  name: string
  fn: (delta: number, elapsed: number) => void
  after?: string[]
  enabled?: boolean
}
```

`addStage` **throws at registration** if a name in `after` is not yet registered. Not a warning, not
a silent reorder — a throw, at boot.

**A number is a hint; the assertion is the guarantee.** Two stages legitimately sit at **order 900**
(`scene-attr` and `dom-bridge`): they touch different attributes and neither reads the other's
output, so their relative order is genuinely irrelevant. Renumbering one of them to 901 would imply
a dependency that does not exist. The contract is expressed by `after`, and the number only sorts.

Reserved bands:

| band | for |
|---|---|
| 0–99 | kernel |
| **100–899** | **your project's stages** |
| 900–979 | DOM and interaction |
| 980–999 | render and diagnostics |

Put your stages in 100–899 and you cannot accidentally wedge yourself between `weights` and
`camera`, which is where the subtle one-frame-late bugs live.

`listStages()` prints the resolved order. When motion is one frame behind, read it first.

---

## 9. Quality tiers — law 9

```ts
low:    { dpr: 1,   antialias: false, shadows: false, postprocessing: false, density: 0.25, shadowMap: 0,    anisotropy: 1, maxActiveScenes: 2 }
medium: { dpr: 1.5, antialias: false, shadows: true,  postprocessing: true,  density: 0.6,  shadowMap: 1024, anisotropy: 2, maxActiveScenes: 3 }
high:   { dpr: 2,   antialias: true,  shadows: true,  postprocessing: true,  density: 1,    shadowMap: 2048, anisotropy: 4, maxActiveScenes: 4 }
```

`detectQuality()` picks the initial tier from `deviceMemory` + `hardwareConcurrency`. The watchdog
(stage 995) demotes on sustained low frame rate. **It never promotes** — an oscillating tier
produces a visible pulse in resolution and effects, which is worse than sitting at the lower tier.

**Read the budget every frame, never cache it:**

```ts
const count = Math.floor(4000 * budget().density)   // in build(): correct
```

`density` is yours to interpret. Multiply particle counts, instance counts, and iteration counts by
it. A scene that ignores `density` is a scene that will not run on the low tier.

**Order of levers, by effect per unit of visual loss:**

1. **DPR.** Quadratic in fragments — 2 → 1.5 is **44 %** fewer, 2 → 1 is **75 %**. Always try this
   first.
2. **`density`.** Fewer things.
3. **`postprocessing`.** Each full-screen pass is another full-resolution read+write.
4. **`shadowMap`.** An extra scene render per shadow-casting light.

---

## 10. What crosses into CSS

`dom-bridge` publishes, once per frame, on `<html>`:

| property | value |
|---|---|
| `--page-progress` | 0..1 down the document |
| `--scroll-velocity` | signed |
| `--scroll-speed` | absolute |
| `--pointer-x`, `--pointer-y` | 0..1 |
| `--vh` | one real viewport unit in px — **use `calc(var(--vh) * 100)`, not `100vh`**, because mobile browser chrome makes `100vh` lie |
| `--audio-level` | from `modules/audio` |
| `--scene-<id>` | per-scene weight, opt-in |

and attributes: `data-scroll-direction`, `data-scrolling`, `data-quality`, `data-active-scene`,
`data-cursor-active`, `data-cursor-state`, `data-audio-muted`, `data-ready`.

**This is the seam that keeps the design in CSS.** A designer can restyle the entire chrome of the
site — nav behaviour, colour shifts per chapter, a scroll-speed blur — without touching TypeScript:

```css
[data-scrolling='true'] .nav { opacity: 0.4; }
[data-active-scene='03-artifact'] { --ink: #d8c9a3; }
.hero { transform: translateY(calc(var(--page-progress) * -20vh)); }
```

Precision is capped at 3 decimals on purpose — writing a full-precision float to a custom property
every frame invalidates style on every listener for a change no one can see.

---

## 11. Boot order

```
readFlags()                       ?debug, ?scene, ?quality …
detectQuality()                   sets state.quality before anything allocates
createStage(renderer)             renderer, world, camera, parallax
AssetRegistry.register(specs)     nothing loaded yet
initViewport / initScroll / initPointer
createSceneManager(manifest)      measures sections, no build() yet
assets load ──► onProgress ──► preloader
onReady()                         gate: wait for the click (this is where audio unlocks)
compileAll()                      shader compile BEFORE the first visible frame
startLoop()
```

**`compileAll()` is not optional.** three compiles a shader program lazily, on first draw. Without a
pre-compile, the first frame a material appears in stalls for 50–300 ms — which the viewer sees as a
hitch at exactly the emotional moment you designed. Compiling behind the preloader is the difference
between "smooth" and "janky" and it is one call.

**`boot()` returns an `App`:** `{ stage, assets, scenes, camera, debug, destroy }`. Keep it. Then
wire post → `setMainRender` → cursor → audio → transition layer, in that order.

---

## 12. Where things are

```
toolkit/
├─ BIBLE.md                 master index — start here
├─ kernel/     14 files     the engine
├─ modules/    11 files     optional capabilities
├─ docs/       27 files     one nine-section guide per unit + PATTERNS + EVIDENCE
├─ shaders/                 GLSL library
├─ templates/               scaffolds: _shared, tier1-onepager, tier2-cinematic, scenes
├─ scripts/                 cli.mjs and friends
├─ presets/                 grades, palettes, ease sets
└─ Projects/                actual client work lives here
```

Related: `kernel-api.md` (exact signatures) · `modules-api.md` · `toolkit/docs/PATTERNS.md`
(composition) · `toolkit/docs/EVIDENCE.md` (what is actually verified).
