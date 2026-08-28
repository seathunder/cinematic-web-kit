/**
 * Audio.
 *
 * Sound is the highest-leverage, least-used tool in this whole toolkit. A scroll-reactive drone
 * and three ~40KB one-shots will do more for the feeling of a site than another postprocessing
 * pass. It is also the subsystem with the most hard platform rules, and every one of them is a
 * silent failure — no error, just no sound, usually only on the client's phone.
 *
 * The rules, all of them load-bearing:
 *
 *   1. **An AudioContext starts suspended.** Every browser blocks audio until a real user
 *      gesture. `resume()` must be called from inside a click/keydown/touch handler — not from a
 *      promise chained off one, because the "user activation" flag is consumed asynchronously.
 *      This is why the preloader has a gate: it is not a design flourish, it is the only reliable
 *      place to unlock audio.
 *   2. **One context, for the life of the page.** Safari has historically allowed only a handful
 *      of AudioContexts per page and does not reclaim them quickly. Creating one per sound works
 *      in development and dies after a dozen interactions.
 *   3. **Never assign `gain.value` while sound is playing.** A step change in gain is a
 *      discontinuity in the waveform, which you hear as a click. Use `setTargetAtTime` — the
 *      exponential approach is also what makes a duck sound intentional rather than abrupt.
 *   4. **Long audio streams, short audio decodes.** Music goes through an `<audio>` element and
 *      `createMediaElementSource` so it streams and starts instantly. One-shots are decoded into
 *      AudioBuffers so they can fire with zero latency and overlap themselves. Using the wrong
 *      one either stalls the page (decoding a 4MB track) or adds 100ms of latency to a click.
 *   5. **`crossOrigin = 'anonymous'` on any media element you route through WebAudio.** Without
 *      it a cross-origin file "taints" the graph and outputs silence — no error anywhere.
 *   6. **Never autoplay with sound, and always give a visible mute.** Both because browsers block
 *      it and because it is the fastest way to lose a visitor. The state persists in
 *      localStorage; a user who muted you once should not have to do it again.
 *
 * The analyser half turns audio into animation input, which is the cheapest "reactive" effect
 * there is: three numbers per frame that make lights pulse and geometry breathe in time with the
 * score.
 */
import { addStage, removeStage } from '../kernel/loop'
import { state, clamp } from '../kernel/state'

export interface AudioOptions {
  /** Master volume, 0..1. */
  volume?: number
  /** localStorage key for the mute preference. Set null to not persist. */
  storageKey?: string | null
  /**
   * FFT size for the analyser. 1024 gives 512 bins at ~43Hz each (at 44.1kHz) which is plenty
   * for band energy. 2048+ costs more and only matters for a real spectrum display.
   */
  fftSize?: number
  /** Publish `--audio-level` on <html> and update level/bass/mid/treble each frame. */
  reactive?: boolean
}

export interface PlayOptions {
  volume?: number
  /** Playback rate. Randomising this by ±10% stops repeated one-shots sounding like a machine. */
  rate?: number
  /** Stereo pan, -1..1. */
  pan?: number
  loop?: boolean
  /** Seconds of fade-in. */
  fade?: number
}

export interface MusicHandle {
  el: HTMLAudioElement
  play(fadeSeconds?: number): Promise<void>
  pause(fadeSeconds?: number): void
  setVolume(v: number, seconds?: number): void
  dispose(): void
}

export interface AudioSystem {
  readonly context: AudioContext | null
  readonly unlocked: boolean
  readonly muted: boolean
  /** Call from inside a user gesture handler. Idempotent. */
  unlock(): Promise<void>
  /** Attach one-shot listeners that unlock on the first interaction anywhere. */
  bindUnlockGesture(): () => void
  /** Fetch + decode a one-shot. Do this during the preloader. */
  loadSfx(key: string, url: string): Promise<void>
  /** Fire a loaded one-shot. Safe to call before unlock — it is simply ignored. */
  play(key: string, opts?: PlayOptions): void
  /** Stream a long track. Returns a handle; call play() from a gesture. */
  music(url: string, opts?: { volume?: number; loop?: boolean }): MusicHandle
  setVolume(v: number, seconds?: number): void
  /** Toggle, or force a value. Returns the new state. */
  mute(on?: boolean): boolean
  /** Drop the master to `amount` for `seconds`, then come back. For dialogue and impacts. */
  duck(amount: number, seconds: number): void
  /** Overall loudness 0..1, smoothed. Only meaningful with `reactive`. */
  readonly level: number
  readonly bass: number
  readonly mid: number
  readonly treble: number
  /** Master low-pass cutoff in Hz. 20000 is open, 400 is "muffled/underwater". */
  setLowpass(hz: number, seconds?: number): void
  /**
   * Tie the low-pass to scroll speed, so moving fast muffles the mix and stopping opens it up.
   * A remarkably strong sense of physicality for four lines of code.
   */
  bindScrollFilter(opts?: { minHz?: number; maxHz?: number }): void
  dispose(): void
}

type WindowWithWebkit = Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }

export function createAudio(opts: AudioOptions = {}): AudioSystem {
  const storageKey = opts.storageKey === undefined ? 'cw-muted' : opts.storageKey
  const baseVolume = opts.volume ?? 0.7

  let ctx: AudioContext | null = null
  let master: GainNode | null = null
  let filter: BiquadFilterNode | null = null
  let analyser: AnalyserNode | null = null
  let bins: Uint8Array<ArrayBuffer> | null = null

  let unlocked = false
  let muted = false
  if (storageKey) {
    try {
      muted = localStorage.getItem(storageKey) === '1'
    } catch {
      // Private mode / disabled storage. Not muted is the right default.
    }
  }

  const sfx = new Map<string, AudioBuffer>()
  const pendingSfx = new Map<string, ArrayBuffer>()
  const musicHandles: MusicHandle[] = []

  let level = 0
  let bass = 0
  let mid = 0
  let treble = 0

  /* ------------------------------------------------------------------- graph */

  const build = () => {
    if (ctx) return
    const Ctor = window.AudioContext ?? (window as WindowWithWebkit).webkitAudioContext
    if (!Ctor) {
      console.warn('[audio] no AudioContext; audio disabled')
      return
    }
    ctx = new Ctor()

    master = ctx.createGain()
    master.gain.value = muted ? 0 : baseVolume

    // A low-pass in the master path costs nothing when open at 20kHz and gives you the single
    // most useful global effect: muffling. Q stays at the default 1 — resonance here would
    // whistle on transients.
    filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 20000

    // master -> filter -> analyser -> destination. The analyser is a pass-through tap, so its
    // position only affects what it measures; after the filter means the numbers reflect what
    // the user actually hears.
    master.connect(filter)
    filter.connect(analyserOrDestination())
  }

  const analyserOrDestination = (): AudioNode => {
    if (!ctx) throw new Error('[audio] no context')
    if (opts.reactive === false) return ctx.destination
    analyser = ctx.createAnalyser()
    analyser.fftSize = opts.fftSize ?? 1024
    // Smoothing is applied inside the analyser, which is cheaper and better than smoothing the
    // output in JS: 0.8 gives a musical response, 0.95 is sluggish, 0.5 is twitchy.
    analyser.smoothingTimeConstant = 0.8
    bins = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount))
    analyser.connect(ctx.destination)
    return analyser
  }

  /* ------------------------------------------------------------------ unlock */

  const unlock = async () => {
    build()
    if (!ctx) return
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume()
      } catch (err) {
        console.warn('[audio] resume rejected — not called from a user gesture?', err)
        return
      }
    }

    // iOS needs an actual sound to have been played through the context before it stays awake.
    // One sample of silence satisfies it and is inaudible.
    const silence = ctx.createBuffer(1, 1, ctx.sampleRate)
    const src = ctx.createBufferSource()
    src.buffer = silence
    src.connect(ctx.destination)
    src.start(0)

    unlocked = ctx.state === 'running'

    // Anything fetched before the context existed can only be decoded now: decodeAudioData
    // needs a context, and it *detaches* the ArrayBuffer it is given, so each one is used once.
    for (const [key, data] of pendingSfx) {
      try {
        sfx.set(key, await ctx.decodeAudioData(data))
      } catch (err) {
        console.warn(`[audio] cannot decode "${key}"`, err)
      }
    }
    pendingSfx.clear()
  }

  const bindUnlockGesture = () => {
    const go = () => {
      void unlock()
      off()
    }
    const off = () => {
      window.removeEventListener('pointerdown', go)
      window.removeEventListener('keydown', go)
      window.removeEventListener('touchstart', go)
    }
    // Not `{ once: true }` on each: the first of any of them must remove all three.
    window.addEventListener('pointerdown', go)
    window.addEventListener('keydown', go)
    window.addEventListener('touchstart', go)
    return off
  }

  /* -------------------------------------------------------------------- sfx */

  const loadSfx = async (key: string, url: string) => {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`[audio] ${res.status} loading ${url}`)
    const data = await res.arrayBuffer()
    if (!ctx) {
      // Hold the bytes; decode when the context exists. Fetching during the preloader and
      // decoding at unlock is the correct split — the network is the slow part.
      pendingSfx.set(key, data)
      return
    }
    sfx.set(key, await ctx.decodeAudioData(data))
  }

  const play = (key: string, o: PlayOptions = {}) => {
    if (!ctx || !master || !unlocked) return
    const buffer = sfx.get(key)
    if (!buffer) return

    // A BufferSource is single-use by design — it cannot be restarted. Creating one per play is
    // the intended pattern and is very cheap; it also means the same sound can overlap itself.
    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.loop = o.loop ?? false
    src.playbackRate.value = o.rate ?? 1

    const gain = ctx.createGain()
    const target = o.volume ?? 1
    if (o.fade) {
      gain.gain.value = 0
      gain.gain.setTargetAtTime(target, ctx.currentTime, o.fade / 3)
    } else {
      gain.gain.value = target
    }

    let tail: AudioNode = gain
    if (o.pan !== undefined && ctx.createStereoPanner) {
      const panner = ctx.createStereoPanner()
      panner.pan.value = clamp(o.pan, -1, 1)
      gain.connect(panner)
      tail = panner
    }

    src.connect(gain)
    tail.connect(master)
    src.start()
    // Disconnect on end or the graph accumulates dead nodes for the life of the page. They do
    // not make sound, but each one is still processed.
    src.onended = () => {
      src.disconnect()
      gain.disconnect()
      if (tail !== gain) tail.disconnect()
    }
  }

  /* ------------------------------------------------------------------ music */

  const music = (url: string, o: { volume?: number; loop?: boolean } = {}): MusicHandle => {
    build()

    const el = document.createElement('audio')
    el.src = url
    el.loop = o.loop ?? true
    el.preload = 'auto'
    // Mandatory for WebAudio routing of any cross-origin file; harmless for same-origin.
    el.crossOrigin = 'anonymous'
    el.style.display = 'none'
    document.body.appendChild(el)

    let gain: GainNode | null = null
    let source: MediaElementAudioSourceNode | null = null
    const targetVolume = o.volume ?? 1

    const connect = () => {
      if (!ctx || !master || source) return
      // Once an element is routed through createMediaElementSource its audio no longer reaches
      // the speakers directly — everything must go through the graph from here on, and the
      // element must not be garbage collected.
      source = ctx.createMediaElementSource(el)
      gain = ctx.createGain()
      gain.gain.value = 0
      source.connect(gain)
      gain.connect(master)
    }

    const handle: MusicHandle = {
      el,
      async play(fade = 2) {
        await unlock()
        if (!ctx) return
        connect()
        try {
          await el.play()
        } catch (err) {
          console.warn('[audio] music play blocked', err)
          return
        }
        // Time constant is fade/3 because setTargetAtTime reaches ~95% of the target after
        // three time constants — so this actually takes about `fade` seconds.
        gain?.gain.setTargetAtTime(targetVolume, ctx.currentTime, Math.max(0.01, fade / 3))
      },
      pause(fade = 1) {
        if (!ctx || !gain) {
          el.pause()
          return
        }
        gain.gain.setTargetAtTime(0, ctx.currentTime, Math.max(0.01, fade / 3))
        // Pause only after the fade has actually finished, or you hear the cut.
        window.setTimeout(() => el.pause(), fade * 1000 + 60)
      },
      setVolume(v, seconds = 0.3) {
        if (!ctx || !gain) return
        gain.gain.setTargetAtTime(clamp(v), ctx.currentTime, Math.max(0.01, seconds / 3))
      },
      dispose() {
        el.pause()
        source?.disconnect()
        gain?.disconnect()
        el.removeAttribute('src')
        el.load()
        el.remove()
        const i = musicHandles.indexOf(handle)
        if (i !== -1) musicHandles.splice(i, 1)
      },
    }

    musicHandles.push(handle)
    return handle
  }

  /* ---------------------------------------------------------------- reactive */

  let stageAdded = false
  const addReactiveStage = () => {
    if (stageAdded || opts.reactive === false) return
    stageAdded = true
    addStage({
      order: 940,
      name: 'audio',
      after: ['state'],
      fn: () => {
        if (!analyser || !bins) return
        analyser.getByteFrequencyData(bins)

        // Bin -> Hz is `bin * sampleRate / fftSize`. Bands are chosen by ear, not by standard:
        // sub/low for the pulse, mid for presence, high for air.
        const nyquistBins = bins.length
        const hzPerBin = (ctx?.sampleRate ?? 44100) / 2 / nyquistBins
        const bandEnergy = (loHz: number, hiHz: number) => {
          const lo = Math.max(0, Math.floor(loHz / hzPerBin))
          const hi = Math.min(nyquistBins - 1, Math.ceil(hiHz / hzPerBin))
          let sum = 0
          for (let i = lo; i <= hi; i++) sum += bins![i]
          return sum / Math.max(1, hi - lo + 1) / 255
        }

        bass = bandEnergy(20, 250)
        mid = bandEnergy(250, 2000)
        treble = bandEnergy(2000, 12000)
        // Weighted toward bass because that is what the body of a mix sits in, and what a
        // viewer perceives as "loud".
        level = clamp(bass * 0.5 + mid * 0.35 + treble * 0.15)

        document.documentElement.style.setProperty('--audio-level', level.toFixed(3))
      },
    })
  }
  addReactiveStage()

  /* -------------------------------------------------------------- suspend/resume */

  const onVisibility = () => {
    if (!ctx) return
    // Suspending saves real battery and stops the track playing over whatever the user switched
    // to. Resume only if we were unlocked, so a hidden tab never sneaks audio on.
    if (document.hidden) void ctx.suspend()
    else if (unlocked) void ctx.resume()
  }
  document.addEventListener('visibilitychange', onVisibility)

  /* -------------------------------------------------------------------- api */

  let scrollFilterBound = false

  return {
    get context() {
      return ctx
    },
    get unlocked() {
      return unlocked
    },
    get muted() {
      return muted
    },
    unlock,
    bindUnlockGesture,
    loadSfx,
    play,
    music,
    setVolume(v, seconds = 0.2) {
      if (!ctx || !master) return
      master.gain.setTargetAtTime(muted ? 0 : clamp(v), ctx.currentTime, Math.max(0.01, seconds / 3))
    },
    mute(on) {
      muted = on ?? !muted
      if (ctx && master) {
        master.gain.setTargetAtTime(muted ? 0 : baseVolume, ctx.currentTime, 0.05)
      }
      if (storageKey) {
        try {
          localStorage.setItem(storageKey, muted ? '1' : '0')
        } catch {
          /* storage unavailable */
        }
      }
      document.documentElement.dataset.audioMuted = String(muted)
      return muted
    },
    duck(amount, seconds) {
      if (!ctx || !master || muted) return
      const now = ctx.currentTime
      master.gain.cancelScheduledValues(now)
      master.gain.setTargetAtTime(baseVolume * amount, now, 0.02)
      master.gain.setTargetAtTime(baseVolume, now + seconds, seconds / 3)
    },
    get level() {
      return level
    },
    get bass() {
      return bass
    },
    get mid() {
      return mid
    },
    get treble() {
      return treble
    },
    setLowpass(hz, seconds = 0.4) {
      if (!ctx || !filter) return
      // Frequency is perceived logarithmically, so an exponential ramp is the one that sounds
      // like a smooth sweep. A linear ramp spends most of its time in the top octave, where
      // almost nothing is audible.
      filter.frequency.cancelScheduledValues(ctx.currentTime)
      filter.frequency.exponentialRampToValueAtTime(
        Math.max(40, hz),
        ctx.currentTime + Math.max(0.01, seconds),
      )
    },
    bindScrollFilter(o = {}) {
      if (scrollFilterBound) return
      scrollFilterBound = true
      const minHz = o.minHz ?? 600
      const maxHz = o.maxHz ?? 20000
      addStage({
        order: 941,
        name: 'audio-scroll-filter',
        after: ['state'],
        fn: () => {
          if (!ctx || !filter) return
          const speed = Math.min(1, Math.abs(state.velocity.current) / 2)
          // Exponential interpolation in frequency space, for the same perceptual reason as
          // above. Written straight to .value: the parameter is smoothed by the damped
          // velocity already, so there is no zipper noise to avoid.
          filter.frequency.value = maxHz * Math.pow(minHz / maxHz, speed)
        },
      })
    },
    dispose() {
      removeStage('audio')
      if (scrollFilterBound) removeStage('audio-scroll-filter')
      document.removeEventListener('visibilitychange', onVisibility)
      for (const h of [...musicHandles]) h.dispose()
      sfx.clear()
      pendingSfx.clear()
      analyser?.disconnect()
      filter?.disconnect()
      master?.disconnect()
      void ctx?.close()
      ctx = null
      document.documentElement.style.removeProperty('--audio-level')
    },
  }
}
