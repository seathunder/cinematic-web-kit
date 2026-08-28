# `kernel/dispose.ts`

## Purpose

Complete GPU teardown. Three does not garbage-collect VRAM: a geometry, texture or program stays
resident until something calls `.dispose()`. This file walks an object graph and frees everything,
exactly once, including the slots people forget.

## When to use it

- `disposeObject(root, { detach: true })` in every scene's `dispose()`.
- `gpuInfo(renderer)` when investigating a memory problem.
- `leakWatch(renderer, label)` during development, around a build/teardown cycle you suspect leaks.

## When NOT to use it

- **Not on objects you do not own.** A cloned glTF shares geometry and materials with the original.
  Disposing the clone's geometry destroys the original too. Clone materials explicitly if you intend
  to dispose them (see [`assets.md`](assets.md)).
- **Not on registry assets.** Anything from `AssetRegistry` is owned by its refcount. Call
  `assets.release(key)` instead; the registry disposes when the count hits zero.
- **Not as a substitute for `release`.** Disposing a texture the registry still thinks is live leaves
  a dangling entry that will be handed to the next scene that asks for it.

## Signature

```ts
export function disposeMaterial(material: THREE.Material): void
export function disposeObject(root: THREE.Object3D, opts?: { detach?: boolean }): void

export function gpuInfo(renderer: THREE.WebGLRenderer): {
  geometries: number; textures: number; programs: number
  calls: number; triangles: number; points: number; lines: number
}

export function leakWatch(renderer: THREE.WebGLRenderer, label: string, tolerance?: number): () => void
```

## Inputs

`disposeObject(root, { detach: true })` — `detach` removes `root` from its parent as well. Almost
always what you want in a scene's `dispose()`; without it the object stays in the graph, invisible but
still traversed every frame by the renderer's culling pass.

`leakWatch(renderer, label, tolerance = 4)` snapshots `renderer.info.memory` and returns a function
that compares and logs. `tolerance` allows for a few shared resources legitimately created during the
window.

## Outputs

`disposeMaterial` frees:

- every one of the **~25 texture slots** three defines (`map`, `normalMap`, `roughnessMap`,
  `metalnessMap`, `aoMap`, `emissiveMap`, `bumpMap`, `displacementMap`, `alphaMap`, `envMap`,
  `lightMap`, `specularMap`, `clearcoatMap`, `clearcoatNormalMap`, `clearcoatRoughnessMap`,
  `iridescenceMap`, `iridescenceThicknessMap`, `sheenColorMap`, `sheenRoughnessMap`,
  `transmissionMap`, `thicknessMap`, `anisotropyMap`, `specularIntensityMap`, `specularColorMap`,
  `matcap`, `gradientMap`)
- **`ShaderMaterial` uniform textures**, which are not in any of those slots and are the single most
  commonly leaked resource in custom-shader-heavy work
- the material itself

`disposeObject` traverses, collects geometries and materials into `Set`s (so a shared resource is
disposed exactly once, not once per user), disposes **light shadow maps**, and calls `.dispose()` on
any non-mesh disposable it finds.

`gpuInfo` returns live counts. `geometries` and `textures` should return to their baseline after a
scene tears down. `programs` legitimately stays high — three caches compiled programs on purpose.

## Transitions and applications

**The disposal decision.** VRAM is not the only cost; re-acquiring is expensive too.

| situation | do |
|---|---|
| user can scroll back to this scene | **deactivate** — leave it resident |
| asset is under ~15 MB | deactivate; the churn costs more than the memory |
| asset is large *and* behind a one-way transition | dispose |
| quality downgrade rebuilding a scene | dispose — the old objects are genuinely dead |
| navigating away entirely | `disposeAll()` |

**Video and image frames are outside the JS heap.** A `VideoFrame` or `ImageBitmap` holds memory the JS
garbage collector does not manage. Every one that leaves a cache must be `.close()`d. The leak will
**not** appear in a heap snapshot — you will see flat JS memory and a browser tab that grows to 3 GB
and dies. `modules/video-scrub.ts` and `modules/frame-sequence.ts` both close rigorously; copy that
discipline in any custom decode path.

**A one-line leak test that works.** Scroll the whole page, scroll back, repeat three times, then:

```ts
console.log(gpuInfo(app.stage.renderer))
```

`geometries` and `textures` should be at their baseline, not three times it.

## Gotchas

**`renderer.info.memory` counts three-managed resources only.** Render targets you create manually,
WebGL objects from a raw context call, and decoded video frames are all invisible to it. Trust it for
geometry/texture, not as a total.

**Disposing a material still in use** produces a black or missing object rather than an error — three
just has no program for it any more. If a mesh suddenly renders black after you added a disposal path,
you disposed something shared.

**`scene.remove(obj)` does not free anything.** It only unparents. This is the most common false
teardown: the code looks like cleanup, VRAM does not move.

**`InstancedMesh.dispose()` frees only `instanceMatrix` and `instanceColor`** — not the geometry or
material you passed in. `modules/instancing.ts`'s `dispose()` handles both and lets you opt out with
`keepAssets`.

**Render targets are separate.** `EffectComposer` targets, PMREM targets and any `WebGLRenderTarget`
you made need their own `.dispose()`. `modules/post.ts` and `kernel/renderer.ts` do this.

## Recipe

A scene's teardown:

```ts
import { disposeObject } from '../../kernel/dispose'

let group: THREE.Group | null = null
let customMaterial: THREE.ShaderMaterial | null = null

export default {
  // ...
  dispose() {
    // Walks the graph, frees geometries/materials/textures/shadow maps once each, unparents.
    if (group) disposeObject(group, { detach: true })
    group = null

    // A ShaderMaterial's uniform textures are covered by disposeMaterial, which disposeObject
    // calls — but if the material is not attached to anything in `group`, do it explicitly.
    customMaterial?.dispose()
    customMaterial = null
  },
}
```

Development leak check around a build/teardown cycle:

```ts
import { leakWatch } from '../kernel/dispose'

const check = leakWatch(renderer, 'scene 03 rebuild')
await scene.build(ctx)
scene.dispose()
check()      // logs a warning if geometries/textures did not return to baseline
```

Related: [`assets.md`](assets.md) (refcounts own registry assets), [`renderer.md`](renderer.md),
[`../modules/instancing.md`](../modules/instancing.md),
[`../modules/frame-sequence.md`](../modules/frame-sequence.md) (ImageBitmap lifetime).
