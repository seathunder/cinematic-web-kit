/**
 * Debug layer. Entirely driven by URL flags so it ships to production harmlessly and you can
 * diagnose a client's "it looks broken on my laptop" by sending them a link.
 *
 *   ?debug          panel + stats + console handle
 *   ?scene=03       jump to that scene and lock the camera to its waypoint
 *   ?quality=low    force a tier (tests the demotion path without a slow device)
 *   ?nomotion       simulate prefers-reduced-motion
 *   ?wireframe      wireframe every material
 *   ?axes           world axes helper
 *   ?waypoints      draw every scene's camera waypoint as a marker
 *   ?stats          stats only, no panel
 *
 * Tweakpane and stats-gl are imported dynamically, so a production visitor without ?debug
 * never downloads them. Check the network tab: they must not appear in the initial bundle.
 */
import * as THREE from 'three'
import { state } from './state'
import { addStage } from './loop'
import type { SceneInstance, QualityTier } from './types'

export interface DebugFlags {
  enabled: boolean
  stats: boolean
  scene: string | null
  quality: QualityTier | null
  nomotion: boolean
  wireframe: boolean
  axes: boolean
  waypoints: boolean
}

export function readFlags(search = location.search): DebugFlags {
  const q = new URLSearchParams(search)
  const has = (k: string) => q.has(k) && q.get(k) !== 'false' && q.get(k) !== '0'
  const quality = q.get('quality')
  return {
    enabled: has('debug'),
    stats: has('debug') || has('stats'),
    scene: q.get('scene'),
    quality:
      quality === 'low' || quality === 'medium' || quality === 'high' ? (quality as QualityTier) : null,
    nomotion: has('nomotion'),
    wireframe: has('wireframe'),
    axes: has('axes'),
    waypoints: has('waypoints'),
  }
}

export interface Debug {
  flags: DebugFlags
  /** Add a numeric control. No-op unless ?debug. Returns a disposer. */
  slider(
    label: string,
    obj: Record<string, unknown>,
    key: string,
    opts?: { min?: number; max?: number; step?: number },
  ): () => void
  /** Add a colour control bound to a THREE.Color. */
  color(label: string, obj: Record<string, unknown>, key: string): () => void
  /** Add a checkbox or button. */
  toggle(label: string, obj: Record<string, unknown>, key: string): () => void
  button(label: string, fn: () => void): () => void
  /** Live read-only readout, refreshed each frame. */
  monitor(label: string, read: () => number | string): () => void
  /** A named folder so each scene's controls stay together. */
  folder(name: string): Debug
  /**
   * Add one live weight readout per scene. Called by boot() after the manager has populated
   * the instance array — at createDebug() time the list is still empty.
   */
  bindScenes(instances: SceneInstance[]): void
  log(...args: unknown[]): void
  dispose(): void
}

/** Used when ?debug is absent. Every method is a no-op, so scenes need no branching. */
function nullDebug(flags: DebugFlags): Debug {
  const noop = () => () => {}
  const d: Debug = {
    flags,
    slider: noop as Debug['slider'],
    color: noop as Debug['color'],
    toggle: noop as Debug['toggle'],
    button: noop as Debug['button'],
    monitor: noop as Debug['monitor'],
    folder: () => d,
    bindScenes: () => {},
    log: () => {},
    dispose: () => {},
  }
  return d
}

export async function createDebug(
  flags: DebugFlags,
  renderer: THREE.WebGLRenderer,
  world: THREE.Scene,
  instances: SceneInstance[],
): Promise<Debug> {
  if (!flags.enabled && !flags.stats) return nullDebug(flags)

  /* --------------------------------------------------------------- stats-gl */
  if (flags.stats) {
    const { default: Stats } = await import('stats-gl')
    const stats = new Stats({ trackGPU: true, trackHz: true })
    // init() patches renderer.render, so begin/end are handled for us.
    await stats.init(renderer)
    stats.dom.style.cssText = 'position:fixed;top:0;left:0;z-index:9999'
    document.body.appendChild(stats.dom)
  }

  if (!flags.enabled) return nullDebug(flags)

  /* -------------------------------------------------------------- tweakpane */
  const { Pane } = await import('tweakpane')
  const pane = new Pane({ title: 'cinematic-web', expanded: true })
  const el = (pane as unknown as { element: HTMLElement }).element
  el.parentElement!.style.cssText = 'position:fixed;top:8px;right:8px;z-index:9999;width:300px'

  const monitors: { read: () => number | string; set: (v: number | string) => void }[] = []

  addStage({
    order: 999,
    name: 'debug-monitors',
    fn: () => {
      for (const m of monitors) m.set(m.read())
    },
  })

  /* ------------------------------------------------------------- kernel info */
  const info = pane.addFolder({ title: 'kernel', expanded: true })
  const readout = {
    fps: 0,
    quality: state.quality,
    progress: 0,
    scene: '—',
    geometries: 0,
    textures: 0,
    calls: 0,
  }
  info.addBinding(readout, 'fps', { readonly: true, format: (v: number) => v.toFixed(0) })
  info.addBinding(readout, 'quality', { readonly: true })
  info.addBinding(readout, 'progress', { readonly: true, format: (v: number) => v.toFixed(3) })
  info.addBinding(readout, 'scene', { readonly: true })
  info.addBinding(readout, 'geometries', { readonly: true, format: (v: number) => v.toFixed(0) })
  info.addBinding(readout, 'textures', { readonly: true, format: (v: number) => v.toFixed(0) })
  info.addBinding(readout, 'calls', { readonly: true, format: (v: number) => v.toFixed(0) })

  addStage({
    order: 998,
    name: 'debug-readout',
    fn: (delta) => {
      readout.fps = 1 / Math.max(delta, 1e-6)
      readout.quality = state.quality
      readout.progress = state.progress.current
      readout.geometries = renderer.info.memory.geometries
      readout.textures = renderer.info.memory.textures
      readout.calls = renderer.info.render.calls
      let best = '—'
      let bw = 0.001
      for (const i of instances) {
        if (i.weight > bw) {
          bw = i.weight
          best = `${i.def.id} ${i.weight.toFixed(2)}`
        }
      }
      readout.scene = best
    },
  })

  /* ------------------------------------------------------------ scene weights */
  const weightsFolder = pane.addFolder({ title: 'weights', expanded: false })
  let scenesBound = false

  const bindScenes = (list: SceneInstance[]) => {
    if (scenesBound) return
    scenesBound = true
    for (const inst of list) {
      const proxy = { w: 0 }
      weightsFolder.addBinding(proxy, 'w', {
        readonly: true,
        label: inst.def.id,
        min: 0,
        max: 1,
        format: (v: number) => v.toFixed(2),
      })
      monitors.push({ read: () => inst.weight, set: (v) => (proxy.w = v as number) })
    }
  }

  /* ---------------------------------------------------------------- helpers */
  // These run inside bindScenes, not here: at createDebug() time the scenes have not been
  // built yet, so `world` is empty and traversing it would find nothing to wireframe.
  if (flags.axes) world.add(new THREE.AxesHelper(5))

  const applyHelpers = (list: SceneInstance[]) => {
    if (flags.wireframe) {
      world.traverse((o) => {
        const m = (o as THREE.Mesh).material
        if (!m) return
        for (const mat of Array.isArray(m) ? m : [m]) {
          ;(mat as THREE.MeshBasicMaterial).wireframe = true
        }
      })
    }

    if (flags.waypoints) {
      const group = new THREE.Group()
      group.name = 'debug-waypoints'
      for (const inst of list) {
        const wp = inst.def.waypoint?.landscape
        if (!wp) continue
        const marker = new THREE.Mesh(
          new THREE.SphereGeometry(0.08, 8, 8),
          new THREE.MeshBasicMaterial({ color: 0x00ff88 }),
        )
        marker.position.set(...wp.position)
        const line = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(...wp.position),
            new THREE.Vector3(...wp.focus),
          ]),
          new THREE.LineBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.4 }),
        )
        group.add(marker, line)
      }
      world.add(group)
    }
  }

  const mk = (target: { addFolder: (o: { title: string }) => unknown }): Debug => {
    const self = target as unknown as {
      addBinding: (o: object, k: string, p?: object) => { dispose: () => void }
      addButton: (o: { title: string }) => { on: (e: string, f: () => void) => void; dispose: () => void }
      addFolder: (o: { title: string; expanded?: boolean }) => unknown
    }
    const d: Debug = {
      flags,
      slider(label, obj, key, o = {}) {
        const b = self.addBinding(obj, key, {
          label,
          min: o.min ?? 0,
          max: o.max ?? 1,
          step: o.step,
        })
        return () => b.dispose()
      },
      color(label, obj, key) {
        const b = self.addBinding(obj, key, { label, color: { type: 'float' } })
        return () => b.dispose()
      },
      toggle(label, obj, key) {
        const b = self.addBinding(obj, key, { label })
        return () => b.dispose()
      },
      button(label, fn) {
        const b = self.addButton({ title: label })
        b.on('click', fn)
        return () => b.dispose()
      },
      monitor(label, read) {
        const proxy = { v: read() }
        const b = self.addBinding(proxy, 'v', { readonly: true, label })
        monitors.push({ read, set: (v) => (proxy.v = v) })
        return () => b.dispose()
      },
      folder(name) {
        return mk(self.addFolder({ title: name, expanded: false }) as never)
      },
      bindScenes(list) {
        bindScenes(list)
        applyHelpers(list)
      },
      log: (...args) => console.log('[cw]', ...args),
      dispose: () => pane.dispose(),
    }
    return d
  }

  const debug = mk(pane as never)

  // Console handle. `cw.state`, `cw.instances`, `cw.waypoint()` from devtools.
  ;(window as unknown as Record<string, unknown>).cw = {
    state,
    instances,
    renderer,
    world,
    pane,
    debug,
  }

  return debug
}
