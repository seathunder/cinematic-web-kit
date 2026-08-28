# `modules/cursor.ts`

## Purpose

A custom cursor — a tight dot and a trailing ring that stretches with velocity, snaps to element boxes,
and carries a label — plus `initMagnetic`, elements that lean toward the pointer.

Worth being honest: **a custom cursor is pure decoration and the single easiest way to make a site feel
worse.** It replaces an OS-level, zero-latency, universally understood affordance with a DOM element that
lags. Everything defensive in this module exists because of that.

## When to use it

When the site's tone is *authored* rather than utilitarian: a portfolio, an art-directed experience, a
brand piece. Used well it is one of the cheapest ways to signal that a site was made deliberately.

## When NOT to use it

- **Never on touch or coarse pointers.** The module gates on `(hover: hover) and (pointer: fine)` and
  returns an inert `NOOP_CURSOR` otherwise, appending nothing to the DOM — so there is no element for a
  stray CSS rule to make visible. Getting this gate wrong leaves a dead dot stuck in the corner of every
  phone.
- **Not under `prefers-reduced-motion`.** `state.reducedMotion` disables both `createCursor` and
  `initMagnetic`. A lagging, stretching, snapping cursor is exactly the class of motion that setting
  exists to suppress.
- **Not on anything transactional.** A checkout, a form, a dashboard. And never over text inputs — the
  caret shape carries real information (the required CSS below handles this).
- **Not as the only hover affordance.** If the ring growing is the *only* indication something is
  clickable, keyboard and touch users get nothing. `:focus-visible` is a separate, mandatory job.

## Signature

```ts
export interface CursorOptions {
  el?: HTMLElement        // existing root; one is created and appended if omitted
  dotEase?: number        // default 0.35 — tight, so clicking feels accurate
  ringEase?: number       // default 0.1  — trails, so the motion reads as weight
  stretch?: number        // default 0.08 — 0.05–0.15 reads as inertia; more looks like a comet
  attribute?: string      // default 'data-cursor' — declares a hover state on a target
  publish?: boolean       // default false — also write --cursor-x / --cursor-y in px on <html>
}

export interface Cursor {
  root: HTMLElement
  setState(name: string | null): void   // force a state; null releases back to hover detection
  setText(text: string): void           // '' clears
  snapTo(el: HTMLElement | null): void
  hide(): void
  show(): void
  readonly enabled: boolean             // false on a coarse pointer — every method is a no-op
  dispose(): void
}

export function createCursor(opts?: CursorOptions): Cursor

export function initMagnetic(
  selector?: string,                                   // default '[data-magnetic]'
  opts?: { strength?: number; radius?: number; ease?: number },  // 0.22 / 140 / 0.14
): () => void
```

## Inputs

**The two-ease contrast is the entire effect.** The dot tracks tightly so clicking feels accurate; the
ring trails so the motion reads as weight. One layer at one speed is either laggy or lifeless:

| | `dotEase` | `ringEase` | feel |
|---|---|---|---|
| snappy | 0.5 | 0.25 | responsive, techy |
| **default** | 0.35 | 0.1 | present but soft |
| liquid | 0.25 | 0.06 | dreamy; starts to feel laggy on a click |

Both are damped with the kernel's frame-rate-independent `damp()`, so the trail is identical at 60 Hz and
144 Hz. A naive lerp makes the trail **2.4× tighter on a gaming monitor** — which is why so many custom
cursors look great on the developer's machine and sluggish on the client's.

**`stretch`** (default **0.08**) elongates the ring along its direction of travel and rotates it to match.
The velocity is free: *the lag between ring and pointer **is** the velocity*, so no extra state is
tracked. Speed is normalised against 120 px, then `scaleX = 1 + speed × stretch × 2`,
`scaleY = 1 − speed × stretch`. 0.05–0.15 reads as inertia; above ~0.3 it looks like a comet and dates
badly.

**`attribute`** (default `data-cursor`) is read off hovered elements via **one delegated `pointerover` on
the document** — no per-element listeners, which also means content added later just works. The markup is
the API:

| on a target element | effect |
|---|---|
| `data-cursor="view"` | sets `data-cursor-state="view"` on the cursor root |
| `data-cursor` (no value) | state falls back to `"hover"` |
| `data-cursor-text="view project"` | fills the label |
| `data-cursor-snap` | **auto-snaps the ring to this element's box — no JS needed** |
| `data-magnetic="0.3"` | per-element strength override for `initMagnetic` |

**`initMagnetic`:** `strength` (default 0.22) is the fraction of the pointer offset the element travels,
`radius` (140 px) is the activation distance, `ease` (0.14) the damping. **The effect only works if it is
small.** 0.22 over 140 px feels alive; stronger turns a button into a fish and makes it genuinely harder
to click, because the target moves away from where the user aimed — and the element's *hit area* moves
with it, so the offset must stay well inside its own bounds.

## Outputs

**Default markup** (created and appended to `<body>` unless you pass `el`):

```html
<div class="cw-cursor" aria-hidden="true">
  <div class="cw-cursor-ring"></div>
  <div class="cw-cursor-dot"></div>
  <span class="cw-cursor-text"></span>
</div>
```

`position: fixed`, `top/left: 0`, `pointer-events: none`, `will-change: transform` are set inline by the
module. Everything else is yours.

**Attribute contract — note *which element* each lands on:**

| attribute | element | meaning |
|---|---|---|
| `data-cursor-active="true"` | `<html>` | a custom cursor initialised. **This is the hook for `cursor: none`** |
| `data-cursor-state="view"` | the cursor **root** | current state, from the hovered element or `setState()` |
| `data-cursor-pressed` | the cursor **root** | present while the pointer is down |

**Required CSS in your stylesheet** — the module injects no styles:

```css
[data-cursor-active] *                 { cursor: none; }
[data-cursor-active] input,
[data-cursor-active] textarea,
[data-cursor-active] [contenteditable]  { cursor: auto; }
```

An attribute hook, not a media query: `cursor: none` then applies *only* when a custom cursor actually
exists, so a device that fails the gate keeps its native cursor with no duplicated condition.

**Stage 930 `cursor`** (`after: ['state']`) damps dot, ring and ring-scale; writes `translate3d(...)
translate(-50%,-50%)` on the dot and a stretched/rotated or snapped transform on the ring, each behind a
**changed-value guard**; and optionally publishes `--cursor-x` / `--cursor-y` in px on `<html>`.

**Stage 935 `magnetic`** (`after: ['state']`) damps each magnet's offset and re-measures only when
`state.pageReflow` changes.

`hide()` / `show()` set `root.style.opacity` and are wired to `pointerleave` / `pointerenter` on `<html>`,
so the cursor disappears when the pointer leaves the window.

## Transitions and applications

**What the cursor can express** — the states are yours to define; these are the ones that earn their keep:

| `data-cursor` | ring | text | signals |
|---|---|---|---|
| *(none)* | small circle | — | idle |
| `link` | 2–3× scale, filled | — | clickable |
| `view` | large, inverted | `VIEW` | opens something |
| `drag` | wide, horizontal | `DRAG` | a carousel or slider |
| `sound` | ring becomes a level meter | `ON` / `OFF` | the audio toggle |
| `data-cursor-snap` | matches the element's box | — | the target is armed |

**`setText` is the highest-value feature here.** It turns the cursor into a label that never occludes the
layout — no tooltip, no caption, no layout shift.

**`mix-blend-mode: difference` is what makes one cursor work on every background.** Without it you need a
light cursor, a dark cursor, and logic to choose. With it, a white ring inverts against whatever is under
it — essential on a site that scrolls from a black 3D scene into a white editorial section.

**Magnetic elements are disproportionately effective.** A CTA that leans toward the pointer within 140 px
feels *alive* for one damped vector. Apply it to two or three primary actions, not everything — magnetism
everywhere is noise.

**Recede while scrolling**, so the cursor is not competing with the page:

```css
[data-scrolling='true'] .cw-cursor-ring { opacity: 0.4; }
```

**Driving cursor state from 3D hits.** `createPicker`'s `cursor` handler writes `data-cursor-state` on
`<html>`, while this module writes it on the **cursor root**. They are different elements, so either
style both selectors or — cleaner — call `cursor.setState()` from the picker's handlers:

```ts
picker.add(katana, {
  onEnter: () => cursor.setState('view'),
  onLeave: () => cursor.setState(null),
})
```

**Force a state during a drag**, where hover detection is wrong by definition:

```ts
el.addEventListener('pointerdown', () => cursor.setState('drag'))
window.addEventListener('pointerup', () => cursor.setState(null))
```

## Gotchas

**The ring element must be 40 × 40 px for snapping to be correct.** `snapTo` scales the ring by
`snapped.w / 40, snapped.h / 40` — a hard-coded base size. Style the ring to some other dimension and
every snap is the wrong size by that ratio. Change the CSS *and* that constant together, or keep the ring
at 40.

**Snap interpolates transform, never `width`/`height`.** Tweening the box would relayout every frame;
scaling keeps it on the compositor. It also means a border on the ring is scaled — a 1 px border on a
snapped 300 px box reads as 7 px. Use an inset `box-shadow` or accept it.

**The gate is a capability query, not a width query.** `(hover: hover) and (pointer: fine)`. A tablet
with a stylus reports fine pointer and no hover; a touch laptop reports both. `min-width: 1024px` enables
a custom cursor on a tablet and disables it on a small laptop.

**`enabled` is false on a coarse pointer *and* under reduced motion**, and every method is then a no-op.
Do not branch on `enabled` to build a fallback — the native cursor *is* the fallback.

**Never `getBoundingClientRect()` per magnet per frame.** `initMagnetic` caches centres in **document
space** (scroll-independent, so scrolling needs no re-measure) and re-reads only when `state.pageReflow`
changes. It also clears the element's own transform before measuring — otherwise the cached centre drifts
a little further on every reflow that happens while the pointer is near it. An earlier version measured
every frame and cost 0.4 ms with eight magnets.

**The ring is re-targeted every frame in the non-snapped branch**, not only on `pointermove`. Without
that, leaving a snap strands the ring at the element's centre until the pointer moves again.

**`pointerout` needs the `relatedTarget.contains` check.** Without it the state flickers on any element
with children, because moving between a link and its own `<span>` fires an out event.

**Hit testing must use raw pointer coordinates, not the damped ones.** This module tracks `e.clientX` in
CSS pixels deliberately — the cursor has to land exactly under the physical pointer, and a
normalise/denormalise round trip through a damped value introduces a half-pixel wobble. Likewise, 3D hit
testing must use `state.pointerX.target`, never `.current`.

**`pointer-events: none` on the root is mandatory** — otherwise the cursor is the hover target for
everything and no other element ever receives a hover. The module sets it inline; do not override it.

**`dispose()` does not undo your CSS.** It removes `data-cursor-active` from `<html>`, which switches
`cursor: none` off if you wrote the rule as above — that is exactly why the rule is attribute-scoped. It
removes the root only if the module created it.

## Recipe

CSS — the look lives entirely here:

```css
[data-cursor-active] *                 { cursor: none; }
[data-cursor-active] input,
[data-cursor-active] textarea,
[data-cursor-active] [contenteditable]  { cursor: auto; }

.cw-cursor { z-index: 90; mix-blend-mode: difference; opacity: 0; transition: opacity 0.2s; }

.cw-cursor-dot {
  position: absolute; width: 6px; height: 6px;
  border-radius: 50%; background: #fff;
}

/* 40x40 is load-bearing: snapTo() scales from this base. */
.cw-cursor-ring {
  position: absolute; width: 40px; height: 40px;
  border: 1px solid #fff; border-radius: 50%;
  transition: background 0.3s, border-radius 0.3s, border-color 0.3s;
}

.cw-cursor-text {
  position: absolute; left: 0; top: 0;
  transform: translate(-50%, -50%);
  font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: #fff;
}

.cw-cursor[data-cursor-state='view'] .cw-cursor-ring { background: #fff; }
.cw-cursor[data-cursor-state='drag'] .cw-cursor-ring { border-radius: 20px; }
.cw-cursor[data-cursor-pressed]      .cw-cursor-ring { border-color: rgb(255 255 255 / 0.4); }
[data-scrolling='true'] .cw-cursor-ring { opacity: 0.4; }
```

Markup — nothing required for the cursor itself; states come from your content:

```html
<a href="/work/kensei" data-cursor="view" data-cursor-text="view project">Kensei</a>
<div class="carousel" data-cursor="drag" data-cursor-text="drag"></div>
<button data-cursor-snap data-magnetic="0.3">Enter</button>
```

Wiring:

```ts
import { createCursor, initMagnetic } from '../modules/cursor'

const cursor = createCursor({
  dotEase: 0.35,
  ringEase: 0.1,
  stretch: 0.08,
  publish: true,            // --cursor-x / --cursor-y, for a CSS spotlight elsewhere
})

const stopMagnets = initMagnetic('[data-magnetic]', {
  strength: 0.22,
  radius: 140,
  ease: 0.14,
})
```

A CSS spotlight driven by the published properties, with no extra JS:

```css
.spotlight {
  background: radial-gradient(
    240px circle at var(--cursor-x, 50%) var(--cursor-y, 50%),
    rgb(255 240 210 / 0.18),
    transparent 70%
  );
}
```

Related: [`dom-bridge.md`](dom-bridge.md) (`data-scrolling`, published properties),
[`../kernel/state.md`](../kernel/state.md) (`damped`/`damp`, `reducedMotion`, `pointerX.target`),
[`../kernel/viewport.md`](../kernel/viewport.md) (`pageReflow`),
[`raycast.md`](raycast.md) (cursor state from 3D hits).
