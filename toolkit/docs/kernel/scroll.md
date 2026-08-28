# `kernel/scroll.ts`

## Purpose

Smooth scrolling via Lenis, correctly bridged to GSAP and ScrollTrigger, plus pointer input. It owns
the raw scroll value, the derived velocity, and the scroll direction.

## When to use it

`initScroll()` once, from `boot()`. After that you consume `state.scroll`, `state.progress`,
`state.velocity` and `state.direction`, and call `scrollTo` / `stopScroll` / `startScroll`.

## When NOT to use it

- **Do not use ScrollTrigger for scene weights.** The kernel derives weights arithmetically from
  cached rects (see [`weights.md`](weights.md)) — one subtraction per scene per frame, and no
  per-scene trigger objects. ScrollTrigger is for one-off DOM effects: a pinned panel, a horizontal
  gallery, a `data-reveal` fire. Use both, for different things.
- **Do not enable `syncTouch`.** Smooth-scrolling touch fights the OS's own physics, breaks
  overscroll behaviour, and feels wrong on every phone. It is off by default and should stay off.
- **Do not smooth-scroll a document with `position: sticky` you care about.** Lenis transforms the
  content wrapper in some configurations; verify sticky behaviour before shipping.

## Signature

```ts
export let lenis: Lenis | null

export interface ScrollOptions {
  duration?: number             // seconds to settle; 1.0–1.4 is cinematic
  wheelMultiplier?: number      // lower = heavier
  syncTouch?: boolean           // default false. Leave it false.
  wrapper?: HTMLElement | Window
  content?: HTMLElement
}

export function initScroll(opts?: ScrollOptions): () => void
export function scrollTo(
  target: string | number | HTMLElement,
  opts?: { offset?: number; duration?: number; immediate?: boolean },
): void
export function stopScroll(): void
export function startScroll(): void
export function initPointer(el?: HTMLElement | Window): () => void

export { gsap, ScrollTrigger }
```

`gsap` and `ScrollTrigger` are re-exported here so the rest of the codebase has exactly one import
site for them, and the plugin registration happens exactly once.

## Inputs

| `duration` | feel |
|---|---|
| 0 | native (forced when `reducedMotion`) |
| 0.6 | barely smoothed; users may not notice |
| **1.1** | default — clearly cinematic, still controllable |
| 1.6+ | heavy, dreamlike; starts to feel unresponsive on a long page |

`wheelMultiplier` below 1 makes each wheel notch travel less. Combined with a long duration it gives
the "heavy film reel" feel. Do not go below ~0.6 or a user with a notched wheel cannot cross the page.

## Outputs

Stage 20 `scroll` writes:

- `state.scroll.value`, `state.scroll.max` — raw, undamped, in pixels
- `state.progress.target` — `value / max`
- `state.velocity.target` — **derived from the clamped delta**, in viewport-heights per second
- `state.direction` — `+1` or `-1`, never 0

`velocity` is normalised by viewport height, so the same physical flick produces the same number on a
phone and a 4K monitor. Roughly −3..3 in practice; anything above 2 is a hard flick.

## Transitions and applications

**The GSAP bridge — exactly these three lines, in this order:**

```ts
lenis.on('scroll', ScrollTrigger.update)
gsap.ticker.add((t) => lenis.raf(t * 1000))
gsap.ticker.lagSmoothing(0)
```

1. Line 1 tells ScrollTrigger about Lenis's synthetic scroll position. Without it, triggers fire at
   the wrong time or not at all.
2. Line 2 drives Lenis from GSAP's ticker instead of its own rAF, so there is one clock. GSAP's
   ticker is in **seconds**; `lenis.raf` wants **milliseconds** — the `* 1000` is not optional.
3. Line 3 disables GSAP's lag smoothing, which otherwise silently rescales time after a slow frame
   and desynchronises the two systems in exactly the situation where sync matters most.

Get any of these wrong and the symptom is the same: scroll-triggered things fire slightly early or
late, intermittently, and only on slower machines.

**Velocity is the cheapest cinematic effect available.** Feed it to chromatic aberration, vignette,
grain, motion blur strength, a low-pass filter on the audio, or a camera roll. The site then responds
to *how* the user scrolls, not just where they are. `bindVelocityToGrade` in `modules/post.ts` and
`bindScrollFilter` in `modules/audio.ts` both do this.

**`stopScroll()` during a transition.** A user who scrolls during a covered transition arrives
somewhere unexpected when it lifts. `transition.run()` locks scroll for exactly this reason.

## Gotchas

**Lenis with `duration: 0` is not the same as no Lenis.** Under `reducedMotion` the kernel sets
duration 0, which passes input straight through — the correct behaviour, since ScrollTrigger and the
bridge stay wired.

**Velocity spikes on the first frame after a scroll jump.** `scrollTo({ immediate: true })` moves the
position instantly, producing a one-frame velocity of hundreds. The delta clamp in the loop bounds
it, but if you drive something dramatic off velocity, clamp it yourself:
`Math.min(1, Math.abs(state.velocity.current) / 2)`.

**`state.scroll.max` can be 0** before layout settles, which would make `progress` NaN. The kernel
guards with `|| 1`; do the same if you compute your own ratio.

**Anchor links need `scrollTo`, not `href="#id"`.** A native hash jump bypasses Lenis and desyncs its
internal position from the actual scroll. Intercept anchor clicks and call `scrollTo(el)`.

## Recipe

```ts
import { initScroll, initPointer, scrollTo, gsap, ScrollTrigger } from '../kernel/scroll'
import { state } from '../kernel/state'

// once, in boot()
const offScroll = initScroll({ duration: 1.1, wheelMultiplier: 0.9 })
const offPointer = initPointer()

// anchor links, so Lenis stays in sync
document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((a) => {
  a.addEventListener('click', (e) => {
    const el = document.querySelector<HTMLElement>(a.hash)
    if (!el) return
    e.preventDefault()
    scrollTo(el, { offset: -40 })
  })
})

// ScrollTrigger for a DOM-only effect — this is what it is for
ScrollTrigger.create({
  trigger: '#gallery',
  start: 'top top',
  end: '+=200%',
  pin: true,
  scrub: 1,
  animation: gsap.to('#gallery-track', { xPercent: -66, ease: 'none' }),
})

// velocity as an effect input
const speed = () => Math.min(1, Math.abs(state.velocity.current) / 2)
```

Related: [`state.md`](state.md), [`weights.md`](weights.md),
[`../modules/post.md`](../modules/post.md) (`bindVelocityToGrade`),
[`../modules/audio.md`](../modules/audio.md) (`bindScrollFilter`).
