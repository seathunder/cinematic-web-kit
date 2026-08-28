/**
 * Scroll-driven video.
 *
 * Setting `video.currentTime` from a scroll handler is the obvious implementation and it is
 * wrong. Each assignment is a seek request; the browser coalesces them, decodes from the
 * previous keyframe, and drops everything in flight. At 60 scroll events per second you get
 * roughly 8 distinct frames and a visible stutter that no amount of easing fixes.
 *
 * Three strategies, best first. Which one you get is decided by capability, not by preference.
 *
 *   webcodecs  Demux with mp4box, decode with VideoDecoder, present exact frames. Frame-accurate
 *              in both directions, no seek storms, and reverse scrubbing works properly. Costs
 *              ~200 lines and needs the file fetched up front. This is what the "how did they
 *              do that" sites use.
 *   rate       No seeking at all in the common case: when the target is ahead of the playhead,
 *              raise playbackRate so normal playback catches up, then pause. The decoder's own
 *              pipeline does the work it is built for. Only reverse and long jumps seek.
 *   seek       Plain currentTime. Correct everywhere, and genuinely the best option in WebKit,
 *              where rate manipulation stutters and seeks on a keyframe-dense file are fast.
 *
 * Whatever the strategy, the ENCODE matters more than the code. A scrub video needs keyframes
 * every ~10 frames, not every 250. `cw assets --video` does this; the flag is `-g 10`. Without
 * it the seek strategy decodes up to 250 frames per scroll event and nothing can save it.
 */
import * as THREE from 'three'
import { state, clamp } from '../kernel/state'

export type ScrubStrategy = 'webcodecs' | 'rate' | 'seek'

export interface ScrubOptions {
  /** Force a strategy. Leave unset to auto-detect, which is almost always right. */
  strategy?: ScrubStrategy
  /**
   * Decoded frames kept in memory, webcodecs only. Each is roughly width*height*1.5 bytes,
   * so 24 frames of 1080p is ~75MB — real memory. 12–24 is the useful range.
   */
  cacheSize?: number
  /** Frames to decode past the requested one, so forward scrubbing stays ahead. */
  lookahead?: number
  /** Cap for the rate strategy. Browsers refuse above ~16 anyway. */
  maxRate?: number
  /** Draw presented frames into this canvas as well as the texture. */
  canvas?: HTMLCanvasElement
  /** Called once per newly presented frame. Use for a canvas2d scene's own compositing. */
  onFrame?: (source: CanvasImageSource, index: number) => void
}

export interface VideoScrub {
  readonly strategy: ScrubStrategy
  /** Ready when the first frame can be presented. Await before revealing the section. */
  readonly ready: Promise<void>
  /** Seconds. 0 until ready resolves. */
  readonly duration: number
  /** Feed this to a material. Null until ready. */
  readonly texture: THREE.Texture | null
  readonly width: number
  readonly height: number
  /** 0..1. Call every frame from a scene's update() with ctx.frame.local. Idempotent. */
  seek(progress: number): void
  dispose(): void
}

/* ------------------------------------------------------------------ detection */

const isWebKit = (): boolean => {
  const ua = navigator.userAgent
  // Chrome and Edge on iOS are Safari underneath, so UA sniffing here is checking the engine,
  // not the brand. This is one of the few places where it is the correct tool.
  return /^((?!chrome|android|crios|fxios).)*safari/i.test(ua) || /iP(hone|ad|od)/.test(ua)
}

function pickStrategy(): ScrubStrategy {
  // Low tier: never hold 24 decoded 1080p frames on a 2GB phone.
  if (state.quality === 'low') return isWebKit() ? 'seek' : 'rate'
  if (typeof VideoDecoder === 'undefined') return isWebKit() ? 'seek' : 'rate'
  return 'webcodecs'
}

/* ------------------------------------------------------------------- factory */

export async function createVideoScrub(
  url: string,
  opts: ScrubOptions = {},
): Promise<VideoScrub> {
  const strategy = opts.strategy ?? pickStrategy()
  if (strategy === 'webcodecs') {
    try {
      return await createWebCodecsScrub(url, opts)
    } catch (err) {
      // Any failure here — unsupported codec, CORS, a fragmented mp4 we cannot parse — must
      // fall through rather than blank the section. The element strategies work on anything
      // the <video> tag can play, which is a strictly larger set.
      console.warn('[scrub] webcodecs path failed, falling back to element playback:', err)
      return createElementScrub(url, { ...opts, strategy: isWebKit() ? 'seek' : 'rate' })
    }
  }
  return createElementScrub(url, { ...opts, strategy })
}

/* ------------------------------------------------------- strategy: rate/seek */

function createElementScrub(url: string, opts: ScrubOptions): VideoScrub {
  const strategy: ScrubStrategy = opts.strategy === 'seek' ? 'seek' : 'rate'
  const maxRate = opts.maxRate ?? 12

  const video = document.createElement('video')
  video.src = url
  video.muted = true
  video.defaultMuted = true
  video.playsInline = true
  video.preload = 'auto'
  video.crossOrigin = 'anonymous'
  video.loop = false
  video.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none'
  document.body.appendChild(video)

  const texture = new THREE.VideoTexture(video)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.generateMipmaps = false
  texture.minFilter = THREE.LinearFilter

  let duration = 0
  let width = 0
  let height = 0
  let disposed = false
  let targetTime = 0
  let playing = false

  const ready = new Promise<void>((res, rej) => {
    const ok = () => {
      duration = video.duration || 0
      width = video.videoWidth
      height = video.videoHeight
      video.removeEventListener('loadedmetadata', ok)
      // Force the first frame to exist, otherwise the texture is a black rectangle until
      // the user scrolls. A zero seek is enough and completes almost instantly.
      video.currentTime = 0.001
      res()
    }
    video.addEventListener('loadedmetadata', ok)
    video.addEventListener('error', () => rej(new Error(`[scrub] cannot load ${url}`)), {
      once: true,
    })
  })

  const seekTo = (t: number) => {
    // Guard: seeking while a seek is in flight throws away the pending one and costs a decode.
    if (video.seeking) return
    video.currentTime = t
  }

  const seek = (progress: number) => {
    if (disposed || duration === 0) return
    targetTime = clamp(progress) * duration

    if (strategy === 'seek') {
      // One frame of tolerance at 30fps. Below this the pixels would not change.
      if (Math.abs(targetTime - video.currentTime) < 1 / 30) return
      seekTo(targetTime)
      return
    }

    /* --- rate strategy --- */
    const diff = targetTime - video.currentTime

    // Close enough: stop. Leaving it playing overshoots and then oscillates.
    if (Math.abs(diff) < 0.033) {
      if (playing) {
        video.pause()
        playing = false
      }
      video.playbackRate = 1
      return
    }

    // Backwards, or a jump too far to play through: a seek is the only option. Reverse
    // playback does not exist in any browser — negative playbackRate is silently ignored.
    if (diff < 0 || diff > 1.5) {
      if (playing) {
        video.pause()
        playing = false
      }
      seekTo(targetTime)
      return
    }

    // Forward and near: catch up by playing faster. This is the whole trick — the decoder
    // stays in its sequential fast path and never re-decodes from a keyframe.
    video.playbackRate = clamp(diff * 4, 1, maxRate)
    if (!playing) {
      playing = true
      // play() rejects if the element is not allowed to play; muted+playsInline means it is,
      // but a rejected promise must still be caught or it logs an unhandled rejection.
      void video.play().catch(() => {
        playing = false
      })
    }
  }

  // The rate strategy plays past its target between scroll events if the user stops scrolling
  // mid-catch-up, so pause on the frame that crosses it. requestVideoFrameCallback fires once
  // per presented frame, which is exactly the right granularity.
  type VideoWithRvfc = HTMLVideoElement & {
    requestVideoFrameCallback?: (cb: () => void) => number
    cancelVideoFrameCallback?: (id: number) => void
  }
  const v = video as VideoWithRvfc
  let rvfcId = 0
  if (strategy === 'rate' && typeof v.requestVideoFrameCallback === 'function') {
    const onFrame = () => {
      if (disposed) return
      if (playing && video.currentTime >= targetTime - 0.005) {
        video.pause()
        playing = false
        video.playbackRate = 1
      }
      opts.onFrame?.(video, Math.round(video.currentTime * 30))
      rvfcId = v.requestVideoFrameCallback!(onFrame)
    }
    rvfcId = v.requestVideoFrameCallback(onFrame)
  }

  return {
    strategy,
    ready,
    get duration() {
      return duration
    },
    get texture() {
      return texture
    },
    get width() {
      return width
    },
    get height() {
      return height
    },
    seek,
    dispose() {
      disposed = true
      if (rvfcId && v.cancelVideoFrameCallback) v.cancelVideoFrameCallback(rvfcId)
      video.pause()
      texture.dispose()
      video.removeAttribute('src')
      video.load()
      video.remove()
    },
  }
}

/* ------------------------------------------------- strategy: webcodecs ----- */

interface DemuxedTrack {
  /** Sample metadata in decode order. cts/dts are in `timescale` units. */
  samples: {
    index: number
    cts: number
    dts: number
    duration: number
    offset: number
    size: number
    sync: boolean
  }[]
  timescale: number
  codec: string
  width: number
  height: number
  /** avcC / hvcC / av1C payload, required by VideoDecoder for these codecs. */
  description: Uint8Array | null
}

/**
 * Parse the container without decoding anything.
 *
 * The whole file is fetched into one ArrayBuffer and sample bytes are sliced out of it by
 * offset. That is deliberate: a scrub video should be small (a few MB — it is a texture, not
 * a movie), and having the bytes resident removes range requests, partial-parse edge cases and
 * an entire class of bug. mp4box is told to discard its own copy of the mdat so we hold one.
 */
async function demux(url: string): Promise<{ file: ArrayBuffer; track: DemuxedTrack }> {
  const [{ createFile, MP4BoxBuffer, MultiBufferStream }, res] = await Promise.all([
    import('mp4box'),
    fetch(url),
  ])
  if (!res.ok) throw new Error(`[scrub] ${res.status} fetching ${url}`)
  const file = await res.arrayBuffer()

  const iso = createFile(false)
  const info = await new Promise<import('mp4box').Movie>((resolve, reject) => {
    iso.onReady = resolve
    iso.onError = (mod, msg) => reject(new Error(`[scrub] mp4box ${mod}: ${msg}`))
    const buf = MP4BoxBuffer.fromArrayBuffer(file, 0)
    iso.appendBuffer(buf, true)
    iso.flush()
  })

  const vt = info.videoTracks[0]
  if (!vt) throw new Error('[scrub] no video track')

  // Codec-specific config record. VideoDecoder rejects avc1/hvc1 without it; av1 and vp9
  // are self-describing so null is correct there.
  let description: Uint8Array | null = null
  const trak = iso.getTrackById(vt.id)
  for (const entry of trak.mdia.minf.stbl.stsd.entries) {
    const e = entry as unknown as {
      avcC?: { write: (s: unknown) => void }
      hvcC?: { write: (s: unknown) => void }
      av1C?: { write: (s: unknown) => void }
    }
    const box = e.avcC ?? e.hvcC ?? e.av1C
    if (!box) continue
    const stream = new MultiBufferStream()
    box.write(stream)
    // Strip the 8-byte box header (size + fourcc); the decoder wants the payload only.
    description = new Uint8Array(stream.buffer.slice(8))
    break
  }

  const raw = iso.getTrackSamplesInfo(vt.id)
  if (!raw.length) throw new Error('[scrub] no samples')

  const samples = raw.map((s, index) => ({
    index,
    cts: s.cts,
    dts: s.dts,
    duration: s.duration,
    offset: s.offset,
    size: s.size,
    sync: s.is_sync !== false,
  }))
  // Presentation order, not decode order — B-frames make these differ, and seeking is a
  // presentation-time operation.
  const byCts = [...samples].sort((a, b) => a.cts - b.cts)

  // Free mp4box's parse state; we only need the plain arrays from here on.
  iso.stop()

  return {
    file,
    track: {
      samples: byCts,
      timescale: vt.timescale,
      codec: vt.codec,
      width: vt.video?.width ?? vt.track_width,
      height: vt.video?.height ?? vt.track_height,
      description,
    },
  }
}

async function createWebCodecsScrub(url: string, opts: ScrubOptions): Promise<VideoScrub> {
  const cacheSize = opts.cacheSize ?? (state.quality === 'high' ? 20 : 10)
  const lookahead = opts.lookahead ?? 3

  const { file, track } = await demux(url)
  const { samples, timescale } = track
  const duration =
    (samples[samples.length - 1].cts + samples[samples.length - 1].duration) / timescale

  const config: VideoDecoderConfig = {
    codec: track.codec,
    codedWidth: track.width,
    codedHeight: track.height,
    description: track.description ?? undefined,
    // Prefer the GPU path. Falls back automatically if unavailable.
    hardwareAcceleration: 'no-preference',
    optimizeForLatency: true,
  }
  const support = await VideoDecoder.isConfigSupported(config)
  if (!support.supported) throw new Error(`[scrub] unsupported codec ${track.codec}`)

  const texture = new THREE.VideoFrameTexture()
  texture.colorSpace = THREE.SRGBColorSpace
  texture.generateMipmaps = false
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter

  const ctx2d = opts.canvas
    ? opts.canvas.getContext('2d', { alpha: false, desynchronized: true })
    : null
  if (opts.canvas) {
    opts.canvas.width = track.width
    opts.canvas.height = track.height
  }

  /* ------------------------------------------------------------------ cache */
  // index -> VideoFrame. VideoFrames hold GPU/system memory that the JS GC does not manage:
  // every frame that leaves this map must be .close()d or the tab climbs until it dies.
  const cache = new Map<number, VideoFrame>()
  const order: number[] = []
  let presentedIndex = -1
  let presentedFrame: VideoFrame | null = null

  const evict = () => {
    while (order.length > cacheSize) {
      const i = order.shift()!
      // Never close what the texture is currently pointing at.
      if (i === presentedIndex) {
        order.push(i)
        if (order.length <= cacheSize) break
        continue
      }
      cache.get(i)?.close()
      cache.delete(i)
    }
  }

  const present = (index: number) => {
    const frame = cache.get(index)
    if (!frame || index === presentedIndex) return
    presentedIndex = index
    presentedFrame = frame
    texture.setFrame(frame)
    if (ctx2d) ctx2d.drawImage(frame, 0, 0)
    opts.onFrame?.(frame, index)
  }

  /* ---------------------------------------------------------------- decoder */
  let wanted = -1
  let fedUpTo = -1
  let runStart = Infinity
  let disposed = false

  // cts (microseconds, as fed to the decoder) -> sample index. The decoder returns frames
  // keyed by timestamp, so this is how output is mapped back to a position.
  const byTimestamp = new Map<number, number>()
  const tsOf = (i: number) => Math.round((samples[i].cts / timescale) * 1e6)

  const decoder = new VideoDecoder({
    output: (frame) => {
      if (disposed) {
        frame.close()
        return
      }
      const index = byTimestamp.get(frame.timestamp ?? -1)
      if (index === undefined) {
        frame.close()
        return
      }
      const existing = cache.get(index)
      if (existing && existing !== presentedFrame) existing.close()
      cache.set(index, frame)
      order.push(index)
      evict()
      // The frame we were waiting for has arrived — show it now, not next frame.
      if (index === wanted) present(index)
    },
    error: (e) => {
      if (!disposed) console.error('[scrub] decoder error:', e)
    },
  })
  decoder.configure(config)

  const syncBefore = (i: number) => {
    for (let j = i; j >= 0; j--) if (samples[j].sync) return j
    return 0
  }

  const feed = (from: number, to: number) => {
    for (let i = from; i <= to && i < samples.length; i++) {
      const s = samples[i]
      const timestamp = tsOf(i)
      byTimestamp.set(timestamp, i)
      decoder.decode(
        new EncodedVideoChunk({
          type: s.sync ? 'key' : 'delta',
          timestamp,
          duration: (s.duration / timescale) * 1e6,
          // Slice, not subarray: EncodedVideoChunk copies, but a detached view of a 5MB
          // buffer keeps the whole buffer reachable in some engines.
          data: new Uint8Array(file, s.offset, s.size),
        }),
      )
      fedUpTo = i
    }
  }

  const restart = (from: number) => {
    // reset() drops queued work and pending outputs, which is exactly what a backwards jump
    // wants: those frames are no longer on the way to anywhere useful.
    decoder.reset()
    decoder.configure(config)
    byTimestamp.clear()
    runStart = from
    fedUpTo = from - 1
    feed(from, Math.min(from + lookahead, samples.length - 1))
  }

  const indexForTime = (t: number): number => {
    // Binary search on presentation time.
    const ticks = t * timescale
    let lo = 0
    let hi = samples.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (samples[mid].cts <= ticks) lo = mid
      else hi = mid - 1
    }
    return lo
  }

  const seek = (progress: number) => {
    if (disposed) return
    const index = indexForTime(clamp(progress) * duration)
    if (index === wanted) return
    wanted = index

    if (cache.has(index)) {
      present(index)
      // Still keep the pipeline warm ahead of the playhead.
      if (index + lookahead > fedUpTo && index >= runStart) {
        feed(fedUpTo + 1, Math.min(index + lookahead, samples.length - 1))
      }
      return
    }

    const sync = syncBefore(index)
    // Continue the current decode run when the target is ahead of it and no keyframe in
    // between resets the reference chain. Otherwise start a new run from the keyframe.
    if (index > fedUpTo && runStart <= sync) {
      feed(fedUpTo + 1, Math.min(index + lookahead, samples.length - 1))
    } else if (index <= fedUpTo && index >= runStart) {
      // Already fed but not yet returned; the output callback will present it.
    } else {
      restart(sync)
      if (index > fedUpTo) feed(fedUpTo + 1, Math.min(index + lookahead, samples.length - 1))
    }
  }

  // Decode frame 0 so the texture is never a black rectangle.
  restart(0)
  wanted = 0
  await decoder.flush().catch(() => {})
  present(0)

  return {
    strategy: 'webcodecs',
    ready: Promise.resolve(),
    duration,
    texture,
    width: track.width,
    height: track.height,
    seek,
    dispose() {
      disposed = true
      try {
        decoder.close()
      } catch {
        /* already closed */
      }
      for (const frame of cache.values()) frame.close()
      cache.clear()
      order.length = 0
      presentedFrame = null
      texture.dispose()
    },
  }
}
