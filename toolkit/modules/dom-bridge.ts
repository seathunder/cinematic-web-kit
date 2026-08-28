/**
 * The DOM bridge.
 *
 * The 3D world and the HTML have to agree on things — a nav that inverts over a dark scene, a
 * caption pinned to a point on a model, a progress bar. There are two wrong ways to do this and
 * one right one.
 *
 * Wrong 1: React state / a store. Sixty setState calls a second re-render the tree sixty times
 * a second. This is the single biggest reason WebGL sites built on component frameworks feel
 * heavy — the GPU is fine, the reconciler is not.
 *
 * Wrong 2: writing element styles directly from the loop for every element. Each write is a
 * style invalidation; a hundred of them is a hundred.
 *
 * Right: publish a handful of CSS custom properties on <html> once per frame and let CSS do the
 * rest. `--page-progress` costs one property write; any number of elements can read it in
 * `transform: translateY(calc(var(--page-progress) * -100px))` with no JS involvement at all,
 * and it animates on the compositor.
 *
 * The guard that makes it cheap: only write when the rounded value actually changed. Scroll
 * stops, writes stop, style invalidation stops.
 */
import * as THREE from 'three'
import { state } from '../kernel/state'
import { addStage } from '../kernel/loop'
import { ACTIVE_THRESHOLD } from '../kernel/weights'
import type { SceneInstance } from '../kernel/types'

export interface BridgeOptions {
  /** Publish `--scene-weight-<id>` per scene. Off by default: N more writes per frame. */
  sceneWeights?: boolean
  /** Decimal places. 3 is invisible to the eye and cuts writes by ~10x versus raw floats. */
  precision?: number
  /** Element to write the properties on. Defaults to <html>. */
  root?: HTMLElement
}

/**
 * Published every frame (when changed):
 *
 *   --page-progress     0..1   whole-page scroll, damped
 *   --scroll-velocity   -4..4  signed, viewport-heights per second, damped
 *   --scroll-speed      0..1   absolute velocity, normalised and clamped — the useful one
 *   --pointer-x         -1..1
 *   --pointer-y         -1..1
 *   --vh                px     the real visible viewport height, for mobile
 *
 * And as attributes on <html>:
 *   data-scroll-direction  "up" | "down"
 *   data-scrolling         "true" while moving (add transitions off this, not off a JS class)
 *   data-quality           "low" | "medium" | "high"
 *   data-active-scene      set by the kernel's scene-attr stage
 */
export function initDomBridge(
  instances: SceneInstance[] = [],
  opts: BridgeOptions = {},
): () => void {
  const root = opts.root ?? document.documentElement
  const p = opts.precision ?? 3
  const q = (v: number) => v.toFixed(p)

  // Previous written values, so we can skip no-op writes.
  const prev: Record<string, string> = {}
  const write = (name: string, value: string) => {
    if (prev[name] === value) return
    prev[name] = value
    root.style.setProperty(name, value)
  }

  let lastDir = ''
  let lastScrolling = ''
  let lastVh = 0

  addStage({
    order: 900,
    name: 'dom-bridge',
    after: ['scenes'],
    fn: () => {
      write('--page-progress', q(state.progress.current))
      write('--scroll-velocity', q(state.velocity.current))
      write('--scroll-speed', q(Math.min(1, Math.abs(state.velocity.current) / 2)))
      write('--pointer-x', q(state.pointerX.current))
      write('--pointer-y', q(state.pointerY.current))

      // 100vh on mobile includes the browser chrome, so a full-height hero is always taller
      // than the screen and the CTA sits below the fold. This is the fix, and it is why every
      // template's CSS uses `height: calc(var(--vh) * 100)` and not `100vh`.
      if (state.viewport.height !== lastVh) {
        lastVh = state.viewport.height
        write('--vh', `${(lastVh / 100).toFixed(4)}px`)
      }

      const dir = state.direction > 0 ? 'down' : 'up'
      if (dir !== lastDir) {
        lastDir = dir
        root.dataset.scrollDirection = dir
      }

      const scrolling = Math.abs(state.velocity.current) > 0.02 ? 'true' : 'false'
      if (scrolling !== lastScrolling) {
        lastScrolling = scrolling
        root.dataset.scrolling = scrolling
      }

      if (opts.sceneWeights) {
        for (let i = 0; i < instances.length; i++) {
          const inst = instances[i]
          write(`--scene-weight-${inst.def.id}`, q(inst.weight))
        }
      }
    },
  })

  return () => {
    for (const name of Object.keys(prev)) root.style.removeProperty(name)
    delete root.dataset.scrollDirection
    delete root.dataset.scrolling
  }
}

/* --------------------------------------------------------------- 3D anchors */

interface Anchor {
  el: HTMLElement
  /** Either a fixed world point or an object to follow. */
  point: THREE.Vector3
  object: THREE.Object3D | null
  offset: THREE.Vector3
  /** Hide when the point is behind the camera or outside the frustum. */
  cull: boolean
  /** Scale the element with distance, like a real label in the world. */
  scaleWithDepth: boolean
  baseScale: number
  visible: boolean
  lastX: number
  lastY: number
}

const _v = new THREE.Vector3()

/**
 * HTML elements that track points in the 3D scene.
 *
 * This is how you get real text — selectable, accessible, indexable, kerned by the browser —
 * sitting on a 3D object. The alternative (text baked into a texture or drawn with troika) is
 * invisible to search engines and to screen readers, which for a portfolio or a client's
 * product page is a real cost, not a theoretical one.
 *
 * Written with translate3d so the compositor handles it. `left`/`top` would relayout.
 */
export function createAnchors(camera: THREE.Camera): {
  add: (
    el: HTMLElement,
    target: THREE.Object3D | [number, number, number],
    opts?: { offset?: [number, number, number]; cull?: boolean; scaleWithDepth?: boolean },
  ) => () => void
  clear: () => void
  dispose: () => void
} {
  const anchors: Anchor[] = []

  addStage({
    order: 910,
    name: 'anchors',
    after: ['camera'],
    fn: () => {
      if (anchors.length === 0) return
      const { width, height } = state.viewport

      for (let i = 0; i < anchors.length; i++) {
        const a = anchors[i]

        if (a.object) a.object.getWorldPosition(_v)
        else _v.copy(a.point)
        _v.add(a.offset)

        // Distance before projection — project() destroys it.
        const depth = a.scaleWithDepth ? camera.position.distanceTo(_v) : 0

        _v.project(camera)

        // z outside -1..1 after projection means behind the near plane or past the far one.
        const onScreen = _v.z > -1 && _v.z < 1 && Math.abs(_v.x) < 1.6 && Math.abs(_v.y) < 1.6
        if (a.cull && !onScreen) {
          if (a.visible) {
            a.visible = false
            a.el.style.visibility = 'hidden'
          }
          continue
        }
        if (!a.visible) {
          a.visible = true
          a.el.style.visibility = ''
        }

        const x = (_v.x * 0.5 + 0.5) * width
        const y = (-_v.y * 0.5 + 0.5) * height

        // Sub-pixel changes are invisible but still cost a style write.
        if (Math.abs(x - a.lastX) < 0.25 && Math.abs(y - a.lastY) < 0.25) continue
        a.lastX = x
        a.lastY = y

        const scale = a.scaleWithDepth ? a.baseScale * (10 / Math.max(depth, 0.001)) : a.baseScale
        a.el.style.transform =
          `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%)` +
          (a.scaleWithDepth ? ` scale(${scale.toFixed(3)})` : '')
      }
    },
  })

  return {
    add(el, target, o = {}) {
      // position: fixed + top/left 0, then everything is done in the transform.
      el.style.position = 'fixed'
      el.style.top = '0'
      el.style.left = '0'
      el.style.willChange = 'transform'

      const anchor: Anchor = {
        el,
        point: Array.isArray(target) ? new THREE.Vector3(...target) : new THREE.Vector3(),
        object: Array.isArray(target) ? null : target,
        offset: new THREE.Vector3(...(o.offset ?? [0, 0, 0])),
        cull: o.cull ?? true,
        scaleWithDepth: o.scaleWithDepth ?? false,
        baseScale: 1,
        visible: true,
        lastX: -9999,
        lastY: -9999,
      }
      anchors.push(anchor)
      return () => {
        const i = anchors.indexOf(anchor)
        if (i !== -1) anchors.splice(i, 1)
      }
    },
    clear() {
      anchors.length = 0
    },
    dispose() {
      anchors.length = 0
    },
  }
}

/* ------------------------------------------------------------ scroll reveal */

/**
 * Reveal-on-enter, without an IntersectionObserver per element and without ScrollTrigger.
 *
 * It reads the scene weights the kernel already computes, so a reveal is free: the numbers
 * exist whether or not anything is watching them. Elements inside a section get
 * `data-revealed="true"` as that section's weight crosses the threshold, and CSS does the
 * animation. Staggering is a `--i` index published on each child.
 *
 * Reduced motion: the attribute is set immediately for everything, so the content is simply
 * present. The CSS should have no transition under `prefers-reduced-motion`.
 */
export function initReveal(
  instances: SceneInstance[],
  opts: { selector?: string; stagger?: boolean } = {},
): () => void {
  const selector = opts.selector ?? '[data-reveal]'
  const groups = new Map<SceneInstance, HTMLElement[]>()

  for (const inst of instances) {
    if (!inst.section) continue
    const els = [...inst.section.querySelectorAll<HTMLElement>(selector)]
    if (els.length === 0) continue
    if (opts.stagger !== false) {
      els.forEach((el, i) => el.style.setProperty('--i', String(i)))
    }
    groups.set(inst, els)
  }

  if (state.reducedMotion) {
    for (const els of groups.values()) for (const el of els) el.dataset.revealed = 'true'
    return () => {}
  }

  const done = new Set<HTMLElement>()

  addStage({
    order: 920,
    name: 'reveal',
    after: ['scenes'],
    fn: () => {
      for (const [inst, els] of groups) {
        // 0.05, not ACTIVE_THRESHOLD: a scene technically activates a full viewport before it
        // is visible, and revealing then means the animation is over before you see it.
        if (inst.weight <= Math.max(0.05, ACTIVE_THRESHOLD)) continue
        for (const el of els) {
          if (done.has(el)) continue
          done.add(el)
          el.dataset.revealed = 'true'
        }
      }
    },
  })

  return () => {
    groups.clear()
    done.clear()
  }
}
