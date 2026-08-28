# `kernel/weights.ts`

## Purpose

Turns scroll position into a per-scene blend factor. This is the mechanism behind Law 3 and Law 4:
every scene's presence is computed independently from its own section's geometry, so no scene knows
another exists.

## When to use it

`initWeights()` once, from `boot()`. After that, scenes read `ctx.frame.weight` and `ctx.frame.local`
and never touch this file.

## When NOT to use it

Not for DOM element reveals — that is `initReveal` in `modules/dom-bridge.ts`, driven by an
IntersectionObserver, which is cheaper for many small elements. Weights are for scenes, which are
few and expensive.

## Signature

```ts
export const ACTIVE_THRESHOLD = 0.001

export function measureScene(inst: SceneInstance): void
export function computeWeights(instances: SceneInstance[]): void
export function initWeights(
  instances: SceneInstance[],
  onEdge: (inst: SceneInstance, entering: boolean, dir: number) => void,
): () => void
export function dominant(instances: SceneInstance[]): SceneInstance | null
```

## Inputs

`measureScene` caches `{ top, height }` in **document space** via `measure()`. It runs on
registration and on every reflow — never in the loop.

`computeWeights` reads only cached rects and `state.scroll.value`. Per scene, per frame, it is a
handful of subtractions and a multiply. This is why a 12-scene site costs nothing to weight, where 12
ScrollTriggers with their own callbacks would be measurably heavier.

`ramp` (from `SceneDefinition`) controls the ramp widths in viewport heights, defaulting to 1 each
side.

## Outputs

Per instance, per frame:

```
in     0 → 1   as the section approaches and enters the viewport
out    0 → 1   as it leaves
weight clamp(in × (1 − out))
```

`weight` is therefore a **bell**: 0 before, rising to 1 while the section owns the screen, falling
back to 0 after. `local` (computed alongside) is a **ramp** that reaches 1 and stays.

`active` flips when `weight` crosses `ACTIVE_THRESHOLD` (0.001), and `onEdge` fires with
`(instance, entering, direction)`. `kernel/stage.ts` uses that to call the scene's `enter`/`exit`.

`dominant(instances)` returns the highest-weighted scene, used for `data-active-scene` and for
deciding which scene gets to drive global state (post-processing grade, audio bed).

## Transitions and applications

**Why `in × (1 − out)` and not a piecewise function.** The two ramps are independent, so a section can
be entering and leaving at once (a short section on a tall screen) and the arithmetic still produces
a sensible partial weight. A piecewise `if (entering) … else if (leaving) …` breaks exactly there,
and short sections are common in editorial layouts.

**Why the threshold is 0.001 and not 0.** Floating-point ramps produce values like `3e-17` that never
reach exactly zero. A `weight > 0` test leaves every scene permanently active — every `update()`
running forever, which on a 9-scene site is a 9× multiplier on your frame cost. This one constant is
the difference between a site that runs and one that mysteriously does not.

**Crossfade authoring.** Two adjacent scenes both having weight ~0.5 in the overlap is the crossfade.
Control it entirely with `ramp`:

```ts
ramp: { enter: 0.2, exit: 0.2 }   // hard cut, minimal overlap, cheapest
ramp: { enter: 1,   exit: 1 }     // one screen of crossfade (default)
ramp: { enter: 2.5, exit: 2.5 }   // long dissolve; both scenes live for ages
```

Cost scales with overlap. Two heavy `three` scenes overlapping for 2.5 viewport-heights means both
are fully built, updating and rendering for that whole stretch. `budget().maxActiveScenes` caps how
many the kernel will keep updating on lower tiers.

## Gotchas

**A section with `height: auto` and no content has height 0**, so `in` and `out` transition in the
same pixel and `weight` never rises above ~0. Symptom: the scene builds, never enters. Give every
scene section an explicit height (`min-height: calc(var(--vh) * 100)`).

**Sections must not overlap in the document.** Absolute-positioned or negative-margined sections
produce overlapping scroll ranges and two scenes both claiming weight 1. The weighted-average camera
then sits between two waypoints and looks at nothing.

**`local` past 1 or below 0.** It is clamped, but if you feed it to a GSAP timeline `progress()` and
also apply your own `range()`, double-clamping can flatten the end of your animation. Pick one.

**Never call `measureScene` from a stage.** It reads layout. The reflow path exists precisely so this
never happens in the loop.

## Recipe

Reading weights inside a scene:

```ts
update(w, ctx) {
  // BLEND with weight — goes back to 0 at the end of the section
  material.opacity = w
  group.scale.setScalar(0.9 + w * 0.1)
  post?.set('uFade', 1 - w)

  // SCRUB with local — monotonic, reversible, never rewinds
  timeline.progress(ctx.frame.local)
  video.seek(ctx.frame.local)

  // The raw ramps, for asymmetric behaviour
  if (ctx.frame.out > 0.6) startLeavingEffect(ctx.frame.out)
}
```

Choosing the ramp for a mood:

```ts
// A hard, graphic cut between two worlds
{ id: '05-dissolution', ramp: { enter: 0.15, exit: 0.15 }, … }

// An atmospheric dissolve where fog from one world bleeds into the next
{ id: '01-world', ramp: { enter: 2, exit: 2 }, quality: 'high', … }
```

Related: [`types.md`](types.md) (`ramp`, `frame`), [`stage.md`](stage.md) (who consumes `onEdge`),
[`camera.md`](camera.md) (weights drive the camera), [`viewport.md`](viewport.md) (reflow).
