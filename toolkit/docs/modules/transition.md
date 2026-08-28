# `modules/transition.ts`

## Purpose

A full-screen cover layer with six shader transitions, used to hide a swap — a scene change, a page
navigation, a camera jump. When two moments cannot be crossfaded honestly, you cover the seam.

## When to use it

- **A one-way chapter change** where the two worlds have nothing visually in common.
- **A real page navigation** (multi-page site), where the cover hides the reload.
- **A camera jump** the weighted-average rig would otherwise smear through empty space.
- **A scroll-position cut** mid-section, via `createScrollCut`.

## When NOT to use it

- **Not where a crossfade would work.** Two scenes overlapping their `ramp` is cheaper, more elegant, and
  needs no code. Covering the seam is what you do when the seam cannot be made honest.
- **Not as the default between every section.** A site that wipes to black nine times reads as a
  slideshow, not a film. Two or three deliberate cuts in a nine-scene experience is a lot.
- **Not for a fade to black.** `post.set('uFade', …)` already does that with no extra render target. Use
  this layer when the transition has *shape*.

## Signature

```ts
export type TransitionKind = 'fade' | 'wipe' | 'dissolve' | 'iris' | 'ink' | 'glitch'

export interface TransitionOptions {
  duration?: number
  ease?: string                       // GSAP ease string
  angle?: number                      // wipe direction, radians
  color?: THREE.ColorRepresentation
  lockScroll?: boolean
  softness?: number                   // edge softness of the travelling boundary
}

export interface TransitionLayer {
  cover(kind?: TransitionKind, opts?: TransitionOptions): Promise<void>
  reveal(kind?: TransitionKind, opts?: TransitionOptions): Promise<void>
  /** cover → run the swap → reveal. The only one you usually need. */
  run(swap: () => void | Promise<void>, kind?: TransitionKind, opts?: TransitionOptions): Promise<void>
  /** Drive the cover manually, 0..1. For scroll-driven cuts. */
  set(progress: number, kind?: TransitionKind): void
  readonly busy: boolean
  dispose(): void
}

export function createTransitionLayer(stage: Stage3D): TransitionLayer

export function navigateWithTransition(
  url: string, layer?: TransitionLayer, kind?: TransitionKind,
): Promise<void>

export function createScrollCut(
  layer: TransitionLayer,
  opts?: {
    kind?: TransitionKind
    from?: number                     // local where the cover starts closing, default 0.45
    to?: number                       // local where it is fully open again, default 0.55
    onCovered?: (direction: number) => void
  },
): (local: number) => void
```

## Inputs

**The six kinds, and what each *reads* as** — this is the actual decision:

| kind | mechanism | reads as | use for |
|---|---|---|---|
| `fade` | uniform opacity | neutral, invisible, safe | anything; the default when in doubt |
| `wipe` | a hard edge travelling at `angle` | **graphic, editorial, deliberate** | a chapter break; a change of subject |
| `dissolve` | noise-thresholded boundary | organic, atmospheric | weather, memory, time passing |
| `iris` | expanding/contracting circle | **classical cinema**, a lens closing | end of an act; focus onto one point |
| `ink` | fbm-driven bleed | **brush, sumi-e, Japanese** | the samurai chapter; anything hand-made |
| `glitch` | blocky displacement + channel split | signal loss, technology, violence | a transmission cutting out; a shock |

`angle` only affects `wipe`. `softness` widens the travelling boundary; the travel range is extended by
`uSoftness` on both ends so the transition still fully covers at progress 1.

**`lockScroll`** prevents the user scrolling through a cover mid-animation. Use it for `run()`; do not use
it for `createScrollCut`, where scroll *is* the driver.

## Outputs

A full-screen quad drawn at stage **985** — after `render` (980) so it composites over everything,
before the diagnostics band.

`cover()` resolves when fully covered. `reveal()` resolves when fully clear. `run(swap, …)` covers,
awaits your `swap` callback, then reveals — the only one you usually need, because it guarantees the swap
happens while nothing is visible.

`busy` is true during an automated transition. Guard user input against it.

`set(progress, kind)` drives the cover manually at 0..1, for scroll-driven cuts.

`createScrollCut` returns a function you call with `local` each frame. It builds a **triangle**: 0 at
`from`, 1 at the midpoint, 0 again at `to`. `onCovered(direction)` fires once when coverage passes 0.98,
and re-arms below 0.5 — so it fires **in both directions** and must be idempotent.

## Transitions and applications

**Match the transition to the art direction, not to novelty.** `ink` in a Swiss-graphic site is
incoherent; `glitch` in a serene one is vandalism. Pick one or two kinds for the whole site and use them
consistently — a transition vocabulary is part of the design system, like type and colour.

**The cut is where you change the rules.** A cover is the only moment you can honestly change everything
at once: lighting, palette, camera, audio bed, even the post grade. Use it for the one or two moments in
the experience where the world genuinely changes:

```ts
await layer.run(async () => {
  post?.setTint(0x2a1408, 0xffd9a0)     // day → dusk
  post?.set('uSaturation', 0.85)
  audio.music('/media/dusk.mp3').play(2)
  scrollTo('#chapter-4', { immediate: true })
}, 'ink', { duration: 1.1, softness: 0.35 })
```

**`createScrollCut` is a cut *inside* a section.** A single section can contain two shots: the cover
closes at 45 %, the swap happens at 50 %, the cover opens at 55 %. To the user it is one continuous
scroll containing an edit — which is exactly what a film cut is.

**`navigateWithTransition(url, layer, kind)`** covers, then navigates. For a multi-page site this is the
whole trick: the cover hides the white flash of a document load, and if the new page's preloader starts
covered, the join is invisible.

**Transition duration by intent:**

| duration | reads as |
|---|---|
| 0.25–0.4 s | a cut. Fast, energetic, barely noticed. |
| 0.6–0.9 s | a transition. The default; the audience registers it. |
| 1.2–2.0 s | a chapter break. Feels like a curtain. Use once or twice. |
| 2.5 s+ | the audience wonders if it broke |

## Gotchas

**Backticks inside a GLSL comment terminate the enclosing TypeScript template literal.** The shaders here
live in `` /* glsl */ `…` `` strings; a comment like `` // scale by `soft` `` is a syntax error 200 lines
away with a message that does not mention comments. Write GLSL comments without backticks. This exact bug
cost the only two compile errors in this toolkit.

**`set()` and `run()` fight.** Do not drive `set()` from a scene while a `run()` is in flight — check
`busy`.

**`onCovered` fires in both directions.** Scrolling up through the same cut fires it again. Anything it
does must be idempotent, or reversible via the `direction` argument.

**A cover does not pause anything.** Scenes behind it keep updating and rendering at full cost. If the
cover is long, that is wasted work; if a scene is being disposed inside the swap, make sure nothing else
still references it.

**`lockScroll` on a scroll-driven cut deadlocks it** — you lock scroll, so `local` stops changing, so the
cover never opens.

**Stage 985 draws over the post chain, not through it.** The cover is not graded, tone-mapped, or grained.
That is usually what you want (a pure black is pure black), but a `color` that matched in the composer
will look slightly different here.

## Recipe

A one-way chapter change:

```ts
import { createTransitionLayer } from '../modules/transition'
import { scrollTo } from '../kernel'

const layer = createTransitionLayer(app.stage)

document.querySelector('#enter-dusk')!.addEventListener('click', async () => {
  if (layer.busy) return
  await layer.run(
    async () => {
      post?.setTint(0x2a1408, 0xffd9a0)
      post?.set('uSaturation', 0.85)
      scrollTo('#chapter-dusk', { immediate: true })
    },
    'ink',
    { duration: 1.2, softness: 0.35, color: 0x0b0705, lockScroll: true },
  )
})
```

A cut inside one section:

```ts
import { createScrollCut } from '../../modules/transition'

let cut: ((local: number) => void) | null = null

export default {
  id: '04-duel',
  renderer: 'three',
  section: '#chapter-duel',

  build(ctx) {
    cut = createScrollCut(layer, {
      kind: 'wipe',
      from: 0.42,
      to: 0.58,
      onCovered: (dir) => {
        // Idempotent, and aware of direction.
        stanceA.visible = dir < 0
        stanceB.visible = dir > 0
      },
    })
  },

  update(_w, ctx) {
    cut?.(ctx.frame.local)
  },
}
```

Related: [`post.md`](post.md) (`uFade` — the cheaper fade), [`../kernel/camera.md`](../kernel/camera.md)
(when waypoints average into nothing), [`../kernel/scroll.md`](../kernel/scroll.md) (`scrollTo`),
[`../PATTERNS.md`](../PATTERNS.md) (the transitions catalogue in context).
