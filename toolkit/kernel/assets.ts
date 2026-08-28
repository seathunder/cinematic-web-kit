/**
 * Refcounted asset registry.
 *
 * Two scenes both need `models/city.glb`. Naively each loads it, so you pay the download and
 * the VRAM twice. Naively sharing it means whichever scene unmounts first disposes the buffer
 * out from under the other. A refcount fixes both.
 *
 * release() then has a real choice to make, and it is not always "dispose":
 *   dispose    -> free the VRAM. Right for a big scene the user has scrolled past for good.
 *   deactivate -> keep it resident, stop rendering it. Right for anything they might scroll
 *                 back to, because re-uploading a 40MB texture atlas stalls the main thread
 *                 for hundreds of milliseconds and drops a visible chunk of frames.
 * The rule of thumb: dispose if it cost more than ~15MB of VRAM and is behind a one-way
 * transition; deactivate otherwise.
 */
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { disposeObject } from './dispose'

export type AssetKind = 'gltf' | 'texture' | 'ktx2' | 'hdr' | 'video' | 'audio' | 'json'

export interface AssetSpec {
  key: string
  url: string
  kind: AssetKind
  /** Skip this asset entirely on low quality (e.g. a 4K normal map). */
  minQuality?: 'low' | 'medium' | 'high'
  /** Weight for the progress bar. Defaults to 1. Give the 20MB model a 10. */
  weight?: number
}

interface Entry {
  spec: AssetSpec
  value: unknown
  instances: number
  promise: Promise<unknown> | null
  active: boolean
}

export class AssetRegistry {
  private entries = new Map<string, Entry>()
  private gltfLoader: GLTFLoader
  private texLoader = new THREE.TextureLoader()
  private ktx2Loader: KTX2Loader | null = null
  private renderer: THREE.WebGLRenderer
  private loadedWeight = 0
  private totalWeight = 0
  private onProgressCb: ((p: number, key: string) => void) | null = null

  /**
   * `basisPath` and `dracoPath` must point at the decoder files copied into /public.
   * The toolkit's `cw assets --decoders` command copies them out of node_modules for you;
   * loading them from a CDN works but adds a third-party runtime dependency to a client site.
   */
  constructor(
    renderer: THREE.WebGLRenderer,
    opts: { dracoPath?: string; basisPath?: string } = {},
  ) {
    this.renderer = renderer
    this.gltfLoader = new GLTFLoader()

    const draco = new DRACOLoader()
    draco.setDecoderPath(opts.dracoPath ?? '/decoders/draco/')
    draco.setDecoderConfig({ type: 'js' })
    this.gltfLoader.setDRACOLoader(draco)

    this.ktx2Loader = new KTX2Loader()
      .setTranscoderPath(opts.basisPath ?? '/decoders/basis/')
      .detectSupport(renderer)
    this.gltfLoader.setKTX2Loader(this.ktx2Loader)

    // Meshopt is the compression gltfpack emits. Free, no external binary, and decodes
    // faster than Draco — worth supporting alongside it rather than picking one.
    this.gltfLoader.setMeshoptDecoder(MeshoptDecoder)
  }

  register(specs: AssetSpec[]): void {
    for (const spec of specs) {
      if (this.entries.has(spec.key)) continue
      this.entries.set(spec.key, {
        spec,
        value: null,
        instances: 0,
        promise: null,
        active: false,
      })
    }
  }

  onProgress(cb: (p: number, key: string) => void): void {
    this.onProgressCb = cb
  }

  has(key: string): boolean {
    return this.entries.has(key)
  }

  /** Synchronous read. Only valid after acquire() resolved for this key. */
  get<T = unknown>(key: string): T {
    const e = this.entries.get(key)
    if (!e) throw new Error(`[assets] unknown key "${key}". Register it in assets.ts.`)
    if (e.value === null) {
      throw new Error(`[assets] "${key}" read before it loaded. await ctx.assets.acquire() first.`)
    }
    return e.value as T
  }

  /**
   * Load if needed, bump the refcount, return the value.
   * Concurrent callers share one in-flight promise.
   */
  async acquire<T = unknown>(key: string, quality: 'low' | 'medium' | 'high' = 'high'): Promise<T | null> {
    const e = this.entries.get(key)
    if (!e) throw new Error(`[assets] unknown key "${key}"`)

    const need = e.spec.minQuality
    if (need && !meetsQuality(quality, need)) return null

    e.instances++
    e.active = true
    if (e.value !== null) return e.value as T
    if (e.promise) return (await e.promise) as T

    e.promise = this.load(e.spec)
    try {
      e.value = await e.promise
    } finally {
      e.promise = null
    }
    this.loadedWeight += e.spec.weight ?? 1
    this.onProgressCb?.(this.progress(), key)
    return e.value as T
  }

  /**
   * Drop a reference. When the last one goes, `mode` decides the fate of the GPU memory.
   * Nothing happens while other scenes still hold a reference.
   */
  release(key: string, mode: 'dispose' | 'deactivate' = 'deactivate'): void {
    const e = this.entries.get(key)
    if (!e) return
    e.instances = Math.max(0, e.instances - 1)
    if (e.instances > 0) return

    e.active = false
    if (mode === 'deactivate') return

    const v = e.value
    if (v && typeof v === 'object') {
      if ((v as GLTF).scene) disposeObject((v as GLTF).scene)
      else if (v instanceof THREE.Texture) v.dispose()
      else if (v instanceof HTMLVideoElement) {
        v.pause()
        v.removeAttribute('src')
        v.load()
      }
    }
    e.value = null
    this.loadedWeight = Math.max(0, this.loadedWeight - (e.spec.weight ?? 1))
  }

  /** 0..1 across everything registered. Feed this straight to the preloader. */
  progress(): number {
    if (this.totalWeight === 0) return 1
    return Math.min(1, this.loadedWeight / this.totalWeight)
  }

  /** Call before the preload pass so progress() has a denominator. */
  setBudget(keys: string[]): void {
    this.totalWeight = keys.reduce((sum, k) => sum + (this.entries.get(k)?.spec.weight ?? 1), 0)
    this.loadedWeight = 0
  }

  /** Every key currently held by at least one scene. Useful in the debug panel. */
  live(): { key: string; instances: number; active: boolean }[] {
    return [...this.entries.values()]
      .filter((e) => e.value !== null)
      .map((e) => ({ key: e.spec.key, instances: e.instances, active: e.active }))
  }

  disposeAll(): void {
    for (const key of this.entries.keys()) {
      const e = this.entries.get(key)!
      e.instances = 1
      this.release(key, 'dispose')
    }
    this.entries.clear()
    this.ktx2Loader?.dispose()
    this.ktx2Loader = null
  }

  private load(spec: AssetSpec): Promise<unknown> {
    switch (spec.kind) {
      case 'gltf':
        return new Promise((res, rej) =>
          this.gltfLoader.load(spec.url, (g) => res(g), undefined, rej),
        )
      case 'ktx2':
        if (!this.ktx2Loader) return Promise.reject(new Error('[assets] KTX2Loader disposed'))
        return this.ktx2Loader.loadAsync(spec.url)
      case 'texture':
        return this.texLoader.loadAsync(spec.url).then((t) => {
          t.colorSpace = THREE.SRGBColorSpace
          // Anisotropy is nearly free and fixes the blurry-at-grazing-angles look on floors.
          t.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy())
          return t
        })
      case 'hdr':
        // Lazy import: RGBELoader is only pulled into the bundle if a project uses an HDR.
        return import('three/examples/jsm/loaders/RGBELoader.js').then(({ RGBELoader }) =>
          new RGBELoader().loadAsync(spec.url).then((tex) => {
            tex.mapping = THREE.EquirectangularReflectionMapping
            return tex
          }),
        )
      case 'video':
        return loadVideo(spec.url)
      case 'audio':
        return fetch(spec.url).then((r) => r.arrayBuffer())
      case 'json':
        return fetch(spec.url).then((r) => r.json())
    }
  }
}

const ORDER = { low: 0, medium: 1, high: 2 } as const
const meetsQuality = (have: keyof typeof ORDER, need: keyof typeof ORDER) =>
  ORDER[have] >= ORDER[need]

/**
 * Video element ready for use as a texture or a scrub target.
 * `playsInline` and `muted` are both required for autoplay on iOS — without either, the
 * element silently refuses to start and you get a black plane with no console error.
 */
export function loadVideo(url: string, opts: { loop?: boolean } = {}): Promise<HTMLVideoElement> {
  return new Promise((res, rej) => {
    const v = document.createElement('video')
    v.src = url
    v.muted = true
    v.defaultMuted = true
    v.playsInline = true
    v.loop = opts.loop ?? false
    v.preload = 'auto'
    v.crossOrigin = 'anonymous'
    // Keeps it out of the layout and off the compositor while still decoding.
    v.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none'
    const ok = () => {
      cleanup()
      res(v)
    }
    const fail = () => {
      cleanup()
      rej(new Error(`[assets] video failed to load: ${url}`))
    }
    const cleanup = () => {
      v.removeEventListener('loadeddata', ok)
      v.removeEventListener('error', fail)
    }
    v.addEventListener('loadeddata', ok)
    v.addEventListener('error', fail)
    document.body.appendChild(v)
    v.load()
  })
}
