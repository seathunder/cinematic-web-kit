# `kernel/assets.ts`

## Purpose

One loader for every asset kind, with **reference counting**. Two scenes that both need the same
model share one copy in VRAM, and it is only freed when the last user releases it. Also drives the
preloader's progress number.

## When to use it

Always, for anything that touches the GPU or the network. Declare assets in `boot({ assets })` and
list the keys a scene needs in its `SceneDefinition.assets`.

## When NOT to use it

- **Not for small, one-off JSON or text** you fetch in a `build()`. The registry's value is refcounting
  and progress-tracking; a 2 KB config needs neither.
- **Not for video you intend to scrub.** Use `modules/video-scrub.ts`, which needs the raw bytes for
  WebCodecs rather than an `HTMLVideoElement`. `loadVideo` here is for simple looping background
  video.

## Signature

```ts
export type AssetKind = 'gltf' | 'texture' | 'ktx2' | 'hdr' | 'video' | 'audio' | 'json'

export interface AssetSpec {
  key: string
  url: string
  kind: AssetKind
  minQuality?: 'low' | 'medium' | 'high'    // skipped entirely below this tier
  weight?: number                            // progress-bar weight, default 1
}

export class AssetRegistry {
  constructor(renderer: THREE.WebGLRenderer, opts?: { dracoPath?: string; basisPath?: string })
  register(specs: AssetSpec[]): void
  onProgress(cb: (p: number, key: string) => void): void
  has(key: string): boolean

  /** Load if needed, refcount++, resolve with the value. `null` when minQuality excluded it. */
  acquire<T = unknown>(key: string, quality?: 'low' | 'medium' | 'high'): Promise<T | null>
  /** Synchronous read. Throws if the key is unknown or not yet loaded. */
  get<T = unknown>(key: string): T
  release(key: string, mode?: 'dispose' | 'deactivate'): void

  progress(): number
  setBudget(keys: string[]): void
  live(): { key: string; instances: number; active: boolean }[]
  disposeAll(): void
}

export function loadVideo(url: string, opts?: { loop?: boolean }): Promise<HTMLVideoElement>
```

## Inputs

**`weight`** is the progress-bar contribution, not the file size in bytes. Give the 20 MB character
model a weight of 10 and the 40 KB icon texture a weight of 1, or the bar jumps from 4% to 96% in one
step and the preloader looks broken. Weights are relative; only their ratio matters.

**`minQuality`** skips an asset entirely below that tier. A 4K normal map at `minQuality: 'high'` is
never downloaded on a phone — saving bandwidth *and* VRAM. The scene must handle `get()` returning
undefined for it, or (better) declare the whole scene `quality: 'high'`.

**Decoder paths.** `basisPath` and `dracoPath` must point at the decoder files in `/public`. Run
`cw decoders` to copy them out of `node_modules`. Loading them from a CDN works but adds a
third-party runtime dependency to a client site — an outage in someone else's CDN then breaks your
client's homepage.

## Outputs

`acquire(key, quality)` loads one key, increments its refcount and resolves with the value — or with
`null` when `minQuality` excluded it on this tier. Pass `state.quality`; `kernel/stage.ts` does that
for you for every key in a scene's `assets` array. Concurrent `acquire` calls for the same key share
one in-flight promise: the second caller does not start a second download.

`get<T>(key)` is the synchronous read for use inside `build()` and `update()`. It **throws** on an
unknown key or on a key that has not finished loading — deliberately, because a silent `undefined`
surfaces 200 lines later as `Cannot read property 'scene' of undefined`.

`progress()` is `loadedWeight / totalWeight`, 0..1. `onProgress(cb)` fires per completed asset.

`release(key, mode)`:

| mode | effect | when |
|---|---|---|
| `'deactivate'` (default) | refcount−−, stays in VRAM, marked inactive | almost always |
| `'dispose'` | refcount−−, and at zero actually frees GPU memory | only above ~15 MB, and only behind a one-way transition |

`live()` returns the current refcount table — the single most useful thing to print when debugging a
memory problem.

## Transitions and applications

**Why deactivate is the default.** Freeing a 40 MB texture means re-downloading and re-transcoding it
if the user scrolls back up, which produces a visible pop and a stall. Deactivating costs nothing but
VRAM residency. Only dispose when (a) the asset is genuinely large and (b) the user cannot return —
after a one-way transition into a different chapter of the experience.

**`setBudget(keys)`** marks a set of keys as the currently relevant working set, which is the hook a
project uses to implement its own eviction policy for a very large experience.

**The preloader contract.**

```ts
const pre = createPreloader({ gate: true })          // gate: audio needs a user gesture
assets.onProgress((p) => pre.set(p))
```

`preloaderHooks(pre)` returns `{ onProgress, onReady }` ready to pass straight into `boot()`.

**KTX2 / Basis is the format that matters.** A 2048×2048 PNG is ~4 MB on the wire and **16 MB in VRAM**
after decode, always, regardless of how well it compressed. The same texture as KTX2 is ~1 MB on the
wire and ~4 MB in VRAM, because the GPU keeps it compressed. On a 2 GB Android phone this is the
difference between working and being killed by the OS. `gltfpack` produces KTX2 for free — see the
asset pipeline in [`../PATTERNS.md`](../PATTERNS.md).

## Gotchas

**Every `acquire` needs a matching `release`.** The refcount never drops otherwise and `disposeAll` is
the only thing that frees anything. `kernel/stage.ts` does this correctly for scene assets; do it
yourself for anything you acquire manually.

**`get()` throws, it does not return undefined.** `[assets] "x" read before it loaded` means you called
`get()` before the `acquire()` for that key resolved — usually because the key is missing from the
scene's `assets` array. `[assets] unknown key "x"` means it is missing from the `boot({ assets })`
list. Both messages name the key; read them literally.

**`acquire` can resolve to `null`.** A `minQuality: 'high'` asset on a phone was never downloaded. A
scene that unconditionally `get()`s it will throw on mobile only, which is the worst kind of bug to
find. Either guard the read or mark the whole scene `quality: 'high'` so it never builds there.

**glTF `scene` must be cloned if two scenes use it.** `get<GLTF>('x').scene` is one object graph; adding
it to two parents moves it. `.clone()` shares geometry and materials (which is what you want) while
giving you an independent transform hierarchy.

**Cloning does not clone materials.** Setting `clone.material.opacity` changes the original too. Use
`mesh.material = mesh.material.clone()` when you need per-instance material state — and remember you
now own that clone's disposal.

**`loadVideo` needs `muted` and `playsInline` to autoplay**, and even then a browser may refuse until
a gesture. It sets both; do not remove them.

## Recipe

```ts
// main.ts
import { boot } from './kernel'
import { createPreloader, preloaderHooks } from './modules/preloader'
import manifest from './manifest'

const pre = createPreloader({ gate: true, minMs: 1200 })

const app = await boot({
  manifest,
  decoders: { dracoPath: '/decoders/draco/', basisPath: '/decoders/basis/' },
  assets: [
    { key: 'character', url: '/media/samurai.glb',   kind: 'gltf',    weight: 12 },
    { key: 'env-dusk',  url: '/media/dusk.hdr',      kind: 'hdr',     weight: 4, minQuality: 'medium' },
    { key: 'ground',    url: '/media/ground.ktx2',   kind: 'ktx2',    weight: 3 },
    { key: 'grain',     url: '/media/grain.png',     kind: 'texture', weight: 1 },
    { key: 'ambience',  url: '/media/wind.mp3',      kind: 'audio',   weight: 2 },
  ],
  ...preloaderHooks(pre),
})
```

In a scene:

```ts
build(ctx) {
  const gltf = ctx.assets.get<{ scene: THREE.Group }>('character')
  model = gltf.scene.clone()                    // clone: shares geometry, own transform
  model.traverse((o) => {
    o.layers.set(ctx.layer)
    if ((o as THREE.Mesh).isMesh) {
      const m = o as THREE.Mesh
      m.material = (m.material as THREE.Material).clone()   // now I own this clone
    }
  })
  ctx.world.add(model)
}
```

Debugging memory:

```ts
console.table(app.assets.live())
console.log(gpuInfo(app.stage.renderer))      // from kernel/dispose.ts
```

Related: [`dispose.md`](dispose.md), [`quality.md`](quality.md),
[`../modules/preloader.md`](../modules/preloader.md), [`stage.md`](stage.md).
