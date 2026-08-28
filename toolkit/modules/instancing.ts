/**
 * Instancing: many objects, one draw call.
 *
 * The number that governs everything on this page: a draw call costs the CPU roughly 0.05–0.2ms
 * of state setup regardless of how simple the mesh is. 500 separate meshes is therefore 25–100ms
 * per frame of pure driver overhead — the GPU is idle and the site runs at 12fps. This is the
 * most common reason a "simple" scene is slow, and no amount of texture compression fixes it.
 *
 * One InstancedMesh draws all 500 in one call. But instancing only moves the bottleneck: now the
 * cost is *updating* the instances, and there are two completely different ways to do it that
 * people routinely conflate.
 *
 *   CPU-driven (`createInstancedField` + commit)
 *     You compose a Matrix4 per instance in JS and upload the buffer. Each instance costs a
 *     matrix compose (~16 multiplies) plus the upload. Fine up to a few thousand *if they change
 *     rarely* — a layout computed once at build and never touched is free forever. Terrible for
 *     per-frame animation: 20k instances re-composed every frame is the entire frame budget.
 *
 *   GPU-driven (`gpuAnimate`)
 *     Instance matrices are uploaded once, and the per-frame motion is computed in the vertex
 *     shader from per-instance attributes (a seed, a phase) plus a uTime uniform. Cost per frame:
 *     one uniform write. 100k instances animate for the same CPU cost as one. This is how grass,
 *     crowds, dust, snow, and swarms are actually done — and it is the technique most tutorials
 *     skip, which is why so many of them cap out at 2,000 objects.
 *
 * Rule of thumb: if the motion is a *function of time and identity*, it belongs on the GPU. If it
 * depends on unpredictable per-instance state (physics, raycast results, user selection), it has
 * to be CPU-side — so keep that set small and put the decorative millions on the GPU.
 */
import * as THREE from 'three'
import { state } from '../kernel/state'
import { addStage } from '../kernel/loop'
import { budget } from '../kernel/quality'
import { disposeObject } from '../kernel/dispose'

/* ----------------------------------------------------------------- shared time */

// One uniform object shared by every GPU-animated material, driven by one loop stage. Each
// material owning its own uTime would mean N uniform writes and, worse, N chances for one of
// them to be left un-updated after a hot reload.
const sharedTime = { value: 0 }
let timeStageAdded = false

function ensureTimeStage(): void {
  if (timeStageAdded) return
  timeStageAdded = true
  addStage({
    order: 45,
    name: 'instance-time',
    after: ['state'],
    fn: (_delta, elapsed) => {
      sharedTime.value = elapsed
    },
  })
}

/** The clock every GPU-animated instance material reads. Bind it into your own shaders too. */
export const instanceTime = sharedTime

/* ------------------------------------------------------------------ transforms */

export interface InstanceTransform {
  position: [number, number, number]
  /** Euler radians. Use `quaternion` instead if you are copying an existing orientation. */
  rotation?: [number, number, number]
  quaternion?: THREE.Quaternion
  /** Scalar or per-axis. */
  scale?: number | [number, number, number]
  /** Per-instance tint, multiplied into the material colour. */
  color?: THREE.ColorRepresentation
}

export interface InstancedFieldOptions {
  geometry: THREE.BufferGeometry
  material: THREE.Material
  /** Instance count BEFORE the quality multiplier. */
  count: number
  /**
   * Scale the count by `budget().density` (low tier = 0.25x). Default true — it is the cheapest
   * quality lever there is, and thinning a field of 8,000 particles to 2,000 is nearly invisible
   * while cutting vertex work by 4x.
   */
  scaleWithQuality?: boolean
  /** Called once per instance at build. Return its transform. */
  layout: (i: number, count: number) => InstanceTransform
  /** Instances will be re-written at runtime. Sets DynamicDrawUsage on the matrix buffer. */
  dynamic?: boolean
  /**
   * Extra per-instance attributes for a GPU-animated shader. Values are generated once.
   * `{ aSeed: (i) => Math.random() }` becomes `attribute float aSeed;` in the vertex shader.
   * Return an array for a vecN attribute.
   */
  attributes?: Record<string, (i: number, count: number) => number | number[]>
  /**
   * Skip frustum culling. Correct for a field that spans the whole scene: three culls by the
   * *whole mesh's* bounding sphere, so a scene-wide field is either fully drawn or fully
   * invisible anyway, and computing the sphere is wasted work.
   */
  noCull?: boolean
}

export interface InstancedField {
  mesh: THREE.InstancedMesh
  /** Post-quality-scaling count. Always read this, never the option you passed in. */
  readonly count: number
  /** Write one instance. Cheap; call `commit()` once after a batch of these. */
  set(i: number, t: InstanceTransform): void
  /** Upload changed buffers. Call once per frame at most, after all set() calls. */
  commit(): void
  /** Re-run a layout function over every instance and commit. */
  relayout(layout: (i: number, count: number) => InstanceTransform): void
  /** Read an instance's matrix into `out`. For raycast results and attachment points. */
  matrixOf(i: number, out: THREE.Matrix4): THREE.Matrix4
  /**
   * Frees the instance buffers, and by default the geometry and material you passed in too —
   * a field almost always owns them. Pass `keepAssets` when they are shared with another field
   * or come from the asset registry, where the refcount owns them instead.
   */
  dispose(opts?: { keepAssets?: boolean }): void
}

const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _e = new THREE.Euler()
const _p = new THREE.Vector3()
const _s = new THREE.Vector3()
const _c = new THREE.Color()

export function createInstancedField(opts: InstancedFieldOptions): InstancedField {
  const density = opts.scaleWithQuality === false ? 1 : budget().density
  // At least one, always: a field that silently becomes empty on a low-tier device is much
  // harder to debug than one that is merely sparse.
  const count = Math.max(1, Math.round(opts.count * density))

  const mesh = new THREE.InstancedMesh(opts.geometry, opts.material, count)
  mesh.count = count

  if (opts.dynamic) {
    // Tells the driver the buffer will be re-uploaded often, so it picks a different memory
    // pool. Without it, per-frame updates on a large buffer stall the pipeline.
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  }
  if (opts.noCull) mesh.frustumCulled = false

  /* ---------------------------------------------------- per-instance attributes */

  if (opts.attributes) {
    for (const [name, gen] of Object.entries(opts.attributes)) {
      const probe = gen(0, count)
      const itemSize = Array.isArray(probe) ? probe.length : 1
      const array = new Float32Array(count * itemSize)
      for (let i = 0; i < count; i++) {
        const v = i === 0 ? probe : gen(i, count)
        if (Array.isArray(v)) {
          for (let k = 0; k < itemSize; k++) array[i * itemSize + k] = v[k]
        } else {
          array[i] = v as number
        }
      }
      // InstancedBufferAttribute on a plain BufferGeometry is valid as long as the geometry is
      // only ever used by InstancedMesh — three sets the divisor from the attribute type, not
      // from the geometry class.
      opts.geometry.setAttribute(name, new THREE.InstancedBufferAttribute(array, itemSize))
    }
  }

  /* --------------------------------------------------------------- initial fill */

  let hasColor = false

  const write = (i: number, t: InstanceTransform) => {
    _p.set(t.position[0], t.position[1], t.position[2])

    if (t.quaternion) _q.copy(t.quaternion)
    else if (t.rotation) _q.setFromEuler(_e.set(t.rotation[0], t.rotation[1], t.rotation[2]))
    else _q.identity()

    if (typeof t.scale === 'number') _s.setScalar(t.scale)
    else if (Array.isArray(t.scale)) _s.set(t.scale[0], t.scale[1], t.scale[2])
    else _s.setScalar(1)

    _m.compose(_p, _q, _s)
    mesh.setMatrixAt(i, _m)

    if (t.color !== undefined) {
      // setColorAt lazily allocates mesh.instanceColor on first use, so a field with no colours
      // never pays for the buffer at all.
      mesh.setColorAt(i, _c.set(t.color))
      hasColor = true
    }
  }

  for (let i = 0; i < count; i++) write(i, opts.layout(i, count))

  mesh.instanceMatrix.needsUpdate = true
  if (hasColor && mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  // Culling uses this sphere, and it is computed from the instance matrices — so it must be
  // recomputed after any relayout or the mesh vanishes when it should be on screen.
  if (!opts.noCull) mesh.computeBoundingSphere()

  return {
    mesh,
    get count() {
      return count
    },
    set: write,
    commit() {
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    },
    relayout(layout) {
      for (let i = 0; i < count; i++) write(i, layout(i, count))
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      if (!opts.noCull) mesh.computeBoundingSphere()
    },
    matrixOf(i, out) {
      mesh.getMatrixAt(i, out)
      return out
    },
    dispose(o = {}) {
      mesh.removeFromParent()
      // InstancedMesh.dispose() frees instanceMatrix/instanceColor specifically; it does not
      // touch the geometry or material.
      mesh.dispose()
      if (!o.keepAssets) disposeObject(mesh)
    },
  }
}

/* -------------------------------------------------------------- GPU animation */

export interface GpuAnimateOptions {
  /**
   * GLSL that computes `vec3 cwOffset` — the displacement for this vertex, this frame. In scope:
   * `uTime`, `position`, `normal`, `uv`, plus any attributes declared in `attributes`.
   *
   *   'float w = sin(uTime * 1.4 + aSeed * 6.28);\n cwOffset = vec3(w * 0.2 * uv.y, 0.0, 0.0);'
   *
   * Multiplying by `uv.y` is the standard foliage trick — the base of the blade stays planted
   * and only the tip moves, which is what makes it read as bending rather than sliding.
   */
  glsl: string
  /** Attribute declarations to prepend, e.g. `{ aSeed: 'float' }`. */
  attributes?: Record<string, 'float' | 'vec2' | 'vec3' | 'vec4'>
  /** Extra uniforms, merged into the material's uniform set. */
  uniforms?: Record<string, { value: unknown }>
  /**
   * 'local' applies the offset before the instance matrix, so it rotates and scales with the
   * instance and is seen by shadows and world-space effects. This is the default and the right
   * answer for foliage, crowds, anything planted in the world.
   *
   * 'view' applies it after projection setup, in view space. Use for camera-relative drift
   * (dust, snow) where the instance's own orientation must not tilt the motion. It does NOT
   * affect worldPosition, so shadow casting and env-mapped reflections ignore it.
   */
  space?: 'local' | 'view'
  /** Unique key for the program cache. Required if you use several different injections. */
  cacheKey?: string
}

/**
 * Animate instances in the vertex shader, on any built-in three material.
 *
 * `onBeforeCompile` patches the generated GLSL just before it is compiled, which is how you keep
 * MeshStandardMaterial's lighting, shadows, IBL and tone mapping and still write your own
 * vertex motion. The alternative — a raw ShaderMaterial — means reimplementing the entire PBR
 * chain, which nobody should do for a sway.
 *
 * Two things that will bite you and are not in the docs:
 *
 *   1. `customProgramCacheKey` is mandatory. three caches compiled programs by material type +
 *      defines; two materials with *different* injected source but the same type collide and the
 *      second one silently gets the first one's shader. Symptom: your second field animates like
 *      the first.
 *   2. Shadows use an internal depth material that does not see this patch, so a GPU-animated
 *      mesh casts a *static* shadow. If the shadow matters, assign a matching
 *      `mesh.customDepthMaterial` — or, much more often the right call, turn shadow casting off
 *      for the field and put a soft baked contact shadow underneath instead.
 *
 * Verified against three 0.185's ShaderChunks: `begin_vertex` declares `vec3 transformed`, and
 * `project_vertex` declares `vec4 mvPosition` and applies `instanceMatrix` to it. Both patches
 * below depend only on those two facts.
 */
export function gpuAnimate<M extends THREE.Material>(material: M, opts: GpuAnimateOptions): M {
  ensureTimeStage()

  const decls = Object.entries(opts.attributes ?? {})
    .map(([name, type]) => `attribute ${type} ${name};`)
    .join('\n')

  const space = opts.space ?? 'local'
  const key = opts.cacheKey ?? `cw-gpu-${space}-${hashString(opts.glsl)}`

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = sharedTime
    if (opts.uniforms) {
      for (const [name, u] of Object.entries(opts.uniforms)) shader.uniforms[name] = u
    }

    shader.vertexShader = `
      uniform float uTime;
      ${decls}
      ${shader.vertexShader}
    `

    if (space === 'local') {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vec3 cwOffset = vec3(0.0);
         { ${opts.glsl} }
         transformed += cwOffset;`,
      )
    } else {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <project_vertex>',
        `#include <project_vertex>
         vec3 cwOffset = vec3(0.0);
         { ${opts.glsl} }
         // w = 0.0 so the view matrix rotates the offset without re-applying its translation.
         mvPosition.xyz += (viewMatrix * vec4(cwOffset, 0.0)).xyz;
         gl_Position = projectionMatrix * mvPosition;`,
      )
    }
  }

  material.customProgramCacheKey = () => key
  // Force a recompile if the material was already used before being patched.
  material.needsUpdate = true
  return material
}

/** Cheap deterministic string hash, for program cache keys. */
function hashString(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

/* ------------------------------------------------------------- particle field */

export interface ParticleFieldOptions {
  count: number
  /** Bounding box half-extents the particles are distributed in. */
  size?: [number, number, number]
  /** Base point size in world units at 1 unit from the camera. */
  pointSize?: number
  color?: THREE.ColorRepresentation
  /** Additive reads as light (embers, dust in a beam). Normal reads as matter (snow, ash). */
  blending?: 'additive' | 'normal'
  opacity?: number
  /** Drift speed. 0 for a static starfield. */
  speed?: number
  scaleWithQuality?: boolean
  /** Custom distribution. Default is a uniform box. */
  distribute?: (i: number, count: number) => [number, number, number]
}

export interface ParticleField {
  points: THREE.Points
  readonly count: number
  material: THREE.ShaderMaterial
  dispose(): void
}

/**
 * A drifting particle field, animated entirely on the GPU.
 *
 * Points, not instanced quads, and the trade-off is worth knowing: `gl_PointSize` is capped by
 * the driver (`ALIASED_POINT_SIZE_RANGE`) — commonly 1024 but as low as 63 on some mobile GPUs —
 * and points are always screen-aligned squares that cannot be rotated. For small specks that is
 * exactly right and it is the cheapest primitive available. For anything that needs to be large,
 * rotate, or use a texture with orientation, switch to `createInstancedField` with a plane and
 * a billboard vertex shader.
 *
 * The sprite is computed in the fragment shader from `gl_PointCoord` rather than sampled from a
 * texture: no download, no decode, no mip chain, and it stays perfectly round at any size.
 */
export function createParticleField(opts: ParticleFieldOptions): ParticleField {
  ensureTimeStage()

  const density = opts.scaleWithQuality === false ? 1 : budget().density
  const count = Math.max(16, Math.round(opts.count * density))
  const size = opts.size ?? [10, 10, 10]
  const speed = opts.speed ?? 0.15

  const positions = new Float32Array(count * 3)
  const seeds = new Float32Array(count)
  const scales = new Float32Array(count)

  for (let i = 0; i < count; i++) {
    const p = opts.distribute
      ? opts.distribute(i, count)
      : ([
          (Math.random() * 2 - 1) * size[0],
          (Math.random() * 2 - 1) * size[1],
          (Math.random() * 2 - 1) * size[2],
        ] as [number, number, number])
    positions[i * 3] = p[0]
    positions[i * 3 + 1] = p[1]
    positions[i * 3 + 2] = p[2]
    seeds[i] = Math.random()
    // Cubed, so most particles are small and a few are noticeably large. A uniform
    // distribution looks like a texture; this looks like depth.
    scales[i] = 0.25 + Math.pow(Math.random(), 3) * 1.75
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
  geometry.setAttribute('aScale', new THREE.BufferAttribute(scales, 1))

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: sharedTime,
      uSize: { value: (opts.pointSize ?? 6) * state.viewport.dpr },
      uColor: { value: new THREE.Color(opts.color ?? 0xffffff) },
      uOpacity: { value: opts.opacity ?? 0.6 },
      uSpeed: { value: speed },
      uBounds: { value: new THREE.Vector3(size[0], size[1], size[2]) },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uSize;
      uniform float uSpeed;
      uniform vec3 uBounds;
      attribute float aSeed;
      attribute float aScale;
      varying float vFade;

      void main() {
        vec3 p = position;

        // Vertical drift with wraparound. mod() is what makes this loop forever with no
        // bookkeeping: the particle leaves the top and reappears at the bottom, and because
        // every particle has its own seed they never line up into a visible sheet.
        float travel = uTime * uSpeed * (0.5 + aSeed);
        p.y = mod(p.y + travel + uBounds.y, uBounds.y * 2.0) - uBounds.y;

        // Lateral wander. Two frequencies so the path is not a recognisable sine.
        p.x += sin(uTime * 0.3 + aSeed * 40.0) * 0.4 + sin(uTime * 0.11 + aSeed * 13.0) * 0.8;
        p.z += cos(uTime * 0.25 + aSeed * 27.0) * 0.4;

        vec4 mv = modelViewMatrix * vec4(p, 1.0);

        // Fade at the extremes of the box so particles do not pop in and out at the wrap.
        vFade = 1.0 - smoothstep(uBounds.y * 0.6, uBounds.y, abs(p.y));

        // Perspective size attenuation, done by hand: -mv.z is the view-space distance.
        gl_PointSize = uSize * aScale * (1.0 / max(-mv.z, 0.001)) * 30.0;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vFade;

      void main() {
        // gl_PointCoord is 0..1 across the point sprite. A soft radial falloff here is what
        // stops the field looking like a grid of squares.
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.05, d) * uOpacity * vFade;
        if (a < 0.01) discard;
        gl_FragColor = vec4(uColor, a);
      }
    `,
    transparent: true,
    // Transparent particles must not write depth, or the ones drawn first punch holes in the
    // ones behind them. This is the single most common particle bug.
    depthWrite: false,
    depthTest: true,
    blending: opts.blending === 'normal' ? THREE.NormalBlending : THREE.AdditiveBlending,
  })

  const points = new THREE.Points(geometry, material)
  // The vertex shader moves particles outside the geometry's declared bounds, so three's
  // culling would remove the field while it is still visible.
  points.frustumCulled = false

  return {
    points,
    count,
    material,
    dispose() {
      points.removeFromParent()
      geometry.dispose()
      material.dispose()
    },
  }
}

/* ------------------------------------------------------------------- layouts */

/**
 * Layout generators. Nothing clever, but having them named stops every project from
 * re-deriving the Fibonacci sphere wrong.
 */
export const layouts = {
  /** Uniform points on a sphere surface. The golden-angle spiral — no clustering at the poles. */
  fibonacciSphere(radius: number) {
    const phi = Math.PI * (3 - Math.sqrt(5))
    return (i: number, count: number): InstanceTransform => {
      const y = 1 - (i / Math.max(1, count - 1)) * 2
      const r = Math.sqrt(Math.max(0, 1 - y * y))
      const theta = phi * i
      return {
        position: [Math.cos(theta) * r * radius, y * radius, Math.sin(theta) * r * radius],
      }
    }
  },

  /** Scattered on a plane, with jitter so it does not read as a grid. */
  scatterPlane(width: number, depth: number, jitterScale = 0.4) {
    return (): InstanceTransform => ({
      position: [(Math.random() - 0.5) * width, 0, (Math.random() - 0.5) * depth],
      rotation: [0, Math.random() * Math.PI * 2, 0],
      scale: 1 - Math.random() * jitterScale,
    })
  },

  /**
   * Grid with per-cell jitter. `jitter` of 0.35 is the sweet spot: still legible as a grid,
   * no longer mechanical. 0 gives a hard grid, which is a legitimate graphic choice.
   */
  jitteredGrid(cols: number, rows: number, spacing: number, jitter = 0.35) {
    return (i: number): InstanceTransform => {
      const cx = i % cols
      const cz = Math.floor(i / cols) % rows
      return {
        position: [
          (cx - (cols - 1) / 2) * spacing + (Math.random() - 0.5) * spacing * jitter,
          0,
          (cz - (rows - 1) / 2) * spacing + (Math.random() - 0.5) * spacing * jitter,
        ],
        rotation: [0, Math.random() * Math.PI * 2, 0],
      }
    }
  },

  /** Along a curve — for anything that follows a path: lanterns, torii, streetlights. */
  alongCurve(curve: THREE.Curve<THREE.Vector3>, up = new THREE.Vector3(0, 1, 0)) {
    const pos = new THREE.Vector3()
    const tangent = new THREE.Vector3()
    const quat = new THREE.Quaternion()
    const m = new THREE.Matrix4()
    return (i: number, count: number): InstanceTransform => {
      const t = count > 1 ? i / (count - 1) : 0
      curve.getPointAt(t, pos)
      curve.getTangentAt(t, tangent)
      // lookAt on a matrix, then decompose: aligning a quaternion to a tangent by hand is
      // where sign errors live.
      m.lookAt(new THREE.Vector3(0, 0, 0), tangent, up)
      quat.setFromRotationMatrix(m)
      return {
        position: [pos.x, pos.y, pos.z],
        quaternion: quat.clone(),
      }
    }
  },
}
