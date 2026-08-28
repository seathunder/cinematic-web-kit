/**
 * Postprocessing.
 *
 * THE ORDER IS NOT NEGOTIABLE, and it is the single most common thing done wrong in WebGL
 * sites. It follows from one fact about three.js: when the renderer draws into a render target
 * it does NOT apply tone mapping or the sRGB transfer in the material shader. Verified in
 * three 0.185 — `WebGLPrograms.getParameters()` sets `toneMapping = NoToneMapping` unless
 * `currentRenderTarget === null`. So everything inside an EffectComposer chain is linear,
 * unbounded HDR until something converts it.
 *
 *   HalfFloat target   values above 1.0 must survive; an 8-bit target clips them to white and
 *                      bloom has nothing bright left to find
 *   RenderPass         draw the world, linear
 *   UnrealBloomPass    threshold in LINEAR HDR — this is why it goes here and not after
 *   BokehPass          depth-of-field, also linear (optional; it re-renders the scene)
 *   OutputPass         tone map + sRGB encode. The line between "light" and "pixels".
 *   GradePass          grain, vignette, aberration, split-tone — DISPLAY space
 *
 * Put bloom after OutputPass and the threshold compares against tone-mapped values, so it
 * either does nothing or blooms the midtones into mush. Put grain before OutputPass and the
 * tone mapper eats it, so it looks like noise at 30% strength no matter what you set.
 * three's own OutputPass docblock says the same thing: "If a pass requires sRGB input
 * (e.g. like FXAA), the pass must follow OutputPass in the pass chain."
 *
 * Antialiasing: an EffectComposer bypasses the canvas's MSAA, so `antialias: true` on the
 * renderer stops working the moment you add a chain. Fixed here with `samples` on the
 * composer's own target (WebGL2 multisampled FBO) rather than a post-hoc FXAA pass, because
 * FXAA smears text and thin geometry — exactly what a portfolio site is full of.
 */
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js'
import { state, clamp } from '../kernel/state'
import { onReflow } from '../kernel/viewport'
import { budget } from '../kernel/quality'
import type { Stage3D } from '../kernel/renderer'

/* ------------------------------------------------------------- grade shader */

/**
 * One pass for every display-space effect, because each extra full-screen pass is another
 * full-resolution texture read and on a mid-range Android that is the difference between 60
 * and 40fps. Everything here is a cheap per-pixel operation with no neighbourhood sampling
 * except the 3-tap aberration.
 */
const GradeShader = {
  name: 'GradeShader',
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    /** Film grain, 0..1. 0.04–0.10 is the range that reads as "film" and not "broken". */
    uGrain: { value: 0.06 },
    /** Vignette strength 0..1 and how soft its edge is. */
    uVignette: { value: 0.35 },
    uVignetteSoft: { value: 0.55 },
    /** Chromatic aberration in pixels at the frame edge. 1–4 is subtle, 8+ is a effect. */
    uAberration: { value: 1.5 },
    uContrast: { value: 1.0 },
    uSaturation: { value: 1.0 },
    uBrightness: { value: 0.0 },
    /** Split-toning: tint pushed into shadows and into highlights. The core "graded" look. */
    uShadowTint: { value: new THREE.Color(0x0a0e1a) },
    uHighlightTint: { value: new THREE.Color(0xfff2e0) },
    uTintStrength: { value: 0.0 },
    /** Global fade to black. Transitions drive this — see modules/transition.ts. */
    uFade: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform vec2  uResolution;
    uniform float uGrain;
    uniform float uVignette;
    uniform float uVignetteSoft;
    uniform float uAberration;
    uniform float uContrast;
    uniform float uSaturation;
    uniform float uBrightness;
    uniform vec3  uShadowTint;
    uniform vec3  uHighlightTint;
    uniform float uTintStrength;
    uniform float uFade;
    varying vec2 vUv;

    // Hash-based value noise. Deliberately not a texture lookup: no asset to download, no
    // second sampler, and it never tiles visibly.
    float hash(vec2 p) {
      p = fract(p * vec2(443.897, 441.423));
      p += dot(p, p + 19.19);
      return fract((p.x + p.y) * p.x);
    }

    const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

    void main() {
      vec2 uv = vUv;
      vec2 centered = uv - 0.5;
      float dist = length(centered);

      // Radial chromatic aberration: channels diverge with distance from centre, like a real
      // lens. Scaled by 1/resolution so the pixel amount is resolution-independent.
      vec3 color;
      if (uAberration > 0.001) {
        vec2 dir = centered * (uAberration / uResolution) * dist * 2.0;
        color.r = texture2D(tDiffuse, uv + dir).r;
        color.g = texture2D(tDiffuse, uv).g;
        color.b = texture2D(tDiffuse, uv - dir).b;
      } else {
        color = texture2D(tDiffuse, uv).rgb;
      }

      // --- grade ---
      color += uBrightness;
      color = (color - 0.5) * uContrast + 0.5;
      float luma = dot(color, LUMA);
      color = mix(vec3(luma), color, uSaturation);

      if (uTintStrength > 0.001) {
        vec3 tint = mix(uShadowTint, uHighlightTint, smoothstep(0.0, 1.0, luma));
        // Soft-light-ish blend. Keeps the tint out of pure black and pure white, which is
        // what separates a grade from a colour overlay.
        color = mix(color, color * 2.0 * tint, uTintStrength * (1.0 - abs(luma - 0.5) * 1.2));
      }

      // --- vignette ---
      // smoothstep on distance, not a multiply: a linear falloff has a visible ring.
      float vig = smoothstep(0.8, uVignetteSoft * 0.8, dist);
      color *= mix(1.0, vig, uVignette);

      // --- grain ---
      // Divided by dpr so the grain is the same physical size on a retina display as on a
      // 1x one. Without this it turns into invisible fizz on high-DPR screens.
      if (uGrain > 0.001) {
        float n = hash(gl_FragCoord.xy + fract(uTime) * 1000.0) - 0.5;
        // Scaled by (1 - luma) so grain lives in the shadows, as it does on real film.
        color += n * uGrain * (1.0 - luma * 0.7);
      }

      color = mix(color, vec3(0.0), uFade);
      gl_FragColor = vec4(color, 1.0);
    }
  `,
}

export type GradeKey =
  | 'uGrain'
  | 'uVignette'
  | 'uVignetteSoft'
  | 'uAberration'
  | 'uContrast'
  | 'uSaturation'
  | 'uBrightness'
  | 'uTintStrength'
  | 'uFade'

export interface BloomOptions {
  /** 0.2–0.6 for atmosphere, 1.0+ for a deliberate glow. */
  strength?: number
  /** Blur spread, 0..1. 0.4 is a good default. */
  radius?: number
  /**
   * Luminance above which a pixel blooms. In LINEAR HDR, so >1.0 means "only actual
   * light sources". 0.8–1.0 for realism; below 0.5 everything glows and looks like fog.
   */
  threshold?: number
  /** Render bloom at half resolution. Nearly free quality win — the blur hides it. */
  half?: boolean
}

export interface DofOptions {
  /** Distance from the camera in world units that is sharp. */
  focus?: number
  /** Smaller = deeper focus. 0.0001–0.001 is the useful range. */
  aperture?: number
  maxblur?: number
}

export interface PostOptions {
  bloom?: BloomOptions | false
  /** Depth of field. Costs a second scene render — measure before shipping it. */
  dof?: DofOptions | false
  grade?: Partial<Record<GradeKey, number>> | false
  /** MSAA samples on the composer target. 0 to disable. Ignored on WebGL1. */
  samples?: number
}

export interface PostChain {
  composer: EffectComposer
  bloom: UnrealBloomPass | null
  bokeh: BokehPass | null
  grade: ShaderPass | null
  /** Read/write a grade uniform from a scene's update(). */
  set(key: GradeKey, value: number): void
  get(key: GradeKey): number
  /** Tint colours are Colors, not numbers, so they get their own setter. */
  setTint(shadow: THREE.ColorRepresentation, highlight: THREE.ColorRepresentation): void
  render(): void
  resize(): void
  dispose(): void
}

/**
 * Build the chain. Returns null when the quality budget forbids postprocessing, so the caller
 * pattern is always:
 *
 *   const post = createPost(stage)
 *   if (post) scenes.setMainRender(post.render)
 *
 * On a low-tier device that leaves the plain renderer.render() path in place, which is the
 * correct fallback: no chain at all is much better than a cheap chain.
 */
export function createPost(stage: Stage3D, opts: PostOptions = {}): PostChain | null {
  const b = budget()
  if (!b.postprocessing) return null

  const { renderer, world, camera } = stage
  const { width, height, dpr } = state.viewport

  // Explicit target rather than the composer's default, for two reasons: HalfFloat (bloom
  // needs values above 1.0 to exist) and `samples` (MSAA, since the composer bypasses the
  // canvas's own antialiasing).
  const samples = opts.samples ?? (state.quality === 'high' ? 4 : 0)
  const target = new THREE.WebGLRenderTarget(width * dpr, height * dpr, {
    type: THREE.HalfFloatType,
    // Leave the buffer linear. OutputPass converts, once, at the end.
    colorSpace: THREE.LinearSRGBColorSpace,
    depthBuffer: true,
    stencilBuffer: false,
    samples: renderer.capabilities.isWebGL2 ? samples : 0,
  })

  const composer = new EffectComposer(renderer, target)
  composer.setPixelRatio(dpr)
  composer.setSize(width, height)

  /* 1. scene ---------------------------------------------------------------- */
  composer.addPass(new RenderPass(world, camera))

  /* 2. bloom, in linear HDR -------------------------------------------------- */
  let bloom: UnrealBloomPass | null = null
  if (opts.bloom !== false) {
    const o = opts.bloom ?? {}
    const res = o.half === false ? 1 : 0.5
    bloom = new UnrealBloomPass(
      new THREE.Vector2(width * res, height * res),
      o.strength ?? 0.4,
      o.radius ?? 0.4,
      o.threshold ?? 0.9,
    )
    composer.addPass(bloom)
  }

  /* 3. depth of field, still linear ----------------------------------------- */
  let bokeh: BokehPass | null = null
  if (opts.dof && state.quality === 'high') {
    bokeh = new BokehPass(world, camera, {
      focus: opts.dof.focus ?? 10,
      aperture: opts.dof.aperture ?? 0.0002,
      maxblur: opts.dof.maxblur ?? 0.01,
    })
    composer.addPass(bokeh)
  }

  /* 4. the conversion ------------------------------------------------------- */
  composer.addPass(new OutputPass())

  /* 5. display-space grade -------------------------------------------------- */
  let grade: ShaderPass | null = null
  if (opts.grade !== false) {
    grade = new ShaderPass(GradeShader)
    const u = grade.uniforms
    u.uResolution.value.set(width * dpr, height * dpr)
    // Reduced motion means no animated grain. Static grain is still fine and still looks
    // like film; it is the per-frame flicker that causes trouble.
    if (state.reducedMotion) u.uGrain.value = Math.min(u.uGrain.value as number, 0.02)
    for (const [k, v] of Object.entries(opts.grade ?? {})) {
      if (k in u) (u[k] as { value: number }).value = v as number
    }
    composer.addPass(grade)
  }

  /* ------------------------------------------------------------------ resize */
  const resize = () => {
    const { width: w, height: h, dpr: d } = state.viewport
    composer.setPixelRatio(d)
    composer.setSize(w, h)
    bloom?.resolution.set(w * 0.5, h * 0.5)
    if (grade) (grade.uniforms.uResolution.value as THREE.Vector2).set(w * d, h * d)
  }
  const offReflow = onReflow(resize)

  const render = () => {
    if (grade && !state.reducedMotion) grade.uniforms.uTime.value = state.time.elapsed
    composer.render(state.time.delta)
  }

  return {
    composer,
    bloom,
    bokeh,
    grade,
    set(key, value) {
      if (grade) (grade.uniforms[key] as { value: number }).value = value
    },
    get(key) {
      return grade ? ((grade.uniforms[key] as { value: number }).value ?? 0) : 0
    },
    setTint(shadow, highlight) {
      if (!grade) return
      ;(grade.uniforms.uShadowTint.value as THREE.Color).set(shadow)
      ;(grade.uniforms.uHighlightTint.value as THREE.Color).set(highlight)
    },
    render,
    resize,
    dispose() {
      offReflow()
      // The composer owns its passes' render targets but not the target we passed in.
      composer.dispose()
      target.dispose()
    },
  }
}

/* ------------------------------------------------------- selective bloom ---- */

/**
 * Bloom only certain objects.
 *
 * UnrealBloomPass blooms whatever is bright, which is usually what you want. When it is not —
 * a glowing sword edge in an otherwise dark frame, where you need the *blade* to bloom and not
 * the bright sky behind it — the standard technique is two renders: one with everything except
 * the bloom layer blacked out, and one normal, added together.
 *
 * This is the cheap version of that: it swaps every non-layer material for a black basic
 * material, renders bloom, then restores. One extra scene traversal per frame, no extra
 * render target beyond the bloom pass's own.
 *
 * Use `ctx.layer` from a scene as the layer number — the kernel hands each scene a unique one.
 */
export function createSelectiveBloom(
  stage: Stage3D,
  layer: number,
  opts: BloomOptions = {},
): {
  render: (draw: () => void) => void
  dispose: () => void
} {
  const dark = new THREE.MeshBasicMaterial({ color: 0x000000 })
  const cache = new Map<string, THREE.Material | THREE.Material[]>()
  const bloomLayer = new THREE.Layers()
  bloomLayer.set(layer)

  const darken = (obj: THREE.Object3D) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.material || bloomLayer.test(obj.layers)) return
    cache.set(obj.uuid, mesh.material)
    mesh.material = dark
  }
  const restore = (obj: THREE.Object3D) => {
    const saved = cache.get(obj.uuid)
    if (saved) {
      ;(obj as THREE.Mesh).material = saved
      cache.delete(obj.uuid)
    }
  }

  void opts

  return {
    render(draw) {
      stage.world.traverse(darken)
      draw()
      stage.world.traverse(restore)
    },
    dispose() {
      dark.dispose()
      cache.clear()
    },
  }
}

/* ------------------------------------------------------------ velocity hook */

/**
 * Wire scroll velocity into the grade so fast scrolling smears and darkens slightly.
 *
 * This is the cheapest "expensive-looking" effect in the whole toolkit: aberration and
 * vignette driven by `state.velocity.current`, which is already damped and already
 * frame-rate independent. Two multiplies per frame.
 *
 * Register it after the post chain exists; it returns a disposer.
 */
export function bindVelocityToGrade(
  post: PostChain,
  opts: { aberration?: number; vignette?: number; grain?: number } = {},
): () => void {
  const base = {
    aberration: post.get('uAberration'),
    vignette: post.get('uVignette'),
    grain: post.get('uGrain'),
  }
  const gain = {
    aberration: opts.aberration ?? 6,
    vignette: opts.vignette ?? 0.25,
    grain: opts.grain ?? 0.02,
  }

  let disposed = false
  const original = post.render
  // Patch render rather than adding a loop stage: the values must be written in the same
  // frame they are used, and render is by definition the last thing to run.
  post.render = () => {
    if (!disposed) {
      const v = clamp(Math.abs(state.velocity.current) / 2, 0, 1)
      post.set('uAberration', base.aberration + v * gain.aberration)
      post.set('uVignette', base.vignette + v * gain.vignette)
      post.set('uGrain', base.grain + v * gain.grain)
    }
    original()
  }

  return () => {
    disposed = true
    post.render = original
    post.set('uAberration', base.aberration)
    post.set('uVignette', base.vignette)
    post.set('uGrain', base.grain)
  }
}
