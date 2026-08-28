/**
 * Transitions between worlds.
 *
 * The distinction that matters: a *transition* is not a *crossfade*. A crossfade is two scenes
 * visible at once, which the kernel's weight system already does for free — that is what
 * `weight = in * (1 - out)` is. A transition is the opposite: a deliberate moment where the
 * user is shown *nothing* of either world, so you can change something you could not change
 * gradually — swap a 40MB model, jump the camera across a cut, or move between two sections of
 * a narrative that are not physically adjacent.
 *
 * Implemented as one full-screen quad rendered into the shared canvas after the main pass, at
 * loop stage 985. Not as a post-processing pass, and not as CSS, for three specific reasons:
 *
 *   - It must work when the post chain does not exist. `budget().postprocessing` is false on
 *     low tier, and a transition is not a luxury: without it the model swap is visible.
 *   - It must be in GLSL. Dissolve and ink-bleed need a per-pixel noise threshold, and CSS has
 *     no threshold operator on a mask. CSS can do fade, wipe and iris; it cannot do the two
 *     that actually look expensive.
 *   - When uProgress is 0 the stage returns immediately, so the cost of having it available is
 *     one number comparison per frame.
 *
 * The DOM half is handled in parallel: `data-transition` on <html> plus a `--transition`
 * custom property, so HTML content can be covered by the same beat with CSS only.
 */
import * as THREE from 'three'
import { state } from '../kernel/state'
import { addStage, removeStage } from '../kernel/loop'
import { gsap } from '../kernel/scroll'
import { stopScroll, startScroll } from '../kernel/scroll'
import type { Stage3D } from '../kernel/renderer'

/**
 * What each mode is for. Pick by narrative intent, not by which looks coolest in isolation —
 * a wipe implies geography ("we travelled"), a dissolve implies time ("later"), a cut implies
 * nothing and is therefore the most versatile.
 *
 *   fade      Black. The default. Use between unrelated worlds, and whenever in doubt.
 *   wipe      Hard edge sweeping across. Directional, energetic. Chapter breaks, "next case".
 *   dissolve  Noise-thresholded erosion. Reads as decay, memory, dream. Slower is better.
 *   iris      Circular close from the edges. Old-cinema punctuation. Good for endings.
 *   ink       fBm bleed with a soft dark rim, like sumi-e on wet paper. Built for the samurai
 *             sequence; also correct for anything hand-made, editorial or Japanese-influenced.
 *   glitch    Block displacement + channel split. Digital rupture. Use once, never twice.
 */
export type TransitionKind = 'fade' | 'wipe' | 'dissolve' | 'iris' | 'ink' | 'glitch'

const MODE: Record<TransitionKind, number> = {
  fade: 0,
  wipe: 1,
  dissolve: 2,
  iris: 3,
  ink: 4,
  glitch: 5,
}

export interface TransitionOptions {
  /** Seconds for one half (cover or reveal). 0.6–1.2 is the cinematic range. */
  duration?: number
  /** GSAP ease. 'power2.inOut' for most; 'expo.in' for a cover that snaps shut. */
  ease?: string
  /** Sweep direction for wipe/ink, in radians. 0 = left-to-right, PI/2 = bottom-to-top. */
  angle?: number
  /** Cover colour. Black is right almost always; paper-white suits the ink mode. */
  color?: THREE.ColorRepresentation
  /** Freeze scrolling while the transition runs. Almost always yes. */
  lockScroll?: boolean
  /** Softness of the moving edge, 0..1. Higher is gentler and hides low frame rates. */
  softness?: number
}

export interface TransitionLayer {
  /** Cover the screen. Resolves when fully opaque — do the swap in that await. */
  cover(kind?: TransitionKind, opts?: TransitionOptions): Promise<void>
  /** Uncover. Resolves when fully transparent. */
  reveal(kind?: TransitionKind, opts?: TransitionOptions): Promise<void>
  /**
   * cover → run `swap` → reveal, with scroll locked across the whole thing.
   * This is the call you actually want 90% of the time.
   */
  run(swap: () => void | Promise<void>, kind?: TransitionKind, opts?: TransitionOptions): Promise<void>
  /** Jump straight to a value, 0..1. For scroll-driven transitions instead of timed ones. */
  set(progress: number, kind?: TransitionKind): void
  /** Currently covering anything at all. Scenes can skip work while true. */
  readonly busy: boolean
  dispose(): void
}

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

const FRAG = /* glsl */ `
  precision highp float;

  uniform float uProgress;   // 0 = invisible, 1 = fully covering
  uniform int   uMode;
  uniform vec3  uColor;
  uniform float uAngle;
  uniform float uSoftness;
  uniform float uAspect;
  uniform float uTime;
  varying vec2 vUv;

  float hash(vec2 p) {
    p = fract(p * vec2(233.34, 851.73));
    p += dot(p, p + 23.45);
    return fract(p.x * p.y);
  }

  // Value noise. Smoothstep interpolation, not linear — linear gives visible diamond artefacts
  // along the cell diagonals which are very obvious in a slow dissolve.
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  // Four octaves. Five is not visibly better and costs 25% more; three looks synthetic.
  float fbm(vec2 p) {
    float v = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 4; i++) {
      v += amp * noise(p);
      p *= 2.03;   // not exactly 2.0, which would align the octaves' cell grids
      amp *= 0.5;
    }
    return v;
  }

  void main() {
    // Aspect-corrected coordinates, so a circle is a circle and a 45-degree wipe is 45 degrees.
    vec2 uv = vUv;
    vec2 c = (uv - 0.5) * vec2(uAspect, 1.0);

    float alpha = 0.0;
    float soft = max(uSoftness, 0.001);

    if (uMode == 0) {
      // fade
      alpha = uProgress;

    } else if (uMode == 1) {
      // wipe: project onto the sweep axis, then a soft edge travels along it
      vec2 dir = vec2(cos(uAngle), sin(uAngle));
      float t = dot(uv - 0.5, dir) + 0.5;
      // The travel range is extended by uSoftness on both ends so the edge is fully off-screen
      // at progress 0 and 1 — otherwise a sliver of the old world survives at the end.
      float edge = mix(-soft, 1.0 + soft, uProgress);
      alpha = smoothstep(edge + soft, edge - soft, t);

    } else if (uMode == 2) {
      // dissolve: threshold a noise field. Every pixel has its own crossing point, so the
      // image erodes rather than fading. The remap to 0.2..0.8 keeps the extremes from
      // being instant, which would look like a cut.
      float n = fbm(uv * 6.0) * 0.6 + 0.2;
      alpha = smoothstep(n - soft, n + soft, uProgress);

    } else if (uMode == 3) {
      // iris: radius shrinks from beyond the corner to zero
      float r = length(c);
      // 0.75 is half the diagonal of a 16:9 frame in these coordinates — start fully outside.
      float radius = mix(0.85, 0.0, uProgress);
      alpha = smoothstep(radius + soft, radius - soft, r);

    } else if (uMode == 4) {
      // ink: a low-frequency bleed advanced along the sweep axis, with a darker wet rim.
      // The two-scale noise is what makes it read as pigment in paper rather than as fog:
      // the coarse octave decides where the ink goes, the fine one gives the edge its grain.
      vec2 dir = vec2(cos(uAngle), sin(uAngle));
      float t = dot(uv - 0.5, dir) + 0.5;
      float coarse = fbm(uv * 2.5);
      float fine = fbm(uv * 14.0);
      float field = t - (coarse - 0.5) * 0.55 - (fine - 0.5) * 0.08;
      float edge = mix(-0.4, 1.4, uProgress);
      alpha = smoothstep(edge + soft, edge - soft * 0.4, field);
      // Wet rim: a narrow band just inside the edge is darker, as pigment pools at the front.
      float rim = smoothstep(0.0, 0.25, alpha) * (1.0 - smoothstep(0.25, 0.6, alpha));
      gl_FragColor = vec4(uColor * (1.0 - rim * 0.55), alpha);
      return;

    } else {
      // glitch: quantise into horizontal bands, offset each one, split the channels.
      float bands = 24.0;
      float row = floor(uv.y * bands) / bands;
      float jitter = (hash(vec2(row, floor(uTime * 12.0))) - 0.5) * uProgress * 0.4;
      float t = uv.x + jitter;
      float edge = mix(-soft, 1.0 + soft, uProgress);
      alpha = smoothstep(edge + soft, edge - soft, t);
      // Tint the leading edge so the rupture reads as digital, not as a paint roller.
      vec3 tint = mix(vec3(1.0, 0.1, 0.3), uColor, smoothstep(0.0, 0.4, alpha));
      gl_FragColor = vec4(tint, alpha);
      return;
    }

    gl_FragColor = vec4(uColor, clamp(alpha, 0.0, 1.0));
  }
`

export function createTransitionLayer(stage: Stage3D): TransitionLayer {
  const geometry = new THREE.PlaneGeometry(2, 2)
  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uProgress: { value: 0 },
      uMode: { value: 0 },
      uColor: { value: new THREE.Color(0x000000) },
      uAngle: { value: 0 },
      uSoftness: { value: 0.06 },
      uAspect: { value: state.viewport.aspect },
      uTime: { value: 0 },
    },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    // The quad is already in clip space from the vertex shader, so no camera is involved and
    // frustum culling would throw it away.
    toneMapped: false,
  })

  const quad = new THREE.Mesh(geometry, material)
  quad.frustumCulled = false
  const overlayScene = new THREE.Scene()
  overlayScene.add(quad)
  // An unused camera is still required by renderer.render(); an ortho identity camera is the
  // cheapest possible one and its matrices never change.
  const overlayCamera = new THREE.Camera()

  const u = material.uniforms
  let busy = false

  addStage({
    order: 985,
    name: 'transition',
    after: ['render'],
    fn: () => {
      // Zero-cost when idle. This is why the layer can always be installed.
      if ((u.uProgress.value as number) <= 0.0001) return
      u.uTime.value = state.time.elapsed
      u.uAspect.value = state.viewport.aspect
      const r = stage.renderer
      r.autoClear = false
      r.render(overlayScene, overlayCamera)
      r.autoClear = true
    },
  })

  const root = document.documentElement

  const apply = (kind: TransitionKind, opts: TransitionOptions) => {
    u.uMode.value = MODE[kind]
    u.uAngle.value = opts.angle ?? 0
    u.uSoftness.value = opts.softness ?? (kind === 'ink' ? 0.12 : 0.06)
    if (opts.color !== undefined) (u.uColor.value as THREE.Color).set(opts.color)
    root.dataset.transition = kind
  }

  const tween = (to: number, opts: TransitionOptions) =>
    new Promise<void>((resolve) => {
      const duration = state.reducedMotion ? 0.001 : (opts.duration ?? 0.8)
      gsap.to(u.uProgress, {
        value: to,
        duration,
        ease: opts.ease ?? 'power2.inOut',
        // Publish to CSS on every frame so a DOM overlay can move in lockstep with the shader.
        onUpdate: () => root.style.setProperty('--transition', (u.uProgress.value as number).toFixed(3)),
        onComplete: () => resolve(),
      })
    })

  return {
    get busy() {
      return busy
    },
    set(progress, kind = 'fade') {
      apply(kind, {})
      u.uProgress.value = Math.max(0, Math.min(1, progress))
      root.style.setProperty('--transition', String(u.uProgress.value))
    },
    async cover(kind = 'fade', opts = {}) {
      busy = true
      apply(kind, opts)
      if (opts.lockScroll !== false) stopScroll()
      await tween(1, opts)
    },
    async reveal(kind = 'fade', opts = {}) {
      apply(kind, opts)
      await tween(0, opts)
      if (opts.lockScroll !== false) startScroll()
      delete root.dataset.transition
      busy = false
    },
    async run(swap, kind = 'fade', opts = {}) {
      busy = true
      apply(kind, opts)
      if (opts.lockScroll !== false) stopScroll()
      await tween(1, opts)
      // Two frames of headroom: the swap may create geometry, and doing it in the same frame
      // the cover completed can drop a frame while the cover is still animating out.
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      await swap()
      await tween(0, opts)
      if (opts.lockScroll !== false) startScroll()
      delete root.dataset.transition
      busy = false
    },
    dispose() {
      removeStage('transition')
      gsap.killTweensOf(u.uProgress)
      geometry.dispose()
      material.dispose()
      overlayScene.clear()
      root.style.removeProperty('--transition')
      delete root.dataset.transition
    },
  }
}

/* ------------------------------------------------------------ page navigation */

/**
 * Cross-document transitions.
 *
 * The View Transitions API does the hard part — snapshotting the outgoing page and
 * interpolating it against the incoming one — and where it exists it is strictly better than
 * anything hand-rolled, because it survives the actual navigation. Where it does not, this
 * degrades to a plain cover-then-navigate, which is what everyone shipped before 2023.
 *
 * For a multi-page portfolio this is what makes project pages feel like part of one film.
 * Add `@view-transition { navigation: auto; }` to the CSS to opt the whole document in.
 */
export function navigateWithTransition(
  url: string,
  layer?: TransitionLayer,
  kind: TransitionKind = 'fade',
): void {
  type DocWithVT = Document & { startViewTransition?: (cb: () => void) => unknown }
  const doc = document as DocWithVT

  if (typeof doc.startViewTransition === 'function') {
    doc.startViewTransition(() => {
      location.href = url
    })
    return
  }

  if (layer) {
    void layer.cover(kind, { duration: 0.5 }).then(() => {
      location.href = url
    })
    return
  }
  location.href = url
}

/* ---------------------------------------------------------- scroll-driven cut */

/**
 * A transition driven by scroll position rather than by time.
 *
 * Give it a scene's `local` value and a window inside it, and the cover opens and closes as the
 * user scrolls — so the cut is reversible and they stay in control. This is the honest way to
 * hide a model swap in a scroll-driven site: a timed transition fights the user's input, and
 * the moment they scroll backwards through it the illusion breaks.
 *
 *   update(w, ctx) {
 *     cut(ctx.frame.local)              // covers between 0.45 and 0.55
 *   }
 */
export function createScrollCut(
  layer: TransitionLayer,
  opts: {
    kind?: TransitionKind
    /** Local progress where the cover starts closing. */
    from?: number
    /** Local progress where it is fully open again. */
    to?: number
    /** Called once when fully covered — do the swap here. Fires in both directions. */
    onCovered?: (direction: number) => void
  } = {},
): (local: number) => void {
  const from = opts.from ?? 0.45
  const to = opts.to ?? 0.55
  const mid = (from + to) / 2
  const kind = opts.kind ?? 'fade'
  let swapped = false

  return (local: number) => {
    // Triangle: 0 at `from`, 1 at the midpoint, 0 again at `to`.
    let p = 0
    if (local > from && local < to) {
      p = local < mid ? (local - from) / (mid - from) : (to - local) / (to - mid)
    }
    layer.set(p, kind)

    const covered = p > 0.98
    if (covered && !swapped) {
      swapped = true
      opts.onCovered?.(state.direction)
    } else if (!covered && p < 0.5) {
      swapped = false
    }
  }
}
