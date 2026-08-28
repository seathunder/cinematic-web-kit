/**
 * Picking: hover and click on 3D objects.
 *
 * Raycasting is the one part of an interactive scene where the naive implementation is not just
 * slower but *quadratically* slower, and the cost is invisible until the client's laptop.
 *
 * `raycaster.intersectObjects(scene.children, true)` walks every mesh, and for each one whose
 * bounding sphere is hit it tests **every triangle**. A 120k-triangle character does 120,000
 * ray/triangle intersections. Do that on every pointermove — which fires up to 120 times a
 * second on a high-polling mouse — and you have spent the entire frame budget deciding whether
 * the cursor is over something.
 *
 * Four rules, all enforced by this module:
 *
 *   1. **Only registered objects.** Never the whole scene. A scene has hundreds of meshes and
 *      three of them are interactive.
 *   2. **Only when something changed.** The pointer moving is the only thing that can change the
 *      hit result for a static object, so one raycast per pointer-move-frame, not per frame. For
 *      objects that move on their own, opt in with `always`.
 *   3. **Test a proxy, not the art.** An invisible low-poly box or sphere sized to the model is
 *      12 triangles instead of 120,000, and users cannot tell the difference on a hover target.
 *      This is the single biggest win available and it costs one line.
 *   4. **World matrices must be current.** `Object3D.raycast` reads `matrixWorld`, which three
 *      only refreshes inside `renderer.render()`. A picker that runs before the render stage is
 *      testing against *last frame's* transforms — which looks like "the hitbox lags behind the
 *      model" and is maddening to debug. This module updates the registered objects' matrices
 *      itself, which is cheap because the list is short.
 *
 * When a scene genuinely needs per-triangle accuracy on heavy geometry, the answer is a BVH
 * (`three-mesh-bvh`, MIT), not a faster loop. It is not a dependency here because a proxy mesh
 * solves 95% of cases for free.
 */
import * as THREE from 'three'
import { state } from '../kernel/state'
import { addStage, removeStage } from '../kernel/loop'

export interface PickHandlers {
  /** Pointer entered this object. */
  onEnter?: (hit: THREE.Intersection) => void
  /** Pointer left it. No hit is passed — there is nothing to report. */
  onLeave?: () => void
  /** Every frame the pointer is over it and has moved. Use for a follow-the-cursor highlight. */
  onMove?: (hit: THREE.Intersection) => void
  /** Click or tap. Fires only if the pointer did not travel far between down and up. */
  onClick?: (hit: THREE.Intersection) => void
  /**
   * Test this instead of the object. An invisible box/sphere sized to the model. The object
   * passed to handlers is still the real one, so nothing downstream needs to know.
   */
  proxy?: THREE.Object3D
  /** Object moves independently of the pointer, so re-test every frame. Costs a raycast/frame. */
  always?: boolean
  /** Cursor state to publish while hovered — pairs with the cursor module's data-cursor-state. */
  cursor?: string
  /** Priority when two registered objects overlap. Higher wins regardless of distance. */
  priority?: number
}

export interface Picker {
  /** Register an object. Returns an unregister function. */
  add(object: THREE.Object3D, handlers: PickHandlers): () => void
  /** Currently hovered object, or null. */
  readonly hovered: THREE.Object3D | null
  /** Last intersection, for scenes that want the uv or point without registering a handler. */
  readonly hit: THREE.Intersection | null
  /** Turn picking off during transitions and cutscenes. Leaving it on lets users click a fade. */
  setEnabled(on: boolean): void
  dispose(): void
}

interface Entry {
  object: THREE.Object3D
  test: THREE.Object3D
  handlers: PickHandlers
  priority: number
}

export interface PickerOptions {
  /** DOM element the pointer coordinates are relative to. Defaults to the whole window. */
  el?: HTMLElement
  /** Restrict to a render layer. Use when several scenes share the world. */
  layer?: number
  /** Max raycasts per second. 30 is imperceptible and halves the cost versus 60. */
  hz?: number
  /** Threshold in world units for THREE.Points. Default 0.1; points are otherwise unhittable. */
  pointsThreshold?: number
}

export function createPicker(camera: THREE.Camera, opts: PickerOptions = {}): Picker {
  const entries: Entry[] = []
  const raycaster = new THREE.Raycaster()
  if (opts.layer !== undefined) raycaster.layers.set(opts.layer)
  // A ray has zero width, so it passes between points and lines unless given a radius. This
  // default is a world-space distance and will need tuning per scene scale.
  raycaster.params.Points.threshold = opts.pointsThreshold ?? 0.1
  raycaster.params.Line.threshold = opts.pointsThreshold ?? 0.1

  const ndc = new THREE.Vector2()
  const interval = 1 / (opts.hz ?? 30)

  let enabled = true
  let dirty = true
  let accumulated = 0
  let hovered: THREE.Object3D | null = null
  let lastHit: THREE.Intersection | null = null

  // Down position, to distinguish a click from the end of a drag. 8px is the threshold every
  // native UI uses; below it a human intended a click even if their hand moved.
  let downX = 0
  let downY = 0
  let downOn: Entry | null = null

  const el = opts.el ?? null

  const toNdc = (clientX: number, clientY: number) => {
    if (el) {
      // Element-relative, for a scene rendered into a scissored rect. getBoundingClientRect
      // here is fine: it runs on pointer events, not in the loop.
      const r = el.getBoundingClientRect()
      ndc.x = ((clientX - r.left) / r.width) * 2 - 1
      ndc.y = -((clientY - r.top) / r.height) * 2 + 1
    } else {
      ndc.x = (clientX / state.viewport.width) * 2 - 1
      ndc.y = -(clientY / state.viewport.height) * 2 + 1
    }
  }

  const onMove = (e: PointerEvent) => {
    toNdc(e.clientX, e.clientY)
    dirty = true
  }

  const onDown = (e: PointerEvent) => {
    // Touch fires no move before down, so the coordinates must be taken here too or the first
    // tap on a phone hits whatever was under the previous one.
    toNdc(e.clientX, e.clientY)
    downX = e.clientX
    downY = e.clientY
    dirty = true
    // Resolve immediately: on touch there is no hover state to have already resolved it.
    cast()
    downOn = currentEntry
  }

  const onUp = (e: PointerEvent) => {
    if (!downOn) return
    const moved = Math.hypot(e.clientX - downX, e.clientY - downY)
    if (moved < 8 && lastHit && currentEntry === downOn) {
      downOn.handlers.onClick?.(lastHit)
    }
    downOn = null
  }

  const onCancel = () => {
    downOn = null
  }

  window.addEventListener('pointermove', onMove, { passive: true })
  window.addEventListener('pointerdown', onDown, { passive: true })
  window.addEventListener('pointerup', onUp, { passive: true })
  window.addEventListener('pointercancel', onCancel, { passive: true })

  /* ------------------------------------------------------------------- casting */

  let currentEntry: Entry | null = null
  const testObjects: THREE.Object3D[] = []

  const cast = () => {
    if (!entries.length) {
      leave()
      return
    }

    // Refresh only the registered objects' world matrices. `updateWorldMatrix(true, false)`
    // walks up to the root so a parent's animation is included, and does not descend — the
    // children that matter for a hit test are refreshed by Object3D.raycast itself.
    testObjects.length = 0
    for (const e of entries) {
      e.test.updateWorldMatrix(true, false)
      testObjects.push(e.test)
    }

    raycaster.setFromCamera(ndc, camera)
    const hits = raycaster.intersectObjects(testObjects, true)

    if (!hits.length) {
      leave()
      return
    }

    // Nearest hit, unless something with a higher priority was also hit. Priority exists for
    // the case where a small control sits in front of a large backdrop that is also pickable.
    let best = hits[0]
    let bestEntry = entryFor(best.object)
    for (let i = 1; i < hits.length; i++) {
      const e = entryFor(hits[i].object)
      if (e && bestEntry && e.priority > bestEntry.priority) {
        best = hits[i]
        bestEntry = e
      }
    }
    if (!bestEntry) {
      leave()
      return
    }

    lastHit = best
    if (bestEntry !== currentEntry) {
      currentEntry?.handlers.onLeave?.()
      currentEntry = bestEntry
      hovered = bestEntry.object
      bestEntry.handlers.onEnter?.(best)
      if (bestEntry.handlers.cursor) {
        document.documentElement.dataset.cursorState = bestEntry.handlers.cursor
      }
    } else {
      bestEntry.handlers.onMove?.(best)
    }
  }

  const leave = () => {
    if (!currentEntry) return
    currentEntry.handlers.onLeave?.()
    if (currentEntry.handlers.cursor) delete document.documentElement.dataset.cursorState
    currentEntry = null
    hovered = null
    lastHit = null
  }

  /** Walk up from a hit mesh to the registered ancestor, since hits land on leaf geometry. */
  const entryFor = (object: THREE.Object3D): Entry | null => {
    for (let o: THREE.Object3D | null = object; o; o = o.parent) {
      for (const e of entries) if (e.test === o || e.object === o) return e
    }
    return null
  }

  addStage({
    order: 970,
    name: 'picker',
    after: ['scenes'],
    fn: (delta) => {
      if (!enabled) return
      accumulated += delta
      if (accumulated < interval) return
      accumulated = 0

      const needsCast = dirty || entries.some((e) => e.handlers.always)
      if (!needsCast) return
      dirty = false
      cast()
    },
  })

  return {
    add(object, handlers) {
      const entry: Entry = {
        object,
        test: handlers.proxy ?? object,
        handlers,
        priority: handlers.priority ?? 0,
      }
      if (handlers.proxy) {
        // The proxy must be in the scene graph to have a world matrix, but must not be drawn.
        handlers.proxy.visible = false
        if (!handlers.proxy.parent) object.add(handlers.proxy)
      }
      entries.push(entry)
      dirty = true
      return () => {
        const i = entries.indexOf(entry)
        if (i !== -1) entries.splice(i, 1)
        if (currentEntry === entry) leave()
      }
    },
    get hovered() {
      return hovered
    },
    get hit() {
      return lastHit
    },
    setEnabled(on) {
      enabled = on
      if (!on) leave()
    },
    dispose() {
      removeStage('picker')
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      entries.length = 0
      leave()
    },
  }
}

/* --------------------------------------------------------------- plane probe */

/**
 * Where the pointer is on an infinite mathematical plane.
 *
 * No geometry, no traversal, no triangles — one ray/plane intersection, which is about a dozen
 * floating-point operations. This is what you want for:
 *
 *   - a ripple, footprint or light that follows the pointer across the ground
 *   - dragging an object along a surface
 *   - feeding a shader the pointer's position in *world* space rather than screen space
 *
 * People reach for a giant invisible plane mesh and a raycast for this. That works and it is
 * hundreds of times more expensive. Note that `visible = false` does **not** stop a mesh being
 * raycast — a common source of mystery hits — so the invisible-plane approach also needs care
 * this one does not.
 *
 * Returns null when the plane is behind the camera or the ray is parallel to it.
 */
export function createPlaneProbe(
  camera: THREE.Camera,
  plane: THREE.Plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
): {
  /** Pointer position on the plane, using the kernel's raw pointer. Null if it misses. */
  read(out?: THREE.Vector3): THREE.Vector3 | null
  /** Same, from explicit NDC coordinates (-1..1). */
  at(x: number, y: number, out?: THREE.Vector3): THREE.Vector3 | null
  plane: THREE.Plane
} {
  const raycaster = new THREE.Raycaster()
  const v2 = new THREE.Vector2()
  const scratch = new THREE.Vector3()

  const at = (x: number, y: number, out = scratch) => {
    v2.set(x, y)
    raycaster.setFromCamera(v2, camera)
    return raycaster.ray.intersectPlane(plane, out)
  }

  return {
    at,
    read(out) {
      // .target, not .current: hit testing must use the pointer's true position. The damped
      // value trails by up to ~100ms, so a probe reading .current puts the ripple behind the
      // cursor — which reads as lag in the whole site, not just in the ripple.
      return at(state.pointerX.target, state.pointerY.target, out)
    },
    plane,
  }
}

/* ------------------------------------------------------------- screen <-> world */

const _ndc = new THREE.Vector3()

/**
 * Project a world point to CSS pixels. The maths behind `createAnchors`, exposed for one-offs.
 * Returns z in NDC: outside -1..1 means the point is not in front of the camera.
 */
export function worldToScreen(
  point: THREE.Vector3,
  camera: THREE.Camera,
  out = { x: 0, y: 0, z: 0, visible: false },
): { x: number; y: number; z: number; visible: boolean } {
  _ndc.copy(point).project(camera)
  out.x = (_ndc.x * 0.5 + 0.5) * state.viewport.width
  out.y = (-_ndc.y * 0.5 + 0.5) * state.viewport.height
  out.z = _ndc.z
  out.visible = _ndc.z > -1 && _ndc.z < 1
  return out
}

/**
 * Unproject a screen position to a world point at a given distance from the camera.
 *
 * Distance, not "z", because there is no single world z for a screen coordinate — a screen
 * position is a ray, and you have to say how far along it you mean. Getting this wrong is why
 * unprojected objects sometimes appear to drift when the camera moves.
 */
export function screenToWorld(
  clientX: number,
  clientY: number,
  distance: number,
  camera: THREE.Camera,
  out = new THREE.Vector3(),
): THREE.Vector3 {
  const raycaster = new THREE.Raycaster()
  const v = new THREE.Vector2(
    (clientX / state.viewport.width) * 2 - 1,
    -(clientY / state.viewport.height) * 2 + 1,
  )
  raycaster.setFromCamera(v, camera)
  return out.copy(raycaster.ray.origin).addScaledVector(raycaster.ray.direction, distance)
}

/**
 * How wide the camera's view is, in world units, at a given distance.
 *
 * The function that makes "fit this plane exactly to the viewport" a one-liner instead of a
 * fiddle — used by every full-screen video/shader scene, and by anything that must line up with
 * a DOM element.
 */
export function visibleSizeAt(
  distance: number,
  camera: THREE.PerspectiveCamera,
): { width: number; height: number } {
  const height = 2 * Math.tan((camera.fov * Math.PI) / 360) * distance
  return { width: height * camera.aspect, height }
}
