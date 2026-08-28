# `kernel/viewport.ts`

## Purpose

Resize handling and the measure-once discipline. It coalesces every resize signal into a single
application per frame, bumps `state.pageReflow` so caches know to invalidate, and provides the one
sanctioned way to measure an element's position.

## When to use it

- `measure(el)` whenever you need an element's scroll-space position.
- `onReflow(fn)` to re-measure or rebuild anything layout-dependent.
- `requestReflow()` after *you* changed layout in a way the browser's resize event will not report —
  injecting content, expanding an accordion, swapping a font.

## When NOT to use it

Do not add your own `resize` listener. There is exactly one, it is debounced into stage 30, and
adding a second one reintroduces the thrash this file exists to prevent.

Do not use `measure()` for anything that needs left/width — it deliberately returns only `top` and
`height`, because horizontal layout is not what scroll ranges are derived from and returning fields
nobody should use invites their use.

## Signature

```ts
export function requestReflow(): void
export function onReflow(fn: () => void): () => void     // returns an unsubscribe
export function measureViewport(): void
export function measure(el: HTMLElement): { top: number; height: number }
export function initViewport(): () => void               // registers stage 30
```

## Inputs

`measure(el)` reads `getBoundingClientRect()` once and adds the current scroll offset, giving a
**document-space** `top`. Document space is the right space to cache in: it does not change when the
page scrolls, only when layout changes.

`initViewport()` wires:

- a `resize` listener → `requestReflow()`
- an `orientationchange` listener → `requestReflow()`
- a `ResizeObserver` on `document.body` → `requestReflow()` (catches content-driven height changes
  that `resize` never fires for)
- `document.fonts.ready` → `requestReflow()`

## Outputs

Stage 30 `viewport` applies at most one pending reflow per frame:

1. `measureViewport()` rewrites `state.viewport` (width, height, dpr, aspect, portrait, breakpoint,
   touch)
2. `state.pageReflow++`
3. every `onReflow` listener fires

`state.viewport.dpr` is `min(devicePixelRatio, budget().dpr)` — already capped by the quality tier,
so consumers never need to apply the cap themselves.

## Transitions and applications

**The `pageReflow` counter is the invalidation protocol.** Any module that caches geometry compares
the counter it last saw:

```ts
let lastReflow = state.pageReflow
// in a stage:
if (state.pageReflow !== lastReflow) { lastReflow = state.pageReflow; remeasure() }
```

`modules/cursor.ts`'s magnetic elements and `kernel/weights.ts`'s scene rects both do exactly this.
It is cheaper than a listener (one integer compare per frame) and impossible to leak.

**`document.fonts.ready` is the reflow everybody forgets.** A webfont has different metrics from the
fallback. Every line break in the document can move when it loads. `text-split.ts` re-splits on
reflow specifically because of this — split once on DOMContentLoaded and the line masks clip mid-word
for the first 150 ms and then stay wrong.

**The mobile height guard.** On iOS and Android, scrolling shows and hides browser chrome, which
changes `innerHeight` and fires `resize` — continuously, while the user scrolls. Re-measuring every
scene rect mid-scroll causes a visible hitch. `measureViewport()` ignores height-only changes on
touch devices; width changes (a real rotation) still go through.

## Gotchas

**100vh on mobile includes browser chrome.** A section styled `height: 100vh` is taller than the
visible area and its bottom is hidden behind the toolbar. Use the `--vh` custom property that
`modules/dom-bridge.ts` publishes:

```css
.section { min-height: calc(var(--vh, 1vh) * 100); }
```

**`ResizeObserver` on `body` fires during layout.** It is safe here because it only sets a flag and
the work happens in the next frame's stage 30. Doing work directly in a `ResizeObserver` callback
that itself changes layout produces a loop the browser will warn about.

**Reflow is not free.** Every `onReflow` listener runs on every resize, and text splitting is
genuinely expensive. Debouncing already happens (one per frame), but if you have 40 split headings
a slow drag-resize will be janky. That is acceptable — users do not drag-resize; devices rotate once.

**`measure()` after a style change in the same frame** returns the *new* layout, forcing a synchronous
reflow. That is correct but slow. Batch: change all styles, then measure all elements.

## Recipe

Cache a rect, invalidate on reflow, never measure in the loop:

```ts
import { state } from '../kernel/state'
import { measure, onReflow } from '../kernel/viewport'
import { addStage } from '../kernel/loop'

const el = document.querySelector<HTMLElement>('#panel')!
let rect = measure(el)                       // document space

// Either subscribe...
const off = onReflow(() => { rect = measure(el) })

// ...or poll the counter inside your existing stage (cheaper, no listener to leak):
let lastReflow = state.pageReflow

addStage({
  order: 320,
  name: 'panel',
  after: ['scroll'],
  fn: () => {
    if (state.pageReflow !== lastReflow) {
      lastReflow = state.pageReflow
      rect = measure(el)
    }
    // document space -> viewport space, no layout read
    const top = rect.top - state.scroll.value
    const progress = 1 - (top + rect.height) / (state.viewport.height + rect.height)
    el.style.setProperty('--p', progress.toFixed(3))
  },
})
```

After injecting content:

```ts
container.append(...newCards)
requestReflow()          // the browser will not fire resize for this
```

Related: [`state.md`](state.md), [`weights.md`](weights.md) (the biggest consumer of `measure`),
[`../modules/dom-bridge.md`](../modules/dom-bridge.md) (`--vh`).
