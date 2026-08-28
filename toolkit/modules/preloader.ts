/**
 * The preloader.
 *
 * Three problems, none of them about loading.
 *
 * 1. Real progress is lumpy. Asset weights resolve in bursts, so a bar bound directly to
 *    `assets.progress()` sits at 0, jumps to 0.4, sits, then hits 1. It reads as broken. The fix
 *    is to damp the displayed value toward the real one and never let it move backwards, which
 *    is honest — it is still bounded by the truth — while looking continuous.
 *
 * 2. A preloader that flashes for 200ms is worse than none. `minMs` holds it, and because
 *    shader compilation happens behind it (see kernel/renderer.ts compileAll) that time is
 *    doing real work, not stalling.
 *
 * 3. Audio cannot start without a user gesture, in every browser. If the experience has sound,
 *    the preloader must end in a click. `gate: true` turns the "100%" state into an ENTER
 *    button and resolves only on that click, which is also a good moment to start the score.
 *
 * The DOM is yours. This drives `data-*` attributes and CSS properties on an element you
 * provide; all animation belongs in CSS. There is no markup opinion in here beyond the hooks.
 */
import { state, clamp } from '../kernel/state'
import { addStage, removeStage } from '../kernel/loop'
import { gsap } from '../kernel/scroll'

export interface PreloaderOptions {
  /** Root element. Defaults to `[data-preloader]`. */
  el?: HTMLElement | string
  /** Element whose text is set to the percentage. Defaults to `[data-preloader-count]`. */
  counter?: HTMLElement | string | null
  /** Minimum time on screen, ms. Below ~800 it reads as a flash. */
  minMs?: number
  /** Require a click to continue. Mandatory if the site has audio. */
  gate?: boolean
  /** Element that must be clicked when `gate` is set. Defaults to `[data-preloader-enter]`. */
  enter?: HTMLElement | string | null
  /** Seconds for the exit animation. The kernel waits for this before the first frame. */
  outDuration?: number
  /** Called with the damped 0..1 value each frame. For a custom bar or a shader uniform. */
  onTick?: (p: number) => void
}

export interface Preloader {
  /** Feed the real value here — from `assets.onProgress`. */
  set(p: number): void
  /** Resolves when the minimum time has elapsed, progress is 1, and (if gated) clicked. */
  done(): Promise<void>
  /** Plays the exit animation and removes the element. Await before starting the loop. */
  hide(): Promise<void>
  destroy(): void
}

const resolveEl = (v: HTMLElement | string | null | undefined, fallback: string) => {
  if (v instanceof HTMLElement) return v
  return document.querySelector<HTMLElement>(typeof v === 'string' ? v : fallback)
}

export function createPreloader(opts: PreloaderOptions = {}): Preloader {
  const el = resolveEl(opts.el, '[data-preloader]')
  const counter = opts.counter === null ? null : resolveEl(opts.counter, '[data-preloader-count]')
  const enterEl = opts.gate
    ? (opts.enter === null ? null : resolveEl(opts.enter, '[data-preloader-enter]'))
    : null
  const minMs = opts.minMs ?? 900
  const outDuration = opts.outDuration ?? (state.reducedMotion ? 0.01 : 0.8)

  const startedAt = performance.now()
  let real = 0
  let shown = 0
  let lastPercent = -1

  let resolveDone: () => void = () => {}
  const donePromise = new Promise<void>((res) => {
    resolveDone = res
  })
  let settled = false
  let clicked = !opts.gate

  const checkSettled = () => {
    if (settled) return
    if (shown < 0.999) return
    if (performance.now() - startedAt < minMs) return
    if (!clicked) {
      // Reveal the gate exactly once, when everything else is satisfied.
      if (el && el.dataset.state !== 'gate') el.dataset.state = 'gate'
      return
    }
    settled = true
    resolveDone()
  }

  if (enterEl) {
    enterEl.addEventListener(
      'click',
      () => {
        clicked = true
        checkSettled()
      },
      { once: true },
    )
  } else if (opts.gate) {
    // gate requested but no button in the DOM: fall back to any click on the overlay, so a
    // missing element degrades to "click anywhere" rather than a page that never starts.
    const target = el ?? document.body
    target.addEventListener(
      'click',
      () => {
        clicked = true
        checkSettled()
      },
      { once: true },
    )
  }

  addStage({
    order: 5,
    name: 'preloader',
    fn: (delta) => {
      // Damped toward the real value, and monotonic: a bar that goes backwards destroys trust
      // more than a slow one does. 4/s means it closes ~98% of a gap in one second.
      const f = 1 - Math.pow(1 - 0.06, delta * 60)
      shown = Math.max(shown, shown + (real - shown) * f)
      // Snap the last sliver; exponential damping never quite arrives and the counter would
      // sit at 99% forever.
      if (real >= 1 && shown > 0.995) shown = 1

      const percent = Math.round(shown * 100)
      if (counter && percent !== lastPercent) {
        lastPercent = percent
        counter.textContent = String(percent).padStart(2, '0')
      }
      if (el) el.style.setProperty('--preload', shown.toFixed(4))
      opts.onTick?.(shown)
      checkSettled()
    },
  })

  if (el) el.dataset.state = 'loading'

  return {
    set(p) {
      real = clamp(p)
    },
    done: () => donePromise,
    async hide() {
      if (!el) {
        removeStage('preloader')
        return
      }
      el.dataset.state = 'out'
      // The CSS owns the look; GSAP only owns the timing, so the two never disagree about
      // when the loop is allowed to start.
      await gsap.to(el, {
        autoAlpha: 0,
        duration: outDuration,
        ease: 'power2.inOut',
      })
      el.remove()
      removeStage('preloader')
    },
    destroy() {
      removeStage('preloader')
      el?.remove()
    },
  }
}

/* ------------------------------------------------------------------ wiring ---- */

/**
 * The whole preloader lifecycle in one call, for the common case.
 *
 * Pass it to boot() like this:
 *
 *   const pre = createPreloader({ gate: true })
 *   const app = await boot({
 *     manifest,
 *     assets,
 *     onProgress: pre.set,
 *     onReady: async () => { await pre.done(); await pre.hide() },
 *   })
 *
 * The ordering is the point: onProgress feeds it, and onReady — which the kernel calls after
 * shaders are compiled but before the first frame — is where you wait. Do it the other way
 * round and the reveal happens onto an uncompiled scene, which is the stutter this all exists
 * to prevent.
 */
export function preloaderHooks(pre: Preloader) {
  return {
    onProgress: (p: number) => pre.set(p),
    onReady: async () => {
      await pre.done()
      await pre.hide()
    },
  }
}
