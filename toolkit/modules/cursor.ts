/**
 * The custom cursor.
 *
 * Worth being honest about this one: a custom cursor is pure decoration and it is the single
 * easiest way to make a site feel worse. It replaces an OS-level, zero-latency, universally
 * understood affordance with a DOM element that lags. So the rules here are defensive:
 *
 *   - Pointer-capable devices only. `(hover: hover) and (pointer: fine)` — not a width query.
 *     A tablet with a stylus reports fine pointer and no hover; a touch laptop reports both.
 *     Getting this wrong leaves a dead dot stuck in a corner of every phone.
 *   - The native cursor is only hidden where a custom one is drawn, and never over text inputs,
 *     where the caret shape carries real information.
 *   - Two layers, two eases. The dot tracks tightly (0.35) so clicking feels accurate; the ring
 *     trails (0.1) so the motion reads as weight. One layer at one speed is either laggy or
 *     lifeless — the contrast between the two is the entire effect.
 *   - Damped with the kernel's `damp()`, so it behaves identically at 60 and 144Hz. A naive
 *     lerp makes the trail 2.4x tighter on a gaming monitor, which is why so many of these
 *     look great on the developer's machine and sluggish on the client's.
 *
 * States are declarative. Put `data-cursor="view"` on a thumbnail and the cursor root gets
 * `data-cursor-state="view"`; everything else is CSS. No per-element listeners: one delegated
 * pointerover on the document, which also means content added later just works.
 *
 * Required CSS in the project stylesheet (the module does not inject styles):
 *
 *   [data-cursor-active] *                       { cursor: none }
 *   [data-cursor-active] input,
 *   [data-cursor-active] textarea,
 *   [data-cursor-active] [contenteditable]       { cursor: auto }
 */
import { damped, damp, state } from '../kernel/state'
import { addStage, removeStage } from '../kernel/loop'

export interface CursorOptions {
  /** Existing root element. One is created and appended if omitted. */
  el?: HTMLElement
  /** Tracking speed of the inner dot, 0..1 per 1/60s. Higher = tighter. */
  dotEase?: number
  /** Tracking speed of the outer ring. Lower = more trail. */
  ringEase?: number
  /**
   * Let the ring stretch along its direction of travel. Subtle (0.05–0.15) reads as inertia;
   * more looks like a comet and dates badly.
   */
  stretch?: number
  /** Attribute that declares a hover state on a target element. */
  attribute?: string
  /** Also drive `--cursor-x` / `--cursor-y` in px on <html>, for CSS-only effects elsewhere. */
  publish?: boolean
}

export interface Cursor {
  root: HTMLElement
  /** Force a state, e.g. while dragging. Pass null to release back to hover detection. */
  setState(name: string | null): void
  /** Set the label inside the cursor. Empty string clears it. */
  setText(text: string): void
  /** Snap the ring to an element's box — the "cursor becomes the button" move. */
  snapTo(el: HTMLElement | null): void
  hide(): void
  show(): void
  /** False when the device has no fine pointer; every method is then a no-op. */
  readonly enabled: boolean
  dispose(): void
}

const NOOP_CURSOR = (root: HTMLElement): Cursor => ({
  root,
  setState: () => {},
  setText: () => {},
  snapTo: () => {},
  hide: () => {},
  show: () => {},
  enabled: false,
  dispose: () => {},
})

export function createCursor(opts: CursorOptions = {}): Cursor {
  const fine =
    typeof matchMedia !== 'undefined' && matchMedia('(hover: hover) and (pointer: fine)').matches

  const root = opts.el ?? document.createElement('div')
  if (!opts.el) {
    root.className = 'cw-cursor'
    root.setAttribute('aria-hidden', 'true')
    root.innerHTML =
      '<div class="cw-cursor-ring"></div><div class="cw-cursor-dot"></div>' +
      '<span class="cw-cursor-text"></span>'
  }

  // Bail before touching the DOM further. Nothing is appended on touch devices, so there is no
  // element to accidentally become visible via a stray CSS rule.
  if (!fine || state.reducedMotion) return NOOP_CURSOR(root)

  if (!opts.el) document.body.appendChild(root)

  const ring = root.querySelector<HTMLElement>('.cw-cursor-ring') ?? root
  const dot = root.querySelector<HTMLElement>('.cw-cursor-dot') ?? root
  const label = root.querySelector<HTMLElement>('.cw-cursor-text')

  root.style.position = 'fixed'
  root.style.top = '0'
  root.style.left = '0'
  root.style.pointerEvents = 'none'
  root.style.willChange = 'transform'
  document.documentElement.dataset.cursorActive = 'true'

  const attribute = opts.attribute ?? 'data-cursor'
  const stretchAmount = opts.stretch ?? 0.08
  const publish = opts.publish ?? false

  // Raw pointer position in CSS pixels. Not the kernel's normalised -1..1 values: the cursor
  // has to land exactly under the physical pointer, and a normalise/denormalise round trip
  // through a damped value would introduce a half-pixel wobble.
  let px = -100
  let py = -100
  let havePointer = false

  const dx = damped(-100, opts.dotEase ?? 0.35)
  const dy = damped(-100, opts.dotEase ?? 0.35)
  const rx = damped(-100, opts.ringEase ?? 0.1)
  const ry = damped(-100, opts.ringEase ?? 0.1)

  let forcedState: string | null = null
  let hoverState: string | null = null
  let snapped: { x: number; y: number; w: number; h: number } | null = null
  const ringScale = damped(1, 0.18)

  let visible = false
  let lastRingTransform = ''
  let lastDotTransform = ''

  /* ------------------------------------------------------------------ input */

  const onMove = (e: PointerEvent) => {
    px = e.clientX
    py = e.clientY
    if (!havePointer) {
      // First real position: teleport instead of animating in from (-100,-100), which reads
      // as a bug on page load.
      havePointer = true
      dx.current = dx.target = px
      dy.current = dy.target = py
      rx.current = rx.target = px
      ry.current = ry.target = py
      show()
    }
    dx.target = px
    dy.target = py
    rx.target = px
    ry.target = py
  }

  const onLeaveWindow = () => hide()
  const onEnterWindow = () => {
    if (havePointer) show()
  }

  const onDown = () => {
    root.dataset.cursorPressed = 'true'
  }
  const onUp = () => {
    delete root.dataset.cursorPressed
  }

  /* ------------------------------------------------- delegated hover states */

  const applyState = () => {
    const next = forcedState ?? hoverState
    if (next) root.dataset.cursorState = next
    else delete root.dataset.cursorState
  }

  const onOver = (e: PointerEvent) => {
    const target = (e.target as Element | null)?.closest?.(`[${attribute}]`) as HTMLElement | null
    if (!target) return
    hoverState = target.getAttribute(attribute) || 'hover'
    applyState()

    const text = target.dataset.cursorText
    if (label) label.textContent = text ?? ''

    if (target.dataset.cursorSnap !== undefined) snapTo(target)
  }

  const onOut = (e: PointerEvent) => {
    const target = (e.target as Element | null)?.closest?.(`[${attribute}]`) as HTMLElement | null
    if (!target) return
    // relatedTarget still inside the same declaring element means this is an internal
    // boundary crossing, not a real exit — without this check the state flickers on any
    // element that has children.
    const to = e.relatedTarget as Element | null
    if (to && target.contains(to)) return
    hoverState = null
    applyState()
    if (label) label.textContent = ''
    snapTo(null)
  }

  document.addEventListener('pointermove', onMove, { passive: true })
  document.addEventListener('pointerover', onOver, { passive: true })
  document.addEventListener('pointerout', onOut, { passive: true })
  document.addEventListener('pointerdown', onDown, { passive: true })
  document.addEventListener('pointerup', onUp, { passive: true })
  document.documentElement.addEventListener('pointerleave', onLeaveWindow, { passive: true })
  document.documentElement.addEventListener('pointerenter', onEnterWindow, { passive: true })

  /* ------------------------------------------------------------------- loop */

  addStage({
    order: 930,
    name: 'cursor',
    after: ['state'],
    fn: (delta) => {
      if (!havePointer) return

      damp(dx, delta)
      damp(dy, delta)
      damp(rx, delta)
      damp(ry, delta)
      damp(ringScale, delta)

      // The dot is the accurate one, so it is written first and never stretched.
      const dotT = `translate3d(${dx.current.toFixed(2)}px, ${dy.current.toFixed(2)}px, 0) translate(-50%, -50%)`
      if (dotT !== lastDotTransform) {
        lastDotTransform = dotT
        dot.style.transform = dotT
      }

      let ringT: string
      if (snapped) {
        // Snap mode: the ring becomes the element's box. Interpolating position and size
        // separately (rather than tweening width/height, which relayouts) keeps it on the
        // compositor.
        rx.target = snapped.x
        ry.target = snapped.y
        ringT =
          `translate3d(${rx.current.toFixed(2)}px, ${ry.current.toFixed(2)}px, 0) ` +
          `translate(-50%, -50%) scale(${(snapped.w / 40).toFixed(3)}, ${(snapped.h / 40).toFixed(3)})`
      } else {
        // Re-assert the target every frame rather than only on pointermove: leaving a snap
        // state would otherwise strand the ring at the element's centre until the pointer
        // moves again.
        rx.target = px
        ry.target = py
        // Stretch along the direction of travel. The lag between ring and pointer *is* the
        // velocity, so no extra state is needed to compute it.
        const vx = px - rx.current
        const vy = py - ry.current
        const speed = Math.min(1, Math.hypot(vx, vy) / 120)
        const angle = speed > 0.01 ? Math.atan2(vy, vx) : 0
        const sx = 1 + speed * stretchAmount * 2
        const sy = 1 - speed * stretchAmount
        ringT =
          `translate3d(${rx.current.toFixed(2)}px, ${ry.current.toFixed(2)}px, 0) ` +
          `translate(-50%, -50%) rotate(${angle.toFixed(3)}rad) ` +
          `scale(${(sx * ringScale.current).toFixed(3)}, ${(sy * ringScale.current).toFixed(3)})`
      }
      if (ringT !== lastRingTransform) {
        lastRingTransform = ringT
        ring.style.transform = ringT
      }

      if (publish) {
        const html = document.documentElement.style
        html.setProperty('--cursor-x', `${dx.current.toFixed(1)}px`)
        html.setProperty('--cursor-y', `${dy.current.toFixed(1)}px`)
      }
    },
  })

  /* ------------------------------------------------------------------- api */

  function show() {
    if (visible) return
    visible = true
    root.style.opacity = '1'
  }
  function hide() {
    if (!visible) return
    visible = false
    root.style.opacity = '0'
  }
  function snapTo(el: HTMLElement | null) {
    if (!el) {
      snapped = null
      ringScale.target = 1
      return
    }
    const r = el.getBoundingClientRect()
    snapped = { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }
    ringScale.target = 1
  }

  return {
    root,
    enabled: true,
    setState(name) {
      forcedState = name
      applyState()
    },
    setText(text) {
      if (label) label.textContent = text
    },
    snapTo,
    hide,
    show,
    dispose() {
      removeStage('cursor')
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerover', onOver)
      document.removeEventListener('pointerout', onOut)
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('pointerup', onUp)
      document.documentElement.removeEventListener('pointerleave', onLeaveWindow)
      document.documentElement.removeEventListener('pointerenter', onEnterWindow)
      delete document.documentElement.dataset.cursorActive
      if (!opts.el) root.remove()
    },
  }
}

/* ------------------------------------------------------------------ magnetic */

/**
 * Elements that lean toward the pointer.
 *
 * The effect only works if it is small. 0.2 strength over a 120px radius is enough to feel
 * alive; anything stronger turns a button into a fish and makes it genuinely harder to click,
 * because the target moves away from where the user aimed. The element's *hit area* moves with
 * it, so the offset must stay well inside its own bounds.
 *
 * One delegated pointermove and one loop stage for any number of elements. Rects are cached and
 * only re-read on reflow, because reading them per frame per element is exactly the kind of
 * layout thrash that makes a page feel heavy for no visible reason.
 */
export function initMagnetic(
  selector = '[data-magnetic]',
  opts: { strength?: number; radius?: number; ease?: number } = {},
): () => void {
  const strength = opts.strength ?? 0.22
  const radius = opts.radius ?? 140
  const fine =
    typeof matchMedia !== 'undefined' && matchMedia('(hover: hover) and (pointer: fine)').matches
  if (!fine || state.reducedMotion) return () => {}

  interface Magnet {
    el: HTMLElement
    x: ReturnType<typeof damped>
    y: ReturnType<typeof damped>
    /** Centre in DOCUMENT space — scroll-independent, so it survives scrolling uncached. */
    docX: number
    docY: number
    strength: number
  }

  const magnets: Magnet[] = [...document.querySelectorAll<HTMLElement>(selector)].map((el) => ({
    el,
    x: damped(0, opts.ease ?? 0.14),
    y: damped(0, opts.ease ?? 0.14),
    docX: 0,
    docY: 0,
    strength: Number(el.dataset.magnetic) || strength,
  }))
  if (!magnets.length) return () => {}

  const measure = () => {
    for (const m of magnets) {
      // The element's own transform must not pollute the measurement, or the cached centre
      // drifts a little further every reflow while the pointer happens to be near it.
      m.el.style.transform = ''
      const r = m.el.getBoundingClientRect()
      m.docX = r.left + window.scrollX + r.width / 2
      m.docY = r.top + window.scrollY + r.height / 2
    }
  }
  measure()

  let lastReflow = state.pageReflow
  let pointerX = -9999
  let pointerY = -9999

  const onMove = (e: PointerEvent) => {
    pointerX = e.clientX
    pointerY = e.clientY
  }
  document.addEventListener('pointermove', onMove, { passive: true })

  addStage({
    order: 935,
    name: 'magnetic',
    after: ['state'],
    fn: (delta) => {
      if (state.pageReflow !== lastReflow) {
        lastReflow = state.pageReflow
        measure()
      }

      for (const m of magnets) {
        // Document space -> viewport space using the scroll value the kernel already has.
        // No getBoundingClientRect in the loop; that is the whole point of caching.
        const cx = m.docX - window.scrollX
        const cy = m.docY - state.scroll.value
        const dist = Math.hypot(pointerX - cx, pointerY - cy)

        if (dist < radius) {
          // Falloff, so the pull grows as the pointer closes in rather than snapping on at
          // the radius boundary.
          const fall = 1 - dist / radius
          m.x.target = (pointerX - cx) * m.strength * fall
          m.y.target = (pointerY - cy) * m.strength * fall
        } else {
          m.x.target = 0
          m.y.target = 0
        }

        damp(m.x, delta)
        damp(m.y, delta)

        if (Math.abs(m.x.current) < 0.05 && Math.abs(m.y.current) < 0.05) {
          if (m.el.style.transform) m.el.style.transform = ''
          continue
        }
        m.el.style.transform = `translate3d(${m.x.current.toFixed(2)}px, ${m.y.current.toFixed(2)}px, 0)`
      }
    },
  })

  return () => {
    removeStage('magnetic')
    document.removeEventListener('pointermove', onMove)
    for (const m of magnets) m.el.style.transform = ''
  }
}
