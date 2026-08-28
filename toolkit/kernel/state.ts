/**
 * The motion-state singleton.
 *
 * THE RULE: inputs write `.target`. The loop damps `.current`. Render reads `.current`.
 * Nothing else writes `.current`. If you find yourself writing `.current` from an event
 * handler, you have a bug that will show up as jitter on 144Hz displays.
 */
import type { QualityTier } from './types'

export interface Damped {
  current: number
  target: number
  /** Fraction closed per 1/60s. 0.08 = slow and cinematic, 0.2 = responsive. */
  ease: number
}

export const damped = (v = 0, ease = 0.08): Damped => ({ current: v, target: v, ease })

/**
 * Frame-rate-independent exponential damping.
 *
 * The naive `cur += (target - cur) * ease` is frame-rate DEPENDENT: at 144Hz it closes
 * 2.4x faster than at 60Hz, so the same site feels different on different monitors.
 * Raising (1 - ease) to the power of the frame count fixes that exactly.
 */
export function damp(s: Damped, delta: number): void {
  const f = 1 - Math.pow(1 - s.ease, delta * 60)
  s.current += (s.target - s.current) * f
}

/** Snap a damped value to its target with no animation (resize, teleport, reduced motion). */
export function snap(s: Damped, v?: number): void {
  if (v !== undefined) s.target = v
  s.current = s.target
}

export interface MotionState {
  /** Whole-page scroll progress, 0..1. */
  progress: Damped
  /** Signed scroll velocity in viewport-heights per second, roughly -3..3. */
  velocity: Damped
  /** Pointer, normalised to -1..1 with 0 at centre. */
  pointerX: Damped
  pointerY: Damped
  /** Raw, undamped scroll. Read this only when you need the true value (ScrollTrigger). */
  scroll: { value: number; max: number }
  /** +1 scrolling down, -1 up. Never 0. */
  direction: 1 | -1
  /** True while the pointer is over the canvas (desktop) or touching (mobile). */
  hovering: boolean
  reducedMotion: boolean
  quality: QualityTier
  /** Rendering is paused (tab hidden, or user backgrounded the experience). */
  paused: boolean
  time: { elapsed: number; delta: number; frame: number }
  /** Incremented whenever layout changed and every cached rect must be re-measured. */
  pageReflow: number
  viewport: {
    width: number
    height: number
    dpr: number
    aspect: number
    portrait: boolean
    /** 'mobile' < 768 <= 'tablet' < 1024 <= 'desktop' */
    breakpoint: 'mobile' | 'tablet' | 'desktop'
    touch: boolean
  }
}

export const state: MotionState = {
  progress: damped(0, 0.08),
  velocity: damped(0, 0.12),
  pointerX: damped(0, 0.06),
  pointerY: damped(0, 0.06),
  scroll: { value: 0, max: 1 },
  direction: 1,
  hovering: false,
  reducedMotion:
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  quality: 'high',
  paused: false,
  time: { elapsed: 0, delta: 0, frame: 0 },
  pageReflow: 0,
  viewport: {
    width: 1,
    height: 1,
    dpr: 1,
    aspect: 1,
    portrait: false,
    breakpoint: 'desktop',
    touch: false,
  },
}

/** Damp everything the kernel owns. Runs before any scene sees a frame. */
export function updateState(delta: number): void {
  damp(state.progress, delta)
  damp(state.velocity, delta)
  damp(state.pointerX, delta)
  damp(state.pointerY, delta)
}

// NOTE: this file deliberately imports nothing but types. It is the leaf of the kernel's
// dependency graph, so anything may import it without creating a cycle. The stage that calls
// updateState() is registered by boot() in index.ts.

/** Utility every scene needs. Not in Math, annoyingly. */
export const clamp = (v: number, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v)

/** Remap a..b -> 0..1, clamped. The single most-used function in this whole codebase. */
export const range = (v: number, a: number, b: number) => clamp((v - a) / (b - a || 1))

/** Remap in one call: v from [a,b] to [c,d], clamped. */
export const remap = (v: number, a: number, b: number, c: number, d: number) =>
  c + range(v, a, b) * (d - c)

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** Smoothstep. Use instead of linear for anything a human will look at. */
export const smooth = (t: number) => t * t * (3 - 2 * t)

/** 0 at the edges, 1 in the middle. For "fade in then out across my range". */
export const bell = (t: number) => Math.sin(clamp(t) * Math.PI)
