# `modules/video-scrub.ts`

## Purpose

Scroll-controlled video. Three strategies behind one interface, picked automatically by capability:
WebCodecs frame-accurate decode, `playbackRate` chasing, or plain `currentTime` seeking. The output is
a `THREE.Texture` you can put on any material, or a callback with a `CanvasImageSource`.

## When to use it

When the section's content genuinely *is* a video — a shot of a product rotating, a filmed sequence, a
rendered animation you did not build in three. This is the cheapest way to get photoreal motion on the
web: an 8-second 1080p clip at a sane bitrate is ~2 MB, where the equivalent frame sequence is 30× that
and the equivalent 3D scene is a week of work.

## When NOT to use it

- **Not for anything interactive.** A video cannot respond to a pointer, change lighting, or be
  raycast. If the user needs to affect it, it needs to be a real scene.
- **Not for short sequences under ~20 frames.** Use `modules/frame-sequence.ts`; the encode overhead
  and keyframe constraints are not worth it.
- **Not for anything with alpha.** Browser support for alpha video is a minefield (HEVC-with-alpha is
  Safari-only, VP9 alpha is not universal). Use a frame sequence of WebP/AVIF, or composite in a shader
  with a luma-matte packed side-by-side.
- **Not with audio.** Scrubbed video has no meaningful audio playback. Use `modules/audio.ts` for a
  separate bed.

## Signature

```ts
export type ScrubStrategy = 'webcodecs' | 'rate' | 'seek'

export interface ScrubOptions {
  strategy?: ScrubStrategy      // force one; default is capability detection
  cacheSize?: number            // decoded frames held (webcodecs)
  lookahead?: number            // frames decoded ahead of the playhead
  maxRate?: number              // cap on playbackRate (rate strategy)
  canvas?: HTMLCanvasElement    // draw target; created if absent
  onFrame?: (source: CanvasImageSource, index: number) => void
}

export interface VideoScrub {
  readonly strategy: ScrubStrategy
  readonly ready: Promise<void>
  readonly duration: number
  readonly texture: THREE.Texture | null
  readonly width: number
  readonly height: number
  seek(progress: number): void      // 0..1
  dispose(): void
}

export async function createVideoScrub(url: string, opts?: ScrubOptions): Promise<VideoScrub>
```

## Inputs

**The three strategies, and when each wins:**

| strategy | how | frame-accurate | best on | cost |
|---|---|---|---|---|
| `webcodecs` | demux with mp4box, decode with `VideoDecoder`, cache `VideoFrame`s | **yes** | Chromium desktop + Android | most code, most memory, needs the raw bytes |
| `rate` | `playbackRate = clamp(diff * 4, 1, maxRate)` chases the target | no — approximate | anywhere WebCodecs is missing | cheap; can lag on a fast scroll |
| `seek` | set `currentTime` directly | keyframe-accurate | **WebKit / Safari** | cheap; janky elsewhere |

Default detection picks `webcodecs` when `VideoDecoder` exists, `seek` on WebKit, `rate` otherwise.
Force one with `strategy` only when you have measured that the default is wrong on a target device.

**`seek(progress)` takes 0..1**, so it wires straight to `ctx.frame.local`:

```ts
update(w, ctx) { scrub.seek(ctx.frame.local) }
```

## Outputs

`texture` is a `THREE.Texture` wrapping the internal canvas, with `needsUpdate` managed for you. Put it
on any material. `onFrame` gives you the raw `CanvasImageSource` if you want to composite yourself.

`ready` resolves when metadata is parsed and the first frame is presented. Await it in `build()` so the
scene never shows an empty canvas.

`strategy` tells you which path was actually chosen — worth logging via `ctx.debug.log` during
development, because a device silently on `rate` explains a lot of "why is it not sharp".

## Transitions and applications

**The encode matters more than the code.** This is the single most important thing on this page. A video
scrubs well or badly almost entirely because of how it was encoded:

```bash
ffmpeg -i in.mp4 -c:v libx264 -profile:v high -pix_fmt yuv420p -g 10 -bf 0 -crf 22 -movflags +faststart -an out.mp4
```

| flag | why |
|---|---|
| `-g 10` | **keyframe every 10 frames.** The decoder must start at a keyframe, so with the default `-g 250` a seek can require decoding 249 frames. This one flag is the difference between smooth and unusable. |
| `-bf 0` | no B-frames — they must be decoded out of order, which fights backwards scrubbing |
| `-movflags +faststart` | moov atom at the front, so playback starts before the whole file arrives |
| `-an` | strip audio; it is dead weight in a scrubbed clip |
| `-crf 22` | quality target; 20–24 is the useful band |

Smaller `-g` means a bigger file. `-g 10` roughly doubles size versus `-g 250`, and it is worth it every
time. Run `cw assets` to apply this preset.

**Applications and the transitions they read as:**

| use | setup |
|---|---|
| product turntable | 360° render, `local` → `seek`, `ramp` short so it feels direct |
| a filmed transition between worlds | video scene at low `ramp` overlap, `uFade` on either side |
| a face or hand in close-up | telephoto waypoint on the neighbouring 3D scenes so the cut matches |
| a "screen" inside a 3D scene | `texture` on a plane in a `three` scene, not a `video` scene |
| dissolve from video into geometry | crossfade `weight` of a `video` scene against a `three` scene |

**Using the texture inside a `three` scene** is often better than a `video` renderer scene, because you
keep the shared camera, post-processing and lighting:

```ts
const scrub = await createVideoScrub('/media/plate.mp4')
await scrub.ready
const screen = new THREE.Mesh(
  new THREE.PlaneGeometry(3.2, 1.8),
  new THREE.MeshBasicMaterial({ map: scrub.texture!, toneMapped: false }),
)
```

`toneMapped: false` because the video is already display-referred; tone mapping it again crushes it.

## Gotchas

**`VideoFrame` memory is not managed by the JS garbage collector.** Every frame that leaves the cache
must be `.close()`d. The module does this rigorously — copy the discipline if you extend it. A leak here
does **not** appear in a JS heap snapshot: you see flat JS memory and a tab that grows to 3 GB and gets
killed. This is the highest-severity bug class in the whole toolkit.

**WebCodecs needs the raw bytes**, so this module fetches the file itself rather than going through
`AssetRegistry`. That means it is not refcounted and not in the preloader's progress by default. Wire
`ready` into your own progress if the clip is large.

**`rate` strategy cannot go backwards.** `playbackRate` is positive-only. Scrolling up on the `rate`
strategy holds the frame until the target is ahead again. If backwards scrubbing must be smooth on
Safari, use `seek` — or use a frame sequence.

**`seek` is keyframe-accurate, not frame-accurate.** With `-g 10` that is a maximum error of nine
frames, which at 30fps is 0.3 s. Visible on a fast pan, invisible on a slow turntable.

**iOS requires `muted` and `playsInline`** or the video takes over the screen in a native player. The
module sets both; do not strip them.

**A `video` renderer scene still needs a `[data-scene-root]` element** in its section, or the manager
falls back to the section itself and the canvas sizing is wrong.

**Do not `seek()` from anywhere but the loop.** Calling it from a scroll event means multiple decodes per
frame. `update()` is called once per frame; that is the contract.

## Recipe

A scrubbed hero video as a `video` scene:

```ts
import { createVideoScrub, type VideoScrub } from '../../modules/video-scrub'
import type { SceneDefinition } from '../../kernel/types'

let scrub: VideoScrub | null = null

export default {
  id: '01-transmission',
  renderer: 'video',
  section: '#chapter-transmission',
  ramp: { enter: 0.4, exit: 0.4 },       // short: a video wants to own the screen

  async build(ctx) {
    scrub = await createVideoScrub('/media/transmission.mp4', {
      cacheSize: 24,
      lookahead: 6,
      maxRate: 8,
      canvas: ctx.el!.querySelector('canvas')!,
    })
    await scrub.ready
    ctx.debug.log(`strategy: ${scrub.strategy} · ${scrub.width}x${scrub.height}`)
    ctx.debug.monitor('strategy', () => scrub!.strategy)
  },

  update(_w, ctx) {
    scrub?.seek(ctx.frame.local)          // local, not weight: monotonic scrub
  },

  dispose() {
    scrub?.dispose()                      // closes every cached VideoFrame
    scrub = null
  },
} satisfies SceneDefinition
```

Encoding the source (or run `cw assets`):

```bash
ffmpeg -i source.mov -c:v libx264 -profile:v high -pix_fmt yuv420p -g 10 -bf 0 -crf 22 -vf "scale=1920:-2" -movflags +faststart -an public/media/transmission.mp4
```

Related: [`frame-sequence.md`](frame-sequence.md) (the alternative, and when it wins),
[`../kernel/types.md`](../kernel/types.md) (`renderer: 'video'`, `local` vs `weight`),
[`../kernel/dispose.md`](../kernel/dispose.md) (VideoFrame lifetime),
[`../PATTERNS.md`](../PATTERNS.md) (the free asset pipeline).
