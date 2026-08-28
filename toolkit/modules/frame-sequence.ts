/**
 * Image-sequence scrubbing, with bounded memory.
 *
 * The classic Apple-product-page technique: a folder of numbered stills, one shown per scroll
 * position. It looks trivial and every open-source implementation I could find gets the memory
 * wrong in the same way — they decode every frame into an Image or ImageBitmap up front. Do the
 * arithmetic: 240 frames of 1920x1080 RGBA is 240 x 8.3MB = **2GB**. It runs on a dev machine
 * with 32GB and swap, and it kills the tab on a phone.
 *
 * The fix is that "loaded" and "decoded" are two different states with two different costs, so
 * they get two different caches:
 *
 *   encoded tier   Every frame, as a Blob. A 1280x720 WebP frame is 40–80KB, so a 240-frame
 *                  sequence is 10–20MB total. Cheap enough to hold all of it, forever.
 *   decoded tier   A sliding window of ImageBitmaps around the playhead — the only thing that
 *                  costs real memory. 12 frames each side of 720p is ~100MB, and re-decoding
 *                  from the encoded tier when the window moves takes 2–5ms off the main thread.
 *
 * Two more things that matter:
 *
 *   sparse-first   Fetch every Nth frame before filling in the gaps, so the entire timeline is
 *                  scrubbable (at reduced temporal fidelity) after ~1/8th of the download
 *                  instead of after all of it. The user can start scrolling immediately and the
 *                  detail arrives underneath them. This is the single biggest perceived-speed
 *                  win available here.
 *   direction bias The window is asymmetric, weighted the way the user is already scrolling.
 *                  Frames behind the playhead are the cheapest thing to give up.
 *
 * Encode the source with `cw frames` — WebP quality 82 at 1280px wide is the sweet spot, and
 * it is roughly 4x smaller than the JPEGs most of these sequences ship as.
 */
import * as THREE from 'three'
import { state, clamp } from '../kernel/state'

export interface FrameSequenceOptions {
  /** Build a URL for frame i (0-based). */
  src: (i: number) => string
  count: number
  /**
   * Decoded frames kept each side of the playhead. Memory is
   * (2*window+1) x width x height x 4 bytes — check it before raising this.
   */
  window?: number
  /** Load every Nth frame first so the whole range is scrubbable early. 0 disables. */
  sparse?: number
  /** Parallel fetches. 6 matches the browser's per-host HTTP/1.1 limit; raise for HTTP/2. */
  concurrency?: number
  /** Draw presented frames into this canvas too (for `canvas2d` scenes). */
  canvas?: HTMLCanvasElement
  onFrame?: (bitmap: ImageBitmap, index: number) => void
  /** Progress 0..1 over the full sequence. */
  onProgress?: (p: number) => void
}

export interface FrameSequence {
  /** Resolves once the sparse pass is done — enough to scrub. Not the full download. */
  readonly ready: Promise<void>
  /** Resolves when every frame is in the encoded tier. */
  readonly complete: Promise<void>
  readonly texture: THREE.Texture
  readonly count: number
  readonly width: number
  readonly height: number
  /** 0..1. Call from a scene's update(). */
  seek(progress: number): void
  progress(): number
  dispose(): void
}

export function createFrameSequence(opts: FrameSequenceOptions): FrameSequence {
  const count = opts.count
  const windowSize = opts.window ?? (state.quality === 'high' ? 12 : 6)
  const sparseStep = opts.sparse ?? 8
  const concurrency = opts.concurrency ?? 6

  /* ------------------------------------------------------------- encoded tier */
  const blobs = new Map<number, Blob>()
  const inflight = new Map<number, Promise<void>>()
  const failed = new Set<number>()
  let loadedCount = 0

  /* ------------------------------------------------------------- decoded tier */
  const bitmaps = new Map<number, ImageBitmap>()
  const decoding = new Set<number>()

  let width = 0
  let height = 0
  let presented = -1
  let wanted = 0
  let disposed = false

  // A 1x1 placeholder so the material has something valid before the first frame decodes.
  const texture = new THREE.Texture()
  texture.colorSpace = THREE.SRGBColorSpace
  texture.generateMipmaps = false
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter

  const ctx2d = opts.canvas
    ? opts.canvas.getContext('2d', { alpha: false, desynchronized: true })
    : null

  const controller = new AbortController()

  /* -------------------------------------------------------------- fetch queue */

  const fetchFrame = (i: number): Promise<void> => {
    if (blobs.has(i) || failed.has(i)) return Promise.resolve()
    const existing = inflight.get(i)
    if (existing) return existing

    const p = fetch(opts.src(i), { signal: controller.signal, cache: 'force-cache' })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status))
        return r.blob()
      })
      .then((blob) => {
        if (disposed) return
        blobs.set(i, blob)
        loadedCount++
        opts.onProgress?.(loadedCount / count)
      })
      .catch((err) => {
        if (disposed || controller.signal.aborted) return
        // A single missing frame must not stop the sequence — the neighbour is shown instead
        // and the gap is invisible at scroll speed.
        failed.add(i)
        console.warn(`[frames] frame ${i} failed:`, err)
      })
      .finally(() => {
        inflight.delete(i)
      })

    inflight.set(i, p)
    return p
  }

  /** Run a list of indices through a fixed-size worker pool, in order. */
  const runPool = async (indices: number[]): Promise<void> => {
    let cursor = 0
    const worker = async () => {
      while (cursor < indices.length && !disposed) {
        const i = indices[cursor++]
        await fetchFrame(i)
      }
    }
    await Promise.all(Array.from({ length: concurrency }, worker))
  }

  /* ----------------------------------------------------------------- decoding */

  const decodeFrame = async (i: number): Promise<void> => {
    if (disposed || bitmaps.has(i) || decoding.has(i)) return
    const blob = blobs.get(i)
    if (!blob) return
    decoding.add(i)
    try {
      // createImageBitmap decodes off the main thread. `new Image()` + onload does not, and
      // that difference is why sequence players built on Image() hitch on every frame.
      const bitmap = await createImageBitmap(blob)
      if (disposed) {
        bitmap.close()
        return
      }
      if (!width) {
        width = bitmap.width
        height = bitmap.height
        if (opts.canvas) {
          opts.canvas.width = width
          opts.canvas.height = height
        }
      }
      bitmaps.set(i, bitmap)
      if (i === wanted) present(i)
    } catch {
      failed.add(i)
    } finally {
      decoding.delete(i)
    }
  }

  const present = (i: number) => {
    const bitmap = bitmaps.get(i)
    if (!bitmap || i === presented) return
    presented = i
    texture.image = bitmap
    texture.needsUpdate = true
    if (ctx2d) ctx2d.drawImage(bitmap, 0, 0)
    opts.onFrame?.(bitmap, i)
  }

  /** Closest available frame to `i`, so scrubbing never shows a blank. */
  const nearestAvailable = (i: number): number => {
    if (bitmaps.has(i)) return i
    for (let d = 1; d <= count; d++) {
      if (bitmaps.has(i - d)) return i - d
      if (bitmaps.has(i + d)) return i + d
    }
    return -1
  }

  /* ------------------------------------------------------- window maintenance */

  const updateWindow = (center: number) => {
    // Asymmetric: two thirds of the window sits ahead of the playhead in the direction of
    // travel. Frames already scrolled past are the first thing worth dropping.
    const ahead = state.direction > 0 ? windowSize : Math.ceil(windowSize / 3)
    const behind = state.direction > 0 ? Math.ceil(windowSize / 3) : windowSize
    const lo = Math.max(0, center - behind)
    const hi = Math.min(count - 1, center + ahead)

    // Free everything outside. ImageBitmap.close() is not optional — without it the tab's
    // memory climbs until the OS kills it, and it will not show up in a JS heap snapshot.
    for (const [i, bitmap] of bitmaps) {
      if (i < lo || i > hi) {
        if (i === presented) continue
        bitmap.close()
        bitmaps.delete(i)
      }
    }

    // Decode nearest-first so the frame under the playhead wins the race.
    const order: number[] = []
    for (let d = 0; d <= Math.max(ahead, behind); d++) {
      const f = center + d * (state.direction > 0 ? 1 : -1)
      const b = center - d * (state.direction > 0 ? 1 : -1)
      if (f >= lo && f <= hi) order.push(f)
      if (d > 0 && b >= lo && b <= hi) order.push(b)
    }
    for (const i of order) {
      if (bitmaps.has(i) || decoding.has(i)) continue
      if (blobs.has(i)) void decodeFrame(i)
      // Not downloaded yet — pull it forward out of queue order. The sequential pass will
      // skip it because fetchFrame is idempotent.
      else void fetchFrame(i).then(() => decodeFrame(i))
    }
  }

  /* ---------------------------------------------------------------- load plan */

  const sparseIndices: number[] = []
  if (sparseStep > 1) {
    for (let i = 0; i < count; i += sparseStep) sparseIndices.push(i)
    // Always include the last frame: a sequence that never reaches its final pose looks broken
    // at the bottom of the section, and it is the frame most likely to be a hero shot.
    if (sparseIndices[sparseIndices.length - 1] !== count - 1) sparseIndices.push(count - 1)
  }

  const restIndices: number[] = []
  const sparseSet = new Set(sparseIndices)
  for (let i = 0; i < count; i++) if (!sparseSet.has(i)) restIndices.push(i)

  const ready = (async () => {
    if (sparseIndices.length) {
      await runPool(sparseIndices)
      // Decode the first frame immediately so the section is never empty.
      await decodeFrame(0)
      present(nearestAvailable(0))
    } else {
      await runPool([0])
      await decodeFrame(0)
      present(0)
    }
  })()

  const complete = ready.then(() => runPool(restIndices))

  /* -------------------------------------------------------------------- seek */

  let lastCenter = -1

  const seek = (progress: number) => {
    if (disposed) return
    const i = Math.min(count - 1, Math.max(0, Math.round(clamp(progress) * (count - 1))))
    wanted = i

    const have = bitmaps.has(i) ? i : nearestAvailable(i)
    if (have >= 0) present(have)

    // Re-planning the window on every sub-frame move would thrash the decode queue.
    if (Math.abs(i - lastCenter) >= 1) {
      lastCenter = i
      updateWindow(i)
    }
  }

  return {
    ready,
    complete,
    texture,
    count,
    get width() {
      return width
    },
    get height() {
      return height
    },
    seek,
    progress: () => loadedCount / count,
    dispose() {
      disposed = true
      controller.abort()
      for (const bitmap of bitmaps.values()) bitmap.close()
      bitmaps.clear()
      blobs.clear()
      inflight.clear()
      texture.image = null
      texture.dispose()
    },
  }
}
