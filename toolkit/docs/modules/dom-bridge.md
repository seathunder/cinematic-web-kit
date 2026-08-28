# `modules/dom-bridge.ts`

## Purpose

Makes the HTML and the 3D world agree, cheaply. Three separate jobs: publish a handful of CSS custom
properties on `<html>` once per frame (`initDomBridge`), pin real HTML elements to points in the 3D
scene (`createAnchors`), and reveal elements as their section becomes active (`initReveal`).

## When to use it

`initDomBridge` in every project — it costs ~6 property writes per frame and it is what lets CSS
participate in the experience at all. `createAnchors` when you need real text on a 3D object.
`initReveal` instead of ScrollTrigger for entrance animations.

## When NOT to use it

- **Not one custom property per element.** The whole design is that a *handful* of properties on the
  root are read by any number of elements. Publishing `--card-3-offset` defeats the point.
- **`createAnchors` is not for hundreds of labels.** Each anchor is a `project()` plus a potential style
  write per frame. A dozen is free; two hundred is a frame budget. For many labels, draw them into a
  canvas2d overlay instead.
- **`initReveal` is not for elements outside a scene section.** It groups elements by scene instance, so
  anything in a section without a registered scene is never revealed. Use a plain
  IntersectionObserver there.

## Signature

```ts
export interface BridgeOptions {
  sceneWeights?: boolean   // publish --scene-weight-<id> per scene. Off by default.
  precision?: number       // decimal places, default 3
  root?: HTMLElement       // default <html>
}

export function initDomBridge(instances?: SceneInstance[], opts?: BridgeOptions): () => void

export function createAnchors(camera: THREE.Camera): {
  add(
    el: HTMLElement,
    target: THREE.Object3D | [number, number, number],
    opts?: { offset?: [number, number, number]; cull?: boolean; scaleWithDepth?: boolean },
  ): () => void
  clear(): void
  dispose(): void
}

export function initReveal(
  instances: SceneInstance[],
  opts?: { selector?: string; stagger?: boolean },
): () => void
```

## Inputs

**`precision: 3`** is the default because three decimals are invisible to the eye and cut writes by
roughly 10× versus raw floats — the changed-value guard fires far more often.

**`sceneWeights` is off by default** because it is N more property writes per frame. Turn it on when CSS
genuinely needs to react to a specific scene; otherwise `data-active-scene` is enough.

**`initReveal`'s threshold is 0.05, not `ACTIVE_THRESHOLD`.** A scene technically activates a full
viewport-height before it is visible; revealing then means the animation has finished before the user
can see it.

**Anchor options:** `cull` (default `true`) hides the element when the point is offscreen or behind the
camera; `scaleWithDepth` (default `false`) scales it by `10 / distance`, which makes a label feel
attached to the object rather than floating on the glass; `offset` shifts the anchor point in world
space, which is how you put a caption *beside* a subject rather than on top of it.

## Outputs

**Custom properties on `<html>`, written only when the rounded value changed:**

| property | range | meaning |
|---|---|---|
| `--page-progress` | 0..1 | whole-page scroll, damped |
| `--scroll-velocity` | −4..4 | signed, viewport-heights per second, damped |
| `--scroll-speed` | 0..1 | absolute velocity normalised and clamped — **the useful one** |
| `--pointer-x` | −1..1 | |
| `--pointer-y` | −1..1 | |
| `--vh` | px | one percent of the *real* visible viewport height |
| `--scene-weight-<id>` | 0..1 | only with `sceneWeights: true` |

**Attributes on `<html>`:**

| attribute | values | note |
|---|---|---|
| `data-scroll-direction` | `"up"` / `"down"` | |
| `data-scrolling` | `"true"` / `"false"` | flips at `|velocity| > 0.02` |
| `data-quality` | `low` / `medium` / `high` | written by `boot()`, not here |
| `data-active-scene` | scene id | written by the kernel's stage-900 `scene-attr` |
| `data-revealed` | `"true"` | per element, by `initReveal` |
| `--i` | index | per element, for CSS stagger |

**Stages registered:** 900 `dom-bridge` (after `scenes`), 910 `anchors` (after `camera`), 920 `reveal`
(after `scenes`).

## Transitions and applications

**Why not React state or per-element style writes.** Sixty `setState` calls a second re-render the tree
sixty times a second — this is the single biggest reason WebGL sites built on component frameworks feel
heavy: the GPU is fine, the reconciler is not. Writing element styles directly from the loop is better
but still one style invalidation per element. Publishing on the root is one invalidation total, and any
number of elements read it with no JS involvement at all:

```css
.parallax-layer {
  transform: translateY(calc(var(--page-progress) * -220px));
}
```

That animates on the compositor.

**`--scroll-speed` is the one to reach for.** Signed velocity is awkward in CSS; a 0..1 magnitude drives
almost every effect you want:

```css
.nav { letter-spacing: calc(0.02em + var(--scroll-speed) * 0.06em); }
.hero-title { filter: blur(calc(var(--scroll-speed) * 3px)); }
.grain { opacity: calc(0.04 + var(--scroll-speed) * 0.06); }
```

**`--vh` exists because `100vh` on mobile includes the browser chrome.** A full-height hero using
`100vh` is always taller than the visible screen, so the CTA sits below the fold on every phone. Every
template's CSS uses:

```css
.section { min-height: calc(var(--vh, 1vh) * 100); }
```

The `1vh` fallback means it still works before the first frame.

**`data-scrolling` is where transitions belong**, not a JS-toggled class:

```css
.cursor-ring { transition: transform 0.2s ease; }
[data-scrolling='true'] .cursor-ring { transform: scale(0.6); }
```

**Anchors are how you get real text on 3D.** Selectable, accessible, indexable, kerned by the browser.
The alternative — text baked into a texture, or drawn with troika — is invisible to search engines and
screen readers, which for a portfolio or a client's product page is a real cost, not a theoretical one.
Anchors are written with `translate3d` so the compositor handles them; `left`/`top` would relayout.

**Transitions and effects this module enables:**

| effect | mechanism |
|---|---|
| nav inverting over a dark scene | `[data-active-scene='02-night'] .nav { color: #fff }` |
| progress bar | `transform: scaleX(var(--page-progress))` |
| CSS parallax layers | `translateY(calc(var(--page-progress) * …))` |
| speed-reactive blur / letter-spacing / grain | `--scroll-speed` |
| pointer-reactive gradients and shadows | `--pointer-x` / `--pointer-y` |
| staggered entrance | `data-revealed` + `--i` and `transition-delay: calc(var(--i) * 60ms)` |
| captions pinned to a model | `createAnchors` |
| a hotspot that scales as you approach | `scaleWithDepth: true` |

## Gotchas

**`initReveal` never un-reveals.** Elements go into a `done` set and stay revealed. That is deliberate —
content that fades out when you scroll back up is annoying and, for a client, reads as a bug.

**Under reduced motion, `initReveal` sets `data-revealed="true"` on everything immediately and registers
no stage.** So the CSS must have no transition under `prefers-reduced-motion`, or you get every
animation firing at once on load. Wrap the animation, not the end state:

```css
[data-reveal] { opacity: 0; }
[data-reveal][data-revealed] { opacity: 1; transition: opacity 0.6s; }
@media (prefers-reduced-motion: reduce) {
  [data-reveal] { opacity: 1; }
  [data-reveal][data-revealed] { transition: none; }
}
```

**Anchor elements are forced to `position: fixed; top: 0; left: 0`** with everything done in the
transform. Do not also set `top`/`left` in your CSS — they will fight, and `left` relayouts.

**Anchors sub-pixel guard.** Movements under 0.25px are skipped. If you expected a tiny continuous
drift and see none, that is the guard, not a bug.

**`createAnchors` registers a stage per call.** Call it once and share the returned object. A second
call throws on the duplicate stage name `anchors`.

**`--scene-weight-<id>` uses the raw scene id.** An id with characters invalid in a custom property name
produces a silently-ignored write. Keep scene ids kebab-case.

**Two stages share order 900** — this one and the kernel's `scene-attr`. Registration order decides
which runs first. If you need to read `data-active-scene` in the same frame it is written, use 901.

## Recipe

Boot wiring:

```ts
import { initDomBridge, initReveal, createAnchors } from '../modules/dom-bridge'

initDomBridge(app.scenes.instances, { sceneWeights: false, precision: 3 })
initReveal(app.scenes.instances, { selector: '[data-reveal]', stagger: true })

const anchors = createAnchors(app.stage.camera)
```

CSS that consumes the bridge:

```css
:root { --ease-out: cubic-bezier(0.16, 1, 0.3, 1); }

.section { min-height: calc(var(--vh, 1vh) * 100); }

/* progress bar — no JS */
.progress { transform: scaleX(var(--page-progress)); transform-origin: 0 50%; }

/* pointer-reactive light */
.card {
  background: radial-gradient(
    600px circle at calc(50% + var(--pointer-x) * 30%) calc(50% + var(--pointer-y) * 30%),
    rgb(255 255 255 / 0.06), transparent 60%);
}

/* speed */
.title { filter: blur(calc(var(--scroll-speed) * 2.5px)); }

/* nav inverts over one specific scene */
[data-active-scene='02-night'] .nav { color: #fff; mix-blend-mode: difference; }

/* staggered reveal */
[data-reveal] { opacity: 0; transform: translateY(24px); }
[data-reveal][data-revealed] {
  opacity: 1; transform: none;
  transition: opacity 0.7s var(--ease-out), transform 0.7s var(--ease-out);
  transition-delay: calc(var(--i, 0) * 70ms);
}
@media (prefers-reduced-motion: reduce) {
  [data-reveal] { opacity: 1; transform: none; }
  [data-reveal][data-revealed] { transition: none; }
}
```

A caption pinned to a point on the character:

```ts
build(ctx) {
  const label = document.querySelector<HTMLElement>('#hilt-caption')!
  offAnchor = anchors.add(label, hiltBone, {
    offset: [0.15, 0.05, 0],
    cull: true,
    scaleWithDepth: true,
  })
}
dispose() { offAnchor?.() }
```

Related: [`../kernel/state.md`](../kernel/state.md) (the values being published),
[`../kernel/weights.md`](../kernel/weights.md) (what drives reveal),
[`cursor.md`](cursor.md) (also publishes properties), [`text-split.md`](text-split.md)
(what `data-revealed` usually animates).
