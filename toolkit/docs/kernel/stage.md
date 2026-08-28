# `kernel/stage.ts`

## Purpose

The scene manager. Turns a manifest array into a running site: resolves DOM sections, filters by
quality tier, assigns render layers, acquires assets, builds, then drives the whole lifecycle every
frame. This is the file that makes a `SceneDefinition` mean something.

## When to use it

`createSceneManager()` once, from `boot()`. Project code touches it in exactly two places:
`manager.setMainRender(post.render)` to insert a post chain, and `manager.instances` for debug.

## When NOT to use it

- **Never call `def.build()` / `def.update()` yourself.** The manager owns ordering, error handling,
  asset refcounts and the active-scene attribute. Calling in manually gets you an unbuilt scene with
  a null `ctx`.
- **Not for DOM-only sections.** A section with text and images and no canvas does not need a scene at
  all — `initReveal` in `modules/dom-bridge.ts` handles it for a fraction of the cost. Use
  `renderer: 'none'` only when a section needs a per-frame hook but no pixels of its own.

## Signature

```ts
export interface SceneManager {
  instances: SceneInstance[]
  /** Swap the main render call. modules/post.ts uses this to insert the EffectComposer. */
  setMainRender: (fn: (() => void) | null) => void
  dispose: () => void
}

export interface ManagerOptions {
  stage: Stage3D
  assets: AssetRegistry
  debug: Debug
  manifest: SceneDefinition[]
  only?: string | null              // force a single scene (?scene=03)
  instances?: SceneInstance[]       // array to populate rather than allocate
}

export async function createSceneManager(opts: ManagerOptions): Promise<SceneManager>
```

## Inputs

**`manifest` order is the only coupling between scenes**, and it decides two things: the render layer
each scene is assigned (`layer: layerIndex++`, starting at 1) and the scroll order, which is implied by
the DOM order of the sections they point at. Nothing else. Reordering the manifest without reordering
the DOM changes layers but not scroll positions.

**`only`** builds one scene and skips the rest. `?scene=03` in the URL. This is the single most useful
development affordance in the toolkit: a 9-scene site takes seconds to boot instead of a minute, and
the scene you are working on is the only thing that can be broken.

**`instances`** lets `boot()` pass an array it has *already* handed to the debug pane, so the pane's
bindings and the manager see one shared list rather than two copies that drift.

## Outputs

The lifecycle, in the order it happens:

| step | when | notes |
|---|---|---|
| **register** | once | resolves `section`, resolves `viewport.selector`, creates the private scene/camera if `viewport` is set |
| **filter** | once | `def.quality` above the current tier → the scene **never exists**. Not hidden: absent. |
| **acquire** | once | every key in `def.assets`, refcounted up, `await`ed in order |
| **build** | once | may be async. Wrapped in try/catch. |
| **enter** | `weight` crossed 0.001 upward | receives `(direction, ctx)` |
| **update** | every frame while `weight > 0.001` | stage 60 |
| **render** | same, only for scenes that own pixels | stage 980 |
| **exit** | `weight` crossed 0.001 downward | receives `(direction, ctx)` |
| **dispose** | manager teardown | also releases every asset key with `'dispose'` |

Four stages are registered:

| order | name | after | does |
|---|---|---|---|
| 60 | `scenes` | `camera` | `def.update(weight, ctx)` for every built, weighted scene |
| 900 | `scene-attr` | `scenes` | writes `<html data-active-scene="…">` from `dominant()` |
| 980 | `render` | `scenes` | `mainRender()` or `renderer.render(world, camera)`, then per-scene `render()` and scissor draws, then `resetViewport()` |

**A built scene at weight 0 costs one number comparison per frame.** That is the whole point of
`ACTIVE_THRESHOLD`: ship twelve scenes, pay for the two on screen.

**`three` scenes are drawn in bulk.** They all live in `stage.world`, so there is nothing to iterate —
one `renderer.render()` covers all of them. Only `canvas2d`, `video` and `viewport` scenes get a
per-scene `render()` call.

## Transitions and applications

**`setMainRender` is the post-processing seam.** Everything the manager does is unchanged; only the
one call that puts pixels on screen is swapped:

```ts
const post = createPost(stage, { bloom: { strength: 0.4 }, dof: { focus: 4 } })
if (post) scenes.setMainRender(post.render)
```

Pass `null` to go back to the plain path — which is exactly what a quality demotion does.

**A private scene per `viewport` scene.** When `def.viewport` is set, the manager creates a fresh
`THREE.Scene` and `PerspectiveCamera` (initialised to the scene's own `waypoint.landscape.fov`), and
`ctx.world` / `ctx.camera` point at *those* rather than the shared ones. The scene then draws into its
element's rect via `renderScissor`, with aspect ratio corrected each frame only when it actually
changed. This is how a product viewer sits inside an editorial layout without a second WebGL context.

**Errors are contained, not swallowed.** A `build()` that throws is logged with the scene id and the
instance is left `built: false`, so `update`/`render` skip it forever. One broken scene leaves a hole;
it does not blank the site. A `dispose()` that throws is caught per scene so the remaining scenes
still tear down.

**A missing section is a content error.** The manager warns
(`"03-character" wants section "#chapter-3" which is not in the DOM. Skipped.`) and continues, because
in practice this means a CMS block was deleted or a selector has a typo — not that the code is wrong.
The site keeps working with one fewer scene.

## Gotchas

**`quality` filtering is absolute.** `quality: 'high'` means the scene does not exist on a phone — no
build, no assets, no DOM hook. The section is still in the document, so it must contain real fallback
content or the user scrolls through an empty screen. This is the most common art-direction oversight.

**Assets are acquired serially.** `for (const key of def.assets) await assets.acquire(key)` — one at a
time, in declaration order, per scene. Deliberate: it makes the progress bar monotonic and avoids
saturating a slow connection with twelve parallel requests. If you need parallelism for a specific
scene, do it inside `build()`.

**`dispose()` releases assets with `'dispose'`, not `'deactivate'`.** Manager teardown is a real
teardown (navigating away, or a full rebuild), so it frees GPU memory. Do not call `manager.dispose()`
as a cheap reset.

**`enter` and `exit` fire in both directions.** `dir` is `+1` scrolling down, `-1` scrolling up. They
fire every time the threshold is crossed, so they must be idempotent — a user oscillating around a
section boundary can trigger them many times per second.

**Two stages share order 900.** `scene-attr` here and `dom-bridge`'s bridge stage both register at 900
and rely on `addStage`'s stable sort. Registration order decides which runs first. Do not add a third
900 stage that depends on either of them; give it 901.

**`renderer: 'none'` still gets `update()` calls.** It just never gets `render()`. Useful for a scene
that only drives DOM or audio.

## Recipe

The manifest is the site:

```ts
// src/manifest.ts
import type { SceneDefinition } from '../kernel/types'
import arrival from './scenes/00-arrival'
import world from './scenes/01-world'
import character from './scenes/03-character'

export default [arrival, world, character] satisfies SceneDefinition[]
```

A complete scene definition showing every hook:

```ts
// src/scenes/03-character.ts
import * as THREE from 'three'
import { budget } from '../../kernel/quality'
import { disposeObject } from '../../kernel/dispose'
import type { SceneDefinition } from '../../kernel/types'

let model: THREE.Group | null = null

export default {
  id: '03-character',
  renderer: 'three',
  section: '#chapter-character',
  assets: ['character', 'env-dusk'],
  quality: 'medium',                       // skipped entirely on low
  ramp: { enter: 1.2, exit: 0.8 },
  waypoint: {
    landscape: { position: [1.6, 1.5, 3.2], focus: [0, 1.45, 0], fov: 24 },
    portrait:  { position: [0.6, 1.5, 4.4], focus: [0, 1.45, 0], fov: 34 },
  },

  async build(ctx) {
    const gltf = ctx.assets.get<{ scene: THREE.Group }>('character')
    model = gltf.scene.clone()
    model.traverse((o) => o.layers.set(ctx.layer))
    model.visible = false                  // enter() reveals it
    ctx.world.add(model)

    ctx.debug.log(`built at density ${budget().density}`)
  },

  enter(dir, ctx) {                        // idempotent: safe to call repeatedly
    if (model) model.visible = true
    ctx.debug.log(`enter dir=${dir}`)
  },

  update(w, ctx) {
    if (!model) return
    model.rotation.y = ctx.frame.local * Math.PI * 0.5   // scrub: monotonic
    model.position.y = (1 - w) * -0.4                    // blend: bell
  },

  exit(_dir) {
    if (model) model.visible = false
  },

  dispose() {
    if (model) disposeObject(model, { detach: true })
    model = null
  },
} satisfies SceneDefinition
```

Related: [`types.md`](types.md) (the definition contract), [`weights.md`](weights.md) (who computes
`weight`), [`renderer.md`](renderer.md) (`renderScissor`), [`assets.md`](assets.md),
[`../modules/post.md`](../modules/post.md) (`setMainRender`).
