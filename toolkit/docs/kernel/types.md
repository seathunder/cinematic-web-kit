# `kernel/types.ts`

## Purpose

The contract between the kernel and everything a project writes. `SceneDefinition` is the interface
every scene implements; `SceneCtx` is the complete list of things a scene is allowed to touch.
Nothing else in the kernel may be imported by a scene.

## When to use it

Every scene file starts by importing these types. If a scene needs something not in `SceneCtx`, that
is a signal to widen `SceneCtx` deliberately — not to import a kernel module directly.

## When NOT to use it

`SceneInstance` is the kernel's runtime wrapper. Scenes never see it and should never import it.
Modules that operate over all scenes (`weights`, `stage`, `dom-bridge`, `camera`) do.

## Signature

```ts
export type RendererKind = 'three' | 'canvas2d' | 'video' | 'dom' | 'none'
export type QualityTier  = 'low' | 'medium' | 'high'

export interface Waypoint {
  position: [number, number, number]
  focus: [number, number, number]
  fov?: number
}
export interface WaypointSet { landscape: Waypoint; portrait?: Waypoint }

export interface SceneCtx {
  world: THREE.Scene
  camera: THREE.PerspectiveCamera        // NEVER write to this
  parallax: THREE.Group
  renderer: THREE.WebGLRenderer
  assets: AssetRegistry
  state: MotionState
  debug: Debug
  layer: number
  el: HTMLElement | null                 // null for `three` and `none`
  frame: { weight: number; local: number; in: number; out: number }
}

export interface SceneDefinition {
  id: string
  renderer: RendererKind
  section: string                        // CSS selector
  assets?: string[]
  quality?: QualityTier                  // minimum tier; below it the scene never builds
  waypoint?: WaypointSet
  viewport?: { selector: string; clearDepth?: boolean }
  ease?: number                          // weight damping, default 0.08
  ramp?: { enter?: number; exit?: number }   // in viewport heights

  build(ctx: SceneCtx): void | Promise<void>
  enter?(dir: number, ctx: SceneCtx): void
  update?(w: number, ctx: SceneCtx): void
  render?(w: number, ctx: SceneCtx): void
  exit?(dir: number, ctx: SceneCtx): void
  dispose(): void
}
```

## Inputs

**`id`** — stable, also the folder name. Two-digit prefixes (`00-arrival`, `01-world`) keep the
manifest readable and make `?scene=03` a usable debug flag.

**`renderer`** — see Law 9. Choosing `dom` or `none` where you could have chosen `three` is a
performance win, not a compromise.

**`section`** — a CSS selector for the DOM element whose scroll range this scene owns. The scene's
`in`/`out`/`weight` are derived entirely from that element's position. A missing section is treated
as a content error and logged, not thrown: a CMS dropping a block should not white-screen the site.

**`quality`** — `quality: 'high'` on a heavy scene means it is never built on a low-tier device. The
section still exists and still scrolls; it just has no 3D in it. Design for that.

**`ramp`** — where the weight ramps happen, in viewport heights.

| ramp | reads as |
|---|---|
| `{ enter: 0.2, exit: 0.2 }` | a hard cut — the scene is either here or not |
| `{ enter: 1, exit: 1 }` (default) | a normal crossfade over one screen |
| `{ enter: 2, exit: 2 }` | slow atmospheric dissolve; two scenes coexist for a long time |

Widening the ramp increases the number of simultaneously active scenes, which is what
`budget().maxActiveScenes` caps. Two heavy `three` scenes overlapping for two viewport-heights on a
mid-tier phone is how you get a 20fps section.

**`viewport`** — renders the scene into its own scissored rect with its own `THREE.Scene` and camera.
Use for product viewers, insets and split screens. From the scene's point of view nothing changes:
it still just adds to `ctx.world`, which the kernel has quietly pointed at the private scene.

## Outputs

`ctx.frame` is **mutated in place** every frame, not reallocated — reading a field costs nothing and
allocates nothing, which matters at 60–144 Hz.

| field | shape | use for |
|---|---|---|
| `in` | 0→1 as the section enters | raw ramp, rarely needed directly |
| `out` | 0→1 as it leaves | raw ramp, rarely needed directly |
| `weight` | `clamp(in × (1 − out))` — a bell | **blending**: opacity, scale, bloom, camera influence |
| `local` | 0→1 across the whole section | **scrubbing**: timelines, video, frame sequences |

`ctx.layer` is a unique render layer per scene, used by scissor viewports and selective bloom.

## Transitions and applications

The lifecycle:

```
build(ctx)        once, after assets resolve. Allocate here.
  ↓
enter(dir, ctx)   weight crossed 0.001. dir = +1 down, -1 up. Start timelines, unmute, resume video.
  ↓
update(w, ctx)    every frame while active. Mutate. Never call setState-like things.
render(w, ctx)    every frame while active — only for canvas2d / video / custom draw.
  ↓
exit(dir, ctx)    weight dropped below 0.001. Pause video, stop timelines, release pointer capture.
  ↓
dispose()         teardown or quality downgrade. Free every GPU resource.
```

`enter`/`exit` fire in **both** directions and can fire many times. They must be idempotent. Anything
that must happen exactly once belongs in `build()`.

`update` is for logic, `render` is for drawing. A `three` scene leaves `render` undefined — the
kernel's single `renderer.render()` at stage 980 draws the whole world at once. Defining `render` on
a `three` scene means you have misunderstood the architecture and are about to draw the world twice.

## Gotchas

**Writing to `ctx.camera`.** The camera is owned by `kernel/camera.ts` and recomputed every frame
from the weighted average of all active waypoints. A scene that sets `camera.position` will have it
overwritten on the next frame, producing a jitter that looks like a physics bug. Declare a
`waypoint` instead. If you need a camera you control, use `viewport` and get your own.

**Adding background layers to `world` instead of `parallax`.** Pointer parallax is applied to the
`parallax` group, which the camera is a child of. Objects added to `world` do not move with it.
Backgrounds, skyboxes and far layers go in `parallax`.

**`build()` is async and the kernel awaits it.** A `build()` that awaits a network request delays
first paint of that scene. Put loads in `assets` (declared, preloaded, refcounted, progress-tracked)
and use `build()` only to assemble what has already arrived.

**`dispose()` must be complete.** It is called on teardown *and* on quality downgrade, and the scene
may be rebuilt afterwards. Use `disposeObject()` from `kernel/dispose.ts`; do not hand-roll it.

**`portrait` waypoints are not optional in practice.** A landscape-framed hero on a 9:19.5 phone
crops to nothing. If a scene has a subject, give it a portrait waypoint.

## Recipe

A complete minimal scene:

```ts
import * as THREE from 'three'
import type { SceneDefinition, SceneCtx } from '../../kernel/types'
import { range, smooth } from '../../kernel/state'
import { disposeObject } from '../../kernel/dispose'

let group: THREE.Group | null = null

const scene: SceneDefinition = {
  id: '02-transmission',
  renderer: 'three',
  section: '#transmission',
  assets: ['monolith', 'env-night'],
  quality: 'medium',
  ramp: { enter: 1.2, exit: 0.8 },
  waypoint: {
    landscape: { position: [0, 1.2, 5], focus: [0, 1, 0], fov: 32 },
    portrait:  { position: [0, 1.2, 8], focus: [0, 1, 0], fov: 46 },
  },

  build(ctx: SceneCtx) {
    const gltf = ctx.assets.get<{ scene: THREE.Group }>('monolith')
    group = gltf.scene.clone()
    group.traverse((o) => o.layers.set(ctx.layer))
    ctx.world.add(group)

    ctx.debug.folder('transmission').slider('height', group.position, 'y', { min: -2, max: 4 })
  },

  enter(dir) {
    // idempotent: safe to call repeatedly, in either direction
    group?.scale.setScalar(1)
  },

  update(w, ctx) {
    if (!group) return
    group.rotation.y = ctx.frame.local * Math.PI * 0.5     // scrub
    group.position.y = -1 + smooth(w) * 1                  // blend
  },

  exit() {},

  dispose() {
    if (group) disposeObject(group, { detach: true })
    group = null
  },
}

export default scene
```

Related: [`stage.md`](stage.md) (who calls these), [`weights.md`](weights.md) (where `frame` comes
from), [`camera.md`](camera.md) (what `waypoint` does), [`assets.md`](assets.md).
