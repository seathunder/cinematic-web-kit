/**
 * The single WebGLRenderer.
 *
 * One context for the whole site. Not one per scene, not one per component. A browser gives
 * you roughly 8–16 live WebGL contexts and silently kills the oldest when you exceed it, so
 * "a canvas per section" is a pattern that works in development and fails on the client's
 * phone. Multiple visually independent scenes are done with scissor rects (see renderScissor)
 * or with render layers — both inside this one context.
 */
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { state } from './state'
import { onReflow } from './viewport'

export interface RendererOptions {
  canvas?: HTMLCanvasElement
  alpha?: boolean
  antialias?: boolean
  /** Background clear colour. Ignored when alpha is true. */
  clearColor?: THREE.ColorRepresentation
  /** 'aces' is right for anything with lights or bloom. 'none' for flat/graphic looks. */
  tone?: 'aces' | 'agx' | 'neutral' | 'none'
  exposure?: number
  shadows?: boolean
}

export interface Stage3D {
  renderer: THREE.WebGLRenderer
  world: THREE.Scene
  camera: THREE.PerspectiveCamera
  /** Pointer parallax lives here. The camera is a child, so scroll and pointer can't fight. */
  parallax: THREE.Group
  envTexture: THREE.Texture | null
  resize: () => void
  dispose: () => void
}

export function createStage(opts: RendererOptions = {}): Stage3D {
  const canvas = opts.canvas ?? document.createElement('canvas')
  if (!opts.canvas) {
    canvas.className = 'cw-canvas'
    document.body.appendChild(canvas)
  }

  const antialias = opts.antialias ?? state.quality === 'high'

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: opts.alpha ?? false,
    antialias,
    // Needed only if you screenshot the canvas or composite it into another canvas.
    preserveDrawingBuffer: false,
    powerPreference: 'high-performance',
    // Depth precision matters for large scenes; stencil almost never does.
    stencil: false,
    depth: true,
  })

  renderer.setPixelRatio(state.viewport.dpr)
  renderer.setSize(state.viewport.width, state.viewport.height, false)

  renderer.toneMapping =
    opts.tone === 'none'
      ? THREE.NoToneMapping
      : opts.tone === 'agx'
        ? THREE.AgXToneMapping
        : opts.tone === 'neutral'
          ? THREE.NeutralToneMapping
          : THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = opts.exposure ?? 1
  renderer.outputColorSpace = THREE.SRGBColorSpace

  if (opts.shadows && state.quality !== 'low') {
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
  }

  if (!opts.alpha && opts.clearColor !== undefined) {
    renderer.setClearColor(new THREE.Color(opts.clearColor), 1)
  }

  const world = new THREE.Scene()

  const camera = new THREE.PerspectiveCamera(35, state.viewport.aspect, 0.1, 200)

  /**
   * The separation that stops the two most common camera bugs.
   *
   * Scroll writes camera.position (inside the group). Pointer writes parallax.rotation and
   * parallax.position (the group itself). Because they write to different objects, they can
   * never overwrite each other, and you never need to compose them by hand.
   */
  const parallax = new THREE.Group()
  parallax.name = 'parallax'
  parallax.add(camera)
  world.add(parallax)

  // Image-based lighting with no HDRI download. RoomEnvironment is a procedural studio box:
  // ~4KB of code instead of a 3MB .hdr, and it makes MeshStandardMaterial look correct
  // immediately instead of flat grey. Swap in a real HDRI later if the art direction needs it.
  const pmrem = new THREE.PMREMGenerator(renderer)
  pmrem.compileEquirectangularShader()
  const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  world.environment = envTexture
  pmrem.dispose()

  const resize = () => {
    const { width, height, dpr, aspect } = state.viewport
    renderer.setPixelRatio(dpr)
    renderer.setSize(width, height, false)
    camera.aspect = aspect
    camera.updateProjectionMatrix()
  }

  const offReflow = onReflow(resize)

  const onContextLost = (e: Event) => {
    e.preventDefault()
    console.error(
      '[renderer] WebGL context lost. Almost always VRAM exhaustion — check dispose() on ' +
        'every scene, and run `cw audit` on the built site.',
    )
  }
  canvas.addEventListener('webglcontextlost', onContextLost)

  return {
    renderer,
    world,
    camera,
    parallax,
    envTexture,
    resize,
    dispose() {
      offReflow()
      canvas.removeEventListener('webglcontextlost', onContextLost)
      envTexture?.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      canvas.remove()
    },
  }
}

/* -------------------------------------------------------- shader precompile */

/**
 * Compile every shader variant during the preloader instead of during the reveal.
 *
 * Three compiles a program the first time a material is actually rendered. If a scene at 40%
 * scroll uses a material nothing has drawn yet, the user gets a 50–300ms freeze exactly when
 * the camera starts moving. That single stutter is the difference between "premium" and
 * "unfinished", and it is the most common flaw in otherwise good WebGL sites.
 *
 * The trick: temporarily force everything visible and unculled so the compiler sees it all,
 * compile, then restore. Do this while the preloader is still on screen.
 */
export async function compileAll(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
): Promise<void> {
  const restore: { obj: THREE.Object3D; visible: boolean; culled: boolean }[] = []

  scene.traverse((obj) => {
    restore.push({ obj, visible: obj.visible, culled: obj.frustumCulled })
    obj.visible = true
    obj.frustumCulled = false
  })

  try {
    // compileAsync yields to the event loop between programs, so the preloader keeps animating.
    if (typeof renderer.compileAsync === 'function') {
      await renderer.compileAsync(scene, camera)
    } else {
      renderer.compile(scene, camera)
    }
  } finally {
    for (const r of restore) {
      r.obj.visible = r.visible
      r.obj.frustumCulled = r.culled
    }
  }
}

/* --------------------------------------------------- scissor / viewport draw */

const _rect = { left: 0, top: 0, width: 0, height: 0 }

/**
 * Draw a scene into the rectangle of a DOM element, inside the shared canvas.
 *
 * This is how you get a product viewer with its own camera and lighting sitting in the middle
 * of a text column, without a second WebGL context. The scissor test clips drawing to the rect;
 * autoClear off means we don't wipe what the main pass already drew.
 *
 * `clearDepth: true` when the inset should ignore the main scene's depth buffer (usually yes).
 */
export function renderScissor(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  el: HTMLElement,
  opts: { clearDepth?: boolean; layer?: number } = {},
): void {
  const r = el.getBoundingClientRect()
  // Fully offscreen — skip the draw entirely rather than scissoring to nothing.
  if (r.bottom < 0 || r.top > state.viewport.height) return

  _rect.left = r.left
  _rect.width = r.width
  _rect.height = r.height
  // WebGL's origin is bottom-left; the DOM's is top-left.
  _rect.top = state.viewport.height - r.bottom

  renderer.autoClear = false
  renderer.setScissor(_rect.left, _rect.top, _rect.width, _rect.height)
  renderer.setViewport(_rect.left, _rect.top, _rect.width, _rect.height)
  renderer.setScissorTest(true)
  if (opts.layer !== undefined && (camera as THREE.PerspectiveCamera).layers) {
    camera.layers.set(opts.layer)
  }
  if (opts.clearDepth) renderer.clearDepth()
  renderer.render(scene, camera)
  renderer.setScissorTest(false)
  renderer.autoClear = true
}

/** Restore full-canvas drawing after any number of renderScissor calls. */
export function resetViewport(renderer: THREE.WebGLRenderer): void {
  const { width, height } = state.viewport
  renderer.setViewport(0, 0, width, height)
  renderer.setScissor(0, 0, width, height)
  renderer.setScissorTest(false)
  renderer.autoClear = true
}
