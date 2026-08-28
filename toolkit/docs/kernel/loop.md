# `kernel/loop.ts`

## Purpose

One `requestAnimationFrame` for the whole site, divided into named stages with declared ordering.
Every subsystem — scroll, camera, scenes, DOM writes, the draw call — is a stage. Nothing anywhere
else in the codebase is allowed to call `requestAnimationFrame`.

## When to use it

- Any per-frame work: `addStage`.
- Any work that must happen after something else per-frame: `addStage` with `after`.
- Turning a subsystem off temporarily (during a transition, in a debug mode): `setStageEnabled`.

## When NOT to use it

- **Not for one-shot animations.** A button hover, a modal, a text reveal — GSAP owns those. GSAP has
  its own ticker and it is already synchronised with Lenis (see [`scroll.md`](scroll.md)). A stage is
  for work that happens *every* frame, forever.
- **Not for anything the compositor can do.** A CSS transition on `transform` runs off the main
  thread. A stage writing `style.transform` every frame does not. If the value only changes on
  hover, use CSS.
- **Not for throttled work at your own cadence.** Register one stage and accumulate `delta` inside
  it (as `modules/raycast.ts` does at 30Hz) rather than adding a `setInterval` alongside the loop.

## Signature

```ts
export interface Stage {
  order: number
  name: string
  fn: (delta: number, elapsed: number) => void
  /** Names of stages that must already be registered. Enforced at register time. */
  after?: string[]
  enabled?: boolean
}

export function addStage(stage: Stage): void          // throws on missing dep or duplicate name
export function removeStage(name: string): void
export function setStageEnabled(name: string, on: boolean): void
export function listStages(): { order: number; name: string; enabled: boolean }[]
export function startLoop(): void
export function stopLoop(): void
export function bindVisibility(): () => void
```

## Inputs

**`order`** decides execution sequence. The reserved bands:

| band | owner |
|---|---|
| 0–99 | kernel: time, state, scroll, viewport, weights, camera, scenes |
| 100–899 | **your project's scenes and systems** |
| 900–979 | DOM and interaction overlays (bridge, anchors, cursor, audio, picker) |
| 980–999 | render, transition overlay, watchdog, debug |

**`after`** is an assertion, not a hint. `addStage` throws if a named dependency is not yet
registered. Use it for real dependencies — a stage that reads the camera's final position declares
`after: ['camera']` — so that a future reorder fails loudly at boot instead of producing a one-frame
lag nobody notices for a week.

**`name`** must be unique; `addStage` throws on a duplicate. This is what makes `removeStage` in a
module's `dispose()` safe.

## Outputs

`delta` is seconds since the last frame, **clamped to `MAX_DELTA = 1/20`** (50 ms). Without the
clamp, returning to a backgrounded tab delivers a delta of several seconds and every damped value
teleports — the camera snaps, particles jump to their end state, and the first frame back looks
broken.

`elapsed` is total seconds since `startLoop()`.

Stage 0 `time` is registered at module load and writes `state.time.elapsed / delta / frame`.

## Transitions and applications

The loop order *is* the architecture. Two orderings matter enough to spell out:

**Anything that reads a world matrix must run after `camera` (50), and ideally after `scenes` (60).**
Three only refreshes `matrixWorld` inside `renderer.render()`. A stage at order 20 that calls
`getWorldPosition()` is reading last frame's transform. `modules/raycast.ts` (970) and
`createAnchors` (910) both sit after the camera for this reason, and the picker additionally calls
`updateWorldMatrix` on its short registered list.

**Anything that writes to the DOM should run in one band, late (900–935).** Batching all DOM writes
after all reads avoids interleaved layout invalidation. This is why the bridge, anchors, reveal,
cursor and magnetic stages are adjacent.

**`stopLoop()` / `startLoop()`** wrap a heavy operation that must not compete with rendering — a
large glTF parse, a KTX2 transcode. `bindVisibility()` does this automatically for tab visibility
and also sets `state.paused`.

## Gotchas

**Two stages may share an order.** `scene-attr` and `dom-bridge` are both 900. `Array.prototype.sort`
is stable in every modern engine, so they run in registration order. If two stages genuinely depend
on each other, express it with `after`, not with adjacent numbers.

**`addStage` throwing at boot is the feature.** If you see
`[loop] stage "x" requires "y" which is not registered`, you registered in the wrong order — usually
a module initialised before `boot()` finished. Move the call, do not delete the `after`.

**`removeStage` in `dispose()` is mandatory for modules.** A disposed cursor whose stage is still
running writes transforms to a detached element every frame, forever. Every module in this toolkit
removes its own stages; follow that.

**A stage that throws kills the frame.** There is no per-stage try/catch — deliberately, because
swallowing an exception per frame produces 60 identical console errors per second and hides the
cause. Guard inside your own stage if the work is genuinely optional.

## Recipe

```ts
import { addStage, removeStage } from '../kernel/loop'
import { state } from '../kernel/state'

export function initSomething() {
  let accumulated = 0

  addStage({
    order: 300,                    // project band
    name: 'my-system',
    after: ['scenes'],             // I read final scene state
    fn: (delta, elapsed) => {
      // Throttle inside the stage rather than adding a timer beside the loop.
      accumulated += delta
      if (accumulated < 1 / 15) return
      accumulated = 0

      doExpensiveThing(state.progress.current, elapsed)
    },
  })

  return () => removeStage('my-system')
}
```

Debug what is actually running:

```ts
console.table(listStages())
```

Related: [`state.md`](state.md), [`index.md`](index.md) (the boot order), [`quality.md`](quality.md)
(the watchdog reads frame times from the loop).
