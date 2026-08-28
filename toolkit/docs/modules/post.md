# `modules/post.ts`

## Purpose

The post-processing chain: bloom, depth of field, and a custom grade pass (grain, vignette, chromatic
aberration, contrast, saturation, tint, fade). This is the module that makes a competent 3D scene look
like a *film*. It is also the module where getting the pass order wrong silently ruins your colours.

## When to use it

Once, after `boot()`. Every project with a `three` scene that is meant to look cinematic.

```ts
const post = createPost(app.stage, { bloom: { strength: 0.4 } })
if (post) app.scenes.setMainRender(post.render)
```

## When NOT to use it

- **Not on a low tier.** `createPost` returns `null` when `budget().postprocessing` is false, and the
  `if (post)` guard leaves the plain `renderer.render()` path in place. No chain at all is much better
  than a cheap chain — a half-resolution bloom on a phone costs frames and adds nothing.
- **Not for a graphic, flat, poster-like art direction.** Bloom and grain say "photographed". If the
  direction is illustration or Swiss-graphic, `tone: 'none'` and no post is the correct look, and it is
  free.
- **Not DOF by default.** `dof` costs a second full scene render for the depth buffer. Measure before
  shipping it. Most of what people want from DOF they actually get from bloom plus a vignette.

## Signature

```ts
export type GradeKey =
  | 'uGrain' | 'uVignette' | 'uVignetteSoft' | 'uAberration'
  | 'uContrast' | 'uSaturation' | 'uBrightness' | 'uTintStrength' | 'uFade'

export interface BloomOptions {
  strength?: number     // 0.2–0.6 atmosphere, 1.0+ deliberate glow
  radius?: number       // blur spread 0..1, 0.4 is a good default
  threshold?: number    // luminance gate, in LINEAR HDR
  half?: boolean        // render bloom at half res — nearly free quality win
}

export interface DofOptions {
  focus?: number        // world units from the camera that are sharp
  aperture?: number     // smaller = deeper focus; 0.0001–0.001 is the useful range
  maxblur?: number
}

export interface PostOptions {
  bloom?: BloomOptions | false
  dof?: DofOptions | false
  grade?: Partial<Record<GradeKey, number>> | false
  samples?: number      // MSAA on the composer target. Ignored on WebGL1.
}

export interface PostChain {
  composer: EffectComposer
  bloom: UnrealBloomPass | null
  bokeh: BokehPass | null
  grade: ShaderPass | null
  set(key: GradeKey, value: number): void
  get(key: GradeKey): number
  setTint(shadow: THREE.ColorRepresentation, highlight: THREE.ColorRepresentation): void
  render(): void
  resize(): void
  dispose(): void
}

export function createPost(stage: Stage3D, opts?: PostOptions): PostChain | null

export function createSelectiveBloom(stage: Stage3D, layer: number, opts?: BloomOptions): {
  render: (draw: () => void) => void
  dispose: () => void
}

export function bindVelocityToGrade(
  post: PostChain,
  opts?: { aberration?: number; vignette?: number; grain?: number },
): void
```

## Inputs

**`threshold` is in linear HDR, and this is the one number people get wrong.** Because tone mapping is
bypassed inside render targets (verified in three 0.185, `three.module.js:7549-7559`), the pixel values
reaching `UnrealBloomPass` are *linear*, not display-referred. So:

| threshold | blooms | reads as |
|---|---|---|
| 0.2–0.4 | almost everything | fog / haze / a smeared lens. Usually a mistake. |
| 0.6–0.8 | bright surfaces and lights | soft cinematic glow |
| **0.9–1.0** | only actual light sources | realistic. **Start here.** |
| 1.2+ | only very bright emissives | a hard sci-fi look, neon against dark |

**`strength`**: 0.2–0.6 for atmosphere; 1.0+ when the glow is the point. Above ~2 you are making a
music video.

**`half: true`** renders bloom at half resolution. The result is a blur, so the resolution loss is
literally invisible, and it is one of the best cost/quality trades available. Default it on.

**Grade defaults worth knowing:**

| key | subtle | strong | notes |
|---|---|---|---|
| `uGrain` | 0.02–0.05 | 0.1+ | the single most effective "filmic" cue; animated per frame |
| `uVignette` | 0.2–0.4 | 0.6+ | focuses attention; above 0.6 reads as a telescope |
| `uVignetteSoft` | 0.4–0.7 | — | edge softness of the vignette |
| `uAberration` | 0.002–0.005 | 0.01+ | lens fringing; above 0.01 looks broken, not stylish |
| `uContrast` | 1.02–1.08 | 1.2+ | |
| `uSaturation` | 0.9–1.1 | 0.6 (bleached) / 1.4 (hyper) | |
| `uBrightness` | ±0.05 | — | prefer `renderer.exposure` for real exposure changes |
| `uTintStrength` | 0.1–0.3 | 0.5+ | pairs with `setTint()` |
| `uFade` | — | 0..1 | full-screen fade to black; a transition primitive |

**`samples`** is the MSAA count on the composer's WebGL2 render target.

## Outputs

`createPost` returns a `PostChain`, or `null` on a tier without postprocessing.

**The pass order is non-negotiable:**

```
HalfFloat render target
  → RenderPass          draw the world, linear HDR
  → UnrealBloomPass     bloom on linear values (this is why threshold is HDR-scaled)
  → BokehPass           DOF, needs depth, still linear
  → OutputPass          ★ tone mapping + sRGB conversion happens HERE
  → GradePass           grain / vignette / aberration, applied in display space
```

Two things follow from that, and both are the reason the order is fixed:

1. **Bloom and DOF must come before `OutputPass`**, because they are physically-motivated effects that
   want linear light. Bloom after tone mapping blooms the *compressed* highlights and looks flat and
   grey.
2. **Grain and aberration must come after `OutputPass`**, because they are *lens and film* artefacts —
   they happen in the camera, not in the scene. Grain applied to linear HDR is invisible in the
   shadows and enormous in the highlights.

`set(key, value)` / `get(key)` read and write the grade uniforms — safe to call every frame from a
scene's `update()`. `setTint(shadow, highlight)` takes `Color`s, so it gets its own setter.

## Transitions and applications

**`uFade` is a transition primitive you already have.** Before reaching for
`modules/transition.ts`, note that a fade-to-black is one uniform:

```ts
gsap.to({ v: 0 }, { v: 1, duration: 0.6, onUpdate() { post.set('uFade', this.targets()[0].v) } })
```

**`bindVelocityToGrade(post, …)` is the highest ratio of perceived quality to code in the toolkit.**
It drives aberration, vignette and grain from `state.velocity.current`, so scrolling fast produces
lens fringing and a tightening vignette, and stopping settles back. The user reads it as "the camera is
moving fast", and it costs nothing but a few uniform writes.

```ts
bindVelocityToGrade(post, { aberration: 0.004, vignette: 0.1 })
```

**Per-scene grade is how you give each world its own colour.** Drive it from `weight` so it crossfades
automatically:

```ts
// in a cold, moonlit scene
update(w, ctx) {
  post.set('uSaturation', 1 - w * 0.35)      // desaturate as this scene takes over
  post.set('uContrast', 1 + w * 0.06)
  post.setTint(0x1a2740, 0xd8e4ff)           // cold shadows, cold highlights
  post.set('uTintStrength', w * 0.3)
}
```

Because every scene writes its contribution scaled by its own `weight`, and weights sum to ~1 in a
crossfade, the grade blends between worlds without any scene knowing about the other. Same principle
as the camera.

**`createSelectiveBloom(stage, layer, opts)`** blooms only objects on one render layer — a glowing
sword, a lantern, a UI element — without the whole scene hazing over. It returns a `render(draw)`
wrapper rather than a pass, because it needs to render the scene twice with different layer masks.

**Which effect for which intent:**

| you want | reach for |
|---|---|
| "it feels shot on film" | `uGrain` 0.04 + `uVignette` 0.3 + `tone: 'aces'` |
| "this light is really bright" | bloom `threshold: 0.95`, `strength: 0.5` |
| "attention on the subject" | `uVignette` 0.45, or DOF if you can afford it |
| "speed" | `bindVelocityToGrade` |
| "this world is cold / hot" | `setTint` + `uTintStrength`, driven by weight |
| "dream / memory" | bloom `threshold: 0.5` + `uSaturation` 0.7 + heavy camera `ease` |
| "glitch / signal loss" | `uAberration` spike + `modules/transition.ts` `'glitch'` |

## Gotchas

**The composer bypasses the canvas's MSAA.** `createStage({ antialias: true })` antialiases the
*canvas*; once you render into a composer target, that does nothing and your edges go jagged. The fix
is `samples` on the composer's WebGL2 target — **not** an FXAA pass, which softens the whole image
including the grain you just added.

**Tone mapping happens in `OutputPass`, not in the renderer.** If you set
`renderer.toneMapping` and see no change while post is enabled, this is why. `OutputPass` reads
`renderer.toneMapping`, so setting it still works — but it applies at the end of the chain, not at
`RenderPass`.

**`resize()` must be called on reflow.** The composer owns render targets sized to the viewport; they
do not resize themselves. `boot()`'s reflow path does not know about your post chain, so wire it:

```ts
onReflow(() => post?.resize())
```

**DOF's `focus` is a world-space distance from the camera, not a point.** With the weighted-average
camera rig moving continuously, a fixed `focus` drifts out of the subject. Drive it from the actual
distance:

```ts
post.bokeh!.uniforms['focus'].value = ctx.camera.position.distanceTo(subject.position)
```

**Every pass is a full-screen render target.** Four passes at DPR 2 on a 1440p screen is
`4 × 2560×1440×4 channels × 2 bytes` ≈ 118 MB of bandwidth per frame. This is why `postprocessing` is
false on the low tier, and why `half: true` on bloom matters.

**`dispose()` must be called before creating a second chain.** Render targets leak otherwise and they
are the largest single allocations in the app.

## Recipe

Standard cinematic setup:

```ts
import { createPost, bindVelocityToGrade } from '../modules/post'
import { onReflow } from '../kernel'

const post = createPost(app.stage, {
  bloom: { strength: 0.35, radius: 0.4, threshold: 0.95, half: true },
  dof: false,                                   // measure before enabling
  grade: {
    uGrain: 0.04,
    uVignette: 0.35,
    uVignetteSoft: 0.55,
    uAberration: 0.0025,
    uContrast: 1.04,
    uSaturation: 1.02,
  },
  samples: 4,                                   // composer MSAA, not canvas MSAA
})

if (post) {
  app.scenes.setMainRender(post.render)
  bindVelocityToGrade(post, { aberration: 0.004, vignette: 0.1, grain: 0.02 })
  post.setTint(0x141d2b, 0xffe9cc)              // cool shadows, warm highlights
  post.set('uTintStrength', 0.2)
  onReflow(() => post.resize())
}
```

A scene that owns its own look:

```ts
update(w, ctx) {
  // Contributions scale by weight, so adjacent scenes crossfade their grades for free.
  post?.set('uSaturation', 1 - w * 0.4)
  post?.set('uVignette', 0.35 + w * 0.2)
  if (post?.bloom) post.bloom.strength = 0.35 + w * 0.5
}
```

Related: [`../kernel/renderer.md`](../kernel/renderer.md) (tone mapping, the verified render-target
fact), [`../kernel/quality.md`](../kernel/quality.md) (`postprocessing`),
[`../kernel/stage.md`](../kernel/stage.md) (`setMainRender`), [`transition.md`](transition.md)
(`uFade` vs a real transition layer), [`../EVIDENCE.md`](../EVIDENCE.md).
