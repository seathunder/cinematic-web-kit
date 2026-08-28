/**
 * VRAM disposal.
 *
 * The JavaScript garbage collector has no jurisdiction over GPU memory. Dropping the last
 * reference to a Mesh frees ~200 bytes of JS object and leaves the vertex buffer and every
 * texture resident in VRAM forever. Do that on a few scene transitions and the browser kills
 * the WebGL context to protect the system: black canvas, no error, forced reload. On a 3GB
 * Android phone that happens in under a minute.
 *
 * There is no automatic fix. Every geometry, material, texture and render target must have
 * .dispose() called explicitly. This file makes that one call.
 */
import * as THREE from 'three'

type Disposable = { dispose: () => void }

const isDisposable = (v: unknown): v is Disposable =>
  !!v && typeof (v as Disposable).dispose === 'function'

/** Every property on a material that can hold a texture. */
const TEXTURE_KEYS = [
  'map',
  'alphaMap',
  'aoMap',
  'bumpMap',
  'displacementMap',
  'emissiveMap',
  'envMap',
  'gradientMap',
  'lightMap',
  'metalnessMap',
  'normalMap',
  'roughnessMap',
  'specularMap',
  'clearcoatMap',
  'clearcoatNormalMap',
  'clearcoatRoughnessMap',
  'iridescenceMap',
  'iridescenceThicknessMap',
  'sheenColorMap',
  'sheenRoughnessMap',
  'specularColorMap',
  'specularIntensityMap',
  'thicknessMap',
  'transmissionMap',
  'anisotropyMap',
  'matcap',
] as const

export function disposeMaterial(material: THREE.Material): void {
  const m = material as unknown as Record<string, unknown>

  for (const key of TEXTURE_KEYS) {
    const tex = m[key]
    if (tex instanceof THREE.Texture) tex.dispose()
  }

  // ShaderMaterial uniforms hold textures and render targets that no key list will find.
  const uniforms = m.uniforms as Record<string, { value: unknown }> | undefined
  if (uniforms) {
    for (const name in uniforms) {
      const v = uniforms[name]?.value
      if (v instanceof THREE.Texture) v.dispose()
      else if (v instanceof THREE.WebGLRenderTarget) v.dispose()
      else if (Array.isArray(v)) {
        for (const item of v) if (item instanceof THREE.Texture) item.dispose()
      }
    }
  }

  material.dispose()
}

/**
 * Recursively free everything under `root`, then detach it from its parent.
 *
 * Safe to call twice. Geometries and materials shared between meshes are disposed once —
 * that matters, because three throws no error on double-dispose but does silently break the
 * other mesh still using the buffer.
 */
export function disposeObject(root: THREE.Object3D, opts: { detach?: boolean } = {}): void {
  const geometries = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>()

  root.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (mesh.geometry) geometries.add(mesh.geometry)
    if (mesh.material) {
      if (Array.isArray(mesh.material)) for (const m of mesh.material) materials.add(m)
      else materials.add(mesh.material)
    }
    // Lights, cameras and helpers own GPU resources too (shadow maps in particular).
    const light = child as THREE.Light & { shadow?: { map?: THREE.WebGLRenderTarget } }
    if (light.shadow?.map) {
      light.shadow.map.dispose()
      light.shadow.map = undefined
    }
    if (isDisposable(child) && !(child as unknown as THREE.Mesh).geometry) {
      // Covers things like Sky, Water, custom Object3D subclasses with their own dispose().
      ;(child as unknown as Disposable).dispose()
    }
  })

  for (const g of geometries) g.dispose()
  for (const m of materials) disposeMaterial(m)

  if (opts.detach !== false) root.removeFromParent()
  root.clear()
}

/**
 * Snapshot of what the GPU is actually holding. Log it on scene transitions during
 * development: if `textures` or `geometries` climbs and never comes back down, you have a leak.
 * This is a 30-second check that prevents the single worst class of bug in this stack.
 */
export function gpuInfo(renderer: THREE.WebGLRenderer): {
  geometries: number
  textures: number
  programs: number
  calls: number
  triangles: number
} {
  return {
    geometries: renderer.info.memory.geometries,
    textures: renderer.info.memory.textures,
    programs: renderer.info.programs?.length ?? 0,
    calls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
  }
}

/**
 * Development guard. Records the GPU counters at a point in time and warns if they have grown
 * past a threshold next time you check. Wire it to scene exit during development.
 */
export function leakWatch(renderer: THREE.WebGLRenderer, label: string, tolerance = 4) {
  const baseline = gpuInfo(renderer)
  return () => {
    const now = gpuInfo(renderer)
    const dg = now.geometries - baseline.geometries
    const dt = now.textures - baseline.textures
    if (dg > tolerance || dt > tolerance) {
      console.warn(
        `[leak] "${label}" left ${dg} geometries and ${dt} textures on the GPU. ` +
          `Check that its dispose() calls disposeObject() on everything it built.`,
      )
    }
    return { geometries: dg, textures: dt }
  }
}
