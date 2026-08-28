/**
 * The scene manager.
 *
 * Turns a manifest array into a running site: resolves DOM sections, filters by quality tier,
 * assigns render layers, preloads assets, builds, then drives the lifecycle every frame.
 *
 * The lifecycle contract, in the order it happens:
 *
 *   register  manifest order decides layer + scroll order. No other coupling.
 *   filter    def.quality below the current tier -> the scene never exists. Not hidden: absent.
 *   acquire   def.assets refcounted up. Shared assets load once.
 *   build     once. Create geometry, materials, DOM. May be async.
 *   enter     weight crossed 0.001 upward. Start audio, play video, reset a timeline.
 *   update    every frame while weight > 0.001. Mutate. Never allocate, never setState.
 *   render    only for canvas2d / video / viewport scenes. `three` scenes are drawn in bulk.
 *   exit      weight crossed 0.001 downward. Pause audio, stop video.
 *   dispose   teardown or quality demotion. Free every GPU handle.
 *
 * A scene that is built but has weight 0 costs one number comparison per frame. That is the
 * point of the threshold: you can ship twelve scenes and pay for the two on screen.
 */
import * as THREE from 'three'
import { state } from './state'
import { addStage } from './loop'
import { renderScissor, resetViewport } from './renderer'
import { initWeights, ACTIVE_THRESHOLD, dominant } from './weights'
import type { Stage3D } from './renderer'
import type { AssetRegistry } from './assets'
import type { Debug } from './debug'
import type { QualityTier, SceneDefinition, SceneInstance } from './types'

const ORDER: Record<QualityTier, number> = { low: 0, medium: 1, high: 2 }

export interface SceneManager {
  instances: SceneInstance[]
  /** Swap the main render call — modules/post.ts uses this to insert the EffectComposer. */
  setMainRender: (fn: (() => void) | null) => void
  dispose: () => void
}

export interface ManagerOptions {
  stage: Stage3D
  assets: AssetRegistry
  debug: Debug
  manifest: SceneDefinition[]
  /** Force a single scene (?scene=03). Everything else is skipped. */
  only?: string | null
  /**
   * Array to populate, rather than allocate. boot() passes the same array it already gave to
   * the debug pane, so the pane's bindings and this manager see one shared list.
   */
  instances?: SceneInstance[]
}

export async function createSceneManager(opts: ManagerOptions): Promise<SceneManager> {
  const { stage, assets, debug, manifest } = opts
  const instances: SceneInstance[] = opts.instances ?? []
  instances.length = 0

  /* ------------------------------------------------------------ 1. register */
  for (const def of manifest) {
    if (def.quality && ORDER[state.quality] < ORDER[def.quality]) {
      debug.log(`skip "${def.id}" — needs quality >= ${def.quality}, have ${state.quality}`)
      continue
    }
    if (opts.only && def.id !== opts.only) continue

    const section = document.querySelector<HTMLElement>(def.section)
    if (!section) {
      // A missing section is a content error, not a code error — the CMS dropped a block, or
      // a selector typo. Warn loudly and carry on rather than taking the whole site down.
      console.warn(
        `[scenes] "${def.id}" wants section "${def.section}" which is not in the DOM. Skipped.`,
      )
      continue
    }

    const viewportEl = def.viewport
      ? document.querySelector<HTMLElement>(def.viewport.selector)
      : null
    if (def.viewport && !viewportEl) {
      console.warn(`[scenes] "${def.id}" viewport "${def.viewport.selector}" not found. Skipped.`)
      continue
    }

    const isPrivate = !!def.viewport
    const privateScene = isPrivate ? new THREE.Scene() : null
    const privateCamera = isPrivate
      ? new THREE.PerspectiveCamera(
          def.waypoint?.landscape.fov ?? 35,
          viewportEl ? viewportEl.clientWidth / Math.max(1, viewportEl.clientHeight) : 1,
          0.1,
          200,
        )
      : null

    instances.push({
      def,
      in: 0,
      out: 0,
      weight: 0,
      built: false,
      active: false,
      rect: { top: 0, height: 0 },
      section,
      el: null,
      ctx: null,
      privateScene,
      privateCamera,
      viewportEl,
    })
  }

  /* ---------------------------------------------------- 2. acquire + 3. build */
  const allKeys = [...new Set(instances.flatMap((i) => i.def.assets ?? []))]
  assets.setBudget(allKeys)

  let layerIndex = 1
  for (const inst of instances) {
    const def = inst.def

    for (const key of def.assets ?? []) {
      await assets.acquire(key, state.quality)
    }

    // canvas2d / video / dom scenes get a root element inside their section.
    let el: HTMLElement | null = null
    if (def.renderer !== 'three' && def.renderer !== 'none') {
      el = inst.section!.querySelector<HTMLElement>('[data-scene-root]') ?? inst.section
    }
    inst.el = el

    inst.ctx = {
      world: inst.privateScene ?? stage.world,
      camera: inst.privateCamera ?? stage.camera,
      parallax: stage.parallax,
      renderer: stage.renderer,
      assets,
      state,
      debug: def.renderer === 'none' ? debug : debug.folder(def.id),
      layer: layerIndex++,
      el,
      frame: { weight: 0, local: 0, in: 0, out: 0 },
    }

    try {
      await def.build(inst.ctx)
      inst.built = true
    } catch (err) {
      // One broken scene must not blank the whole site. Mark it unbuilt so update/render
      // skip it, and surface the error — silently swallowing this is how you ship a hole.
      console.error(`[scenes] "${def.id}" failed to build:`, err)
      inst.built = false
    }
  }

  /* ------------------------------------------------------- 4. weights + edges */
  const offWeights = initWeights(instances, (inst, entering, dir) => {
    if (!inst.built) return
    if (entering) inst.def.enter?.(dir, inst.ctx!)
    else inst.def.exit?.(dir, inst.ctx!)
  })

  /* --------------------------------------------------------------- 5. update */
  addStage({
    order: 60,
    name: 'scenes',
    after: ['camera'],
    fn: () => {
      for (let i = 0; i < instances.length; i++) {
        const inst = instances[i]
        if (!inst.built || inst.weight <= ACTIVE_THRESHOLD) continue
        inst.def.update?.(inst.weight, inst.ctx!)
      }
    },
  })

  /* --------------------------------------------------------------- 6. render */
  let mainRender: (() => void) | null = null

  addStage({
    order: 980,
    name: 'render',
    after: ['scenes'],
    fn: () => {
      const { renderer, world, camera } = stage

      // One draw call sweep for every `three` scene — they all live in the shared world, so
      // there is nothing to iterate. This is the payoff of the single-context rule.
      if (mainRender) mainRender()
      else renderer.render(world, camera)

      // Then anything that owns its own pixels.
      for (let i = 0; i < instances.length; i++) {
        const inst = instances[i]
        if (!inst.built || inst.weight <= ACTIVE_THRESHOLD) continue
        const def = inst.def

        if (inst.privateScene && inst.viewportEl) {
          const cam = inst.privateCamera!
          const w = inst.viewportEl.clientWidth
          const h = Math.max(1, inst.viewportEl.clientHeight)
          if (Math.abs(cam.aspect - w / h) > 1e-4) {
            cam.aspect = w / h
            cam.updateProjectionMatrix()
          }
          renderScissor(renderer, inst.privateScene, cam, inst.viewportEl, {
            clearDepth: def.viewport?.clearDepth ?? true,
          })
        }

        def.render?.(inst.weight, inst.ctx!)
      }

      resetViewport(renderer)
    },
  })

  /* ------------------------------------------------ 7. active-scene attribute */
  addStage({
    order: 900,
    name: 'scene-attr',
    after: ['scenes'],
    fn: () => {
      const best = dominant(instances)
      const id = best?.def.id ?? ''
      const root = document.documentElement
      if (root.dataset.activeScene !== id) root.dataset.activeScene = id
    },
  })

  return {
    instances,
    setMainRender(fn) {
      mainRender = fn
    },
    dispose() {
      offWeights()
      for (const inst of instances) {
        if (inst.built) {
          try {
            inst.def.dispose()
          } catch (err) {
            console.error(`[scenes] "${inst.def.id}" dispose() threw:`, err)
          }
        }
        for (const key of inst.def.assets ?? []) assets.release(key, 'dispose')
        inst.privateScene?.clear()
        inst.built = false
      }
      instances.length = 0
    },
  }
}
