# `kernel/state.ts`

## Purpose

The single mutable object that holds every continuously-varying value in the experience: scroll
progress, velocity, pointer, viewport, quality, time. It is the leaf of the kernel's dependency
graph — it imports nothing but types — so any file may import it without creating a cycle.

## When to use it

Always. Every scene, every module, every shader uniform ultimately reads from `state`. If you find
yourself passing scroll progress or pointer position into a function as an argument, stop: read it
from `state` at the point of use.

## When NOT to use it

- **Do not add per-scene data to `state`.** A scene's own values live in the closure created by its
  `build()`. `state` is for values that more than one subsystem needs.
- **Do not write `state.progress.current` directly.** Write `.target` and let stage 10 damp it. The
  only exception is `snap()`, used after a jump or a resize where easing would be visible as a
  slide.
- **Do not read `.current` for hit testing.** The damped value trails the truth by up to ~100 ms.
  Picking, plane probes and anything that must land under the physical pointer read `.target`.

## Signature

```ts
export interface Damped { current: number; target: number; ease: number }

export const damped: (v?: number, ease?: number) => Damped
export function damp(s: Damped, delta: number): void
export function snap(s: Damped, v?: number): void

export interface MotionState {
  progress: Damped            // 0..1 whole-page scroll
  velocity: Damped            // signed, viewport-heights per second, roughly -3..3
  pointerX: Damped            // -1..1, 0 at centre
  pointerY: Damped
  scroll: { value: number; max: number }        // raw, undamped
  direction: 1 | -1                             // never 0
  hovering: boolean
  reducedMotion: boolean
  quality: QualityTier
  paused: boolean
  time: { elapsed: number; delta: number; frame: number }
  pageReflow: number
  viewport: {
    width: number; height: number; dpr: number; aspect: number
    portrait: boolean
    breakpoint: 'mobile' | 'tablet' | 'desktop'
    touch: boolean
  }
}

export const state: MotionState
export function updateState(delta: number): void

export const clamp:  (v: number, lo?: number, hi?: number) => number
export const range:  (v: number, a: number, b: number) => number
export const remap:  (v: number, a: number, b: number, c: number, d: number) => number
export const lerp:   (a: number, b: number, t: number) => number
export const smooth: (t: number) => number
export const bell:   (t: number) => number
```

## Inputs

`damped(v = 0, ease = 0.08)`. The `ease` is *the fraction closed per 1/60 s*, so it reads the same
way at every refresh rate.

| ease | feel | used for |
|---|---|---|
| 0.02–0.05 | very heavy, floating | atmospheric camera, fog, background layers |
| 0.06–0.10 | cinematic | the kernel defaults: progress 0.08, pointer 0.06 |
| 0.12–0.20 | responsive | velocity (0.12), UI, a cursor ring |
| 0.30–0.50 | tight, still smoothed | a cursor dot, a value that must feel instant |
| 1.0 | no damping | never — just assign the value |

Kernel defaults: `progress` 0.08, `velocity` 0.12, `pointerX/Y` 0.06.

## Outputs

`state` is read, not returned. `updateState(delta)` damps the four kernel-owned values and is called
by the `state` stage (order 10) that `boot()` registers. Nothing else should call it.

`state.direction` is never 0 — it holds the last non-zero direction, so `data-scroll-direction` does
not flicker at the top of the page or at a scroll stop.

`state.viewport.breakpoint` is `'mobile'` below 768, `'tablet'` below 1024, `'desktop'` at and above.

## Transitions and applications

The math helpers are the vocabulary of scroll-driven motion. Learn these four:

```ts
range(v, a, b)          // remap a..b to 0..1, clamped — "start at 0.3, finish at 0.6"
remap(v, a, b, c, d)    // a..b to c..d — "as scroll goes 0.2→0.8, fov goes 50→24"
smooth(t)               // smoothstep — kills the visible corner at both ends of a linear ramp
bell(t)                 // sin(t·π) — 0 at both ends, 1 in the middle: a pulse, a flash, a bloom bump
```

`bell()` is the shape of a moment. Anything that should peak in the middle of a section and be gone
at both edges — a light flare, a rumble, a chromatic aberration hit — is `bell(ctx.frame.local)`.

`smooth(range(...))` composed together is how you author a beat without a timeline:

```ts
const t = smooth(range(state.progress.current, 0.35, 0.55))
material.opacity = t
```

## Gotchas

**Damping in an event handler.** `pointermove` fires at the pointer's polling rate. Damping there
makes the easing speed depend on the user's mouse — a 1000Hz gaming mouse eases eight times faster
than a trackpad. Write `.target` in the handler; damp in the stage.

**Frame-rate dependence.** `damp()` uses `1 - Math.pow(1 - ease, delta * 60)`. The naive
`current += (target - current) * ease` closes **2.4× faster at 144 Hz**. If you write your own
damped value anywhere, use `damp()`.

**A visible slide after a jump.** After `scrollTo({ immediate: true })`, a resize, or restoring
scroll position on load, the damped values still hold the old numbers and will *animate* to the new
ones. Call `snap()` on them, which is what `camera.snapToTargets()` does internally.

**`reducedMotion` is captured at module load** from `matchMedia`. `?nomotion` forces it in `boot()`.
It is not re-read if the user changes the OS setting mid-session — acceptable, and the alternative
(a live listener that re-initialises scenes) is not worth the complexity.

## Recipe

```ts
import { state, damped, damp, range, smooth, bell, clamp } from '../kernel/state'
import { addStage } from '../kernel/loop'

// A scene-local damped value with its own feel.
const glow = damped(0, 0.05)          // heavy: it should lag the scroll noticeably

export default {
  id: '04-artifact',
  renderer: 'three',
  section: '#artifact',

  build(ctx) {
    // ...
  },

  update(w, ctx) {
    // weight to blend
    material.opacity = w

    // local to scrub, smoothed so the ends have no corner
    const reveal = smooth(range(ctx.frame.local, 0.1, 0.6))
    mesh.scale.setScalar(0.8 + reveal * 0.2)

    // bell for a moment that peaks mid-section
    light.intensity = 2 + bell(ctx.frame.local) * 8

    // a lagging value of your own
    glow.target = w * 3
    damp(glow, state.time.delta)
    material.emissiveIntensity = glow.current

    // pointer, already damped by the kernel
    mesh.rotation.y = state.pointerX.current * 0.3
  },

  dispose() {},
}
```

Related: [`loop.md`](loop.md) (who calls `updateState`), [`viewport.md`](viewport.md)
(`pageReflow`), [`../modules/dom-bridge.md`](../modules/dom-bridge.md) (publishing these to CSS).
