/**
 * The single scroll source, plus pointer input.
 *
 * Lenis owns the scroll position. GSAP's ScrollTrigger is told about it; it never drives it.
 * The three lines in bindGsap() are load-bearing and in this exact order for a reason:
 *   1. lenis.on('scroll', ScrollTrigger.update)  -> triggers fire on Lenis's value, not the browser's
 *   2. gsap.ticker.add(t => lenis.raf(t * 1000)) -> one clock, so animation and scroll can't tear
 *   3. gsap.ticker.lagSmoothing(0)               -> GSAP must not invent time; the loop clamps delta
 *
 * If you skip (3), GSAP will "catch up" after a stall by fast-forwarding, and every scrubbed
 * timeline jumps. It looks like a physics bug and it isn't.
 */
import Lenis from 'lenis'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { state } from './state'
import { addStage } from './loop'
import { requestReflow, onReflow } from './viewport'

gsap.registerPlugin(ScrollTrigger)

export let lenis: Lenis | null = null

export interface ScrollOptions {
  /** Seconds to settle. 1.0–1.4 reads as cinematic; below 0.6 feels like native scroll. */
  duration?: number
  /** Multiplier on wheel delta. Lower = heavier. */
  wheelMultiplier?: number
  /** Smooth touch scrolling is usually a mistake — it fights the OS. Off by default. */
  syncTouch?: boolean
  /** Element that scrolls. Defaults to window. */
  wrapper?: HTMLElement | Window
  content?: HTMLElement
}

export function initScroll(opts: ScrollOptions = {}): () => void {
  const reduced = state.reducedMotion

  lenis = new Lenis({
    duration: reduced ? 0 : (opts.duration ?? 1.1),
    // Exponential ease-out. Matches the damping model used everywhere else in the kernel.
    easing: (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
    wheelMultiplier: opts.wheelMultiplier ?? 1,
    syncTouch: opts.syncTouch ?? false,
    smoothWheel: !reduced,
    wrapper: (opts.wrapper as HTMLElement) ?? undefined,
    content: opts.content ?? undefined,
  })

  // --- the bridge ---
  const onLenisScroll = () => ScrollTrigger.update()
  lenis.on('scroll', onLenisScroll)
  const rafBridge = (time: number) => lenis?.raf(time * 1000)
  gsap.ticker.add(rafBridge)
  gsap.ticker.lagSmoothing(0)

  // ScrollTrigger must not install its own rAF-driven scroller proxy on top of Lenis;
  // telling it to refresh on our reflow keeps a single source of truth for layout.
  onReflow(() => ScrollTrigger.refresh())

  addStage({
    order: 20,
    name: 'scroll',
    after: ['state'],
    fn: (delta) => {
      if (!lenis) return
      const max = Math.max(1, lenis.limit)
      const value = lenis.scroll
      const prev = state.scroll.value
      state.scroll.value = value
      state.scroll.max = max
      state.progress.target = value / max

      // Velocity in viewport-heights per second, sign carried. Lenis exposes .velocity in
      // px/frame which is frame-rate dependent, so derive it from the delta we already clamp.
      const vh = state.viewport.height || 1
      const v = (value - prev) / vh / Math.max(delta, 1 / 240)
      state.velocity.target = Math.max(-4, Math.min(4, v))

      if (Math.abs(value - prev) > 0.1) state.direction = value > prev ? 1 : -1
    },
  })

  requestReflow()

  return () => {
    lenis?.off('scroll', onLenisScroll)
    gsap.ticker.remove(rafBridge)
    lenis?.destroy()
    lenis = null
  }
}

/** Programmatic navigation. Use this, never window.scrollTo — Lenis would fight it. */
export function scrollTo(
  target: string | number | HTMLElement,
  opts: { offset?: number; duration?: number; immediate?: boolean } = {},
): void {
  lenis?.scrollTo(target, {
    offset: opts.offset ?? 0,
    duration: opts.duration ?? 1.2,
    immediate: opts.immediate ?? state.reducedMotion,
  })
}

export function stopScroll(): void {
  lenis?.stop()
}
export function startScroll(): void {
  lenis?.start()
}

/* ------------------------------------------------------------------ pointer */

/**
 * Pointer input. Writes targets only.
 *
 * Normalised to -1..1 with 0 at centre so shaders and parallax work identically at any
 * viewport size. On touch devices the pointer decays back to centre after release, otherwise
 * the parallax freezes wherever the finger left it and looks broken.
 */
export function initPointer(el: HTMLElement | Window = window): () => void {
  const target = el as HTMLElement

  const write = (cx: number, cy: number) => {
    const { width, height } = state.viewport
    state.pointerX.target = (cx / width) * 2 - 1
    state.pointerY.target = -((cy / height) * 2 - 1)
  }

  const onMove = (e: PointerEvent) => {
    state.hovering = true
    write(e.clientX, e.clientY)
  }
  const onLeave = () => {
    state.hovering = false
    state.pointerX.target = 0
    state.pointerY.target = 0
  }
  const onTouchEnd = () => {
    state.hovering = false
    state.pointerX.target = 0
    state.pointerY.target = 0
  }

  target.addEventListener('pointermove', onMove as EventListener, { passive: true })
  target.addEventListener('pointerleave', onLeave as EventListener, { passive: true })
  target.addEventListener('pointercancel', onTouchEnd as EventListener, { passive: true })
  target.addEventListener('touchend', onTouchEnd as EventListener, { passive: true })

  return () => {
    target.removeEventListener('pointermove', onMove as EventListener)
    target.removeEventListener('pointerleave', onLeave as EventListener)
    target.removeEventListener('pointercancel', onTouchEnd as EventListener)
    target.removeEventListener('touchend', onTouchEnd as EventListener)
  }
}

export { gsap, ScrollTrigger }
