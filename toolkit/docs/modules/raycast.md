# `modules/raycast.ts`

## Purpose

Hover and click on 3D objects, done at a cost you can afford — plus the small maths helpers that
everything else needs: `createPlaneProbe`, `worldToScreen`, `screenToWorld`, `visibleSizeAt`.

Raycasting is the one part of an interactive scene where the naive implementation is not just slower but
*quadratically* slower, and the cost is invisible until the client's laptop.

## When to use it

- A pickable object in a 3D scene: a katana you can inspect, a portal you can click, a project thumbnail
  on a plane.
- A pointer-following effect on a ground plane — use `createPlaneProbe`, not the picker.
- Lining a DOM element up with a 3D point — `worldToScreen` (or `createAnchors`, which wraps it).
- Fitting a plane exactly to the viewport — `visibleSizeAt`.

## When NOT to use it

- **Not `raycaster.intersectObjects(scene.children, true)`.** Ever. That walks every mesh and, for each
  one whose bounding sphere is hit, tests **every triangle**. A 120k-triangle character does **120,000
  ray/triangle intersections**. Run that on every `pointermove` — which fires up to 120 times a second on
  a high-polling mouse — and you have spent the entire frame budget deciding whether the cursor is over
  something.
- **Not for a pointer-follow on a surface.** A giant invisible plane mesh + a raycast works and is
  *hundreds of times* more expensive than `createPlaneProbe`'s single ray/plane intersection.
- **Not for per-triangle accuracy on heavy geometry.** The answer there is a BVH
  ([`three-mesh-bvh`](https://github.com/gkjohnson/three-mesh-bvh), MIT), not a faster loop. It is not a
  dependency here because a proxy mesh solves 95 % of cases for free.
- **Not for DOM-overlay text.** That is [`createAnchors`](dom-bridge.md).

## Signature

```ts
export interface PickHandlers {
  onEnter?: (hit: THREE.Intersection) => void
  onLeave?: () => void                          // no hit passed — there is nothing to report
  onMove?: (hit: THREE.Intersection) => void    // while hovered and the pointer moved
  onClick?: (hit: THREE.Intersection) => void   // only if the pointer travelled < 8px between down and up
  proxy?: THREE.Object3D                        // test this instead; handlers still get the real object
  always?: boolean                              // object moves on its own — re-test every tick
  cursor?: string                               // publishes data-cursor-state on <html> while hovered
  priority?: number                             // higher wins over nearer
}

export interface Picker {
  add(object: THREE.Object3D, handlers: PickHandlers): () => void   // returns an unregister fn
  readonly hovered: THREE.Object3D | null
  readonly hit: THREE.Intersection | null
  setEnabled(on: boolean): void
  dispose(): void
}

export interface PickerOptions {
  el?: HTMLElement          // pointer coords relative to this element; default the window
  layer?: number            // restrict to a render layer
  hz?: number               // max raycasts/second, default 30
  pointsThreshold?: number  // world-space radius for Points/Line hits, default 0.1
}

export function createPicker(camera: THREE.Camera, opts?: PickerOptions): Picker

export function createPlaneProbe(
  camera: THREE.Camera,
  plane?: THREE.Plane,      // default: y-up through the origin
): {
  read(out?: THREE.Vector3): THREE.Vector3 | null   // from the kernel's raw pointer
  at(x: number, y: number, out?: THREE.Vector3): THREE.Vector3 | null   // from NDC (-1..1)
  plane: THREE.Plane
}

export function worldToScreen(
  point: THREE.Vector3, camera: THREE.Camera,
  out?: { x: number; y: number; z: number; visible: boolean },
): { x: number; y: number; z: number; visible: boolean }

export function screenToWorld(
  clientX: number, clientY: number, distance: number,
  camera: THREE.Camera, out?: THREE.Vector3,
): THREE.Vector3

export function visibleSizeAt(
  distance: number, camera: THREE.PerspectiveCamera,
): { width: number; height: number }
```

## Inputs

### The four rules, all enforced by this module

1. **Only registered objects.** Never the whole scene. A scene has hundreds of meshes and three of them
   are interactive.
2. **Only when something changed.** The pointer moving is the only thing that can change the hit result
   for a static object, so it casts once per pointer-move-tick, not per frame. Objects that move on their
   own opt in with `always`.
3. **Test a proxy, not the art.** An invisible low-poly box or sphere sized to the model is **12
   triangles instead of 120,000**, and users cannot tell the difference on a hover target. **This is the
   single biggest win available and it costs one line.**
4. **World matrices must be current.** See the gotchas — this is the subtle one.

### `hz`

Default **30**. Imperceptible to a human and half the cost of 60. A `pointermove` burst at 120 Hz still
produces at most 30 casts per second, because the handler only sets a `dirty` flag and the loop stage does
the work.

### `proxy`

```ts
const box = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.4, 1.2))  // 12 triangles
picker.add(character, { proxy: box, onClick: () => open('bio') })
```

The module sets `proxy.visible = false` and parents it to the object if it has no parent — a proxy must be
in the scene graph to have a world matrix, but must not be drawn. Handlers still receive the **real**
object, so nothing downstream needs to know a proxy exists.

### `priority`

Higher wins regardless of distance. This exists for the case where a small control sits in front of a
large pickable backdrop — without it, the nearest hit is whichever the ray happens to reach first, which
is not always what the design means.

### `pointsThreshold`

Default **0.1** world units, applied to both `Points` and `Line`. A ray has zero width, so it passes
between points and lines entirely — they are otherwise unhittable. This is a world-space distance and
needs tuning to your scene scale.

## Outputs

**Stage 970 `picker`** (`after: ['scenes']`) accumulates delta, throttles to `hz`, and casts only if
`dirty` or some entry has `always`.

`add()` returns an unregister function; calling it also fires `onLeave` if that entry was hovered.

`hovered` is the currently hovered **registered** object (not the leaf mesh that was hit). `hit` is the
last `THREE.Intersection`, so a scene can read `hit.uv` or `hit.point` without registering a handler at
all — useful for feeding a shader.

`setEnabled(false)` turns picking off and fires `onLeave`. **Do this during transitions and cutscenes** —
leaving it on lets users click a fade.

`cursor: 'view'` writes `data-cursor-state="view"` on `<html>` while hovered, and deletes it on leave.
Note this is `<html>`, whereas [`cursor.ts`](cursor.md) writes the same attribute on the cursor *root*;
the cleaner integration is to call `cursor.setState()` from `onEnter`/`onLeave`.

**Click detection:** `pointerdown` records the position and casts immediately (touch fires no move before
down, so without this the first tap on a phone hits whatever was under the previous one). `pointerup`
fires `onClick` only if the pointer travelled **< 8 px** and is still over the same entry. 8 px is the
threshold every native UI uses — below it a human intended a click even if their hand moved.

**Hit → entry resolution:** hits land on leaf geometry, so the module walks up `parent` from the hit
object to find the registered ancestor. Registering a `Group` therefore works exactly as you would hope.

## Transitions and applications

**`createPlaneProbe` is the one to reach for far more often than the picker.** One ray/plane
intersection — about a dozen floating-point operations, no geometry, no traversal, no triangles:

| use | setup |
|---|---|
| a ripple, footprint or light following the pointer across the ground | default y-up plane, feed `read()` into a shader uniform |
| dragging an object along a surface | `read()` each frame while a pointer is down |
| a shader that needs the pointer in **world** space, not screen space | `read()` → `uniforms.uPointer.value` |
| a vertical "glass pane" the pointer paints on | `new THREE.Plane(new THREE.Vector3(0, 0, 1), -2)` |

It returns `null` when the plane is behind the camera or the ray is parallel to it — always handle that.

**`visibleSizeAt` makes "fit this plane exactly to the viewport" a one-liner** instead of a fiddle. Every
full-screen video or shader scene uses it, as does anything that must line up with a DOM element:

```ts
const { width, height } = visibleSizeAt(camera.position.z - plane.position.z, camera)
plane.scale.set(width, height, 1)
```

**`screenToWorld` takes a *distance*, not a "z".** There is no single world z for a screen coordinate — a
screen position is a **ray**, and you have to say how far along it you mean. Getting this wrong is why
unprojected objects sometimes appear to drift when the camera moves.

**`worldToScreen` returns `z` in NDC**; outside −1..1 means the point is not in front of the camera, which
is what `visible` reports. It is the maths behind `createAnchors`, exposed for one-offs.

**Interaction patterns worth building:**

| pattern | how |
|---|---|
| inspect a prop | `onClick` → `layer.run()` a transition into a detail scene |
| a hover that lights the object | `onEnter`/`onLeave` set a target on a damped emissive value; never set it directly, or it pops |
| a highlight that follows the pointer *across* the object | `onMove` → `hit.uv` into a shader uniform |
| picking one instance out of an `InstancedMesh` | the intersection carries `instanceId`; read the transform back with `field.matrixOf(id, m)` |
| a pickable object in a scissored scene | pass `el` so NDC is element-relative |
| several scenes sharing one world | give each a `layer` and one picker per layer |
| disable picking while covered | `picker.setEnabled(!layer.busy)` |

## Gotchas

**`Object3D.raycast` reads `matrixWorld`, which three only refreshes inside `renderer.render()`.** A
picker that runs before the render stage tests against **last frame's** transforms — which looks like "the
hitbox lags behind the model" and is maddening to debug. This module calls
`e.test.updateWorldMatrix(true, false)` on each registered object itself: `true` walks *up* to the root so
a parent's animation is included, `false` does not descend, because the children that matter are
refreshed by `Object3D.raycast`. It is cheap precisely because the list is short.

**`visible = false` does NOT stop a mesh being raycast.** A very common source of mystery hits. Hiding an
object does not unregister it — remove it from the picker, or use `setEnabled`.

**Hit testing must use the raw pointer, not the damped one.** `createPlaneProbe.read()` uses
`state.pointerX.target` / `pointerY.target` deliberately. The damped value trails by up to ~100 ms, so a
probe reading `.current` puts the ripple *behind* the cursor — which reads as lag in the whole site, not
just in the ripple.

**`createPlaneProbe`'s `at`/`read` return a shared scratch vector** unless you pass `out`. Store the
result and it will be overwritten next call. Copy it, or pass your own target.

**`always: true` costs a raycast every tick, for every entry.** One `always` entry makes the whole `hz`
throttle the *only* thing limiting cost. Use it for orbiting or animated objects and keep the count in
single digits.

**`el` is only correct if the scene is rendered into that element's box.** For a scissored viewport scene,
pass the section element; for a full-screen canvas, omit it and let the module use viewport dimensions.

**`hovered` is the registered object, not the hit mesh.** If you registered a `Group` and want the specific
child, read `hit.object`.

**`onLeave` receives no argument.** There is no meaningful intersection to report on a leave; do not
expect the last hit there — read `picker.hit` before it clears if you need it.

**`screenToWorld` constructs a `Raycaster` per call.** Fine for a click handler; do not call it in a loop
stage for thousands of points.

**`dispose()` removes the stage and all four window listeners and clears the entry list.** Individual
unregister functions become no-ops afterwards, which is safe but means a scene's `dispose` order does not
matter here.

## Recipe

A pickable hero prop with a low-poly proxy and a damped hover response:

```ts
import * as THREE from 'three'
import { createPicker, type Picker } from '../../modules/raycast'
import { damped, damp } from '../../kernel/state'
import type { SceneDefinition } from '../../kernel/types'

let picker: Picker | null = null
let unregister: (() => void) | null = null
const glow = damped(0, 0.12)

export default {
  id: '05-artifact',
  renderer: 'three',
  section: '#chapter-artifact',

  build(ctx) {
    const katana = ctx.assets.get<THREE.Object3D>('katana')
    ctx.scene.add(katana)

    // 12 triangles instead of 120,000.
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.8, 0.1))

    picker = createPicker(ctx.camera, { hz: 30 })
    unregister = picker.add(katana, {
      proxy,
      cursor: 'view',
      priority: 1,
      onEnter: () => { glow.target = 1 },
      onLeave: () => { glow.target = 0 },
      onMove: (hit) => { material.uniforms.uHitUv.value.copy(hit.uv!) },
      onClick: () => transition.run(() => scrollTo('#artifact-detail'), 'iris'),
    })
  },

  update(_w, ctx) {
    // Damp the hover response — setting emissive directly on enter/leave pops.
    damp(glow, ctx.frame.delta)
    material.emissiveIntensity = glow.current * 2.5
  },

  dispose() {
    unregister?.()
    picker?.dispose()
    picker = null
    unregister = null
  },
} satisfies SceneDefinition
```

A pointer-following ripple on the ground — no picker, no geometry:

```ts
import * as THREE from 'three'
import { createPlaneProbe } from '../../modules/raycast'

const probe = createPlaneProbe(ctx.camera)          // y-up plane through the origin
const uPointer = { value: new THREE.Vector3() }

update() {
  const p = probe.read()
  if (p) uPointer.value.copy(p)                     // null when the ray misses the plane
}
```

Fitting a plane to the viewport, and keeping it fitted:

```ts
import { visibleSizeAt } from '../../modules/raycast'

const fit = () => {
  const { width, height } = visibleSizeAt(camera.position.z - plane.position.z, camera)
  plane.scale.set(width, height, 1)
}
fit()                        // in build()
// and again in resize(), which the kernel calls on a real viewport change
```

Related: [`../kernel/state.md`](../kernel/state.md) (`pointerX.target`),
[`../kernel/loop.md`](../kernel/loop.md) (stage 970, `after: ['scenes']`),
[`cursor.md`](cursor.md) (`data-cursor-state`), [`dom-bridge.md`](dom-bridge.md) (`createAnchors` wraps
`worldToScreen`), [`instancing.md`](instancing.md) (`instanceId`, `matrixOf`),
[`transition.md`](transition.md) (`setEnabled` while covered).
