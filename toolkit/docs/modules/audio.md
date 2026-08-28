# `modules/audio.ts`

## Purpose

One `AudioContext`, a master gain → low-pass → analyser chain, decoded one-shots, streamed music, a
persisted mute, ducking, and three band-energy numbers per frame that turn the score into animation input.

**Sound is the highest-leverage, least-used tool in this whole toolkit.** A scroll-reactive drone and three
~40 KB one-shots will do more for the feeling of a site than another postprocessing pass. It is also the
subsystem with the most hard platform rules, and **every one of them is a silent failure** — no error, just
no sound, usually only on the client's phone.

## When to use it

Any experience with a sense of place. A drone that swells as a chapter opens, a single hollow *thock* on a
transition, wind that muffles when you scroll fast. Two or three sounds, chosen well.

## When NOT to use it

- **Not without a user gesture to unlock it.** An `AudioContext` starts suspended. If you have no
  preloader gate and no `bindUnlockGesture()`, there is no sound and no error. See
  [`preloader.md`](preloader.md).
- **Never autoplay with sound.** Browsers block it, and it is the fastest way to lose a visitor.
- **Not without a visible mute.** Non-negotiable. The state persists in `localStorage`; a user who muted
  you once should not have to do it again.
- **Not a music player.** This is ambience and punctuation. If the client wants a playlist with a
  scrubber, that is a different component.
- **Not `loadSfx` for a 4 MB track.** Decoding a long file blocks and holds the whole PCM buffer in
  memory. Use `music()`.

## Signature

```ts
export interface AudioOptions {
  volume?: number             // master, default 0.7
  storageKey?: string | null  // default 'cw-muted'; null to not persist
  fftSize?: number            // default 1024 → 512 bins at ~43 Hz each
  reactive?: boolean          // default on; `false` skips the analyser entirely
}

export interface PlayOptions {
  volume?: number
  rate?: number    // randomise ±10% so repeated one-shots do not sound like a machine
  pan?: number     // -1..1
  loop?: boolean
  fade?: number    // seconds
}

export interface MusicHandle {
  el: HTMLAudioElement
  play(fadeSeconds?: number): Promise<void>   // default fade 2
  pause(fadeSeconds?: number): void           // default fade 1
  setVolume(v: number, seconds?: number): void
  dispose(): void
}

export interface AudioSystem {
  readonly context: AudioContext | null
  readonly unlocked: boolean
  readonly muted: boolean
  unlock(): Promise<void>                    // call from INSIDE a gesture handler. Idempotent.
  bindUnlockGesture(): () => void            // unlock on the first interaction anywhere
  loadSfx(key: string, url: string): Promise<void>
  play(key: string, opts?: PlayOptions): void   // safe before unlock — simply ignored
  music(url: string, opts?: { volume?: number; loop?: boolean }): MusicHandle
  setVolume(v: number, seconds?: number): void
  mute(on?: boolean): boolean                // toggle, or force. Returns the new state.
  duck(amount: number, seconds: number): void
  readonly level: number                     // 0..1, bass-weighted
  readonly bass: number
  readonly mid: number
  readonly treble: number
  setLowpass(hz: number, seconds?: number): void   // 20000 open, 400 underwater
  bindScrollFilter(opts?: { minHz?: number; maxHz?: number }): void
  dispose(): void
}

export function createAudio(opts?: AudioOptions): AudioSystem
```

## Inputs

### The six platform rules, all load-bearing

1. **An `AudioContext` starts suspended.** `resume()` must be called from inside a click/keydown/touch
   handler — **not from a promise chained off one**, because the user-activation flag is consumed
   asynchronously. This is why the preloader has a gate: it is not a design flourish, it is the only
   reliable place to unlock audio.
2. **One context, for the life of the page.** Safari has historically allowed only a handful per page and
   does not reclaim them quickly. One-per-sound works in development and dies after a dozen interactions.
3. **Never assign `gain.value` while sound is playing.** A step change in gain is a discontinuity in the
   waveform, which you hear as a click. Everything here uses `setTargetAtTime`.
4. **Long audio streams, short audio decodes.** Music goes through an `<audio>` element +
   `createMediaElementSource`; one-shots are decoded into `AudioBuffer`s. The wrong choice either stalls
   the page (decoding 4 MB) or adds ~100 ms of latency to a click.
5. **`crossOrigin = 'anonymous'`** on any media element routed through WebAudio. Without it a cross-origin
   file taints the graph and outputs **silence with no error anywhere**.
6. **Never autoplay; always give a visible mute.**

### `setTargetAtTime` and the `/3` everywhere

`setTargetAtTime(target, when, timeConstant)` reaches **~95 % of the target after three time constants**.
So every fade in this module passes `seconds / 3` — that is what makes a "2 second fade" actually take
about 2 seconds.

### The graph

```
sources → master (GainNode) → filter (BiquadFilter, lowpass) → analyser → destination
```

The low-pass costs nothing while open at 20 kHz and gives you the single most useful global effect:
muffling. `Q` stays at the default 1 — resonance here would whistle on transients. The analyser is a
pass-through tap placed **after** the filter, so its numbers reflect what the user actually hears.

`reactive: false` skips the analyser and the loop stage entirely, and `filter` connects straight to
`destination`.

### `fftSize`

1024 → 512 bins at ~43 Hz each at 44.1 kHz, which is plenty for band energy. 2048+ costs more and only
matters for a real spectrum display. `smoothingTimeConstant` is 0.8: **0.95 is sluggish, 0.5 is twitchy**,
and smoothing inside the analyser is cheaper and better than smoothing the output in JS.

## Outputs

**Stage 940 `audio`** (`after: ['state']`, registered at construction unless `reactive: false`) reads the
frequency data and computes:

| value | band | notes |
|---|---|---|
| `bass` | 20–250 Hz | the pulse. What a viewer perceives as "loud" |
| `mid` | 250–2000 Hz | presence |
| `treble` | 2000–12000 Hz | air |
| `level` | `bass×0.5 + mid×0.35 + treble×0.15` | bass-weighted on purpose |

Bin → Hz is `bin * sampleRate / fftSize`; the bands are chosen by ear, not by any standard.

It also publishes **`--audio-level`** (0..1, 3 decimals) on `<html>`, so CSS can react with no JS at all.

**Stage 941 `audio-scroll-filter`** is added only by `bindScrollFilter()`. It maps
`|state.velocity.current|` (clamped at 2) onto the cutoff **exponentially**:
`maxHz * (minHz/maxHz)^speed`. Written straight to `.value` — the parameter is already smoothed by the
damped velocity, so there is no zipper noise to avoid.

**`mute()` writes `data-audio-muted="true|false"` on `<html>`** and persists to `localStorage` under
`storageKey`. Style your toggle off that attribute; do not track the state yourself.

**Visibility handling is automatic:** `document.hidden` suspends the context (real battery saving, and it
stops the track playing over whatever the user switched to) and resumes **only if it was unlocked**, so a
hidden tab never sneaks audio on.

## Transitions and applications

**`bindScrollFilter()` is the single best four lines in this module.** Scrolling fast muffles the mix;
stopping opens it up. It produces a remarkably strong sense of physicality — as though the sound is in the
space you are moving through — and costs one `.value` write per frame:

```ts
audio.bindScrollFilter({ minHz: 600, maxHz: 20000 })
```

**Audio as animation input** — three numbers per frame, and the geometry breathes in time with the score:

```ts
update(weight, ctx) {
  lantern.intensity = 1.2 + audio.bass * 2.5 * weight
  post?.set('uBloomStrength', 0.4 + audio.level * 0.5)
}
```

Or with **no JS at all**, from `--audio-level`:

```css
.sound-toggle__meter { transform: scaleY(calc(0.2 + var(--audio-level, 0) * 0.8)); }
[data-audio-muted='true'] .sound-toggle__meter { transform: scaleY(0.2); }
```

**Sound per scene, driven by `weight`.** Because `weight` is a bell, crossfading two ambiences between
chapters is free and needs no coordination between the scenes:

```ts
update(weight) { ambience.setVolume(weight, 0.2) }
```

**What each tool is for:**

| moment | tool |
|---|---|
| a chapter's ambience | `music(url, { loop: true })`, volume driven by `weight` |
| a transition impact | `play('thock', { volume: 0.8, rate: 0.95 + Math.random() * 0.1 })` |
| a UI click | `play('tick', { volume: 0.3 })` |
| an object hover | `play('shimmer', { pan: hitScreenX })` — pan by screen position |
| a line of dialogue over music | `duck(0.35, 2.5)` |
| going "underwater" / inside / a memory | `setLowpass(400, 1.2)` |
| coming back out | `setLowpass(20000, 0.8)` |
| speed as physicality | `bindScrollFilter()` |

**Randomise `rate` by ±10 % on any repeated one-shot.** Identical playback of the same sample is what makes
a UI sound cheap; a 10 % spread is the difference between a machine and a texture.

**Pan by screen position** for a sound tied to something visible — `worldToScreen(obj.position, camera)`,
normalise x to −1..1, pass as `pan`. Free spatialisation without a `PannerNode`.

## Gotchas

**`unlock()` must be called synchronously inside the gesture handler.** `button.onclick = () => audio.unlock()`
is fine. `button.onclick = async () => { await somethingElse(); audio.unlock() }` is **not** — the
activation flag is gone by then, `resume()` rejects, and you get a console warning and silence.

**`play()` before unlock is silently ignored.** By design — it keeps call sites free of guards — but it
does mean a "why is there no click sound" bug has exactly one likely cause.

**`decodeAudioData` detaches the `ArrayBuffer` it is given.** Each buffer is single-use. This module
fetches during the preloader, holds the bytes in `pendingSfx` if no context exists yet, and decodes at
unlock — the correct split, because the network is the slow part. Do not try to decode the same
`ArrayBuffer` twice.

**An `AudioBufferSourceNode` is single-use and cannot be restarted.** Creating one per `play()` is the
intended pattern, is very cheap, and is what lets a sound overlap itself.

**Disconnect on `ended` or the graph accumulates dead nodes** for the life of the page. They make no sound
and are still processed. This module does it in `src.onended`.

**Once an element goes through `createMediaElementSource`, its audio no longer reaches the speakers
directly.** Everything must go through the graph from then on, and the element must not be garbage
collected — which is why `music()` appends a hidden `<audio>` to the body and keeps the handle in a list.

**`pause(fade)` must delay the actual `el.pause()` until the fade has finished**, or you hear the cut. This
module waits `fade * 1000 + 60` ms.

**Frequency needs `exponentialRampToValueAtTime`, not linear.** Frequency is perceived logarithmically; a
linear ramp spends most of its time in the top octave where almost nothing is audible, so it sounds like
nothing happens and then everything happens at once. `setLowpass` clamps to ≥ 40 Hz because an exponential
ramp cannot pass through zero.

**`duck()` does nothing while muted** — deliberate, so a duck does not un-mute the site by writing a
non-zero gain.

**`mute()` restores `baseVolume`, not your last `setVolume()` value.** If you drive volume dynamically,
re-apply it after unmuting.

**iOS needs an actual sound played through the context before it stays awake.** `unlock()` plays a
1-sample silent buffer for exactly this reason. Removing it "because it does nothing" breaks iOS.

**`localStorage` can throw** (private mode, disabled storage). Both reads and writes here are wrapped;
not-muted is the right default.

**Never one context per sound.** Rule 2 above. It works locally and dies on the client's iPhone.

**`dispose()` closes the context.** After that the whole system is dead — you cannot re-unlock it. Create
one `AudioSystem` for the page and keep it.

## Recipe

Full wiring, with the preloader gate as the unlock point:

```ts
import { createAudio } from '../modules/audio'
import { createPreloader, preloaderHooks } from '../modules/preloader'

const audio = createAudio({
  volume: 0.7,
  fftSize: 1024,
  reactive: true,          // publishes --audio-level and fills level/bass/mid/treble
})

const pre = createPreloader({
  gate: true,              // MANDATORY when there is audio
  enter: '[data-preload-enter]',
  minMs: 1200,
})

// Fetch during the preloader; decoding happens at unlock.
await Promise.all([
  audio.loadSfx('thock', '/audio/thock.mp3'),
  audio.loadSfx('tick', '/audio/tick.mp3'),
])

// Synchronous inside the gesture handler — this is the whole trick.
document.querySelector('[data-preload-enter]')!.addEventListener('click', () => {
  void audio.unlock()
})

const app = await boot({ manifest, assets, ...preloaderHooks(pre) })

const ambience = audio.music('/audio/dusk-drone.mp3', { loop: true, volume: 0.55 })
await ambience.play(3)     // 3-second fade in

audio.bindScrollFilter({ minHz: 600, maxHz: 20000 })
```

A mute toggle, styled entirely from the attribute the module writes:

```html
<button class="sound-toggle" data-cursor="sound" aria-pressed="false">
  <span class="sound-toggle__meter"></span>
  <span class="sound-toggle__label">sound</span>
</button>
```

```ts
const btn = document.querySelector<HTMLButtonElement>('.sound-toggle')!
btn.addEventListener('click', () => {
  const muted = audio.mute()                    // toggles, persists, sets data-audio-muted
  btn.setAttribute('aria-pressed', String(!muted))
})
```

```css
.sound-toggle__meter {
  transform: scaleY(calc(0.2 + var(--audio-level, 0) * 0.8));
  transform-origin: 50% 100%;
}
[data-audio-muted='true'] .sound-toggle__meter { transform: scaleY(0.2); }
```

A scene with its own ambience and an impact on the cut:

```ts
let ambience: MusicHandle | null = null

export default {
  id: '04-duel',
  renderer: 'three',
  section: '#chapter-duel',

  build() {
    ambience = audio.music('/audio/duel-bed.mp3', { loop: true, volume: 0 })
    void ambience.play(0.01)          // start silent; weight drives it
  },

  update(weight, ctx) {
    ambience?.setVolume(weight * 0.6, 0.2)     // crossfades with neighbours for free
    katanaLight.intensity = 0.8 + audio.bass * 3 * weight
  },

  enter(dir) {
    if (dir > 0) {
      audio.play('thock', { volume: 0.85, rate: 0.95 + Math.random() * 0.1 })
      audio.duck(0.4, 1.8)            // pull the bed down under the impact
    }
  },

  dispose() {
    ambience?.dispose()
    ambience = null
  },
}
```

Related: [`preloader.md`](preloader.md) (the gate — why it exists),
[`../kernel/loop.md`](../kernel/loop.md) (stages 940 / 941),
[`../kernel/state.md`](../kernel/state.md) (`velocity.current`),
[`dom-bridge.md`](dom-bridge.md) (`--audio-level` alongside the other published properties),
[`post.md`](post.md) (driving a grade from `level`), [`cursor.md`](cursor.md) (`data-cursor="sound"`).
