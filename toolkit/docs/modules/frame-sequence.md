# `modules/frame-sequence.ts`

## Purpose

Image-sequence scrubbing with **bounded memory**. A folder of numbered stills, one shown per scroll
position — the classic Apple-product-page technique — implemented so it does not kill a phone.

## When to use it

- Sequences short enough to be worth the bytes: roughly **20–400 frames**.
- When you need **exact** frame accuracy in both directions, including on Safari, where video seeking
  is only keyframe-accurate.
- When the source has **alpha**. A WebP/AVIF sequence handles transparency; browser alpha-video support
  does not.
- When the sequence is a *rendered* animation (a 3D turntable, an exploded assembly) rather than filmed
  footage.

## When NOT to use it

- **Not for long sequences.** 600+ frames is a video, even with this module's caching. The wire cost
  wins.
- **Not for filmed footage.** Inter-frame compression is exactly what video codecs are for; a frame
  sequence of live action is 10–30× the bytes for no benefit.
- **Not when `video-scrub`'s `webcodecs` path is available and the source has no alpha.** WebCodecs is
  frame-accurate too, and much smaller on the wire.

## Signature

```ts
export interface FrameSequenceOptions {
  src: (i: number) => string          // index → URL
  count: number
  window?: number                     // decoded frames held each side of the playhead
  sparse?: number                     // fetch every Nth frame first, then fill in
  concurrency?: number                // parallel fetches
  canvas?: HTMLCanvasElement
  onFrame?: (bitmap: ImageBitmap, index: number) => void
  onProgress?: (p: number) => void
}

export interface FrameSequence {
  readonly ready: Promise<void>       // enough frames to scrub the whole timeline
  readonly complete: Promise<void>    // every frame fetched
  readonly texture: THREE.Texture
  readonly count: number
  readonly width: number
  readonly height: number
  seek(progress: number): void        // 0..1
  progress(): number
  dispose(): void
}

export function createFrameSequence(opts: FrameSequenceOptions): FrameSequence
```

## Inputs

**`src` is a function, not an array**, so you never build a 400-element string array and you can encode
any naming scheme:

```ts
src: (i) => `/media/samurai/frame-${String(i).padStart(4, '0')}.webp`
```

**`window`** is the decoded sliding-window radius. This is the only knob that meaningfully changes memory
use:

| `window` | decoded frames | ~memory at 1280×720 RGBA | feel |
|---|---|---|---|
| 6 | 13 | ~48 MB | fine for slow scrubs; can pop on a fast flick |
| **12** | 25 | ~92 MB | the default; smooth in practice |
| 24 | 49 | ~180 MB | only on desktop, only if measured |

**`sparse`** fetches every Nth frame before filling the gaps. Default is on. With `sparse: 8`, the whole
timeline is scrubbable at one-eighth temporal fidelity after ~12 % of the download, and the detail
arrives underneath the user while they are already scrolling.

**`concurrency`** caps parallel fetches. Too high on a slow connection queues everything and delays the
sparse pass; 6–8 is sane.

## Outputs

`texture` is a `THREE.Texture` over the internal canvas, ready for any material.

`ready` resolves after the sparse pass — that is the moment scrubbing becomes possible, and what the
preloader should wait on. `complete` resolves when every frame has been fetched; usually you do not wait
for it at all.

`onProgress(p)` is 0..1 over the whole fetch and wires into the preloader.

`progress()` returns the current playhead position.

## Transitions and applications

**The two-tier design, and why every other implementation gets this wrong.** All five open-source
sequence-scrubbers surveyed for this toolkit decode every frame up front. Do the arithmetic: 240 frames
of 1920×1080 RGBA is `240 × 8.3 MB` = **2 GB**. It runs on a 32 GB dev machine with swap, and it kills
the tab on a phone. The fix is that *loaded* and *decoded* are two different states with two different
costs, so they get two different caches:

| tier | holds | cost | lifetime |
|---|---|---|---|
| **encoded** | every frame, as a `Blob` | a 1280×720 WebP frame is 40–80 KB → 10–20 MB for 240 frames | forever |
| **decoded** | a sliding window of `ImageBitmap`s around the playhead | ~4 MB per frame at 720p | evicted as the window moves |

Re-decoding from the encoded tier when the window moves costs 2–5 ms **off the main thread**, because
`createImageBitmap` decodes on a worker thread. `new Image()` + `onload` does not — it decodes on the
main thread and produces a frame hitch. That difference is why this module never uses `Image`.

**Direction bias.** The window is asymmetric, weighted the way the user is already scrolling. Frames
behind the playhead are the cheapest thing to give up, and biasing the window means a fast downward
flick has more frames ready ahead of it.

**Encode the source properly** — run `cw frames`, or by hand:

```bash
ffmpeg -i source.mov -vf "scale=1280:-2,fps=30" -c:v libwebp -quality 82 -compression_level 6 public/media/seq/frame-%04d.webp
```

WebP at quality 82, 1280 px wide, is the sweet spot — roughly **4× smaller** than the JPEGs most of
these sequences ship as, with alpha available for free. AVIF is smaller again but encodes far more
slowly; worth it for a hero sequence you encode once.

**Frame count is an art-direction decision, not a technical one:**

| frames | over one viewport of scroll | reads as |
|---|---|---|
| 24–40 | ~1 frame per 25 px | a deliberate, mechanical step — good for an exploded diagram |
| 60–90 | smooth | the default for a turntable or a transformation |
| 120–240 | very smooth, long scroll | a full performance beat; a character move, a camera orbit |

**Applications:**

| use | setup |
|---|---|
| product turntable with alpha | WebP sequence, `window: 12`, short `ramp` |
| character performance (samurai draw) | 90–140 frames, `local` → `seek`, telephoto neighbours |
| exploded assembly diagram | 30–50 frames, `renderer: 'canvas2d'`, captions via `createAnchors` |
| a sequence composited into a 3D scene | `texture` on a plane inside a `three` scene |
| dissolve from sequence into geometry | crossfade two scenes' `weight`; put the sequence's last frame and the 3D scene's first pose in the same framing |

## Gotchas

**`ImageBitmap` memory is not managed by the JS garbage collector.** Every bitmap evicted from the window
must be `.close()`d. This module does it; if you extend it, keep doing it. The leak does **not** show in
a JS heap snapshot — you see flat JS memory and a tab that dies. Same class of bug as `VideoFrame`; see
[`../kernel/dispose.md`](../kernel/dispose.md).

**`createImageBitmap` decodes off the main thread; `new Image()` does not.** If you replace the decode
path with an `Image`, memory looks the same and the frame rate collapses.

**A sequence is not in `AssetRegistry`.** It fetches itself, so it is not refcounted and not in the
preloader's progress unless you wire `onProgress`. For a hero sequence, wire it — it is usually the
largest download on the page.

**`ready` is not `complete`.** Awaiting `complete` in `build()` means the preloader waits for the entire
sequence, which throws away the whole point of sparse-first loading. Await `ready`.

**`seek()` belongs in `update()`, once per frame.** Calling it from a scroll handler means several
window evaluations per frame.

**Frame numbering is off-by-one-prone.** `ffmpeg`'s `%04d` output starts at `0001`, so `src` must be
`i + 1` if your index starts at 0. A blank first frame is almost always this.

**Every frame must be the same dimensions.** The canvas is sized from the first decoded frame; a
mismatched frame is drawn scaled and looks like a glitch.

## Recipe

A character-performance scene:

```ts
import { createFrameSequence, type FrameSequence } from '../../modules/frame-sequence'
import type { SceneDefinition } from '../../kernel/types'

let seq: FrameSequence | null = null

export default {
  id: '03-character-draw',
  renderer: 'canvas2d',
  section: '#chapter-draw',
  ramp: { enter: 0.5, exit: 0.5 },

  async build(ctx) {
    seq = createFrameSequence({
      src: (i) => `/media/draw/frame-${String(i + 1).padStart(4, '0')}.webp`,
      count: 120,
      window: 12,
      sparse: 8,
      concurrency: 6,
      canvas: ctx.el!.querySelector('canvas')!,
      onProgress: (p) => ctx.debug.log(`seq ${(p * 100) | 0}%`),
    })

    await seq.ready          // sparse pass only — NOT seq.complete
    ctx.debug.monitor('seq frame', () => Math.round(seq!.progress() * seq!.count))
  },

  update(_w, ctx) {
    seq?.seek(ctx.frame.local)
  },

  dispose() {
    seq?.dispose()           // closes every ImageBitmap and drops the Blob tier
    seq = null
  },
} satisfies SceneDefinition
```

Wiring it into the preloader when it is the page's main download:

```ts
const pre = createPreloader({ gate: true })
const seq = createFrameSequence({ …, onProgress: (p) => pre.set(p * 0.6) })
app.assets.onProgress((p) => pre.set(0.6 + p * 0.4))
```

Encoding (or run `cw frames`):

```bash
ffmpeg -i draw.mov -vf "scale=1280:-2,fps=30" -c:v libwebp -quality 82 -compression_level 6 public/media/draw/frame-%04d.webp
```

Related: [`video-scrub.md`](video-scrub.md) (the alternative and when it wins),
[`../kernel/dispose.md`](../kernel/dispose.md) (ImageBitmap lifetime),
[`preloader.md`](preloader.md), [`../PATTERNS.md`](../PATTERNS.md) (asset pipeline).
