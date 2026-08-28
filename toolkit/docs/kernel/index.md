# `kernel/index.ts`

## Purpose

`boot()` — the only function a project's `main.ts` calls. It wires the eleven subsystems in the one
order that works, then starts the loop. It is also the kernel's public export surface: everything a
scene or project file is expected to import comes from here.

## When to use it

Once, at the top of `src/main.ts`. Every project.

## When NOT to use it

- **Do not call `boot()` twice.** Two loops, two renderers, two sets of stages with colliding names —
  `addStage` will throw on the duplicate, which is the least confusing of the several things that
  would go wrong.
- **Do not reimplement the boot order in a project** to "skip a step you don't need". The `after:`
  assertions exist because the failure mode is a one-frame lag that reads as an easing bug and costs
  hours. If you genuinely need a different order, change it here, once.
- **Do not import from `kernel/state`, `kernel/loop`, etc. in project code** when the symbol is
  re-exported here. `import { addStage, damped, THREE } from '../kernel'` keeps a scene's imports to
  one line and means a kernel refactor does not touch nine scene files.

## Signature

```ts
export interface BootOptions {
  manifest: SceneDefinition[]
  assets?: AssetSpec[]
  renderer?: RendererOptions
  camera?: CameraOptions
  scroll?: Parameters<typeof initScroll>[0]
  onProgress?: (p: number) => void         // 0..1 while assets load
  onReady?: () => void | Promise<void>     // built + compiled, before the first frame
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

Re-exported surface (this is the import list for all project code):

```ts
export * from './types'                    // SceneDefinition, SceneCtx, Waypoint, RendererKind, …
export * from './state'                    // state, damped, damp, snap, range, remap, smooth, bell, clamp
export { addStage, removeStage, setStageEnabled, listStages, startLoop, stopLoop } from './loop'
export { measure, requestReflow, onReflow } from './viewport'
export { scrollTo, lenis, gsap, ScrollTrigger } from './scroll'
export { createStage, compileAll, renderScissor, resetViewport } from './renderer'
export { AssetRegistry, loadVideo } from './assets'
export { disposeObject, disposeMaterial, gpuInfo, leakWatch } from './dispose'
export { budget, BUDGETS, detectQuality } from './quality'
export { readFlags } from './debug'
export { ACTIVE_THRESHOLD, dominant } from './weights'
export { printWaypoint } from './camera'
export { THREE }
```

`export { THREE }` is deliberate: one three instance for the whole project, so there is no chance of a
second copy arriving through a differently-resolved dependency and producing the classic
"`instanceof THREE.Mesh` is false for an obvious Mesh" bug.

## Inputs

**`manifest`** is the site. See [`stage.md`](stage.md).

**`assets`** is registered but not loaded here — the manager acquires per scene, in manifest order, so
progress is monotonic.

**`renderer`** is spread *over* the quality budget's `antialias`/`shadows`, so an explicit
`renderer: { shadows: true }` wins on every tier. Usually you want the budget to decide; override only
when a specific art direction depends on it.

**`onProgress` / `onReady`** are the preloader contract. `modules/preloader.ts` exports
`preloaderHooks(pre)` which returns both, correctly shaped.

**`decoders`** must point at files in `/public`. Run `cw decoders` to copy them out of `node_modules`.

## Outputs

The boot order, which is the entire point of the file:

| # | step | why it is here and not elsewhere |
|---|---|---|
| 0 | quality + `?nomotion` | before anything allocates GPU memory, because DPR and antialias depend on it |
| 1 | stage 10 `state` damping | every other stage declares `after: ['state']` |
| 2 | `measureViewport()` + `initViewport()` | the renderer sizes itself from `state.viewport` |
| 3 | `createStage()` | needs the budget and the viewport |
| 4 | `initScroll()` + `initPointer()` | owns the scroll position; ScrollTrigger only listens |
| 5 | `new AssetRegistry(renderer)` | KTX2 `detectSupport` needs a live renderer |
| 6 | `createDebug()` then `createSceneManager()` | scenes acquire assets and build here |
| 7 | `createCameraRig()` + `initCamera()` | reads scene weights, so it must register after them |
| 7b | `debug.bindScenes(instances)` | scenes now exist, so weight readouts and `?wireframe` can bind |
| 8 | `createWatchdog()` + stage 995 | needs the renderer to act on a demotion |
| 9 | `requestReflow()` + `await compileAll()` | while the preloader is still covering the screen |
| 10 | `rig.snapToTargets()`, `snap(progress)`, `data-ready`, `onReady()`, `startLoop()`, `ScrollTrigger.refresh()` | pose first, reveal second, animate third |

Note step 1: the damping stage's function is **inlined here rather than imported from `state.ts`**,
because `state.ts` importing `loop.ts` and `loop.ts` importing `state.ts` is a genuine circular import.
The four damped values it advances are `progress`, `velocity`, `pointerX`, `pointerY`.

**DOM attributes `boot()` writes on `<html>`:**

| attribute | when | use in CSS |
|---|---|---|
| `data-ready="true"` | after compile, before the first frame | `[data-ready] .hero { opacity: 1 }` |
| `data-quality="high\|medium\|low"` | at boot and on every demotion | hide an expensive CSS effect on `low` |

**`destroy()`** tears down in reverse dependency order: stop loop → unbind visibility → dispose scenes
→ `assets.disposeAll()` → unbind pointer/scroll/viewport → dispose stage → dispose debug → kill every
ScrollTrigger → remove `data-ready`. Needed for a SPA route change; not needed for a normal site.

## Transitions and applications

**Why `snapToTargets()` and `snap(progress)` before the first frame.** Without them the camera starts
at the fallback pose and *slides* into scene 0's waypoint over the first second, and `progress` damps
up from 0 so anything driven by it animates on load. With them, frame one is already correct. On a
reload halfway down the page this is the difference between "the site loaded" and "the site is broken".

**`compileAll` before `onReady`.** Shader compilation is a synchronous GPU stall — 200–600 ms per new
material. Doing it behind the preloader means the user never sees it. Doing it lazily means a freeze
exactly as they scroll into each new scene. This ordering is the single highest-value thing in the boot
sequence.

**`ScrollTrigger.refresh()` after `startLoop()`.** ScrollTrigger caches element positions. It must
refresh after the preloader has been removed from the layout and after `data-ready` has let CSS reveal
things, or every trigger is offset by the preloader's height.

**Adding a module is one line, and order is declared not hoped for:**

```ts
const app = await boot({ manifest, assets })

const post = createPost(app.stage, { bloom: { strength: 0.4 } })
if (post) app.scenes.setMainRender(post.render)

initDomBridge(app.scenes.instances)   // stage 900
initReveal(app.scenes.instances)      // stage 920 + IntersectionObserver
createCursor()                        // stage 930
initMagnetic('[data-magnetic]')       // stage 935
const audio = createAudio({ reactive: true })
audio.bindUnlockGesture()             // stages 940, 941
```

Every one of those registers its own stages with its own `after:` dependencies, so a module cannot be
initialised too early without throwing. Note that most take `app.scenes.instances` — they read scene
weights, so they need the same array the manager filled.

## Gotchas

**`boot()` is async and must be awaited.** Code after a non-awaited `boot()` runs before any scene
exists, so `app.scenes.instances` is empty and every module that needs the stage fails silently.

**A missing `decoders` path fails at load time, not boot time.** The registry constructs fine; the
first `.glb` with Draco or KTX2 then 404s on the decoder. Symptom: one asset never resolves and the
preloader sticks at 60 %. Check the network tab for `/decoders/`.

**`requestReflow()` is called twice** — once at step 9 and once inside the watchdog's demote callback.
Both are correct: the first measures after build, the second after a DPR change moves layout.

**`state.reducedMotion` is set from `?nomotion` *and* read from the media query in `state.ts`.** The
flag can only turn it on, never off. There is no way to force motion on for a user who asked for less.

**`flags.quality` overrides `detectQuality()` completely**, including the WebGL2 check. `?quality=high`
on a machine without WebGL2 will try the expensive path and fail. That is acceptable for a debug flag;
never ship a URL like that to a client.

**`listStages()` under `?debug`** prints the resolved stage order at boot. This is the first thing to
look at when something animates one frame late.

## Recipe

A complete `main.ts`:

```ts
import { boot } from '../kernel'
import { createPost, bindVelocityToGrade } from '../modules/post'
import { createPreloader, preloaderHooks } from '../modules/preloader'
import { initDomBridge, initReveal, createAnchors } from '../modules/dom-bridge'
import { createCursor, initMagnetic } from '../modules/cursor'
import { createAudio } from '../modules/audio'
import manifest from './manifest'

const pre = createPreloader({ gate: true, minMs: 1200 })

const app = await boot({
  manifest,
  decoders: { dracoPath: '/decoders/draco/', basisPath: '/decoders/basis/' },
  assets: [
    { key: 'character', url: '/media/samurai.glb', kind: 'gltf', weight: 12 },
    { key: 'env-dusk',  url: '/media/dusk.hdr',    kind: 'hdr',  weight: 4 },
  ],
  renderer: { tone: 'aces', exposure: 1.05, clearColor: 0x07070a },
  camera: { ease: 0.05, parallaxStrength: 0.25, velocityRoll: 0.015 },
  scroll: { duration: 1.1 },
  ...preloaderHooks(pre),
})

const post = createPost(app.stage, {
  bloom: { strength: 0.35, threshold: 0.9, half: true },
  grade: { uGrain: 0.04, uVignette: 0.35, uContrast: 1.04 },
  samples: 4,
})
if (post) {
  app.scenes.setMainRender(post.render)
  bindVelocityToGrade(post, { aberration: 0.004, vignette: 0.1 })
}

initDomBridge(app.scenes.instances)
initReveal(app.scenes.instances)
createCursor()
initMagnetic('[data-magnetic]')

const audio = createAudio({ reactive: true })
audio.bindUnlockGesture()
audio.bindScrollFilter()

// Handy in devtools; harmless in production.
Object.assign(window as never, { app, post, audio })
```

Related: [`loop.md`](loop.md) (stage order), [`stage.md`](stage.md) (the manifest),
[`quality.md`](quality.md) (step 0 and step 8), [`debug.md`](debug.md) (`bindScenes`),
[`../../BIBLE.md`](../../BIBLE.md) (the ten laws these steps enforce).
