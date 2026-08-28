# `kernel/camera.ts`

## Purpose

One camera for the whole site, positioned every frame as the **weighted average of every active
scene's waypoint**. This is the single most important architectural decision in the toolkit: it is
why scenes can be added, removed and reordered without re-timing anything.

## When to use it

`createCameraRig()` once, from `boot()`. Scenes declare a `waypoint` in their definition and never
touch the camera again.

## When NOT to use it

- **When a scene genuinely needs its own camera** — a product viewer with orbit controls, an inset,
  a split screen. Use `viewport` on the `SceneDefinition` and the kernel gives that scene a private
  scene and camera.
- **When the camera must follow a path with precise timing** — a cinematic dolly where the exact
  curve matters. Then create a `CatmullRomCurve3` inside the scene, get your own camera via
  `viewport`, and drive it from `ctx.frame.local`. The weighted-average rig is for *framing*, not
  choreography.

## Signature

```ts
export interface CameraOptions {
  fallback?: Waypoint          // pose when no scene has weight; default pos [0,0,6] focus [0,0,0] fov 35
  parallaxStrength?: number    // world units of pointer push; default 0.35
  parallaxTilt?: number        // radians of pointer rotation; default 0.04
  ease?: number                // damping on the averaged result; default 0.09
  velocityRoll?: number        // radians of roll per unit velocity; default 0 (off)
}

export interface CameraRig {
  update: (delta: number) => void
  snapToTargets: () => void
  targetPosition: THREE.Vector3
  targetFocus: THREE.Vector3
  fov: Damped
}

export function createCameraRig(
  camera: THREE.PerspectiveCamera,
  parallax: THREE.Group,
  instances: SceneInstance[],
  opts?: CameraOptions,
): CameraRig

export function initCamera(rig: CameraRig): void            // registers stage 50
export function printWaypoint(camera: THREE.PerspectiveCamera, focus?: THREE.Vector3): string
```

## Inputs

**The waypoint average.** For every instance with `weight > ACTIVE_THRESHOLD` and a `waypoint`:

```
position = Σ(posᵢ × wᵢ) / Σ(wᵢ)
focus    = Σ(focusᵢ × wᵢ) / Σ(wᵢ)
fov      = Σ(fovᵢ × wᵢ) / Σ(wᵢ)
```

With one scene at weight 1, the camera is exactly at its waypoint. With two at 0.5, it is exactly
between them. With no scenes weighted, it holds `fallback`.

**Portrait override.** `WaypointSet.portrait` is selected when `state.viewport.portrait`. It falls
back to `landscape` when absent. Give any scene with a subject a portrait waypoint — a landscape
framing on 9:19.5 crops the subject out.

| option | 0 | subtle | strong |
|---|---|---|---|
| `parallaxStrength` | no pointer response | **0.35** (default) | 1.0+ — starts to feel like a game camera |
| `parallaxTilt` | none | 0.02–0.06 | 0.1+ — reads as a wobble, not depth |
| `ease` | — | 0.09 (default) | 0.03 heavy/dreamlike · 0.2 responsive |
| `velocityRoll` | off (default) | 0.01–0.03 — a lovely touch on fast scroll | 0.06+ — nauseating |

## Outputs

Stage 50 `camera`:

1. computes the weighted target position, focus and fov
2. damps each axis with `damp()` (so it is frame-rate independent)
3. applies **pointer parallax to the `parallax` group**, not to the camera
4. `camera.lookAt(dampedFocus)`, `camera.fov = fov.current`, `updateProjectionMatrix()` only when
   fov actually changed
5. optional roll from `state.velocity.current`

`snapToTargets()` forces every damped value onto its target immediately. Call it after a scroll jump,
a resize, or on first load, or the camera visibly slides into place from the fallback pose.

## Transitions and applications

**Why the parallax group and not the camera.** Scroll writes the camera's position; pointer writes the
group's transform. Two independent inputs, two independent transforms, no arbitration. If both wrote
`camera.position` they would overwrite each other every frame and the result would jitter at exactly
the point where the user is moving the mouse *and* scrolling — which is most of the time.

The camera is a child of `parallax`. Objects added to `parallax` therefore move *with* the camera
(backgrounds, skyboxes, far layers, atmospheric planes); objects added to `world` do not.

**Authoring waypoints in the browser.** With `?debug&waypoints`, orbit the camera to the framing you
want and call `printWaypoint(camera)` from the console. It emits a paste-ready literal:

```ts
{ position: [2.41, 1.30, 4.88], focus: [0.00, 0.95, 0.00], fov: 32 }
```

This is much faster than guessing numbers and recompiling, and it is how every waypoint in a real
project should be produced.

**FOV is a dramatic tool, not a technical setting.**

| fov | reads as | use for |
|---|---|---|
| 18–24 | telephoto, compressed, observational | a portrait, a distant landscape, tension |
| 28–36 | natural, cinematic | most scenes; 35 is the default |
| 45–60 | wide, immersive, slightly distorted | interiors, arrival moments, portrait phones |
| 70+ | fisheye, aggressive | a deliberate shock; almost never |

Averaging fov across a crossfade produces a slow lens change, which is a real and expensive-looking
camera move you get for free.

## Gotchas

**A scene writing to `ctx.camera`.** Overwritten next frame → jitter. Declare a waypoint. This is the
most common misunderstanding of the architecture.

**Waypoints averaging into nothing.** Two scenes with opposite waypoints (`x: -10` and `x: +10`) at
equal weight put the camera at `x: 0`, potentially inside geometry, looking at empty space. When
adjacent scenes are in very different places, either tighten their `ramp` so they barely overlap, or
put a `transition` cover over the handover (see [`../modules/transition.md`](../modules/transition.md)).

**`fov` changes force `updateProjectionMatrix()`**, which is not free. The rig only calls it when the
value actually changed — do not call it yourself in a scene's `update()`.

**Parallax on a touch device.** There is no pointer, so `state.pointerX/Y` stay near 0 and parallax is
inert. That is correct. Do not substitute gyroscope input without asking: it requires a permission
prompt on iOS and reads as a novelty.

## Recipe

Waypoints for a three-beat sequence:

```ts
// 00-arrival: wide, low, looking up — the establishing shot
waypoint: {
  landscape: { position: [0, 0.8, 9],  focus: [0, 2.5, 0], fov: 52 },
  portrait:  { position: [0, 0.8, 12], focus: [0, 2.5, 0], fov: 62 },
}

// 03-character: telephoto portrait, off-centre for composition
waypoint: {
  landscape: { position: [1.6, 1.5, 3.2], focus: [0, 1.45, 0], fov: 24 },
  portrait:  { position: [0.6, 1.5, 4.4], focus: [0, 1.45, 0], fov: 34 },
}

// 05-dissolution: pulled back and high, the subject now small
waypoint: {
  landscape: { position: [0, 6, 14], focus: [0, 0, 0], fov: 30 },
  portrait:  { position: [0, 6, 20], focus: [0, 0, 0], fov: 42 },
}
```

Rig configuration for a heavy cinematic feel:

```ts
const rig = createCameraRig(stage.camera, stage.parallax, instances, {
  fallback: { position: [0, 1, 8], focus: [0, 1, 0], fov: 40 },
  ease: 0.05,               // heavy — the camera arrives after you do
  parallaxStrength: 0.25,   // restrained
  parallaxTilt: 0.03,
  velocityRoll: 0.015,      // a slight bank on fast scroll
})
initCamera(rig)
rig.snapToTargets()         // no slide-in on load
```

Related: [`types.md`](types.md) (`Waypoint`, `WaypointSet`), [`weights.md`](weights.md),
[`renderer.md`](renderer.md) (the parallax group), [`debug.md`](debug.md) (`?waypoints`).
