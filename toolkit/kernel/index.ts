/**
 * boot() — the only function a project's main.ts calls.
 *
 * The order below is the whole reason this file exists. Each step depends on the one above it,
 * and the loop's `after:` assertions will throw at startup if you reorder them. That is
 * deliberate: an ordering mistake here produces a one-frame lag that looks like an easing bug
 * and takes hours to find, so it is better as a hard error on line one.
 */
import * as THREE from 'three'
import { state, snap } from './state'
import { addStage, startLoop, stopLoop, bindVisibility, listStages } from './loop'
import { initViewport, measureViewport, requestReflow } from './viewport'
import { initScroll, initPointer, ScrollTrigger } from './scroll'
import { createStage, compileAll } from './renderer'
import { AssetRegistry } from './assets'
import { createSceneManager } from './stage'
import { detectQuality, createWatchdog, budget } from './quality'
import { readFlags, createDebug } from './debug'
import type { RendererOptions } from './renderer'
import type { CameraOptions } from './camera'
import { createCameraRig, initCamera, printWaypoint } from './camera'
import type { SceneDefinition, SceneInstance } from './types'
import type { AssetSpec } from './assets'

export interface BootOptions {
  manifest: SceneDefinition[]
  assets?: AssetSpec[]
  renderer?: RendererOptions
  camera?: CameraOptions
  scroll?: Parameters<typeof initScroll>[0]
  /** Called with 0..1 while assets load. Wire your preloader here. */
  onProgress?: (p: number) => void
  /** Called once everything is built and shaders are compiled, before the first frame. */
  onReady?: () => void | Promise<void>
  /** Paths to the decoder files in /public. Run `cw decoders` to copy them there. */
  decoders?: { dracoPath?: string; basisPath?: string }
}

export interface App {
  stage: ReturnType<typeof createStage>
  assets: AssetRegistry
  scenes: Awaited<ReturnType<typeof createSceneManager>>
  camera: ReturnType<typeof createCameraRig>
  debug: Awaited<ReturnType<typeof createDebug>>
  destroy: () => void
}

export async function boot(opts: BootOptions): Promise<App> {
  const flags = readFlags()

  /* 0. quality + accessibility, before anything allocates GPU memory ---------- */
  state.quality = flags.quality ?? detectQuality()
  if (flags.nomotion) state.reducedMotion = true

  /* 1. state damping — every other stage declares after:['state'] ------------- */
  addStage({
    order: 10,
    name: 'state',
    after: ['time'],
    fn: (delta) => {
      // Inlined rather than imported to keep state.ts free of a loop.ts import (cycle).
      const s = state
      for (const d of [s.progress, s.velocity, s.pointerX, s.pointerY]) {
        const f = 1 - Math.pow(1 - d.ease, delta * 60)
        d.current += (d.target - d.current) * f
      }
    },
  })

  /* 2. viewport — must exist before the renderer sizes itself ----------------- */
  measureViewport()
  const offViewport = initViewport()

  /* 3. renderer + shared world ------------------------------------------------ */
  const b = budget()
  const stage = createStage({
    antialias: b.antialias,
    shadows: b.shadows,
    ...opts.renderer,
  })

  /* 4. scroll — owns the scroll position; ScrollTrigger only listens ---------- */
  const offScroll = initScroll(opts.scroll)
  const offPointer = initPointer()

  /* 5. assets ----------------------------------------------------------------- */
  const assets = new AssetRegistry(stage.renderer, opts.decoders)
  if (opts.assets) assets.register(opts.assets)
  if (opts.onProgress) assets.onProgress((p) => opts.onProgress!(p))

  /* 6. debug + scenes --------------------------------------------------------- */
  // The pane needs the instance list and the manager needs the pane, so the array is created
  // here and handed to both. The manager fills it in place; the pane reads it every frame.
  const instances: SceneInstance[] = []
  const debug = await createDebug(flags, stage.renderer, stage.world, instances)

  const scenes = await createSceneManager({
    stage,
    assets,
    debug,
    manifest: opts.manifest,
    only: flags.scene,
    instances,
  })

  /* 7. camera — reads scene weights, so it registers after them --------------- */
  const rig = createCameraRig(stage.camera, stage.parallax, scenes.instances, opts.camera)
  initCamera(rig)

  // Now that scenes exist, give the debug pane its per-scene weight readouts and helpers.
  debug.bindScenes(scenes.instances)

  /* 8. quality watchdog ------------------------------------------------------- */
  const watchdog = createWatchdog((tier) => {
    const nb = budget()
    stage.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, nb.dpr))
    stage.renderer.shadowMap.enabled = nb.shadows
    document.documentElement.dataset.quality = tier
    requestReflow()
  })
  addStage({ order: 995, name: 'watchdog', fn: (delta) => watchdog(delta) })

  /* 9. compile every shader while the preloader is still up ------------------- */
  requestReflow()
  await compileAll(stage.renderer, stage.world, stage.camera)

  /* 10. first pose, then reveal ---------------------------------------------- */
  rig.snapToTargets()
  snap(state.progress, state.scroll.value / Math.max(1, state.scroll.max))
  document.documentElement.dataset.quality = state.quality
  document.documentElement.dataset.ready = 'true'

  await opts.onReady?.()

  const offVisibility = bindVisibility()
  startLoop()
  ScrollTrigger.refresh()

  if (flags.enabled) {
    console.log('[cw] stages:', listStages())
    ;(window as unknown as Record<string, unknown>).cwWaypoint = () =>
      printWaypoint(stage.camera, rig.targetFocus)
  }

  return {
    stage,
    assets,
    scenes,
    camera: rig,
    debug,
    destroy() {
      stopLoop()
      offVisibility()
      scenes.dispose()
      assets.disposeAll()
      offPointer()
      offScroll()
      offViewport()
      stage.dispose()
      debug.dispose()
      ScrollTrigger.getAll().forEach((t) => t.kill())
      delete document.documentElement.dataset.ready
    },
  }
}

/* ------------------------------------------------------------------- surface */
// Everything a scene or a project file is expected to import.
export * from './types'
export * from './state'
export { addStage, removeStage, setStageEnabled, listStages, startLoop, stopLoop } from './loop'
export { measure, requestReflow, onReflow } from './viewport'
export { scrollTo, lenis, gsap, ScrollTrigger } from './scroll'
export { createStage, compileAll, renderScissor, resetViewport } from './renderer'
export { AssetRegistry, loadVideo } from './assets'
export { disposeObject, disposeMaterial, gpuInfo, leakWatch } from './dispose'
export { budget, BUDGETS, detectQuality } from './quality'
export { readFlags } from './debug'
export { ACTIVE_THRESHOLD, dominant } from './weights'
export { printWaypoint } from './camera'
export { THREE }
