/**
 * Viewport + layout measurement.
 *
 * THE RULE: never call getBoundingClientRect() inside the render loop. Reading layout after
 * the browser has queued style changes forces a synchronous reflow, which is the single most
 * common cause of "it's smooth on my machine but janky on the client's laptop".
 *
 * Instead: measure once, cache, and bump state.pageReflow when the measurement is stale.
 * Anything holding a cached rect compares its own copy of pageReflow and re-measures.
 */
import { state } from './state'
import { addStage } from './loop'

type ReflowListener = () => void
const reflowListeners = new Set<ReflowListener>()
let reflowQueued = false

/** Ask for a re-measure. Coalesced to one per frame — call it as often as you like. */
export function requestReflow(): void {
  reflowQueued = true
}

export function onReflow(fn: ReflowListener): () => void {
  reflowListeners.add(fn)
  return () => reflowListeners.delete(fn)
}

function breakpointFor(w: number): 'mobile' | 'tablet' | 'desktop' {
  if (w < 768) return 'mobile'
  if (w < 1024) return 'tablet'
  return 'desktop'
}

/** Cap DPR. A 3x phone rendering a full-screen shader at native res will thermal-throttle. */
function dprFor(): number {
  const raw = window.devicePixelRatio || 1
  const cap = state.quality === 'low' ? 1 : state.quality === 'medium' ? 1.5 : 2
  return Math.min(raw, cap)
}

export function measureViewport(): void {
  const v = state.viewport
  const w = window.innerWidth
  // innerHeight, not 100vh: mobile browser chrome makes 100vh taller than the visible area.
  const h = window.innerHeight
  const changedBreakpoint = v.breakpoint !== breakpointFor(w)
  v.width = w
  v.height = h
  v.dpr = dprFor()
  v.aspect = w / h
  v.portrait = h > w
  v.breakpoint = breakpointFor(w)
  v.touch = matchMedia('(hover: none)').matches || navigator.maxTouchPoints > 0
  if (changedBreakpoint) requestReflow()
}

/**
 * Measure an element once. Returns document-space coordinates (scroll-independent) so the
 * value stays correct as the user scrolls — a viewport-relative rect would not.
 */
export function measure(el: HTMLElement): { top: number; height: number } {
  const r = el.getBoundingClientRect()
  return { top: r.top + window.scrollY, height: r.height }
}

let ro: ResizeObserver | null = null

export function initViewport(): () => void {
  measureViewport()

  const onResize = () => {
    measureViewport()
    requestReflow()
  }

  // Mobile address-bar show/hide fires resize constantly. Only react to width changes there,
  // plus orientation. Desktop reacts to both axes.
  let lastW = window.innerWidth
  const onResizeGuarded = () => {
    const w = window.innerWidth
    if (state.viewport.touch && w === lastW) {
      // Height-only change on touch = browser chrome. Update the numbers, skip the reflow.
      measureViewport()
      return
    }
    lastW = w
    onResize()
  }

  window.addEventListener('resize', onResizeGuarded, { passive: true })
  window.addEventListener('orientationchange', onResize, { passive: true })

  // Catches layout changes that don't resize the window: fonts loading, images settling,
  // accordions opening, CMS content arriving.
  ro = new ResizeObserver(() => requestReflow())
  ro.observe(document.body)

  if (document.fonts?.ready) document.fonts.ready.then(() => requestReflow())

  addStage({
    order: 30,
    name: 'viewport',
    after: ['state'],
    fn: () => {
      if (!reflowQueued) return
      reflowQueued = false
      state.pageReflow++
      for (const fn of reflowListeners) fn()
    },
  })

  return () => {
    window.removeEventListener('resize', onResizeGuarded)
    window.removeEventListener('orientationchange', onResize)
    ro?.disconnect()
    ro = null
    reflowListeners.clear()
  }
}
