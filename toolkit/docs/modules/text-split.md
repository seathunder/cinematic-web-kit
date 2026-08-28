# `modules/text-split.ts`

## Purpose

Splits text into lines, words and characters so they can be animated individually — measured, not
guessed — plus a ready-made reveal timeline. This is the module behind every "the headline assembles
itself" moment.

## When to use it

Headlines, pull quotes, chapter titles, a name. Text that is *part of the art direction*.

## When NOT to use it

- **Not on body copy.** Splitting a paragraph into 400 spans costs layout and destroys text selection
  ergonomics for no gain. Body text should fade or slide as one block.
- **Not on anything a screen reader must read continuously** unless `aria: true` is on (it is what keeps
  the original text available to assistive tech).
- **Not on text inside a `three` scene.** That is a texture or an anchor — see
  [`dom-bridge.md`](dom-bridge.md).
- **Not for a count of thousands.** Chars mode on a long string is thousands of elements; the browser
  will do it, and then everything else gets slower.

## Signature

```ts
export type SplitMode = 'lines' | 'words' | 'chars'

export interface SplitOptions {
  modes?: SplitMode[]     // which levels to produce; default ['lines','words']
  mask?: boolean          // wrap lines in overflow:hidden so they can slide up from nothing
  prefix?: string         // class prefix
  responsive?: boolean    // re-split on resize and after fonts load
  aria?: boolean          // preserve the original text for assistive tech
}

export interface SplitText {
  root: HTMLElement
  lines: HTMLElement[]
  words: HTMLElement[]
  chars: HTMLElement[]
  refresh(): void         // re-measure and re-split
  revert(): void          // restore the original markup exactly
}

export function splitText(target: HTMLElement | string, opts?: SplitOptions): SplitText

export interface TextRevealOptions {
  level?: SplitMode       // which array to animate
  duration?: number
  stagger?: number
  y?: number              // px offset to travel
  rotate?: number         // deg
  fade?: boolean
  ease?: string
  reverse?: boolean       // animate from the end
}

export type Timeline = ReturnType<typeof gsap.timeline>

export function textTimeline(split: SplitText, opts?: TextRevealOptions): Timeline

export function initSplits(selector: string, opts?: SplitOptions): () => void
```

## Inputs

**`modes`** decides what you get. Producing `chars` on text you only animate by line is wasted DOM:

| modes | elements for a 12-word headline | animate |
|---|---|---|
| `['lines']` | ~3 | the most cinematic and the cheapest |
| `['lines','words']` | ~15 | the default; lines for masks, words for stagger |
| `['lines','words','chars']` | ~70 | only when the type itself is the subject |

**`mask: true`** wraps each line in an `overflow: hidden` container. This is what makes a line slide up
*from nothing* rather than sliding in from visible space — the single most recognisable
editorial-motion move, and it needs the wrapper to work.

**`responsive: true`** re-splits on resize **and after `document.fonts.ready`**. Both are required: line
breaks depend on the actual font metrics, and a webfont arriving after the split silently invalidates
every line boundary.

**Reveal option feel:**

| option | restrained | expressive |
|---|---|---|
| `duration` | 0.7–0.9 | 1.2+ (heavy, ceremonial) |
| `stagger` | 0.04–0.08 | 0.12+ (each element is its own event) |
| `y` | 20–40 | 80+ (with `mask`, a full line-height) |
| `rotate` | 0–3 | 8+ (reads as playful or unstable) |
| `ease` | `'power3.out'` | `'expo.out'` (a snap), `'power2.inOut'` (a glide) |

## Outputs

`lines`, `words`, `chars` are flat arrays of the created elements, in document order — pass any of them
straight to GSAP.

`refresh()` re-measures and re-splits. `revert()` restores the original markup exactly, which matters
because a split is destructive to the DOM you inherited.

`textTimeline(split, opts)` returns a **paused** GSAP timeline. Play it on reveal, or scrub it from
`ctx.frame.local`.

`initSplits(selector, opts)` splits everything matching, returns a disposer that reverts all of them.

## Transitions and applications

**Line splitting must be measured, not guessed.** The only reliable way to know where a line breaks is to
put each word in the DOM and read its `offsetTop` — a change in `offsetTop` is a new line. Any approach
that counts characters or estimates from font size is wrong the moment the viewport, the font, the
language, or the user's zoom changes.

**Read-all-then-write-all.** The split measures every word's position *first*, then does all the DOM
restructuring. Interleaving a read and a write per word forces a synchronous layout per word — with 60
words that is 60 forced reflows and a visible freeze. This is the single most important implementation
detail in the module.

**Re-split after `document.fonts.ready`.** A webfont loading 300 ms in re-flows the text, so lines split
against the fallback font are wrong. `responsive: true` handles it; without it, your headline masks will
clip mid-word on the real font.

**What each level is *for*:**

| level | reads as | use for |
|---|---|---|
| `lines` + `mask` | a curtain rising; editorial, confident | chapter titles, hero headlines |
| `words` | speech, emphasis, rhythm | a pull quote, a manifesto line |
| `chars` | mechanical, typewriter, data, or *precious* | a name, a date, a single word logotype |

**Driving from scroll instead of on reveal.** A timeline scrubbed by `local` means the text assembles as
the user scrolls and disassembles if they scroll back — much more physical than a one-shot reveal:

```ts
update(_w, ctx) { tl.progress(ctx.frame.local) }
```

**Pairing with the DOM bridge.** The usual production combination is `initSplits` for the split plus
`initReveal`'s `data-revealed` attribute as the trigger, so the CSS decides *when* and GSAP decides
*how* — or drop GSAP entirely and animate the split elements from CSS using `--i`.

## Gotchas

**Split before you measure anything else.** Splitting changes element heights, so any cached rect taken
before the split is stale. Split in `build()`, then `requestReflow()`.

**`revert()` is required before re-splitting manually.** Splitting an already-split element nests wrappers
and produces exponential DOM. `refresh()` handles the revert for you; a second `splitText()` call does
not.

**`aria: false` makes the text invisible to screen readers.** The split elements read as a stream of
disconnected characters. If the text matters — and a headline always does — leave `aria` on.

**A split element cannot be a flex/grid child of the original layout.** Wrapping changes the box tree, so
`display: flex` on the parent now lays out lines rather than words. Style the split classes, not the
original selector.

**`text-wrap: balance` and `pretty` fight the split.** They change break points after measurement.
Either drop them on split elements or accept a re-split.

**Hyphenation and `white-space` matter.** `white-space: nowrap` on a parent produces one line; the split
succeeds and looks broken.

**GSAP timelines returned here are paused.** A reveal that never happens is usually a missing `.play()`.

## Recipe

Split on build, scrub on scroll:

```ts
import { splitText, textTimeline, type SplitText, type Timeline } from '../../modules/text-split'
import { requestReflow } from '../../kernel'

let split: SplitText | null = null
let tl: Timeline | null = null

export default {
  id: '00-arrival',
  renderer: 'none',
  section: '#chapter-arrival',

  build(ctx) {
    split = splitText('#arrival-title', {
      modes: ['lines', 'words'],
      mask: true,             // lines slide up from nothing
      responsive: true,       // re-split on resize AND after fonts load
      aria: true,
    })

    tl = textTimeline(split, {
      level: 'lines',
      duration: 1.0,
      stagger: 0.09,
      y: 90,
      fade: false,            // with a mask, no fade needed — it emerges
      ease: 'power3.out',
    })

    requestReflow()           // the split changed layout
  },

  update(_w, ctx) {
    tl?.progress(Math.min(1, ctx.frame.local * 2))   // assembled by halfway
  },

  dispose() {
    tl?.kill()
    split?.revert()
    split = null
    tl = null
  },
}
```

A CSS-only reveal, no GSAP, using the DOM bridge as the trigger:

```ts
initSplits('[data-split]', { modes: ['lines'], mask: true, responsive: true })
```

```css
.split-line-mask { overflow: hidden; }
.split-line {
  display: block;
  transform: translateY(100%);
  transition: transform 0.9s cubic-bezier(0.16, 1, 0.3, 1);
  transition-delay: calc(var(--i, 0) * 80ms);
}
[data-revealed] .split-line { transform: none; }
@media (prefers-reduced-motion: reduce) {
  .split-line { transform: none; transition: none; }
}
```

Related: [`dom-bridge.md`](dom-bridge.md) (`data-revealed`, `--i`),
[`../kernel/viewport.md`](../kernel/viewport.md) (`document.fonts.ready`, reflow),
[`../kernel/scroll.md`](../kernel/scroll.md) (GSAP), [`../PATTERNS.md`](../PATTERNS.md) (typography in
art direction).
