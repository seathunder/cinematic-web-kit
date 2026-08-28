# Syntax

Every idiom in the codebase, and why it is written that way. TypeScript, GLSL, HTML, CSS, and the
naming conventions that keep 25 files legible.

---

## 1. TypeScript

### `satisfies`, not an annotation

```ts
export default { id: '03-artifact', renderer: 'three', /* … */ } satisfies SceneDefinition
```

`: SceneDefinition` widens the literal, and you lose inference on `ctx` inside `build`/`update`.
`satisfies` checks the shape and keeps the narrow types. Use it for every scene, every manifest
entry, every options object you want checked but not widened.

### `import type` for anything type-only

```ts
import type { SceneDefinition, SceneCtx } from '../../kernel/types'
import * as THREE from 'three'
```

Keeps the emitted module graph honest and prevents a type-only import from dragging a runtime
dependency into the bundle.

### Module-scope state for scene locals

A scene module is a singleton — one definition, one instance. So locals live at module scope, and
`dispose()` nulls them:

```ts
let mesh: THREE.Mesh | null = null
let tl: Timeline | null = null

export default {
  build(ctx) { mesh = new THREE.Mesh(geo, mat); ctx.parallax.add(mesh) },
  update(w) { if (mesh) mesh.rotation.y = w * Math.PI },
  dispose() { if (mesh) disposeObject(mesh); mesh = null; tl?.kill(); tl = null },
} satisfies SceneDefinition
```

**Null them.** Not for the GC — for the next `build()`, which must not see a disposed handle.

### Never allocate in `update`

```ts
// WRONG — 60 Vector3s per second, per line
update() { mesh.position.copy(new THREE.Vector3(x, y, z)) }

// RIGHT — one scratch vector, reused
const _v = new THREE.Vector3()
update() { mesh.position.copy(_v.set(x, y, z)) }
```

Leading-underscore `_v`, `_m`, `_c`, `_q` is the convention for module-scope scratch objects. GC
pauses are the one performance problem that looks completely random.

### Uniform objects are held by reference

three stores the object you pass, not a copy. So hold it at module scope and write `.value` later:

```ts
const uWind = { value: 0.2 }                       // module scope

gpuAnimate(material, { glsl, uniforms: { uWind }, cacheKey: 'grass' })

update(_w, ctx) {
  uWind.value = 0.15 + Math.min(0.6, Math.abs(ctx.state.velocity.current) * 0.5)
}
```

Passing an inline `{ value: 0.2 }` gives you no handle, and there is no way to get it back.

### Optional chaining on every module handle

```ts
post?.set('uGrain', 0.05)
ambience?.setVolume(w * 0.6, 0.2)
```

`createPost` returns `null` on the low tier. `audio.context` is `null` before unlock. Modules are
optional by design, so call sites must be written for their absence — this is not defensive
paranoia, it is the contract.

### Cache anything derived from layout, keyed on `pageReflow`

```ts
let rect = { top: 0, height: 0 }
let rectAt = -1
function bounds() {
  if (rectAt !== state.pageReflow) { rect = measure(el); rectAt = state.pageReflow }
  return rect
}
```

A `getBoundingClientRect()` in a loop stage forces layout every frame. One call is cheap; one call
per frame per element is a stall you will blame on the GPU.

### Return an unsubscribe, always

Every `init*` and every `add` returns a teardown function:

```ts
const off = onReflow(fit)
const unregister = picker.add(katana, handlers)
dispose() { off(); unregister() }
```

No cleanup registry, no leak.

### `readonly` on anything a scene must not write

```ts
readonly level: number
readonly hovered: THREE.Object3D | null
```

`ctx.camera` cannot be `readonly` (it is a class instance you legitimately read from), so law 6 is a
documented rule instead. Where the type system *can* express intent, it does.

---

## 2. GLSL

### The one that costs an hour

**A backtick inside a GLSL comment terminates the enclosing TypeScript template literal.**

```ts
const glsl = `
  // don't use `pow` here          <-- THIS ENDS THE TEMPLATE LITERAL
  transformed.y += 1.0;
`
```

The parse error appears far from the cause, often in an unrelated file. Never use a backtick in a
shader comment. This exact bug has been fixed twice in this codebase (`transition.ts:155` and `:162`).

### Injection into three's chunks

Verified by running node against three 0.185.1:

```
ShaderChunk.begin_vertex     declares  vec3 transformed = vec3( position );
ShaderChunk.project_vertex   declares  vec4 mvPosition
                             applies   instanceMatrix under #ifdef USE_INSTANCING
```

So:

| `space` | write | why |
|---|---|---|
| `'local'` | `transformed` | before the instance matrix — object space |
| `'view'` | `mvPosition` | after; offsets need `(viewMatrix * vec4(o, 0.0)).xyz` |

**`w = 0.0`, not `1.0`, when transforming a direction.** `viewMatrix` is affine; `w = 1.0` adds the
camera translation to your offset and everything drifts as the camera moves. A vector gets `0.0`, a
point gets `1.0`. This is the most common shader-maths mistake in the toolkit's history.

### Always declare precision

```glsl
precision highp float;
```

Missing on a fragment shader, some mobile drivers default to `mediump` — which is fine for colour
and visibly steppy for anything positional or noise-based. Symptom: banding on your phone only.

### Float literals need a decimal point

`1` is an int; `1.0` is a float. `float x = 1;` fails to compile on strict drivers and silently
works on lenient ones, so it passes on your desktop and fails on the client's phone.

### Cheap first, always

| expensive | cheaper |
|---|---|
| `pow(x, 2.0)` | `x * x` |
| `normalize()` in a fragment loop | normalise once in the vertex shader and interpolate |
| a 3D noise per fragment | a 2D noise, or sample a baked texture |
| `if` on a uniform | branch-free `mix(a, b, step(...))`, or two materials |
| `sin` per fragment per octave | 2–3 octaves of fbm, not 6 |

A fragment shader runs per pixel per pass: at DPR 2 on a 1440p screen that is **14.7 million
invocations per frame**. Vertex-shader work runs per vertex — usually thousands. **Move everything
you can to the vertex shader.**

### Signature of an injected block

```ts
gpuAnimate(material, {
  glsl: `
    float phase = aSeed * 6.283185;
    float sway = sin(uTime * 1.4 + phase) * aSway;
    transformed.x += sway;
    transformed.z += cos(uTime * 0.9 + phase) * aSway * 0.35;
  `,
  attributes: { aSeed, aSway },
  uniforms: { uTime: instanceTime, uWind },
  space: 'local',
  cacheKey: 'grass-sway',        // REQUIRED — see below
})
```

**`cacheKey` is not optional in practice.** three caches compiled programs by material config; two
materials with the same config and different `onBeforeCompile` injections get the **same program**.
Symptom: *your second field animates like the first.*

### Naming

| prefix | means |
|---|---|
| `u` | uniform — `uTime`, `uWind`, `uProgress` |
| `a` | attribute — `aSeed`, `aSway`, `aOffset` |
| `v` | varying — `vUv`, `vNormal`, `vWorldPos` |

Not decoration: `uTime` in a fragment shader tells you instantly that it is the same value
everywhere, whereas `vTime` would mean it was interpolated.

### Shader files

```ts
import frag from '../shaders/materials/ink.frag'      // vite-plugin-glsl
```

`vite-plugin-glsl` gives you `#include` and real syntax highlighting. Inline template literals are
correct for a five-line injection; anything longer belongs in a file.

---

## 3. HTML

The DOM is the site. GL is enhancement. **The page must read and navigate with JavaScript
disabled.**

```html
<html lang="en">
<body data-ready="false">
  <canvas data-gl></canvas>

  <div data-preloader>
    <span data-preloader-count>0</span>
    <button data-preloader-enter>Enter</button>   <!-- the audio unlock gesture -->
  </div>

  <main data-scroll-content>
    <section id="chapter-arrival" data-scene="01-arrival">
      <h1 data-split data-reveal>The road at dusk</h1>
      <p data-reveal>Real prose. Indexable, translatable, selectable.</p>
    </section>

    <section id="chapter-artifact" data-scene="03-artifact">
      <h2 data-split="chars">The blade</h2>
      <a href="/work" data-cursor="view" data-magnetic="0.3">See the work</a>
    </section>
  </main>

  <button class="sound-toggle" aria-pressed="false" data-cursor="sound">
    <span class="sound-toggle__meter"></span>
    <span class="sound-toggle__label">Sound</span>
  </button>
</body>
</html>
```

### The attribute vocabulary

| attribute | read by |
|---|---|
| `data-scene="<id>"` | documentation for humans; the manifest's `section` selector does the binding |
| `data-split`, `data-split="chars"` | `initSplits()` |
| `data-reveal` | `initReveal()` |
| `data-cursor="view"` | `cursor.ts` |
| `data-cursor-snap` | `cursor.ts` — the ring snaps to this element's box |
| `data-magnetic`, `data-magnetic="0.3"` | `initMagnetic()` |
| `data-preloader`, `data-preloader-count`, `data-preloader-enter` | `preloader.ts` |

**Attributes, not classes, for behaviour.** Classes are the designer's; attributes are the
engineer's. Neither breaks the other by renaming.

### Accessibility that is not optional

- `aria-pressed` on the mute toggle, kept in sync.
- `initSplits` with `aria: true` — 40 spans in a heading is unreadable to a screen reader otherwise.
- `:focus-visible` styling on every interactive element. A cursor ring growing is not an affordance
  for keyboard users.
- A skip link, if there is a nav.
- `prefers-reduced-motion` respected via `state.reducedMotion` — cursor off, magnetics off, smooth
  scroll off, damped values snapped.

---

## 4. CSS

### The `--vh` rule

```css
.hero { height: calc(var(--vh) * 100); }    /* NOT 100vh */
```

Mobile browser chrome makes `100vh` taller than the visible viewport, so a `100vh` hero is cut off
on exactly the devices most traffic comes from. `dom-bridge` publishes the real value.

### The cursor contract

```css
[data-cursor-active] * { cursor: none; }

/* MANDATORY. A text field with no caret is broken, not stylish. */
[data-cursor-active] input,
[data-cursor-active] textarea,
[data-cursor-active] [contenteditable] { cursor: auto; }

.cursor { position: fixed; inset: 0 auto auto 0; pointer-events: none; z-index: 9999; }
[data-cursor-state='view'] .cursor__ring { transform: scale(2.4); }
```

**Gate on capability:** `@media (hover: hover) and (pointer: fine)`. A width query gives a custom
cursor to a stylus tablet and withholds it from a small laptop.

### Reading the published values

```css
.nav                                   { transition: opacity .3s; }
[data-scrolling='true'] .nav           { opacity: .35; }
[data-scroll-direction='-1'] .nav      { transform: none; }
[data-active-scene='03-artifact']      { --ink: #d8c9a3; --paper: #14100c; }
[data-quality='low'] .grain-overlay    { display: none; }

.parallax-layer { transform: translate3d(calc(var(--pointer-x) * 12px - 6px), 0, 0); }
.progress-bar   { transform: scaleX(var(--page-progress)); transform-origin: 0 50%; }
.sound-meter    { transform: scaleY(calc(.2 + var(--audio-level, 0) * .8)); }
```

**This is the seam that keeps design in CSS.** A designer can restyle the chrome, the per-chapter
palette, and the scroll-reactive behaviour without touching TypeScript.

### Animate two properties only

`transform` and `opacity`. Everything else costs layout or paint.

```css
/* WRONG — layout every frame */
.card { transition: width .4s, height .4s, top .4s; }
/* RIGHT — compositor only */
.card { transition: transform .4s, opacity .4s; }
```

### The CSS-only stagger

`splitText` writes `--i` and `--n` on every generated element:

```css
.line { opacity: 0; transform: translateY(100%); }
[data-revealed] .line {
  opacity: 1; transform: none;
  transition: transform .9s cubic-bezier(.16,1,.3,1), opacity .6s;
  transition-delay: calc(var(--i) * 60ms);
}
```

No GSAP, no JS. Use `textTimeline` when you need to *scrub* the reveal instead.

### Reduced motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; }
  .cursor { display: none; }
}
```

Belt and braces alongside `state.reducedMotion` — CSS transitions the JS never sees still need
covering.

---

## 5. Naming

| kind | convention | example |
|---|---|---|
| files | kebab-case | `frame-sequence.ts`, `text-split.ts` |
| factories | `create*` | `createPost`, `createCursor`, `createPicker` |
| side-effect installers | `init*` | `initScroll`, `initMagnetic`, `initDomBridge` |
| scene ids | `NN-name` | `01-arrival`, `03-artifact` — sorts, and reads in `?scene=03` |
| sections | `#chapter-<name>` | `#chapter-artifact` |
| CSS custom props | `--kebab` | `--page-progress`, `--audio-level` |
| data attributes | `data-kebab` | `data-active-scene`, `data-cursor-state` |
| scratch objects | `_` prefix | `_v`, `_m`, `_c` |
| uniform handles | `u` prefix | `uWind`, `uTime` |
| stage names | lowercase, hyphenated | `audio-scroll-filter`, `scene-attr` |

**`create*` returns a handle with a `dispose`. `init*` returns a teardown function.** The naming
tells you which cleanup shape to expect, so you never have to look it up.

### Comments

Comment the **why**, never the what. The codebase's own standard:

```ts
// Hold the uniform object at module scope and pass the SAME reference into `uniforms`.
// That is how you keep a handle you can write to later — three stores the reference, not a copy.
const uWind = { value: 0.2 }
```

```ts
// 0.001, not 0: a finished float ramp yields ~3e-17, so `> 0` never deactivates anything.
export const ACTIVE_THRESHOLD = 0.001
```

**No emojis. Anywhere.** Not in comments, commits, headings, or UI copy.

---

## 6. Project file layout

```
Projects/<client>/
├─ index.html
├─ src/
│  ├─ main.ts                  boot + module wiring, in order
│  ├─ assets.ts                the AssetSpec[] — one place
│  ├─ kernel/                  copied verbatim from the toolkit. Do not edit
│  ├─ modules/                 only the ones this project uses
│  ├─ scenes/
│  │  ├─ manifest.ts           import order = scroll order
│  │  ├─ 01-arrival.ts
│  │  └─ 03-artifact.ts
│  ├─ shaders/
│  └─ styles/
│     ├─ base.css              reset, --vh, reduced motion
│     ├─ type.css
│     ├─ cursor.css
│     └─ scenes.css
├─ public/
│  ├─ decoders/{draco,basis}/  copied from three — MUST be self-hosted
│  ├─ models/  textures/  video/  frames/  audio/
└─ vite.config.ts
```

**`manifest.ts` import order is the scroll order.** Reordering the array reorders the film. That
property is worth preserving — do not sort it alphabetically.

```ts
import arrival from './01-arrival'
import artifact from './03-artifact'
export const manifest = [arrival, artifact] satisfies SceneDefinition[]
```

**`kernel/` is copied, not edited.** A project that has modified its kernel cannot take a fix from
the toolkit. Everything a project needs to vary is already an option.

---

Related: `kernel-api.md` · `modules-api.md` · `recipes.md` · `troubleshooting.md`.
