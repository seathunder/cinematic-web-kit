# `modules/instancing.ts`

## Purpose

Many objects, one draw call — plus the *right* way to animate them. Contains `createInstancedField`
(CPU-driven instancing), `gpuAnimate` (vertex-shader motion on any built-in three material),
`createParticleField` (a GPU-animated point field) and `layouts` (distribution generators).

## When to use it

The moment you have more than ~50 copies of the same geometry: grass, trees, lanterns, torii, rocks,
crowd figures, dust, embers, snow, a swarm, a grid of tiles, a field of type.

**The number that decides it:** a draw call costs the CPU roughly **0.05–0.2 ms** of state setup no
matter how simple the mesh is. 500 separate meshes is therefore **25–100 ms per frame of pure driver
overhead** — the GPU is idle and the site runs at 12 fps. This is the most common reason a "simple"
scene is slow, and no amount of texture compression fixes it.

## When NOT to use it

- **Not for a handful of hero objects.** Ten distinct props are ten draw calls — 1–2 ms. Instancing
  them costs you individual materials, per-object raycasting and readable code for no measurable gain.
- **Not when each copy needs a different geometry or material.** That is what instancing *cannot* do.
  (Different *colour* is fine — that is `InstanceTransform.color`.)
- **Not `createInstancedField` + per-frame `commit()` for large counts.** Instancing moves the
  bottleneck to *updating*; see the CPU vs GPU rule below.
- **Not `createParticleField` for large or rotating sprites.** `gl_PointSize` is driver-capped and
  points cannot rotate.

## Signature

```ts
/** The clock every GPU-animated instance material reads. Bind it into your own shaders too. */
export const instanceTime: { value: number }

export interface InstanceTransform {
  position: [number, number, number]
  rotation?: [number, number, number]        // Euler radians
  quaternion?: THREE.Quaternion              // use instead of rotation when copying an orientation
  scale?: number | [number, number, number]
  color?: THREE.ColorRepresentation          // multiplied into the material colour
}

export interface InstancedFieldOptions {
  geometry: THREE.BufferGeometry
  material: THREE.Material
  count: number                              // BEFORE the quality multiplier
  scaleWithQuality?: boolean                 // default true — scales by budget().density
  layout: (i: number, count: number) => InstanceTransform
  dynamic?: boolean                          // sets DynamicDrawUsage on the matrix buffer
  attributes?: Record<string, (i: number, count: number) => number | number[]>
  noCull?: boolean
}

export interface InstancedField {
  mesh: THREE.InstancedMesh
  readonly count: number                     // post-quality-scaling. Always read this.
  set(i: number, t: InstanceTransform): void
  commit(): void
  relayout(layout: (i: number, count: number) => InstanceTransform): void
  matrixOf(i: number, out: THREE.Matrix4): THREE.Matrix4
  dispose(opts?: { keepAssets?: boolean }): void
}

export function createInstancedField(opts: InstancedFieldOptions): InstancedField

export interface GpuAnimateOptions {
  glsl: string                               // must compute `vec3 cwOffset`
  attributes?: Record<string, 'float' | 'vec2' | 'vec3' | 'vec4'>
  uniforms?: Record<string, { value: unknown }>
  space?: 'local' | 'view'                   // default 'local'
  cacheKey?: string
}

export function gpuAnimate<M extends THREE.Material>(material: M, opts: GpuAnimateOptions): M

export interface ParticleFieldOptions {
  count: number
  size?: [number, number, number]            // bounding-box half-extents, default [10,10,10]
  pointSize?: number                          // default 6, multiplied by dpr
  color?: THREE.ColorRepresentation
  blending?: 'additive' | 'normal'           // default additive
  opacity?: number                            // default 0.6
  speed?: number                              // default 0.15; 0 for a static starfield
  scaleWithQuality?: boolean
  distribute?: (i: number, count: number) => [number, number, number]
}

export interface ParticleField {
  points: THREE.Points
  readonly count: number
  material: THREE.ShaderMaterial
  dispose(): void
}

export function createParticleField(opts: ParticleFieldOptions): ParticleField

export const layouts: {
  fibonacciSphere(radius: number): (i: number, count: number) => InstanceTransform
  scatterPlane(width: number, depth: number, jitterScale?: number): () => InstanceTransform
  jitteredGrid(cols: number, rows: number, spacing: number, jitter?: number): (i: number) => InstanceTransform
  alongCurve(curve: THREE.Curve<THREE.Vector3>, up?: THREE.Vector3): (i: number, count: number) => InstanceTransform
}
```

## Inputs

### The decision that matters: CPU-driven or GPU-driven

These are two completely different techniques that get conflated constantly.

| | `createInstancedField` + `commit()` | `gpuAnimate` |
|---|---|---|
| where the motion is computed | JS, one `Matrix4` compose per instance (~16 multiplies) + a buffer upload | the vertex shader, from a per-instance attribute + `uTime` |
| per-frame CPU cost | O(count) | **one uniform write**, regardless of count |
| practical ceiling | a few thousand **if they change rarely** | 100k+ |
| can depend on | anything — physics, raycast hits, user selection | only time and per-instance identity |
| free case | a layout computed once at build and never touched is free forever | — |

**Rule:** if the motion is a *function of time and identity*, it belongs on the GPU. If it depends on
unpredictable per-instance state, it has to be CPU-side — so keep that set small and put the decorative
millions on the GPU. This is the technique most tutorials skip, which is why so many of them cap out at
2,000 objects.

### `scaleWithQuality` — the cheapest quality lever there is

Default **true**: `count` is multiplied by `budget().density` (low tier = 0.25×). Thinning a field of
8,000 particles to 2,000 is nearly invisible and cuts vertex work by 4×. The field clamps to at least 1
instance, because a field that silently becomes empty on a low-tier device is much harder to debug than
one that is merely sparse.

### `glsl` — the injection contract

Your snippet must compute `vec3 cwOffset`, the displacement for this vertex this frame. In scope:
`uTime`, `position`, `normal`, `uv`, plus any attributes you declared.

```ts
gpuAnimate(material, {
  attributes: { aSeed: 'float' },
  glsl: `
    float w = sin(uTime * 1.4 + aSeed * 6.28);
    cwOffset = vec3(w * 0.2 * uv.y, 0.0, 0.0);
  `,
})
```

**Multiplying by `uv.y` is the standard foliage trick** — the base of the blade stays planted and only
the tip moves, which is what makes it read as *bending* rather than *sliding*.

### `space`

| `space` | injected at | rotates with the instance? | seen by shadows / world-space effects? | use for |
|---|---|---|---|---|
| `'local'` (default) | `#include <begin_vertex>`, `transformed += cwOffset` | yes | yes | foliage, crowds, anything planted in the world |
| `'view'` | `#include <project_vertex>`, `mvPosition.xyz += (viewMatrix * vec4(cwOffset, 0.0)).xyz` | no | **no** | camera-relative drift — dust, snow |

`w = 0.0` in that multiply is deliberate: the view matrix rotates the offset without re-applying its
translation.

### `blending` on a particle field

| `blending` | reads as | use for |
|---|---|---|
| `'additive'` (default) | **light** | embers, dust in a beam, fireflies, sparks |
| `'normal'` | **matter** | snow, ash, pollen, rain |

This one option changes the meaning of the effect more than any other in the module.

## Outputs

**Stage 45 `instance-time`** (`after: ['state']`) is registered lazily the first time any function here
runs, and advances one shared `{ value }` object. Every GPU-animated material reads that same object, so
there is one uniform write per frame no matter how many fields exist — and no chance of one material
being left un-updated after a hot reload. `instanceTime` is exported so you can bind it into your own
`ShaderMaterial` too.

`field.mesh` is a `THREE.InstancedMesh` — add it to your scene, that is all.

`field.count` is the **post-quality-scaling** count. Always read this, never the option you passed in;
on a low-tier device they differ by 4×, and looping to the wrong one writes out of bounds or leaves
instances at the identity matrix stacked at the origin.

`set(i, t)` writes one instance (cheap); `commit()` uploads (once per frame at most, after all the
`set`s). `relayout(fn)` re-runs a layout over every instance and commits. `matrixOf(i, out)` reads an
instance's matrix back — for raycast results and attachment points.

`createParticleField` returns `points` (frustum culling **off**, because the vertex shader moves
particles outside the declared bounds) and `material`, whose uniforms you can drive.

## Transitions and applications

**The sprite is computed, not sampled.** `createParticleField`'s fragment shader derives a soft radial
falloff from `gl_PointCoord` — no download, no decode, no mip chain, and it stays perfectly round at any
size. The soft falloff is what stops the field looking like a grid of squares.

**Particle scale is cubed on purpose:** `0.25 + pow(random(), 3) * 1.75`. A uniform size distribution
looks like a texture; a cubed one — mostly small, a few noticeably large — reads as *depth*.

**What each layout is for:**

| layout | shape | use for |
|---|---|---|
| `fibonacciSphere(r)` | golden-angle spiral, no polar clustering | an orbiting index, a constellation, a data sphere |
| `scatterPlane(w, d, jitter)` | random on a plane, random Y rotation, jittered scale | grass, rocks, a crowd on a ground plane |
| `jitteredGrid(cols, rows, spacing, jitter)` | grid + per-cell jitter | a stone path, a city block, an archive wall. `jitter: 0` gives a hard grid, which is a legitimate graphic choice; **0.35** is the sweet spot — still legible as a grid, no longer mechanical |
| `alongCurve(curve, up)` | oriented to the tangent | **anything that follows a path: lanterns, torii, streetlights** |

`alongCurve` builds the orientation via `m.lookAt(origin, tangent, up)` then decomposes, because
aligning a quaternion to a tangent by hand is where sign errors live.

**Transitions this module can drive:**

| effect | how |
|---|---|
| a field assembles from chaos | `gpuAnimate` with a `uProgress` uniform mixing a scattered position toward the layout position; drive `uProgress` from `ctx.frame.local` |
| a field dissolves as a scene ends | `uniforms.uDissolve` driven from `1 - weight`; displace along `normal` and fade `opacity` |
| dust that reveals a light shaft | `createParticleField` with `blending: 'additive'`, `speed: 0.05`, tight `size`, plus bloom |
| wind rising through a chapter | one uniform: `uWind` from a damped scroll velocity |
| a path of lanterns lighting in sequence | `alongCurve` + a per-instance `aIndex` attribute; in GLSL, light when `uProgress * count > aIndex` |
| a crowd turning to face the camera | `space: 'view'`, or a billboard vertex shader on an instanced plane |
| snow that ignores the camera's rotation | `space: 'view'`, `blending: 'normal'` |

**Bind particle motion to scroll velocity** for the cheapest "the world responds to you" moment in the
toolkit:

```ts
update(_w, ctx) {
  field.material.uniforms.uSpeed.value = 0.15 + Math.abs(ctx.state.scrollVelocity) * 0.4
}
```

## Gotchas

**`customProgramCacheKey` is mandatory, and `gpuAnimate` sets it for you.** three caches compiled
programs by material type + defines; two materials with *different* injected source but the same type
collide and the second silently gets the first one's shader. **Symptom: your second field animates like
the first.** `gpuAnimate` derives a key from a hash of your GLSL, so distinct snippets never collide —
but pass an explicit `cacheKey` if you generate GLSL dynamically.

**Shadows do not see the injection.** Shadow maps use an internal depth material that is not patched, so
a GPU-animated mesh casts a **static** shadow. Either assign a matching `mesh.customDepthMaterial`, or —
much more often the right call — turn shadow casting off for the field and put a soft baked contact
shadow underneath.

**`noCull` / `frustumCulled = false` is not laziness.** three culls by the *whole mesh's* bounding
sphere, so a scene-wide field is either fully drawn or fully invisible anyway, and computing the sphere
is wasted work. Worse: a GPU-animated field moves vertices outside the declared bounds, so culling
removes it while it is still on screen.

**Transparent particles must not write depth.** `depthWrite: false` — otherwise the ones drawn first
punch holes in the ones behind them. **This is the single most common particle bug.**

**`gl_PointSize` is driver-capped.** `ALIASED_POINT_SIZE_RANGE` is commonly 1024 but as low as **63** on
some mobile GPUs. Points are also always screen-aligned squares that cannot be rotated. For small specks
that is exactly right and it is the cheapest primitive available; for anything large, rotating, or
oriented-textured, switch to `createInstancedField` with a plane and a billboard vertex shader.

**`pointSize` is multiplied by `state.viewport.dpr` at construction.** It is captured once, so a field
built before a DPR demotion keeps the old size. Rebuild, or drive `uSize` yourself.

**`commit()` once per frame, after all `set()` calls.** Committing inside a loop uploads the whole buffer
per instance.

**`dynamic: true` is required if you will re-write instances.** Without `DynamicDrawUsage` the driver
assumes the buffer is static and re-uploads are markedly slower.

**`dispose()` frees the geometry and material you passed in, by default.** A field almost always owns
them. Pass `{ keepAssets: true }` when they are shared with another field or came from the asset
registry, where the refcount owns them instead.

**`layouts.scatterPlane` ignores `i`** — it is pure random per call, so `relayout` gives a completely
different arrangement. If you need a stable scatter, seed it yourself.

**Per-instance `color` needs a material that reads it.** Built-in materials do when the `InstancedMesh`
has an instance colour buffer; a custom `ShaderMaterial` must declare `attribute vec3 instanceColor`.

## Recipe

A GPU-animated grass field — 40,000 blades, one draw call, one uniform write per frame:

```ts
import * as THREE from 'three'
import { createInstancedField, gpuAnimate, layouts } from '../../modules/instancing'
import type { SceneDefinition } from '../../kernel/types'

let field: ReturnType<typeof createInstancedField> | null = null

// Hold the uniform object at module scope and pass the SAME reference into `uniforms`.
// That is how you keep a handle you can write to later — three stores the reference, not a copy.
const uWind = { value: 0.2 }

export default {
  id: '02-field',
  renderer: 'three',
  section: '#chapter-field',

  build(ctx) {
    const blade = new THREE.PlaneGeometry(0.06, 0.9, 1, 3)
    blade.translate(0, 0.45, 0)          // pivot at the base, so it bends from the ground

    const material = gpuAnimate(
      new THREE.MeshStandardMaterial({ color: 0x4a5a34, side: THREE.DoubleSide }),
      {
        attributes: { aSeed: 'float' },
        uniforms: { uWind },
        space: 'local',
        glsl: `
          float phase = uTime * 1.4 + aSeed * 6.28318;
          float bend  = sin(phase) * uWind;
          cwOffset = vec3(bend * uv.y, 0.0, bend * 0.35 * uv.y);
        `,
      },
    )

    field = createInstancedField({
      geometry: blade,
      material,
      count: 40_000,                     // → 10,000 on low tier, automatically
      scaleWithQuality: true,
      layout: layouts.scatterPlane(30, 30, 0.5),
      attributes: { aSeed: () => Math.random() },
      noCull: true,
    })

    field.mesh.castShadow = false        // the depth material does not see the injection
    field.mesh.receiveShadow = true
    ctx.scene.add(field.mesh)

    ctx.debug.monitor('blades', () => field!.count)
  },

  update(_w, ctx) {
    // Wind rises with scroll velocity. One uniform write for 40,000 blades.
    uWind.value = 0.15 + Math.min(0.6, Math.abs(ctx.state.scrollVelocity) * 0.5)
  },

  dispose() {
    field?.dispose()                     // owns the blade geometry and the material
    field = null
  },
} satisfies SceneDefinition
```

Lanterns along a path, lighting in sequence as the user scrolls:

```ts
const curve = new THREE.CatmullRomCurve3(pathPoints)
const uProgress = { value: 0 }

const lanterns = createInstancedField({
  geometry: lanternGeo,
  material: gpuAnimate(lanternMat, {
    attributes: { aIndex: 'float' },
    uniforms: { uProgress },
    glsl: `
      // A tiny float as each lantern lights, so the sequence reads as physical.
      float lit = step(aIndex, uProgress * 24.0);
      cwOffset = vec3(0.0, lit * sin(uTime * 2.0 + aIndex) * 0.03, 0.0);
    `,
  }),
  count: 24,
  scaleWithQuality: false,               // 24 hero props, do not thin these
  layout: layouts.alongCurve(curve),
  attributes: { aIndex: (i) => i },
})

// in update():
uProgress.value = ctx.frame.local
```

Dust in a light shaft:

```ts
import { createParticleField } from '../../modules/instancing'

const dust = createParticleField({
  count: 3_000,
  size: [4, 6, 4],
  pointSize: 3,
  color: 0xffe9c4,
  blending: 'additive',      // light, not matter
  opacity: 0.35,
  speed: 0.05,
})
ctx.scene.add(dust.points)
```

Related: [`../kernel/quality.md`](../kernel/quality.md) (`density`),
[`../kernel/dispose.md`](../kernel/dispose.md) (`keepAssets`, VRAM),
[`post.md`](post.md) (additive particles + bloom), [`raycast.md`](raycast.md) (picking an instance),
[`../PATTERNS.md`](../PATTERNS.md) (scene archetypes that use fields).
