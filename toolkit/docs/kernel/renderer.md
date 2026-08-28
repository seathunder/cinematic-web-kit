# `kernel/renderer.ts`

## Purpose

Creates the one WebGL renderer, the one shared `THREE.Scene`, the shared camera, and the parallax
group the camera lives inside. Also owns environment lighting (PMREM), shader precompilation, and
scissor rendering for scenes that draw into their own rect.

## When to use it

`createStage()` once, from `boot()`. `renderScissor` / `resetViewport` when a scene has a `viewport`.
`compileAll` before the first frame.

## When NOT to use it

Do not create a second `WebGLRenderer`. Each one is a separate GL context; browsers cap contexts
(commonly 8–16) and losing one silently kills every texture in it. Multiple visual regions come from
`renderScissor`, not from multiple renderers.

## Signature

```ts
export interface RendererOptions {
  canvas?: HTMLCanvasElement
  alpha?: boolean
  clearColor?: THREE.ColorRepresentation
  antialias?: boolean
  tone?: 'aces' | 'agx' | 'neutral' | 'none'
  exposure?: number
  shadows?: boolean
}

export interface Stage3D {
  renderer: THREE.WebGLRenderer
  world: THREE.Scene
  camera: THREE.PerspectiveCamera
  parallax: THREE.Group          // camera is a child of this
  envTexture: THREE.Texture | null
  resize: () => void
  dispose: () => void
}

export function createStage(opts?: RendererOptions): Stage3D

export async function compileAll(
  renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera,
): Promise<void>

export function renderScissor(
  renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera,
  el: HTMLElement, opts?: { clearDepth?: boolean; layer?: number },
): void

export function resetViewport(renderer: THREE.WebGLRenderer): void
```

## Inputs

**`tone`** — tone mapping maps HDR light values into displayable range. It is a *look* decision:

| value | three constant | reads as |
|---|---|---|
| `'aces'` | `ACESFilmicToneMapping` | filmic, cinematic shoulder. **Correct for anything with lights or bloom.** |
| `'agx'` | `AgXToneMapping` | newer, more neutral highlights, less saturation shift |
| `'neutral'` | `NeutralToneMapping` | Khronos neutral — good for product accuracy |
| `'none'` | `NoToneMapping` | flat, graphic, poster-like. Correct for unlit/graphic art direction. |

**`antialias`** defaults to `state.quality === 'high'`. On mid and low tiers MSAA is not worth the
bandwidth; on low tier `budget().antialias` is false anyway.

**`shadows`** defaults to `budget().shadows`. Shadow maps are the second most expensive thing after
DPR. A baked contact shadow (a dark radial plane under the subject) is almost always the better
trade and it costs nothing.

## Outputs

- `renderer` with `setPixelRatio(state.viewport.dpr)` — already capped by the quality budget
- `world`, `camera`, and `parallax` with the camera added as a child
- `envTexture` — a PMREM-processed `RoomEnvironment`, assigned as `world.environment`, so
  `MeshStandardMaterial` has something to reflect without loading an HDR
- `resize()` — called by `boot()`'s reflow path
- `dispose()` — disposes the renderer, PMREM target and env texture

## Transitions and applications

**Environment lighting first, lights second.** A `MeshStandardMaterial` with roughness/metalness and
no environment looks like plastic. The built-in `RoomEnvironment` costs nothing to download and
instantly gives believable reflections. Add a directional light for shape and a rim light for
separation *on top of* that, not instead of it.

For a specific mood, load an HDR through `assets.ts` (`kind: 'hdr'`) and replace `world.environment`.
An HDR is the fastest way to change the entire feel of a scene without touching a material.

**`compileAll` before the first frame.** Three compiles a shader program the first time a material is
drawn. On a 9-scene site, that means a 200–600 ms stall the first time each new scene appears — a
freeze exactly at the moment the user is scrolling into it, which reads as a broken site.

`compileAll` forces `visible = true` and `frustumCulled = false` on every object, calls
`compileAsync`, and restores the original values in a `finally`. `compileAsync` yields between
programs, so the preloader animation keeps running while it works. The restore must be in a `finally`
or a compile error leaves the entire scene visible.

**Scissor rendering.** For a product viewer sitting in a `<div>` in an editorial layout:

```ts
renderScissor(renderer, privateScene, privateCamera, el, { clearDepth: true, layer: ctx.layer })
```

`renderScissor` reads the element's rect, converts to GL coordinates, sets scissor + viewport, draws,
and restores. It skips the draw entirely when the element is fully offscreen.

**WebGL's origin is bottom-left; the DOM's is top-left.** The conversion is
`top = viewportHeight - rect.bottom`. Getting this wrong renders the inset mirrored vertically down
the page, which is a confusing bug to look at.

## Gotchas

**`renderer.autoClear` must be restored.** `renderScissor` sets it false and back to true. Any code
that leaves it false makes the main render stop clearing, and the frame smears. `resetViewport()`
restores viewport, scissor and autoClear together — call it after any sequence of scissor draws.

**Tone mapping is bypassed inside render targets.** Verified in three 0.185
(`three.module.js:7549-7559`): the renderer applies `toneMapping` only when
`currentRenderTarget === null`. So with an `EffectComposer`, the whole chain is linear HDR and tone
mapping happens in `OutputPass`. This is why post-processing order is non-negotiable — see
[`../modules/post.md`](../modules/post.md).

**`alpha: true` costs performance and disables some optimisations.** Only use it when the canvas must
genuinely show the page behind it. If you want a coloured background, use `clearColor`.

**DPR changes require `setPixelRatio` again.** Moving a window between a Retina and a normal monitor
changes `devicePixelRatio`. `resize()` handles it; do not cache DPR anywhere else.

## Recipe

```ts
import { createStage, compileAll, renderScissor, resetViewport } from '../kernel/renderer'

const stage = createStage({
  tone: 'aces',
  exposure: 1.05,
  clearColor: 0x07070a,
  shadows: false,          // baked contact shadows instead
})

// backgrounds go in parallax so they move with the pointer
const sky = new THREE.Mesh(skyGeo, skyMat)
stage.parallax.add(sky)

// subjects go in world
stage.world.add(character)

// before the first frame
await compileAll(stage.renderer, stage.world, stage.camera)
```

A scene with its own inset viewport:

```ts
render(w, ctx) {
  renderScissor(
    ctx.renderer,
    privateScene, privateCamera,
    document.querySelector<HTMLElement>('#viewer')!,
    { clearDepth: true, layer: ctx.layer },
  )
  resetViewport(ctx.renderer)
}
```

Related: [`camera.md`](camera.md), [`quality.md`](quality.md), [`dispose.md`](dispose.md),
[`../modules/post.md`](../modules/post.md).
