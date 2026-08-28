# `kernel/debug.ts`

## Purpose

A URL-flag-driven debug layer. It ships to production harmlessly — Tweakpane and stats-gl are
dynamically imported, so a normal visitor never downloads them — which means you can diagnose a
client's "it looks broken on my laptop" by sending them a link with `?debug` on the end.

## When to use it

`createDebug(flags, renderer, world, instances)` once, from `boot()`. Inside a scene, use `ctx.debug`
freely: every method is a no-op when `?debug` is absent, so scenes need no branching at all.

## When NOT to use it

- **Not as a logging framework.** `debug.log()` is silent in production, which is right for diagnostics
  and wrong for errors. Real errors go to `console.error` unconditionally.
- **Not for values a designer should control.** A slider you tune once and hard-code is correct. A
  slider that *is* the source of truth means the look lives in a URL and is lost on reload. Tune, then
  commit the number.
- **Not for gating features.** Flags describe how to *inspect* the site, never what it does.

## Signature

```ts
export interface DebugFlags {
  enabled: boolean          // ?debug
  stats: boolean            // ?debug or ?stats
  scene: string | null      // ?scene=03
  quality: QualityTier | null  // ?quality=low|medium|high
  nomotion: boolean         // ?nomotion
  wireframe: boolean        // ?wireframe
  axes: boolean             // ?axes
  waypoints: boolean        // ?waypoints
}

export function readFlags(search?: string): DebugFlags

export interface Debug {
  flags: DebugFlags
  slider(label, obj, key, opts?: { min?; max?; step? }): () => void
  color(label, obj, key): () => void
  toggle(label, obj, key): () => void
  button(label, fn: () => void): () => void
  monitor(label, read: () => number | string): () => void
  folder(name: string): Debug
  bindScenes(instances: SceneInstance[]): void
  log(...args: unknown[]): void
  dispose(): void
}

export async function createDebug(
  flags: DebugFlags,
  renderer: THREE.WebGLRenderer,
  world: THREE.Scene,
  instances: SceneInstance[],
): Promise<Debug>
```

## Inputs

The complete flag set, and what each is actually for:

| flag | effect | use it when |
|---|---|---|
| `?debug` | Tweakpane panel + stats + `window.cw` handle | general inspection |
| `?stats` | stats-gl only, no panel | checking fps without the panel covering the art |
| `?scene=03` | build **only** that scene, camera locked to its waypoint | working on one scene; boots in seconds instead of a minute |
| `?quality=low` | force a tier | testing the demotion path without owning a slow device |
| `?nomotion` | simulate `prefers-reduced-motion` | verifying the reduced-motion path, which is a hard requirement |
| `?wireframe` | wireframe every material in `world` | finding geometry that is the wrong scale or inside-out |
| `?axes` | `AxesHelper(5)` at the origin | orienting yourself when a scene looks empty |
| `?waypoints` | a green marker per waypoint plus a line to its focus point | seeing where the camera is *supposed* to be |

`readFlags` treats `?wireframe=false` and `?wireframe=0` as absent, so flags can be toggled in a URL
without deleting them.

`?scene=03` is passed straight through to `createSceneManager`'s `only` option — the other scenes are
never registered, never load assets, never build.

## Outputs

**Without `?debug`, `createDebug` returns `nullDebug`** — an object where every method is a no-op and
`folder()` returns itself. This is the whole reason scenes can call `ctx.debug.slider(...)`
unconditionally. Note the ordering: with `?stats` but not `?debug`, stats-gl is still initialised and
*then* `nullDebug` is returned, so you get the fps meter with no panel.

**The `kernel` folder** is always present under `?debug` and updates at stage 998:

`fps` · `quality` · `progress` · `scene` (dominant scene id + its weight) · `geometries` · `textures`
· `calls`

Those last three are the numbers that matter. `geometries` and `textures` climbing while you scroll up
and down is a leak. `calls` above a few hundred means you are CPU-bound on draw calls, not GPU-bound —
see the draw-call arithmetic in [`../../BIBLE.md`](../../BIBLE.md) §3.

**Two stages** are registered:

| order | name | does |
|---|---|---|
| 998 | `debug-readout` | refreshes the seven kernel numbers |
| 999 | `debug-monitors` | pushes every `monitor()` and per-scene weight readout |

**`window.cw`** is set to `{ state, instances, renderer, world, pane, debug }`. From devtools:

```js
cw.state.scroll.value          // where the scroll actually is
cw.instances.map(i => [i.def.id, +i.weight.toFixed(2)])
cw.renderer.info.render.calls
```

`ctx.debug` inside a scene is already `debug.folder(def.id)` — the manager does that, so each scene's
controls stay in their own collapsed folder rather than in one 200-row list. The exception is
`renderer: 'none'` scenes, which get the root `debug` (they usually have nothing to bind).

## Transitions and applications

**Authoring a waypoint.** This is the intended workflow and it is much faster than guessing numbers:

1. open `?debug&waypoints&scene=03`
2. move the camera to the framing you want
3. in the console: `printWaypoint(cw.state ? cw.renderer : null)` — or more simply, from a scene folder
   button you added: `printWaypoint(ctx.camera)`
4. paste the emitted literal into the scene definition

See [`camera.md`](camera.md) for `printWaypoint`.

**`bindScenes` is called late, on purpose.** At `createDebug()` time the instance array is still empty
and `world` has nothing in it — traversing to apply `?wireframe` would find zero materials, and the
weights folder would be blank. `boot()` calls `debug.bindScenes(instances)` *after* the manager has
built everything. `bindScenes` also applies the `?wireframe` and `?waypoints` helpers, and guards
itself so a second call does nothing.

**Monitors are pull-based.** `monitor(label, read)` stores your `read` function and calls it at stage
999, writing into a proxy object Tweakpane is bound to. You never push a value; you hand over a getter.
That means a monitor cannot go stale and costs nothing when the panel is absent.

## Gotchas

**`?debug` must not appear in the initial bundle.** Check the network tab: `tweakpane` and `stats-gl`
should only load when the flag is set. If they show up in the main chunk, someone converted a dynamic
`import()` into a static one — that adds ~120 KB to every visitor's download for a feature they cannot
see.

**`stats.init(renderer)` patches `renderer.render`.** You do not call `begin()`/`end()` yourself, and
you should not wrap `renderer.render` in anything else afterwards. `trackGPU: true` uses a timer query
extension; on some drivers the GPU number is absent and reads as 0. That is the driver, not a bug.

**`?wireframe` mutates the real materials.** It sets `wireframe = true` on every material it finds,
including shared and registry-owned ones. Reload to clear it; do not screenshot a wireframe session and
wonder why the next scene is also wireframed.

**`?waypoints` only draws the landscape waypoint.** Portrait overrides are not visualised. If a scene
looks correctly framed in the debug markers but wrong on a phone, its portrait waypoint is the problem.

**`monitor()` returns a disposer that removes the Tweakpane binding but leaves the entry in the
internal `monitors` array.** The `read` closure keeps running each frame. Harmless for a handful; do
not create monitors in a loop or per scene enter.

**The panel is `position: fixed` at `top: 8px; right: 8px`.** It covers content in that corner. If the
art direction puts something important there, collapse the panel rather than moving it.

## Recipe

Boot wiring (what `boot()` does):

```ts
import { readFlags, createDebug } from './debug'

const flags = readFlags()
if (flags.quality) state.quality = flags.quality
if (flags.nomotion) state.reducedMotion = true

const instances: SceneInstance[] = []
const debug = await createDebug(flags, stage.renderer, stage.world, instances)

const scenes = await createSceneManager({
  stage, assets, debug, manifest,
  only: flags.scene,
  instances,                       // same array the debug pane holds
})

debug.bindScenes(instances)        // after build: binds weights, applies wireframe/waypoints
```

Inside a scene — unconditional, no `if (debug)` anywhere:

```ts
build(ctx) {
  const params = { intensity: 0.6, speed: 0.35, tint: new THREE.Color(0xff8844) }

  ctx.debug.slider('intensity', params, 'intensity', { min: 0, max: 2, step: 0.01 })
  ctx.debug.slider('speed',     params, 'speed',     { min: 0, max: 1, step: 0.01 })
  ctx.debug.color('tint',       params, 'tint')
  ctx.debug.monitor('local',    () => ctx.frame.local)
  ctx.debug.monitor('particles',() => count)
  ctx.debug.button('print waypoint', () => console.log(printWaypoint(ctx.camera)))

  material.uniforms.uIntensity.value = params.intensity   // read params in update()
}
```

Diagnosing a slow site, in order:

```
?stats              → is it CPU or GPU bound? (stats-gl shows both)
?debug              → what is `calls`? >300 means draw-call bound
?quality=low        → does it get fast? then it is fill-rate/DPR
?scene=03           → which scene specifically?
?wireframe          → is something absurdly dense that should not be?
```

Related: [`quality.md`](quality.md) (`?quality`), [`stage.md`](stage.md) (`only`),
[`camera.md`](camera.md) (`printWaypoint`), [`index.md`](index.md) (boot order),
[`loop.md`](loop.md) (stages 998/999).
