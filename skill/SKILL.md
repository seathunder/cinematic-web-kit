---
name: cinematic-web
description: Build cinematic, scroll-driven, art-directed websites — WebGL/three.js scenes, scroll choreography, camera work, transitions between "worlds", custom cursors, frame/video scrubbing, spatial audio, postprocessing grades — using a verified vanilla-TypeScript kernel. Covers the code (syntax, module APIs, architecture), the craft (art direction, cinematography, typography, sound), the process (design thinking, screenplay-first scene planning), and the delivery (build, perf budgets, free asset pipeline, deployment, client tiers). Use when building or reviewing an interactive/immersive/portfolio/experiential site, a scroll-driven narrative, a three.js scene, a scene transition, a WebGL performance problem, or when planning the art direction of a web experience.
---

# Cinematic Web

You are acting as **technical director + creative technologist + senior WebGL engineer** at once.
This skill is the accumulated architecture, verified facts, and craft for building cinematic
interactive websites.

**The toolkit this skill documents lives at:**

```
C:\Users\HP\Desktop\cinematic-web-kit\toolkit\
```

If this repository has been moved, that path is wrong — correct it here first. Every reference file
below cites `toolkit/...` relative to it.
25 TypeScript units (14 kernel + 11 modules), all typechecking clean, each with a nine-section
guide in `toolkit/docs/`. **`toolkit/BIBLE.md` is the master index.** Read from it rather than
reimplementing.

---

## Absolute rules

1. **No emojis** in generated content — not in headings, buttons, copy, comments, or commits.
2. **Read the source before writing an API call.** Signatures invented from memory have produced
   broken guides four separate times in this project's history. `references/kernel-api.md` and
   `references/modules-api.md` are transcribed from source; if something is not in them, open the
   `.ts` file.
3. **Never copy code from `github.com/davidhckh/portfolio-2025`.** It is *not* open source —
   personal/educational only, attribution mandatory, commercial use prohibited. Patterns may be
   reimplemented from scratch; code may never be copied. See `references/business.md` §4.
4. **Do not conclude "three.js is the answer."** Five renderer kinds exist for a reason
   (`three | canvas2d | video | dom | none`). Most scenes on a good cinematic site are not `three`.
5. **Verify before claiming.** `toolkit/docs/EVIDENCE.md` tags every fact [S]ource / [C]hecked /
   [D]ocumented / [A]rithmetic / [F]ield-knowledge. Do not promote an [F] to a fact.

---

## The ten laws

These are non-negotiable. Every one exists because breaking it produced a specific bug.

| # | law | why |
|---|---|---|
| 1 | **Inputs write `.target`, the loop damps `.current`, render reads `.current`.** Never write `.current` from an event handler | one source of truth per frame; no input can produce a visible jump |
| 2 | **Damping must be frame-rate independent:** `f = 1 - Math.pow(1 - ease, delta * 60)` | a naive lerp settles **2.4× faster at 144 Hz**. Same site, different feel per monitor |
| 3 | **One loop, one `requestAnimationFrame`, numbered stages with `after:` assertions that throw at registration** | two RAF loops = two clocks = judder you cannot attribute |
| 4 | **`weight` is a bell; `local` is a ramp.** Blend with `weight`, scrub with `local` | confusing them is the #1 scene bug: a scrub with `weight` plays forward then rewinds |
| 5 | **Scenes never reference each other.** Crossfades happen because two `weight` bells overlap | N scenes, zero coupling. Add or remove one without touching the others |
| 6 | **Scenes never write to the shared camera.** They declare a `waypoint`; the rig averages | `position = Σ(waypointᵢ × weightᵢ) / Σ(weightᵢ)` — free camera travel between shots |
| 7 | **`ACTIVE_THRESHOLD = 0.001`, never `0`** | a finished float ramp yields `3e-17`, so `> 0` keeps every scene alive forever |
| 8 | **Everything a scene creates, its `dispose()` frees.** Assets are refcounted | WebGL leaks do not appear in a JS heap snapshot |
| 9 | **Quality tiers demote only, never promote** | an oscillating tier pulses visibly — worse than either state |
| 10 | **Words are DOM. Always.** The GL layer never draws type | accessible, selectable, indexable, translatable |

---

## Where to look

Load the reference you need; do not load them all.

| you are doing | read |
|---|---|
| understanding the system, the loop, scene lifecycle, data flow | `references/architecture.md` |
| calling a kernel function — exact signatures, every option | `references/kernel-api.md` |
| calling a module — post, cursor, audio, transitions, scrubbing, instancing | `references/modules-api.md` |
| writing the code — TS idioms, GLSL injection, CSS contract, naming | `references/syntax.md` |
| deciding how it should *look* — camera, light, colour, type, sound, pacing | `references/art-direction.md` |
| planning the experience before any code | `references/design-thinking.md` |
| build, deploy, perf budgets, asset pipeline, a11y, SEO, testing | `references/fullstack.md` |
| a working scene, right now | `references/recipes.md` |
| something is broken or slow | `references/troubleshooting.md` |
| scoping, pricing, client intake, licensing | `references/business.md` |
| composition patterns, the 9 archetypes, transitions catalogue | `toolkit/docs/PATTERNS.md` |
| whether a claim is actually verified | `toolkit/docs/EVIDENCE.md` |
| one specific unit, in depth | `toolkit/docs/kernel/*.md`, `toolkit/docs/modules/*.md` |

---

## Decision table 1 — how should this section put pixels on screen?

**Ask this before writing any code for a section.** The answer is usually not `three`.

| the section is | `renderer` | why |
|---|---|---|
| text, a list, credits, a case study, prose | **`dom`** | never spend a WebGL context on a paragraph |
| a filmed or pre-rendered shot, scrubbed | **`video`** | a properly encoded MP4 beats a mediocre 3D rig |
| a hand-drawn / alpha / stop-motion sequence | **`video`** + frame-sequence | alpha, and no codec artefacts on line art |
| a 2D composition, a distortion, a data plot | **`canvas2d`** | cheaper, sharper, no shader compile |
| a real 3D space you travel through, or an object you inspect | **`three`** | the only case that needs it |
| a scroll range that only fires events or owns DOM reveals | **`none`** | costs nothing |

## Decision table 2 — how should this thing be animated?

| the motion is | use |
|---|---|
| a function of scroll position | `ctx.frame.local` → `tl.progress()` / `seq.seek()` |
| a fade/blend as a section arrives and leaves | `ctx.frame.weight` |
| a function of pointer | `state.pointerX/Y.current` (damped) — or `.target` for **hit testing only** |
| a function of time and per-instance identity | **GPU** — `gpuAnimate`, one uniform write for 100k instances |
| dependent on unpredictable per-instance state | CPU — `field.set()` + `commit()`, keep the count small |
| a one-shot on arrival | `enter(dir)` → `tl.play()` |
| a discrete UI state | CSS, off a published attribute (`data-scrolling`, `--page-progress`) |

## Decision table 3 — how many draw calls can I afford?

| meshes | CPU/frame at 0.05–0.2 ms each | verdict |
|---|---|---|
| 10 | 0.5–2 ms | fine |
| 100 | 5–20 ms | marginal |
| **500** | **25–100 ms** | **12 fps with the GPU idle.** Instance or merge |

`gpuInfo(renderer)` prints the real count. A 300-node glTF is 300 draw calls — compression does
not merge meshes.

## Decision table 4 — which transition?

| between | use | duration |
|---|---|---|
| two shots of the same place | **overlapping weights** (no transition code at all) | — |
| two places in one world | blend + a camera move, or `fade` | 0.3 s |
| two chapters | `wipe` / `iris` | 0.6–0.9 s |
| two *worlds* — the only place you may change all the rules at once | `ink` / `glitch` + full state swap inside `layer.run()` | 1.2 s |
| a real page navigation | `navigateWithTransition` | 0.5 s |

**Budget two or three covered cuts in a nine-scene site.** More reads as a slideshow.

---

## The 22-stage loop

Order is the contract. `after:` assertions **throw at registration**, so a mis-ordered stage
fails loudly at boot, not subtly at frame 4000.

```
  0  time              kernel/loop.ts
  5  preloader         kernel/loop.ts
 10  state             kernel/index.ts      <- damps everything
 20  scroll            kernel/scroll.ts
 30  viewport          kernel/viewport.ts
 40  weights           kernel/weights.ts    <- in/out -> weight
 45  instance-time     modules/instancing.ts
 50  camera            kernel/camera.ts     <- weighted-average waypoints
 60  scenes            kernel/stage.ts      <- update(w, ctx)
900  scene-attr        kernel/stage.ts
900  dom-bridge        modules/dom-bridge.ts
910  anchors           modules/dom-bridge.ts
920  reveal            modules/dom-bridge.ts
930  cursor            modules/cursor.ts
935  magnetic          modules/cursor.ts
940  audio             modules/audio.ts
941  audio-scroll-filter
970  picker            modules/raycast.ts
980  render            kernel/stage.ts
985  transition        modules/transition.ts
995  watchdog          kernel/debug.ts
998/999 debug / stats  kernel/debug.ts
```

**Reserved bands: 0–99 kernel · 100–899 project · 900–979 DOM/interaction · 980–999
render/diagnostics.** Put your own stages in 100–899 and nothing you write can wedge between
`weights` and `camera`. `MAX_DELTA = 1/20` clamps stalls so returning to a backgrounded tab never
snaps.

---

## The minimum viable scene

Every scene in every project is this shape. Nothing else.

```ts
import type { SceneDefinition } from '../../kernel/types'

export default {
  id: '03-artifact',
  renderer: 'three',
  section: '#chapter-artifact',
  assets: ['katana'],
  waypoint: {
    landscape: { position: [0, 1.4, 3.2], focus: [0, 1.1, 0], fov: 32 },
    portrait:  { position: [0, 1.4, 4.8], focus: [0, 1.1, 0], fov: 42 },
  },
  ramp: { enter: 0.8, exit: 0.8 },

  build(ctx) { /* geometry, materials, DOM. Runs once, after assets resolve. */ },
  enter(dir, ctx) { /* one-shots. dir: +1 down, -1 up */ },
  update(w, ctx) { /* every frame while active. Mutate; never setState */ },
  exit(dir, ctx) {},
  dispose() { /* free everything build() created */ },
} satisfies SceneDefinition
```

**`satisfies SceneDefinition`, not `: SceneDefinition`** — it checks the shape while keeping the
literal's narrow types, so `ctx` stays fully inferred inside the methods.

**What a scene may touch:** only `ctx` (`world`, `camera` read-only, `parallax`, `renderer`,
`assets`, `state`, `debug`, `layer`, `el`, `frame`). Nothing else from the kernel.

---

## Boot

```ts
import { boot } from './kernel'
import { manifest } from './scenes/manifest'
import { assets } from './assets'
import { createPreloader, preloaderHooks } from './modules/preloader'

const pre = createPreloader({ gate: true, minMs: 1200 })   // gate: mandatory if there is audio

const app = await boot({
  manifest,
  assets,
  renderer: { tone: 'aces', exposure: 1.1, clearColor: 0x05060a },
  camera:   { parallaxStrength: 0.35, parallaxTilt: 0.04, ease: 0.07, velocityRoll: 0.02 },
  scroll:   { duration: 1.1 },
  decoders: { dracoPath: '/decoders/draco/', basisPath: '/decoders/basis/' },
  ...preloaderHooks(pre),
})
```

Then, in order: `createPost(app.stage)` → `app.scenes.setMainRender(post.render)` →
`createCursor()` → `createAudio()` → `createTransitionLayer(app.stage)`.

**Debug flags:** `?debug` (Tweakpane + orbit) · `?stats` · `?scene=03` (isolate one) ·
`?quality=low` · `?nomotion` · `?wireframe` · `?axes` · `?waypoints`.

**Authoring waypoints:** `?debug`, fly the orbit controls to the shot, run `cw.waypoint()` in the
console, paste. Nobody hand-writes camera coordinates twice.

---

## Order of work — do not skip step 1

1. **Write the screenplay.** Nine lines of prose, one per scene. If it does not read as an arc on
   paper, no amount of WebGL fixes it. See `references/design-thinking.md`.
2. **Pick archetypes and renderer kinds.** More `dom` than you expect.
3. **Build `index.html` with real sections and real content.** The site must be readable and
   navigable with JavaScript disabled *before* any scene exists.
4. **`boot()` with an empty manifest.** Confirm the loop, `?debug`, `data-ready`.
5. **One scene at a time, `renderer: 'none'` first.** Get the scroll range and `local`/`weight`
   behaviour right with nothing rendering.
6. **Build the heaviest scene second, not last.** If it cannot hit budget, everything downstream
   of that decision changes.
7. **Postprocessing after the scenes.** It multiplies what is there; adding it early hides
   lighting problems you should have fixed.
8. **Sound after post.** Two hours of sound work beats two more days of shader work.
9. **Measure:** `?stats`, `gpuInfo()`, `leakWatch()`, a real mid-range Android on throttled data.
10. **Cut.** Remove the weakest scene. Seven scenes that hold beat nine with two dead ones.

---

## Non-negotiables in delivered work

- **Reduced motion:** `state.reducedMotion` disables the custom cursor, magnetics, and smooth
  scroll, and snaps damped values. Check it; do not skip it.
- **Keyboard:** `:focus-visible` on everything interactive. A cursor ring growing is not an
  affordance for a keyboard user.
- **No-JS baseline:** the DOM has the real content. GL is enhancement.
- **A visible mute** whenever there is audio, persisted.
- **Never autoplay with sound.** An `AudioContext` starts suspended and `resume()` must be called
  **synchronously inside** a gesture handler — which is why the preloader has a gate.
- **A wire budget.** Tier-1 under 2 MB; tier-2 4–8 MB. Above 8 MB you are choosing to lose
  visitors on mobile data — make it a decision, not an accident.

---

## Anti-patterns — stop if you are writing any of these

| never | instead |
|---|---|
| `raycaster.intersectObjects(scene.children, true)` | registered list + a 12-triangle proxy. **120,000 → 12** triangle tests |
| a second `requestAnimationFrame` | `addStage({ order, name, after, fn })` |
| `cur += (target - cur) * ease` | `damp(s, delta)` — law 2 |
| `getBoundingClientRect()` in a loop stage | cache on `state.pageReflow` |
| `scene.getObjectByName()` per frame | resolve once in `build()` |
| a scene writing `camera.position` | declare a `waypoint` |
| tweening `width`/`height` | `transform` only, on the compositor |
| a backtick inside a GLSL comment | it terminates the TS template literal — a parse error far from the cause |
| `new Image()` for sequence frames | `createImageBitmap()` — decodes off the main thread |
| an `ImageBitmap`/`VideoFrame` without `.close()` | a leak invisible in a JS heap snapshot |
| FXAA to fix jaggies under postprocessing | `samples` on the composer target; `EffectComposer` defaults to `samples: 0` |
| `gain.value = x` while audio plays | `setTargetAtTime(x, t, seconds / 3)` |
| `@media (min-width: 1024px)` to gate the cursor | `(hover: hover) and (pointer: fine)` |
| a splash screen with a fake progress bar | real `assets.progress()`, or no preloader |
| nine `three` scenes | alternate heavy and light; give the GPU and the viewer a rest |

---

## Craft, in one screen

The full treatment is in `references/art-direction.md`. The highest-leverage moves:

- **Move the camera less and use a longer lens.** 28–35° FOV, almost still, 2 % push. Amateur 3D
  orbits constantly at 60°+. Telephoto compression *is* the expensive look.
- **One clear light direction.** One directional + a dim ambient at 0.1–0.2. Three equal lights is
  what makes 3D look like a product render.
- **Two-colour grading beats any LUT.** `setTint(shadow, highlight)` — two `vec3` uniforms, and it
  is how film stocks actually differ.
- **Roll 0.5–1.5° with scroll velocity.** The cheapest signal that a human is operating the camera.
- **`bindScrollFilter()` before any other sound work.** Muffling with speed does more for
  physicality than any sample library.
- **Silence is a tool.** The quiet scenes are what make the loud one land.
- **Lower ease = more weight.** The camera should be the slowest thing on the page (0.06–0.12) and
  the cursor dot the fastest (0.35). That spread is what makes a site feel like it has physics.
- **One display face, one text face.** Typographic interest comes from scale and space, not variety.

---

## Verified stack

three **0.185.1** · gsap **3.15.0** (all former Club plugins free since 3.13) · lenis **1.3.26** ·
mp4box **2.4.1** · vite **8.2.2** · typescript **7.0.2** · vite-plugin-glsl · tweakpane **4.0.5**
(+ `@tweakpane/core`, a required peer) · stats-gl · gltfpack · @gltf-transform/cli · sharp ·
ffmpeg-static.

**WebGL2 is the target.** Not WebGPU — support is still uneven on the low-end Android hardware
much of the delivery audience uses, and the verified postprocessing ecosystem is GLSL. WebGPU is an
optional enhancement, never the baseline.

**Vanilla TypeScript, not React Three Fiber.** R3F is a real productivity win for component-shaped
3D. For multi-scene cinematic work with one shared loop, one renderer, and hand-managed scene
lifetimes, vanilla won on control and bundle size. This is a considered position, not a reflex.

**Lenis ↔ GSAP needs all three lines** or you get misfiring triggers, judder, or desync:

```ts
lenis.on('scroll', ScrollTrigger.update)
gsap.ticker.add((t) => lenis.raf(t * 1000))
gsap.ticker.lagSmoothing(0)
```
