# EVIDENCE

**Every non-obvious claim in this toolkit, with where it was verified.**

The guides in [`kernel/`](kernel/) and [`modules/`](modules/) state facts flatly, because a guide full of
hedging is useless. This file is where those facts are backed up — or where they are honestly downgraded.

## How to read this file

| tag | means | how much to trust it |
|---|---|---|
| **[S]** | **Source-verified** — read in a file on this machine, path and line given | high. Re-check after a dependency upgrade |
| **[C]** | **Checked** — confirmed by running code on this machine, command given | high |
| **[D]** | **Documented** — stated in a specification or official documentation | high for the API contract; implementations still vary |
| **[A]** | **Arithmetic** — derived from the stated inputs. The inputs are the real claim | as good as the inputs |
| **[F]** | **Field knowledge** — widely reported, **not measured here** | a prior, not a fact. Measure before you depend on it |

**If you are a future agent: do not promote an [F] to a statement of fact.** The commands to check them
yourself are included.

Verified on **2026-08-25**, Windows 11, Node with the versions in §1.

---

## 1. Environment — [C]

```bash
node -e "for (const m of ['three','gsap','lenis','mp4box','vite','typescript','tweakpane','stats-gl','sharp','gltfpack','@gltf-transform/cli','vite-plugin-glsl','ffmpeg-static','ffprobe-static']) console.log(m, require('./node_modules/'+m+'/package.json').version)"
```

| package | version | role |
|---|---|---|
| `three` | **0.185.1** | renderer. `THREE.REVISION === 185` |
| `gsap` | 3.15.0 | timelines, ScrollTrigger. All former Club plugins are free from 3.13+ |
| `lenis` | 1.3.26 | smooth scroll |
| `mp4box` | 2.4.1 | MP4 demuxing for the WebCodecs scrub path |
| `vite` | 8.2.2 | build |
| `typescript` | 7.0.2 | typecheck |
| `vite-plugin-glsl` | 1.6.1 | `.glsl` imports with `#include` |
| `tweakpane` | 4.0.5 (+ `@tweakpane/core`) | debug panel |
| `stats-gl` | 4.2.3 | GPU-aware stats |
| `gltfpack` | 1.2.0 | Meshopt + BasisU, WASM — no native toolchain |
| `@gltf-transform/cli` | 4.4.2 | finer-grained glTF work |
| `sharp` | 0.35.3 | images |
| `ffmpeg-static` / `ffprobe-static` | 5.3.0 / 3.1.0 | video and frame sequences |

**Typecheck status — [C]:** all 25 TypeScript files compile clean.

```bash
npx --no-install tsc -p toolkit/tsconfig.json
```

Note: **`@tweakpane/core` is a required peer for `Pane.addFolder`** typing under TS 7 — [S], found by the
compile error, not by the docs.

---

## 2. three.js internals

### 2.1 Tone mapping is skipped when rendering into a render target — [S]

**This is the fact that makes postprocessing look washed out or double-graded**, and it is why
`OutputPass` exists.

`node_modules/three/build/three.module.js:7549–7559` (`WebGLPrograms.getParameters`):

```js
let toneMapping = NoToneMapping;

if ( material.toneMapped ) {

    if ( currentRenderTarget === null || currentRenderTarget.isXRRenderTarget === true ) {

        toneMapping = renderer.toneMapping;

    }

}
```

The same guard again at **`three.module.js:18345–18355`** (`WebGLRenderer.setProgram`), reading
`_currentRenderTarget`.

**Consequence:** the moment you render through an `EffectComposer`, `renderer.toneMapping` stops being
applied by the material. It has to be re-applied at the end of the chain. Do not "fix" a washed-out
composer output by raising exposure.

Verify:

```bash
grep -n "currentRenderTarget === null" node_modules/three/build/three.module.js
```

### 2.2 `OutputPass` must be last — [S], and it is in the docs, in the source

`node_modules/three/examples/jsm/postprocessing/OutputPass.js:17–21`:

> This pass is responsible for including tone mapping and color space conversion into your pass chain. In
> most cases, this pass should be included at the end of each pass chain. **If a pass requires sRGB input
> (e.g. like FXAA), the pass must follow `OutputPass` in the pass chain.**

**Consequence — the order in [`modules/post.md`](modules/post.md) is not stylistic:**

```
RenderPass → UnrealBloomPass → BokehPass → OutputPass → GradePass
```

Bloom and DOF are physical effects and belong in linear HDR, *before* the transform. A grade is a look and
belongs in display space, *after* it. FXAA, if you use it, also goes after.

### 2.3 `EffectComposer` allocates HalfFloat and **zero MSAA samples** — [S]

`EffectComposer.js:69`:

```js
renderTarget = new WebGLRenderTarget( this._width * this._pixelRatio, this._height * this._pixelRatio, { type: HalfFloatType } );
```

`node_modules/three/src/core/RenderTarget.js:63` — the default it therefore inherits:

```js
samples: 0,
```

**Consequence:** turning on postprocessing silently turns off the canvas antialiasing you set in the
`WebGLRenderer` constructor, because you are no longer drawing to the canvas. Edges get jaggy the instant
you add bloom, and it looks like the bloom did it.

**The fix is `samples` on the composer's own target** (WebGL2 gives you free multisampled renderbuffers),
not FXAA. FXAA is a blur that guesses; MSAA is correct. Reach for FXAA only when you have proven you
cannot afford MSAA on the low tier.

HalfFloat is also the right default and worth keeping: bloom needs values above 1.0 to have anything to
bloom.

### 2.4 The two shader chunks `gpuAnimate` injects into — [C]

```bash
node -e "const t=require('three'); console.log(t.ShaderChunk.begin_vertex); console.log(t.ShaderChunk.project_vertex)"
```

`begin_vertex` — this is where `transformed` is *declared*, so an injection after it can add to it:

```glsl
vec3 transformed = vec3( position );
#ifdef USE_ALPHAHASH
    vPosition = vec3( position );
#endif
```

`project_vertex` — this is where `mvPosition` is declared **and where `instanceMatrix` is applied**:

```glsl
vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
    mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
    mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;
```

**Consequences, both load-bearing in [`modules/instancing.md`](modules/instancing.md):**

- `space: 'local'` injects after `begin_vertex` → the offset is in object space, so it is rotated by
  `instanceMatrix` *and* `modelViewMatrix`. It moves **with** the instance and is visible to anything
  working in world space.
- `space: 'view'` injects after `project_vertex` → `instanceMatrix` has already been applied, so the
  offset must be brought into view space with `(viewMatrix * vec4(cwOffset, 0.0)).xyz`. **`w = 0.0` is
  required**: a direction must be rotated, not translated. With `w = 1.0` the whole field jumps to the
  camera's position.

### 2.5 `customProgramCacheKey` and the silent shader collision — [D]

three caches compiled programs by material type plus defines. Two materials of the same type with
different `onBeforeCompile`-injected source produce the **same** cache key, so the second one silently
receives the first one's compiled program.

**Symptom: your second instanced field animates exactly like the first.** No error, no warning.

`gpuAnimate` hashes the GLSL into `customProgramCacheKey` for this reason. If you generate GLSL
dynamically, pass an explicit `cacheKey`.

### 2.6 Shadow maps never see an `onBeforeCompile` injection — [D]

Shadow passes use an internal depth material. It is not the material you patched, so a GPU-animated mesh
casts a **static** shadow of its undisplaced geometry.

Two honest fixes, in order of how often they are right:

1. Turn casting off for the field and put a soft baked contact shadow underneath. Cheaper, and on a low
   tier where `shadowMap` is 0 it is the only thing that works anyway.
2. Assign a matching `mesh.customDepthMaterial` with the same injection.

### 2.7 `visible = false` does not stop raycasting — [D]

`Raycaster.intersectObjects` skips invisible objects only when the layer/visibility checks in your own
code do. `Object3D.raycast` itself is called for registered objects regardless. Hiding a mesh is not
un-registering it.

### 2.8 `matrixWorld` is only refreshed inside `renderer.render()` — [D]

`Object3D.raycast` reads `matrixWorld`. Any picker that runs *before* the render stage is therefore
testing against **last frame's** transforms. Symptom: the hitbox lags the model.

This is why `modules/raycast.ts` calls `updateWorldMatrix(true, false)` per registered object — `true`
walks *up* so a parent's animation is included; `false` does not descend, because `Object3D.raycast`
refreshes the children that matter. It is affordable exactly because the registered list is short.

### 2.9 `gl_PointSize` is capped by the driver — [D] for the limit, [F] for the numbers

The cap is queryable and is part of WebGL:

```js
gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)   // [min, max]
```

**[F]** Commonly 1024 on desktop; **as low as 63 on some mobile GPUs** — widely reported, not measured
here. Query it on your target device before relying on large points.

**[D]** Points are always screen-aligned squares and **cannot be rotated**. There is no mechanism for it.
Anything that must rotate or carry an oriented texture needs an instanced plane with a billboard vertex
shader.

### 2.10 Transparent points must not write depth — [D]

With `depthWrite: true`, particles drawn earlier occlude particles behind them that should show through,
because the depth buffer has no concept of partial coverage. Sorting cannot fully fix it for a field.
`depthWrite: false` is correct for any additive or soft-alpha particle field.

---

## 3. Frame-rate independence

### 3.1 A naive lerp closes 2.4× faster at 144 Hz — [A]

`kernel/state.ts:27` and the mirror in `kernel/index.ts:64`:

```js
const f = 1 - Math.pow(1 - s.ease, delta * 60)
```

**The arithmetic.** After one second, a naive `current += (target - current) * ease` leaves a remaining
fraction of `(1 - ease)^frames`. With `ease = 0.1`:

| display | frames in 1 s | remaining `0.9^n` |
|---|---|---|
| 60 Hz | 60 | 0.0018 |
| 144 Hz | 144 | 0.0000000000000000000000000000000000000000000000000000000000000000018 |

That ratio is unusable as a headline, so the meaningful comparison is **time to close 90 %**:
`n = ln(0.1) / ln(0.9) ≈ 21.85` frames → **0.364 s at 60 Hz, 0.152 s at 144 Hz**.

**0.364 / 0.152 = 2.4×.** That is the figure quoted throughout the guides: the same `ease` produces
motion that settles **2.4× faster** on a 144 Hz display.

`Math.pow(1 - ease, delta * 60)` makes the remaining fraction a function of *elapsed time*, so the curve
is identical on both. `ease` then means "the fraction closed per 1/60 s", which is a unit you can reason
about.

**Consequence:** this is why so many WebGL sites feel snappy for the developer and sluggish for the
client, or vice versa. It is not taste. It is a missing `Math.pow`.

### 3.2 `MAX_DELTA = 1/20` — [S] `kernel/loop.ts:37`, clamped at `:75`

```js
const MAX_DELTA = 1 / 20
...
if (delta > MAX_DELTA) delta = MAX_DELTA
```

**Why it exists:** a tab in the background, a long GC pause, or a stalled asset decode produces a delta of
seconds. Without a clamp, every damped value jumps straight to its target and every physics-ish
integration explodes — the site visibly "snaps" when you return to the tab. Clamping trades a small
correctness loss (the world runs slightly slow during a stall, which nobody can see) for never snapping.

---

## 4. Kernel invariants — [S], in this repo

### 4.1 `ACTIVE_THRESHOLD = 0.001`, not 0 — `kernel/weights.ts:24`

Used at `weights.ts:90`, `weights.ts:108`, `camera.ts:94`, `camera.ts:107`, `stage.ts:172`, `stage.ts:196`.

**Why not zero.** A weight is computed as `clamp(in * (1 - out))` from ramps that are themselves
floating-point divisions. A ramp that has mathematically finished produces values like `3e-17`, not `0`.
Testing `weight > 0` therefore keeps a finished scene *active* — built, updating, and rendering — forever.
Symptom: nine scenes are live by the bottom of the page and the site dies.

`camera.ts:107`'s `totalWeight < ACTIVE_THRESHOLD` guard is the same idea protecting a division: the
weighted-average camera would otherwise divide by ~1e-17 and produce `Infinity` positions.

### 4.2 The 22 registered loop stages — [C]

```bash
grep -rhn "order: [0-9]*" toolkit/kernel/*.ts toolkit/modules/*.ts
```

| order | stage | file |
|---|---|---|
| 0 | `time` | `kernel/loop.ts` |
| 5 | `preloader` | `kernel/loop.ts` |
| 10 | `state` | `kernel/index.ts` |
| 20 | `scroll` | `kernel/scroll.ts` |
| 30 | `viewport` | `kernel/viewport.ts` |
| 40 | `weights` | `kernel/weights.ts` |
| 45 | `instance-time` | `modules/instancing.ts` |
| 50 | `camera` | `kernel/camera.ts` |
| 60 | `scenes` | `kernel/stage.ts` |
| 900 | `scene-attr` | `kernel/stage.ts` |
| 900 | `dom-bridge` | `modules/dom-bridge.ts` |
| 910 | `anchors` | `modules/dom-bridge.ts` |
| 920 | `reveal` | `modules/dom-bridge.ts` |
| 930 | `cursor` | `modules/cursor.ts` |
| 935 | `magnetic` | `modules/cursor.ts` |
| 940 | `audio` | `modules/audio.ts` |
| 941 | `audio-scroll-filter` | `modules/audio.ts` |
| 970 | `picker` | `modules/raycast.ts` |
| 980 | `render` | `kernel/stage.ts` |
| 985 | `transition` | `modules/transition.ts` |
| 995 | `watchdog` | `kernel/debug.ts` |
| 998 / 999 | `debug` / `stats` | `kernel/debug.ts` |

**Two stages legitimately share order 900** (`scene-attr` and `dom-bridge`). They touch different
attributes and neither reads the other's output, so the tie is harmless — which is why the ordering
contract is expressed as `after:` assertions that **throw at registration**, not as unique numbers. A
number is a hint; the assertion is the guarantee.

Reserved bands: **0–99 kernel · 100–899 project · 900–979 DOM/interaction · 980–999
render/diagnostics.** Put project stages in 100–899 and nothing you write can wedge itself between
`weights` and `camera`.

### 4.3 A backtick inside a GLSL comment ends the enclosing template literal — [C]

Found the hard way in `modules/transition.ts` (two occurrences, both fixed). GLSL lives in TypeScript
template literals; a stray `` ` `` in a `//` comment inside one terminates the literal, and the resulting
syntax error is reported at a line far from the cause.

**Rule: no backticks in shader comments.** Not a style preference — a parse failure.

---

## 5. Web platform

### 5.1 WebAudio — six rules, all of which fail silently

| # | rule | tag | note |
|---|---|---|---|
| 1 | An `AudioContext` starts **suspended**; `resume()` must be called **synchronously inside** a user-gesture handler | [D] | the user-activation flag is consumed asynchronously, so `await something(); resume()` is already too late. This is *the* reason the preloader has a gate |
| 2 | One context per page | [D]/[F] | the spec allows several; **[F]** Safari has historically permitted only a handful and does not reclaim them promptly. One-per-sound works in development and dies on the client's iPhone |
| 3 | Never assign `gain.value` while audio is playing | [A] | a step change in gain is a discontinuity in the waveform. You hear it as a click. Use `setTargetAtTime` |
| 4 | Long audio → `<audio>` + `createMediaElementSource`; short → decoded `AudioBuffer` | [D] | the wrong choice either stalls the page decoding megabytes or adds ~100 ms of latency to a click |
| 5 | `crossOrigin = 'anonymous'` on any media element routed through WebAudio | [D] | without it a cross-origin resource taints the graph and the output is **silence, with no error** |
| 6 | Never autoplay with sound; always ship a visible mute | [D] | browsers block it and users leave |

**`setTargetAtTime` reaches ~95 % after three time constants — [A].** The node approaches its target
exponentially: `1 - e^-t/τ`. At `t = 3τ`, `1 - e^-3 = 0.9502`. **This is why every fade in
`modules/audio.ts` passes `seconds / 3`** — it is what makes a "2 second fade" take about 2 seconds
instead of about 6.

**Bin → Hz is `bin * sampleRate / fftSize` — [A].** With `fftSize = 1024` at 44.1 kHz: 512 bins,
**~43 Hz each**. Adequate for band energy; a real spectrum display needs more.

**Frequency ramps must be exponential — [A].** Pitch and cutoff are perceived logarithmically. A linear
ramp from 20 kHz to 600 Hz spends most of its duration above 10 kHz, where almost nothing audible lives —
so it sounds like nothing happens, then everything happens at once. `exponentialRampToValueAtTime` cannot
pass through zero, hence the ≥ 40 Hz clamp in `setLowpass`.

**`decodeAudioData` detaches the `ArrayBuffer` — [D].** Each buffer is single-use. So is an
`AudioBufferSourceNode`: create one per `play()`. That is cheap by design and is what lets a sound overlap
itself.

**iOS needs real audio through the context to stay awake — [F].** `unlock()` plays a 1-sample silent
buffer for this. It looks like dead code. Removing it breaks iOS.

### 5.2 Video scrubbing — encoding decides everything

| flag | claim | tag |
|---|---|---|
| `-g 10` | keyframe every 10 frames | [D] |
| | **x264's default `keyint` is 250** — so a seek can be up to 249 frames of decode from the nearest keyframe. At 30 fps that is **over 8 seconds of decode work for one seek** | [D] |
| `-bf 0` | B-frames reference *future* frames, so a backward seek must decode forward first. Backward scrubbing is where B-frames become visible as stutter | [D] |
| `-movflags +faststart` | moves the `moov` atom to the front so playback can start before the file finishes downloading | [D] |
| `-an` | a scrubbed video's audio is never used; it is pure wasted bytes | [A] |
| `-crf 22` | visually transparent for this purpose | [F] |

Check what you actually shipped:

```bash
ffprobe -v error -select_streams v:0 -show_entries frame=key_frame -of csv=p=0 -read_intervals "%+#60" shot.mp4
```

Roughly one `1` every ten rows means `-g 10` took.

**The three strategies, in order — [D] for the APIs, [F] for the ranking:** `webcodecs` (frame-exact,
needs `VideoDecoder` + `mp4box`) → `rate` (`playbackRate` chasing a target time) → `seek`
(`currentTime =`, **the best of the three on WebKit**, where `requestVideoFrameCallback` and WebCodecs
support have been the least consistent).

### 5.3 `VideoFrame` and `ImageBitmap` are not garbage collected — [D]

Both hold platform memory the JS GC does not manage. **Every one that leaves a cache must be `.close()`d.**

**The consequence that matters: the leak is invisible in a JS heap snapshot.** The heap looks flat while
the tab's real memory climbs until the GPU process is killed. If a scrubbing scene dies after a minute and
the heap graph is clean, this is why — look for a missing `.close()`, not a retained closure.

### 5.4 `createImageBitmap` decodes off the main thread; `new Image()` does not — [D]

`new Image()` + `onload` performs its decode on the main thread at first paint, producing a frame-time
spike exactly when a sequence starts playing. `createImageBitmap(blob)` returns a promise and decodes off
thread.

**Consequence:** a frame sequence built on `new Image()` stutters on its first pass and is smooth
thereafter — which reads as "the network was slow" and is actually the decoder.

### 5.5 The custom-cursor gate is a capability query — [D]

```css
(hover: hover) and (pointer: fine)
```

**Not a width query.** A tablet with a stylus reports `pointer: fine` and no hover; a touch-screen laptop
reports both. `min-width: 1024px` enables a custom cursor on a tablet and disables it on a small laptop —
precisely backwards. `state.reducedMotion` gates it too.

### 5.6 Line splitting must be measured, not computed — [A]

A line break depends on the font's actual metrics, the resolved width, hyphenation, and the language. The
only reliable way to find where lines break is to let the browser lay the text out and read the resulting
rects.

Three consequences, all in [`modules/text-split.md`](modules/text-split.md):

1. **Re-split after `document.fonts.ready`.** A split done against the fallback font is wrong the instant
   the webfont swaps in.
2. **Read all, then write all.** Interleaving `getBoundingClientRect()` with DOM writes forces a synchronous
   layout per element. It is the difference between one reflow and *n*.
3. Re-split on a real width change only — not on a mobile scroll that merely collapses the URL bar. See
   `pageReflow` in [`kernel/viewport.md`](kernel/viewport.md).

---

## 6. Performance arithmetic

Every number here is [A] — derived from a stated input. **The inputs are the claim; check them on your
target hardware.**

### 6.1 Draw calls — the most common cause of a slow "simple" scene

**Input [F]:** a draw call costs the CPU roughly **0.05–0.2 ms** of state setup, largely independent of
how simple the mesh is. This is a well-established range for WebGL on mid-range hardware; it is not
measured on this machine.

**Arithmetic:**

| meshes | CPU per frame | verdict at 60 fps (16.7 ms budget) |
|---|---|---|
| 10 | 0.5–2 ms | fine |
| 100 | 5–20 ms | marginal to broken |
| **500** | **25–100 ms** | **12 fps or worse, with the GPU idle** |

**Consequence:** at 500 meshes the GPU has nothing to do and the site still runs at 12 fps. No amount of
texture compression, LOD, or shader simplification helps, because the bottleneck is the driver. Instancing
is the only fix. This is the arithmetic behind
[`modules/instancing.md`](modules/instancing.md)'s existence.

Measure yours:

```ts
import { gpuInfo } from './kernel/dispose'
console.log(gpuInfo(renderer))   // calls, triangles, programs, geometries, textures
```

### 6.2 A 120k-triangle raycast target

**Input:** `Raycaster` tests **every triangle** of any mesh whose bounding sphere the ray hits.

**Arithmetic:** a 120k-triangle character = **120,000 ray/triangle intersections per cast**.
`pointermove` fires up to **120×/s** on a high-polling mouse → up to **14.4 million** intersections per
second, to answer one boolean.

**The fixes, by leverage:**

| fix | cost after |
|---|---|
| a 12-triangle proxy box | **120,000 → 12.** Four orders of magnitude, one line |
| throttle to `hz: 30` | 4× fewer casts |
| dirty-flag (cast only when the pointer moved) | removes all idle cost |
| registered list, never `scene.children` | removes the traversal |
| [`three-mesh-bvh`](https://github.com/gkjohnson/three-mesh-bvh) (MIT) | log-time; **not a dependency here** because the proxy solves ~95 % of cases for free |

### 6.3 Frame sequences — the 2 GB mistake

**Input:** a decoded RGBA frame is `width × height × 4` bytes.

**Arithmetic:** 1920 × 1080 × 4 = **8.29 MB per frame**. 240 frames = **1.99 GB**.

**Consequence:** eagerly decoding a 240-frame 1080p sequence to `ImageBitmap` allocates ~2 GB and the tab
is killed. Every one of the five open-source frame-sequence implementations surveyed in
[`specs/RESEARCH.md`](../../specs/RESEARCH.md) decodes eagerly — which is why the two-tier design in
[`modules/frame-sequence.md`](modules/frame-sequence.md) is an original contribution rather than a
borrowed pattern:

- **tier 1 — encoded `Blob`s**, all frames, ~40–80 KB each. 240 frames ≈ **10–19 MB**. Fine.
- **tier 2 — decoded `ImageBitmap`s**, a sliding window around the playhead, closed on eviction.

### 6.4 Texture VRAM — why compressed textures are the only real lever

**Input:** a GPU stores textures uncompressed unless the format is a *GPU* compressed format. PNG and JPEG
are not; they are decoded at upload.

**Arithmetic** for one 2048² RGBA texture: `2048 × 2048 × 4 = 16.8 MB`, plus ~33 % for a full mip chain.

| form | wire size | **VRAM** |
|---|---|---|
| PNG | ~4 MB | **~16 MB** |
| JPEG q80 | ~400 KB | **~16 MB** |
| KTX2 / BasisU | ~1 MB | **~4 MB** |

**Consequence:** twelve 2048² textures is ~200 MB of VRAM *before a triangle is drawn*. That is the actual
reason a scene dies on a mid-range Android, and it is why the pipeline in
[`PATTERNS.md`](PATTERNS.md) §5 ends at KTX2 and not at WebP. **JPEG optimises the download and changes
GPU cost by zero.**

### 6.5 DPR is quadratic

**Arithmetic:** pixels = `width × height × dpr²`. Dropping DPR from 2 to 1.5 is `1 - (1.5/2)² = 44 %`
fewer fragments. From 2 to 1 is **75 %**.

**Consequence:** DPR is the largest single quality lever and the first one the budget should pull.
`density` (instance counts) is second, `postprocessing` third, `shadowMap` fourth. Demote only — a tier
that can oscillate produces a visible pulsing that is worse than either state.

### 6.6 `visibleSizeAt`

`height = 2 × tan(fov × π / 360) × distance`, `width = height × aspect`. Half the FOV in radians is
`fov × π / 360`; `tan` of it times distance gives half the height.

**Consequence:** fitting a plane to the viewport is one line, not a fiddle. `screenToWorld` needs a
**distance** for the same reason — a screen position is a ray, not a point, so there is no single world
`z` for it.

### 6.7 WebP q82 at 1280 px is ~4× smaller than a typical JPEG sequence — [F]

**Not measured here.** WebP's advantage over JPEG at matched quality is real and well documented, but "4×"
depends entirely on what quality the JPEGs were exported at — and hand-exported sequences are usually
q90+, which inflates the ratio. Measure your own:

```bash
ffmpeg -i draw.mov -vf "scale=1280:-2,fps=30" -c:v libwebp -quality 82 -compression_level 6 out/frame-%04d.webp
```

Then compare directory sizes. Treat 4× as an expectation, not a promise.

---

## 7. GSAP and Lenis

**The bridge needs all three lines — [D]:**

```ts
lenis.on('scroll', ScrollTrigger.update)      // 1. ScrollTrigger reads Lenis, not window.scrollY
gsap.ticker.add((t) => lenis.raf(t * 1000))   // 2. one clock, not two
gsap.ticker.lagSmoothing(0)                   // 3. no catch-up jumps
```

- Without **1**, `ScrollTrigger` polls the native scroll position, which Lenis is no longer driving — every
  trigger fires at the wrong place.
- Without **2**, GSAP's ticker and Lenis's own RAF are two independent clocks; they beat against each other
  and produce a fine judder that is very hard to attribute.
- Without **3**, GSAP's lag smoothing "helpfully" jumps time forward after a stall, which desynchronises a
  scrubbed timeline from the scroll position.

**GSAP 3.13+ made all former Club plugins free — [C]** (`gsap@3.15.0` installed from the public
registry, including SplitText and the former Club-only plugins). Any guide that tells you to pay for
`SplitText` predates this. `modules/text-split.ts` still does its own splitting, deliberately: it is ~200
lines, has no license question at all, and gives us the mask/line-box control the site's transitions need.

---

## 8. Licensing

Verified licences of the repositories cloned into `repos/` — [S], `research/index/LICENSE_INDEX.md`:

| repository | licence |
|---|---|
| `awwwards-3d` | MIT |
| `orbit` | MIT |
| `threejs-scroll-scene` | MIT |
| `Webgl-Data-Globe` | MIT |
| `lattice-drift` | MIT |
| `motion-primitives-website` | MIT |

Toolkit dependencies: three.js **MIT**, GSAP **standard "no charge" license** (3.13+), Lenis **MIT**,
mp4box.js **BSD-3-Clause**, `three-mesh-bvh` **MIT** (referenced, not a dependency).

### 8.1 The one hard exclusion — [S]

**`https://github.com/davidhckh/portfolio-2025` is NOT open source.**

Its `license.md` restricts use to **"personal and educational purposes only"**, requires attribution to
**David Heckhoff** and **https://david-hckh.com**, and states that **"Commercial use, resale, or
redistribution of this project or substantial portions of it is prohibited without prior written
permission from the author."**

Recorded verbatim at [`specs/RESEARCH.md`](../../specs/RESEARCH.md):161–165 and [`../BIBLE.md`](../BIBLE.md):295–297.
It is **not** in `research/index/LICENSE_INDEX.md` because it was never cloned — deliberately.

**What this means in practice, and it matters because this toolkit is used for paid client work:**

| | |
|---|---|
| ✅ allowed | studying the architecture; reimplementing a *pattern* from scratch in your own code |
| ❌ **not allowed** | copying its code, in whole or in part, into any project — client or otherwise |

Four patterns were **reimplemented from scratch** after studying that repository, and are original code
here: in/out scene weights, weighted-average waypoint cameras, a parallax group separating pointer from
scroll, and scene precompilation. **An architectural idea is not copyrightable; an implementation is.** If
you find yourself with that repository open in one window and this toolkit in the other, close it and work
from the guide instead.

---

## 9. Corrections to third-party guidance

Claims encountered in an external (Gemini-authored) report on this project that are wrong or outdated, and
should not propagate into the skill or the templates:

| claim | status | correct position |
|---|---|---|
| "WebGL is legacy; always target WebGPU" | **wrong for this audience** | WebGL2 is the primary target. WebGPU support is still uneven on the low-end Android hardware much of the delivery audience uses. Optional enhancement, never the baseline |
| "Never write GLSL, use TSL only" | **wrong today** | the verified postprocessing ecosystem (`EffectComposer`, `UnrealBloomPass`, `OutputPass`) is WebGL/GLSL. TSL is promising and not where this toolkit lives |
| Skills belong at a `\\wsl$\...` path | **wrong** | Claude Code runs natively on Windows here. Skills go in `C:\Users\HP\.claude\skills\` |
| The report's `SKILL.md` frontmatter | **malformed** | must be real YAML with `name` and `description` |
| "Claude 3.5 Sonnet" | **outdated** | the Claude 5 family (Opus 5 / Sonnet 5 / Fable 5) and Haiku 4.5 |
| "GSAP Club plugins must be purchased" | **outdated** | free since 3.13. See §7 |
| "Use React Three Fiber" | **defensible, but not the conclusion here** | R3F is a real productivity win for component-shaped 3D. For multi-scene cinematic work with one shared loop, one renderer, and hand-managed scene lifetimes, vanilla TS won on control and on bundle size |

---

## 10. What is *not* verified

Stated plainly, so nobody mistakes silence for confidence:

- **No performance number in §6 was measured on target hardware.** They are arithmetic from stated inputs.
  The inputs marked [F] — draw-call cost, `ALIASED_POINT_SIZE_RANGE` minimums, WebP ratios, Safari's
  context limit — are field knowledge.
- **No real device testing has happened.** The quality tiers are a reasoned design, not an empirical one.
  A mid-range Android over a throttled connection is step 9 of
  [`PATTERNS.md`](PATTERNS.md) §6 and has not been done.
- **`npm run build` has not been run on a scaffolded project.** The kernel typechecks clean; that is a
  weaker claim than "it builds and runs."
- **The WebCodecs scrub path is written and typechecked, not exercised** against a real encoded MP4.
- **13 of the 19 candidate repositories failed to download** (network block) and were never inspected —
  noted in `research/index/LICENSE_INDEX.md`. Any claim about them in `specs/RESEARCH.md` is from README and metadata
  only, which the brief for this project explicitly warns against trusting.

---

Related: [`../BIBLE.md`](../BIBLE.md) (the laws these facts justify),
[`PATTERNS.md`](PATTERNS.md) (composition and the asset pipeline),
[`specs/RESEARCH.md`](../../specs/RESEARCH.md) (per-repository findings and licences).
