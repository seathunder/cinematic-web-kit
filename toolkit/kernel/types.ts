/**
 * Kernel contracts. Every scene in every project implements SceneDefinition.
 * Nothing else in the kernel may be imported by a scene except through SceneCtx.
 */
import type * as THREE from 'three'
import type { MotionState } from './state'
import type { AssetRegistry } from './assets'
import type { Debug } from './debug'

/** How a scene puts pixels on screen. Deliberately NOT "always three". */
export type RendererKind = 'three' | 'canvas2d' | 'video' | 'dom' | 'none'

export type QualityTier = 'low' | 'medium' | 'high'

export interface Waypoint {
  /** Camera position in world space. */
  position: [number, number, number]
  /** Point the camera looks at. */
  focus: [number, number, number]
  /** Vertical FOV in degrees. Averaged with the other active waypoints. */
  fov?: number
}

export interface WaypointSet {
  landscape: Waypoint
  /** Optional portrait override. Falls back to landscape when absent. */
  portrait?: Waypoint
}

/** Everything a scene is allowed to touch. Built once per scene and passed to build(). */
export interface SceneCtx {
  /** The single shared THREE.Scene. `three` scenes add their objects here. */
  world: THREE.Scene
  /** The single shared camera. Scenes must NEVER write to it — see camera.ts. */
  camera: THREE.PerspectiveCamera
  /** Group that carries pointer parallax. Add background layers here, not to world. */
  parallax: THREE.Group
  renderer: THREE.WebGLRenderer
  assets: AssetRegistry
  state: MotionState
  debug: Debug
  /** Unique render layer for this scene. Used by scissor viewports + selective bloom. */
  layer: number
  /** Root element for canvas2d / video / dom scenes. Null for `three` and `none`. */
  el: HTMLElement | null
  /**
   * This scene's own scroll numbers, rewritten every frame. Mutable on purpose — reading a
   * field costs nothing and allocates nothing.
   *   weight — 0..1 blend factor, `in * (1 - out)`. Fade, scale and opacity follow this.
   *   local  — 0..1 scrub position through the section. Timelines and video follow this.
   * They are different numbers and confusing them is the most common scene bug: `weight`
   * goes back to 0 at the end of the section, `local` does not.
   */
  frame: { weight: number; local: number; in: number; out: number }
}

export interface SceneDefinition {
  /** Stable id, also the folder name. Two-digit prefix keeps manifest order readable. */
  id: string
  renderer: RendererKind
  /** CSS selector for the DOM section that owns this scene's scroll range. */
  section: string
  /** Asset keys to acquire before build(). Refcounted — see assets.ts. */
  assets?: string[]
  /** Minimum quality tier. Below this the scene is never built. */
  quality?: QualityTier
  /** Camera waypoint. Only meaningful for `three` scenes on the shared camera. */
  waypoint?: WaypointSet
  /**
   * Render this scene into its own scissored rect with its own scene + camera
   * instead of the shared world. Use for product viewers, insets, split screens.
   */
  viewport?: { selector: string; clearDepth?: boolean }
  /** Ease for the in/out weights. Default 0.08. */
  ease?: number
  /**
   * Tune where the weight ramps happen, in viewport heights.
   *   enter: 1   -> starts fading in when the section top is one viewport below the fold
   *   exit:  1   -> finishes fading out one viewport after the section bottom passes the fold
   * Widen for slow atmospheric crossfades, tighten for hard cuts.
   */
  ramp?: { enter?: number; exit?: number }
  /** Called once, after assets resolve. Build geometry/materials/DOM here. */
  build(ctx: SceneCtx): void | Promise<void>
  /** Weight crossed the activation threshold. dir is +1 scrolling down, -1 up. */
  enter?(dir: number, ctx: SceneCtx): void
  /** Called every frame while weight > threshold. w is 0..1. Mutate, never setState. */
  update?(w: number, ctx: SceneCtx): void
  /** Only for canvas2d / video / custom draw. `three` scenes leave this undefined. */
  render?(w: number, ctx: SceneCtx): void
  /** Weight dropped below the threshold. */
  exit?(dir: number, ctx: SceneCtx): void
  /** Free every GPU resource this scene created. Called on teardown + downgrade. */
  dispose(): void
}

/** Runtime wrapper the kernel keeps around each definition. Scenes never see this. */
export interface SceneInstance {
  def: SceneDefinition
  /** 0..1 — how far the scroll has entered this scene's range. */
  in: number
  /** 0..1 — how far the scroll has left it. */
  out: number
  /** clamp(in * (1 - out)) — the only number scenes are given. */
  weight: number
  built: boolean
  active: boolean
  /** Cached layout, measured once per pageReflow. Never read in the loop. */
  rect: { top: number; height: number }
  section: HTMLElement | null
  el: HTMLElement | null
  ctx: SceneCtx | null
  /**
   * Only set when def.viewport is present. A scene drawn into a scissored rect gets its own
   * THREE.Scene and camera so its lighting and framing are fully independent of the main
   * world — from the scene's point of view nothing changes, it still just adds to ctx.world.
   */
  privateScene: THREE.Scene | null
  privateCamera: THREE.PerspectiveCamera | null
  viewportEl: HTMLElement | null
}
