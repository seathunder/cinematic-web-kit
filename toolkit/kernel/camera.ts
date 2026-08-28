/**
 * The weighted-average waypoint camera.
 *
 * Every `three` scene declares where the camera should be when that scene is fully active.
 * The camera's actual position each frame is the weighted average of every scene's waypoint,
 * using the same in/out weights that drive the crossfades:
 *
 *     position = Σ(waypointᵢ × weightᵢ) / Σ(weightᵢ)
 *
 * The consequence is the important part: nothing tweens the camera. GSAP tweens *weights*.
 * When two scenes overlap you automatically get a smooth arc between their waypoints — with
 * no keyframe between them, because the average of two points moving at different rates
 * traces a curve for free. Add a scene in the middle of the site and the camera path through
 * it appears; delete it and the path closes up. Nothing else needs re-timing.
 *
 * The failure mode this replaces: a single GSAP timeline animating camera.position through a
 * dozen keyframes, where inserting a section means re-deriving every keyframe after it, and
 * two ScrollTriggers writing the same property fight on every frame the ranges overlap.
 */
import * as THREE from 'three'
import { state, damp, damped, type Damped } from './state'
import { addStage } from './loop'
import { ACTIVE_THRESHOLD } from './weights'
import type { SceneInstance, Waypoint } from './types'

const _pos = new THREE.Vector3()
const _focus = new THREE.Vector3()
const _wpPos = new THREE.Vector3()
const _wpFocus = new THREE.Vector3()

export interface CameraOptions {
  /** Where the camera sits when no scene has any weight. Also the pre-scroll pose. */
  fallback?: Waypoint
  /** How hard pointer parallax pushes the rig, in world units. 0 disables it. */
  parallaxStrength?: number
  /** Extra rotation from pointer, in radians. Subtle: 0.02–0.06 reads well. */
  parallaxTilt?: number
  /** Damping on the averaged result. Lower = heavier, more cinematic. */
  ease?: number
  /** Roll the camera slightly with scroll velocity. 0 off; 0.01–0.03 is a nice touch. */
  velocityRoll?: number
}

export interface CameraRig {
  /** Call from the manifest after the shared camera exists. */
  update: (delta: number) => void
  /** Force the camera onto its target instantly (after a jump, a resize, or on load). */
  snapToTargets: () => void
  targetPosition: THREE.Vector3
  targetFocus: THREE.Vector3
  fov: Damped
}

export function createCameraRig(
  camera: THREE.PerspectiveCamera,
  parallax: THREE.Group,
  instances: SceneInstance[],
  opts: CameraOptions = {},
): CameraRig {
  const fallback: Waypoint = opts.fallback ?? {
    position: [0, 0, 6],
    focus: [0, 0, 0],
    fov: 35,
  }
  const parallaxStrength = opts.parallaxStrength ?? 0.35
  const parallaxTilt = opts.parallaxTilt ?? 0.04
  const ease = opts.ease ?? 0.09
  const velocityRoll = opts.velocityRoll ?? 0

  const targetPosition = new THREE.Vector3(...fallback.position)
  const targetFocus = new THREE.Vector3(...fallback.focus)
  const fov = damped(fallback.fov ?? 35, ease)

  // Damped position/focus as three scalar triples so every axis uses the same
  // frame-rate-independent damp() as the rest of the kernel.
  const cur = new THREE.Vector3().copy(targetPosition)
  const curFocus = new THREE.Vector3().copy(targetFocus)
  const roll = damped(0, 0.06)

  function pickWaypoint(inst: SceneInstance): Waypoint | null {
    const wp = inst.def.waypoint
    if (!wp) return null
    return state.viewport.portrait ? (wp.portrait ?? wp.landscape) : wp.landscape
  }

  function accumulate(): void {
    let totalWeight = 0
    _pos.set(0, 0, 0)
    _focus.set(0, 0, 0)
    let fovSum = 0

    for (let i = 0; i < instances.length; i++) {
      const inst = instances[i]
      if (inst.weight <= ACTIVE_THRESHOLD) continue
      const wp = pickWaypoint(inst)
      if (!wp) continue

      const w = inst.weight
      _wpPos.set(wp.position[0], wp.position[1], wp.position[2])
      _wpFocus.set(wp.focus[0], wp.focus[1], wp.focus[2])
      _pos.addScaledVector(_wpPos, w)
      _focus.addScaledVector(_wpFocus, w)
      fovSum += (wp.fov ?? fallback.fov ?? 35) * w
      totalWeight += w
    }

    if (totalWeight < ACTIVE_THRESHOLD) {
      // No scene claims the camera — hold the fallback pose rather than snapping to origin.
      targetPosition.set(...fallback.position)
      targetFocus.set(...fallback.focus)
      fov.target = fallback.fov ?? 35
      return
    }

    // Dividing by the weight sum is what makes this an average rather than an accumulation.
    // Without it, two overlapping scenes at weight 1 would place the camera twice as far out.
    const inv = 1 / totalWeight
    targetPosition.copy(_pos).multiplyScalar(inv)
    targetFocus.copy(_focus).multiplyScalar(inv)
    fov.target = fovSum * inv
  }

  function applyParallax(): void {
    if (parallaxStrength === 0 && parallaxTilt === 0) return
    if (state.reducedMotion) return
    const px = state.pointerX.current
    const py = state.pointerY.current

    // Written to the GROUP, never to the camera. The camera's local position belongs to the
    // waypoint average; the group's transform belongs to the pointer. Two owners, two objects,
    // no conflict — this is the whole reason the parallax group exists.
    parallax.position.x = px * parallaxStrength
    parallax.position.y = py * parallaxStrength
    parallax.rotation.y = px * parallaxTilt
    parallax.rotation.x = -py * parallaxTilt
  }

  function snapToTargets(): void {
    accumulate()
    cur.copy(targetPosition)
    curFocus.copy(targetFocus)
    fov.current = fov.target
    camera.position.copy(cur)
    camera.lookAt(curFocus)
    camera.fov = fov.current
    camera.updateProjectionMatrix()
  }

  const posD: Damped = { current: 0, target: 0, ease }

  function dampVec(out: THREE.Vector3, target: THREE.Vector3, delta: number): void {
    posD.ease = ease
    posD.current = out.x
    posD.target = target.x
    damp(posD, delta)
    out.x = posD.current
    posD.current = out.y
    posD.target = target.y
    damp(posD, delta)
    out.y = posD.current
    posD.current = out.z
    posD.target = target.z
    damp(posD, delta)
    out.z = posD.current
  }

  function update(delta: number): void {
    accumulate()

    if (state.reducedMotion) {
      cur.copy(targetPosition)
      curFocus.copy(targetFocus)
      fov.current = fov.target
    } else {
      dampVec(cur, targetPosition, delta)
      dampVec(curFocus, targetFocus, delta)
      damp(fov, delta)
    }

    camera.position.copy(cur)
    camera.lookAt(curFocus)

    if (velocityRoll !== 0 && !state.reducedMotion) {
      roll.target = -state.velocity.current * velocityRoll
      damp(roll, delta)
      camera.rotateZ(roll.current)
    }

    if (Math.abs(camera.fov - fov.current) > 0.001) {
      camera.fov = fov.current
      camera.updateProjectionMatrix()
    }

    applyParallax()
  }

  return { update, snapToTargets, targetPosition, targetFocus, fov }
}

/** Register the camera stage. Must run after weights and before scene update(). */
export function initCamera(rig: CameraRig): void {
  addStage({
    order: 50,
    name: 'camera',
    after: ['weights'],
    fn: (delta) => rig.update(delta),
  })
}

/* ------------------------------------------------------------------ authoring */

/**
 * Print the current camera pose as a pasteable waypoint literal.
 *
 * The practical way to author waypoints: add `?debug` to the URL, fly the orbit controls to
 * the shot you want, run `cw.waypoint()` in the console, paste the result into the scene.
 * Hand-writing camera coordinates is possible and nobody does it twice.
 */
export function printWaypoint(camera: THREE.PerspectiveCamera, focus?: THREE.Vector3): string {
  const f = focus ?? new THREE.Vector3(0, 0, 0)
  const r = (n: number) => Math.round(n * 100) / 100
  const literal = `waypoint: {
  landscape: {
    position: [${r(camera.position.x)}, ${r(camera.position.y)}, ${r(camera.position.z)}],
    focus: [${r(f.x)}, ${r(f.y)}, ${r(f.z)}],
    fov: ${r(camera.fov)},
  },
},`
  console.log(literal)
  return literal
}
