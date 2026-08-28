# `modules/preloader.ts`

## Purpose

The loading overlay: a damped, monotonic progress number, an optional user-gesture gate (which audio
requires), a minimum display time, and a coordinated hand-off to the first frame.

## When to use it

Every project that loads a 3D asset. A cinematic site has a real load cost; the preloader is what makes
that cost feel intentional instead of broken.

## When NOT to use it

- **Not on a tier-1 one-pager with no heavy assets.** If the page is ready in 400 ms, a preloader adds
  400 ms of nothing. Skip it and let `data-ready` reveal the hero.
- **Not as a brand animation of arbitrary length.** `minMs` exists to prevent a flash, not to hold the
  user hostage. Above ~2000 ms you are costing conversions.

## Signature

```ts
export interface PreloaderOptions {
  el?: HTMLElement | string           // overlay root; default '[data-preloader]'
  counter?: HTMLElement | string | null
  minMs?: number                      // minimum visible time, anti-flash
  gate?: boolean                      // require a click before continuing
  enter?: HTMLElement | string | null  // the gate button
  outDuration?: number
  onTick?: (p: number) => void
}

export interface Preloader {
  set(p: number): void                // real progress, 0..1
  done(): Promise<void>               // resolves when settled (progress + minMs + gate)
  hide(): Promise<void>               // animate out, remove, unregister the stage
  destroy(): void
}

export function createPreloader(opts?: PreloaderOptions): Preloader
export function preloaderHooks(pre: Preloader): {
  onProgress: (p: number) => void
  onReady: () => Promise<void>
}
```

## Inputs

**`set(p)` is the *real* progress**; what the user sees is a damped, **monotonic** version of it. The
displayed value is `max(shown, shown + (real - shown) * f)` — it can never go down. A bar that goes
backwards destroys trust faster than a slow one does, and real progress *does* go backwards when a
weight estimate is wrong.

**`gate: true`** requires a click before the site starts. Use it when there is audio: an `AudioContext`
can only be resumed from inside a gesture handler, so without a gate the sound never plays. If `enter`
names no element in the DOM, it degrades to "click anywhere on the overlay" rather than a page that
never starts.

**`minMs`** prevents the flash on a warm cache. 800–1200 ms is the useful band.

## Outputs

Stage **5** `preloader` runs before `state` (order 10), because the preloader must update even while
nothing else is running yet. It:

- damps `shown` toward `real` at ease 0.06 — ~98 % of a gap closed in one second
- snaps the last sliver: `if (real >= 1 && shown > 0.995) shown = 1`, because exponential damping never
  quite arrives and the counter would sit at 99 % forever
- writes the counter text only when the integer percent changed
- publishes `--preload` (0..1) on the overlay element
- calls `onTick(shown)`
- checks whether everything has settled

**DOM contract:**

| hook | meaning |
|---|---|
| `[data-preloader]` | the overlay root |
| `data-state="loading"` → `"out"` | set by the module; CSS animates off it |
| `--preload` | 0..1 on the overlay, for a bar or a mask |
| `counter.textContent` | zero-padded 2-digit percent (`"07"`, `"94"`) |

`hide()` sets `data-state="out"`, tweens `autoAlpha` to 0 over `outDuration`, removes the element, and
unregisters the stage. **The CSS owns the look; GSAP only owns the timing**, so the two never disagree
about when the loop is allowed to start.

## Transitions and applications

**`preloaderHooks(pre)` is the whole integration:**

```ts
const pre = createPreloader({ gate: true, minMs: 1200 })
const app = await boot({ manifest, assets, ...preloaderHooks(pre) })
```

That spreads `onProgress` and `onReady` into `BootOptions`, so `boot()` reports asset progress into the
preloader and awaits `pre.done()` then `pre.hide()` before the first frame. Nothing else to wire.

**The gate is also a dramatic opportunity.** A single centred word — `ENTER`, `BEGIN`, a mon, a
brushstroke — is the first frame of the film, and the click is the audience committing. If the
experience has sound, the gate is mandatory anyway; make it deliberate rather than apologetic.

**`--preload` drives more than a bar.** Because it is a custom property on the overlay, it can drive any
CSS:

```css
[data-preloader] .mask { clip-path: inset(0 calc(100% - var(--preload) * 100%) 0 0); }
[data-preloader] .logo { opacity: var(--preload); filter: blur(calc((1 - var(--preload)) * 8px)); }
[data-preloader] .bar  { transform: scaleX(var(--preload)); transform-origin: 0 50%; }
```

**Splitting progress across sources.** When a frame sequence or a video is the biggest download, the
asset registry alone under-reports:

```ts
const seq = createFrameSequence({ …, onProgress: (p) => pre.set(p * 0.6) })
app.assets.onProgress((p) => pre.set(0.6 + p * 0.4))
```

Monotonicity means the two sources can report out of order without the bar jumping backwards.

## Gotchas

**Without `gate`, audio will not play** — and it will fail *silently*, with no console error. If sound is
part of the direction, `gate: true` is not optional. See [`audio.md`](audio.md).

**`hide()` removes the element from the DOM**, which changes layout. `boot()` calls
`ScrollTrigger.refresh()` after this for exactly that reason. If you call `hide()` yourself, refresh
afterwards.

**Stage 5 is before stage 10.** Do not give a preloader-related stage an order below 5 expecting it to
run first — 0 is `time` and is reserved.

**`done()` resolves when progress, `minMs` and the gate have *all* settled.** A promise that never
resolves means one of those three is outstanding: usually a weight that never reaches 1 because an asset
404'd. Check the network tab for `/decoders/`.

**`destroy()` is not `hide()`.** `destroy()` tears down without the out-animation. Use it in an error
path, not the happy path.

**A `counter` element gets its `textContent` overwritten every percent.** Do not put child elements in
it; put the `%` sign in a sibling.

## Recipe

Markup:

```html
<div data-preloader class="preloader">
  <div class="preloader__mark">求道</div>
  <div class="preloader__bar"><span></span></div>
  <div class="preloader__count"><i data-preload-counter>00</i><span>%</span></div>
  <button data-preload-enter class="preloader__enter" hidden>ENTER</button>
</div>
```

CSS — the look lives here, not in JS:

```css
.preloader {
  position: fixed; inset: 0; z-index: 100;
  display: grid; place-content: center; gap: 2rem;
  background: #07070a; color: #f4f1ea;
}
.preloader__bar { width: 220px; height: 1px; background: rgb(244 241 234 / 0.15); }
.preloader__bar span {
  display: block; height: 100%; background: currentColor;
  transform: scaleX(var(--preload, 0)); transform-origin: 0 50%;
}
.preloader__mark { filter: blur(calc((1 - var(--preload, 0)) * 10px)); }
[data-preloader][data-state='out'] { pointer-events: none; }
```

Wiring:

```ts
import { createPreloader, preloaderHooks } from '../modules/preloader'

const pre = createPreloader({
  el: '[data-preloader]',
  counter: '[data-preload-counter]',
  enter: '[data-preload-enter]',
  gate: true,               // required for audio
  minMs: 1200,
  outDuration: 0.9,
  onTick: (p) => { if (p >= 1) enterBtn.hidden = false },
})

const app = await boot({
  manifest,
  assets,
  ...preloaderHooks(pre),   // onProgress + onReady, correctly shaped
})
```

Related: [`../kernel/index.md`](../kernel/index.md) (`onProgress` / `onReady`),
[`../kernel/assets.md`](../kernel/assets.md) (`weight`), [`audio.md`](audio.md) (why the gate exists),
[`frame-sequence.md`](frame-sequence.md) (splitting progress).
