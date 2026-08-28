# Troubleshooting

Symptom → cause → fix. Ordered by how often each one actually happens.

Every entry here is a bug that was really hit, in this codebase or in the surveyed repositories. The
diagnostic is the point: most of these look like something else.

---

## Motion and timing

### "The animation plays forward then rewinds"

**Cause:** you scrubbed with `weight` instead of `local`. `weight` is a bell — it rises, plateaus,
falls. `local` is a monotonic ramp.

```ts
update(w, ctx) {
  tl.progress(ctx.frame.local)     // RIGHT — scrub
  // tl.progress(w)                // WRONG — plays forward, then rewinds as the section leaves
  mesh.material.opacity = w        // RIGHT — blend
}
```

**This is the single most common bug in the whole system.** It presents as "the animation is buggy",
not as "I read the wrong number".

### "It feels different on my other monitor"

**Cause:** a naive lerp. `cur += (target - cur) * 0.1` applies the ease per *frame*, so it runs at the
refresh rate. Time to close 90 % is 21.85 frames → **0.364 s at 60 Hz, 0.152 s at 144 Hz. 2.4×
faster.**

**Fix:** `damp(s, delta)` — or, if you must hand-roll it,
`f = 1 - Math.pow(1 - ease, delta * 60)`.

### "Everything teleports when I come back to the tab"

**Cause:** an unclamped delta. Away for 30 seconds → `delta = 30` → every damped value jumps.

**Fix:** already handled — `MAX_DELTA = 1/20` in `loop.ts`. If you see this, you have a second RAF
loop somewhere that does not clamp. `listStages()` and search for `requestAnimationFrame`.

### "Motion is one frame behind"

**Cause:** stage order. Something reads a value before the stage that writes it.

**Fix:** `listStages()`, then add the missing `after`. Project stages belong in **100–899**; the
0–99 band is kernel and the 900+ band is DOM, so a stage in the right band cannot wedge between
`weights` and `camera`.

### "It judders even though the frame rate is 60"

**Cause:** two clocks. A second `requestAnimationFrame`, or GSAP's ticker running independently of
Lenis.

**Fix:** one loop, via `addStage`. And all three bridge lines:

```ts
lenis.on('scroll', ScrollTrigger.update)
gsap.ticker.add((t) => lenis.raf(t * 1000))
gsap.ticker.lagSmoothing(0)
```

Missing the third is the classic — everything works until the tab is briefly busy, then desyncs
permanently.

---

## Scenes

### "The scene never builds"

Check in order:

1. Does `section` match a real element? A typo'd selector fails silently.
2. Is `quality` set above the current tier? `?quality=high` to test.
3. Is a declared asset key missing from `assets.ts`? `build()` waits forever for it.
4. Is the section actually in the scroll flow, with a height?
5. `?debug` — is the weight moving at all?

### "The scene never deactivates / the site gets slower as I scroll"

**Cause:** an activity test against `0` instead of `ACTIVE_THRESHOLD`. A finished float ramp yields
about `3e-17`, so `weight > 0` is true forever and every scene you have ever seen is still updating.

**Fix:** `ACTIVE_THRESHOLD = 0.001`. If you wrote a custom activity check, use the constant.

### "Scroll trigger points are wrong / everything is offset"

**Cause:** a stale reflow. Scene rects are cached; something changed the document height after
measurement — a webfont, an accordion, images without dimensions.

**Fix:** `requestReflow()` after anything that changes height. For fonts:

```ts
document.fonts.ready.then(() => requestReflow())
```

### "The camera eases in from the wrong place after a cut"

**Cause:** you teleported the camera without snapping the rig. It spends the next second damping from
the old position — visibly, after the cover lifts.

**Fix:** `app.camera.snapToTargets()` **inside** `layer.run()`, while nothing is visible.

### "Two scenes fight over the camera"

**Cause:** a scene writing `camera.position` directly (law 6).

**Fix:** declare a `waypoint`. The rig averages: `Σ(wp × w) / Σ(w)`. If you genuinely need scripted
camera motion, write `rig.targetPosition` (recipe 6), never `camera.position`.

---

## Rendering

### "It's jagged, and `antialias: true` does nothing"

**Cause:** the composer bypasses canvas MSAA. `EffectComposer.js:69` creates its target with only
`{ type: HalfFloatType }`, and `RenderTarget.js:63` defaults `samples: 0`.

**Fix:** `samples` on the composer target — **not** FXAA:

```ts
createPost(stage, { samples: 4 })
```

### "Everything is washed out / too dark / the colours are wrong under post"

**Cause:** pass order. three applies tone mapping **only** when rendering to the canvas — it is gated
on `currentRenderTarget === null` (`three.module.js:7549–7559`, `18345–18355`). Render through a
composer and nothing tone-maps unless `OutputPass` does it.

**Fix:** the exact order, no exceptions:

```
HalfFloat target → RenderPass → UnrealBloomPass → BokehPass → OutputPass → GradePass
```

Bloom **before** `OutputPass` (it needs linear HDR). Grade **after** (you are grading display-referred
pixels, like a colourist). FXAA, if used, after `OutputPass`.

### "Bloom does nothing" / "everything glows"

**Nothing:** bloom is after `OutputPass`, so nothing exceeds the threshold any more. Move it before.

**Everything:** `threshold` too low. **Raise the threshold to 0.85–0.95, do not lower the strength.**
`strength` 0.4–0.6 with a high threshold reads as real lens behaviour; the opposite reads as amateur.

### "My second instanced field animates like the first"

**Cause:** missing `customProgramCacheKey`. three caches compiled programs by material config; two
materials with the same config and different `onBeforeCompile` injections get the **same program**.

**Fix:** a distinct `cacheKey` per injection:

```ts
gpuAnimate(mat, { glsl, cacheKey: 'grass-sway' })
gpuAnimate(mat2, { glsl: other, cacheKey: 'leaf-drift' })
```

### "The shadow doesn't match the animated mesh"

**Cause:** shadow maps render with a separate depth material. `onBeforeCompile` injections are
invisible to it, so a GPU-animated mesh casts a **static** shadow.

**Fix:** accept it (fine for grass), disable the caster, or inject the same GLSL into
`customDepthMaterial`.

### "Instances drift when the camera moves"

**Cause:** `space: 'view'` with `w = 1.0`. `viewMatrix` is affine; `w = 1.0` adds the camera
translation to your offset.

**Fix:** a direction gets `0.0`:

```glsl
vec3 viewOffset = (viewMatrix * vec4(cwOffset, 0.0)).xyz;
```

### "The first frame of a scene hitches"

**Cause:** lazy shader compilation. three compiles a program on first draw — 50–300 ms, at exactly
the emotional moment you designed.

**Fix:** `compileAll()` behind the preloader. Not optional.

### "Transparent particles punch holes in each other"

**Cause:** `depthWrite: true` on a transparent material. Each particle writes depth and occludes the
ones behind it.

**Fix:** `depthWrite: false`. And `depthTest: true` still, so they occlude against solid geometry.

### "Points are the wrong size on mobile"

**Cause:** `gl_PointSize` is driver-capped — `ALIASED_POINT_SIZE_RANGE`, commonly 1024 and reportedly
as low as **63** on some mobile GPUs.

**Fix:** if size matters, use instanced quads, not `Points`. Points also cannot rotate.

### "Banding / stepping on my phone only"

**Cause:** a missing `precision highp float;` — some mobile drivers default to `mediump`.

**Fix:** declare it. Also check for integer literals where floats belong (`1` vs `1.0`), which passes
on lenient desktop drivers and fails on strict mobile ones.

---

## Interaction

### "Hover detection is slow / the whole site lags when I move the mouse"

**Cause:** `raycaster.intersectObjects(scene.children, true)`. A 120k-triangle mesh = **120,000
ray/triangle tests**, on a `pointermove` firing up to 120×/s = **14.4 million intersections per
second** to answer one boolean.

**Fix, in order of effect:**

1. A **proxy** — a 12-triangle box. **120,000 → 12.** One line.
2. A registered list, never `scene.children`.
3. `hz: 30`.
4. Only cast on a dirty flag.
5. `three-mesh-bvh` (MIT) if you genuinely need per-triangle accuracy on heavy geometry.

### "The hitbox lags behind the model"

**Cause:** `Object3D.raycast` reads `matrixWorld`, which three refreshes only inside
`renderer.render()`. A picker running before the render stage tests **last frame's** transforms.

**Fix:** already handled — the picker calls `updateWorldMatrix(true, false)` itself (`true` walks up
so a parent's animation counts; `false` skips descending because `Object3D.raycast` refreshes
children). If you wrote a custom raycast, do the same.

### "I'm getting hits on hidden objects"

**Cause:** **`visible = false` does not stop raycasting.**

**Fix:** unregister, or `picker.setEnabled(false)`.

### "The pointer effect lags behind the cursor"

**Cause:** reading `pointerX.current` for hit testing. The damped value trails by up to ~100 ms.

**Fix:** `.target` for hit testing, `.current` for anything visual. `createPlaneProbe.read()` already
does this.

### "The first tap on mobile hits the wrong thing"

**Cause:** touch fires no `pointermove` before `pointerdown`, so the cached hit is from wherever the
pointer last was.

**Fix:** already handled — the picker casts immediately on `pointerdown`.

### "Clicks fire when the user meant to scroll"

**Fix:** already handled — `onClick` only fires if the pointer travelled **< 8 px** between down and
up. That is the threshold every native UI uses.

### "The custom cursor is on a touch device"

**Cause:** a width media query.

**Fix:** `@media (hover: hover) and (pointer: fine)`.

### "I can't see the text caret in a form"

**Cause:** `[data-cursor-active] * { cursor: none }` with no exception.

**Fix:** the mandatory exception:

```css
[data-cursor-active] input,
[data-cursor-active] textarea,
[data-cursor-active] [contenteditable] { cursor: auto; }
```

### "The cursor ring is stranded after unsnapping"

Already fixed in `cursor.ts`. If you reimplemented it: `snapTo(null)` must restore the ring's base
size, and the base is the **40 px** constant `snapTo` divides by. Restyle the ring in CSS and that
constant needs updating too.

---

## Audio — every failure is silent

### "There is no sound and no error"

Work down this list. One of them is it.

1. **The context is suspended.** `resume()` must be **synchronous inside** a gesture handler.
   `onclick = () => audio.unlock()` works; `onclick = async () => { await x; audio.unlock() }` does
   not — the activation flag is consumed asynchronously. **This is why the preloader has a gate.**
2. **`play()` before unlock is silently ignored** by design. Check `audio.unlocked`.
3. **Missing `crossOrigin = 'anonymous'`** on a media element routed through WebAudio — a
   cross-origin file taints the graph and outputs silence with no error anywhere.
4. **Muted, from a previous visit.** The state persists in `localStorage`.
5. **A dead `AudioContext`.** `dispose()` closes it permanently; you cannot re-unlock. One system
   per page.

### "There's a click when the volume changes"

**Cause:** assigning `gain.value` while sound plays. A step in gain is a waveform discontinuity.

**Fix:** `setTargetAtTime(v, ctx.currentTime, seconds / 3)`. The `/3` is because
`setTargetAtTime` reaches ~95 % after **three** time constants — that is what makes a "2 second fade"
take about 2 seconds.

### "The fade works but you hear the cut at the end"

**Cause:** `el.pause()` called at the same time as the fade started.

**Fix:** already handled — `pause(fade)` waits `fade * 1000 + 60` ms.

### "It works everywhere except iOS"

**Cause:** iOS needs an actual sound played through the context to keep it awake.

**Fix:** already handled — `unlock()` plays a 1-sample silent buffer. Removing it "because it does
nothing" breaks iOS.

### "Audio dies after a dozen interactions"

**Cause:** one `AudioContext` per sound. Safari has historically allowed only a handful per page and
does not reclaim them quickly. **Works in development, dies on the client's iPhone.**

**Fix:** one context for the life of the page.

### "`decodeAudioData` fails the second time"

**Cause:** it **detaches** the ArrayBuffer. Each buffer is single-use.

**Fix:** fetch once, decode once. Also: an `AudioBufferSourceNode` is single-use — create one per
`play()`, which is cheap and is what lets a sound overlap itself.

### "A lowpass sweep does nothing then everything at once"

**Cause:** a linear ramp on frequency. Frequency is perceived logarithmically, so a linear ramp spends
most of its time in the top octave where almost nothing is audible.

**Fix:** `exponentialRampToValueAtTime`, clamped to ≥ 40 Hz (an exponential ramp cannot pass through
zero).

---

## Video and frames

### "Scrubbing is a slideshow"

**Cause:** the encode. x264's default `keyint` is **250** — a seek decodes from the previous keyframe,
so up to 250 frames per seek.

**Fix:**

```bash
ffmpeg -i in.mov -c:v libx264 -crf 22 -g 10 -bf 0 -pix_fmt yuv420p -movflags +faststart -an out.mp4
```

`-g 10` is the whole difference. `-bf 0` removes decode reordering.

### "Scrubbing works in Chrome and not Safari"

**Cause:** different seek behaviour. `pickStrategy()` returns `seek` on WebKit for exactly this
reason.

**Fix:** do not force `strategy`. Let `pickStrategy()` choose.

### "Memory climbs until the tab dies"

**Cause:** an unclosed `VideoFrame` or `ImageBitmap`. Both hold memory the JS GC does not manage.

**Fix:** `.close()` on every one. **This leak is invisible in a JS heap snapshot** — look at the
process memory, not the heap.

### "240 frames uses 2 GB"

**Cause:** eager decoding. 1920 × 1080 × 4 = **8.29 MB per decoded frame**; × 240 = **1.99 GB**.
Every open-source frame-sequence implementation surveyed for this toolkit does this.

**Fix:** `createFrameSequence` — encoded Blobs plus a sliding `window` of decoded bitmaps.

### "The sequence stutters on the frame it loads"

**Cause:** `new Image()` + `onload` decodes on the main thread.

**Fix:** `createImageBitmap()` — decodes off it.

---

## Performance

### "It's slow and I don't know why"

In order. Stop when you find it.

1. **`?stats`** — CPU-bound or GPU-bound?
2. **`gpuInfo().calls`** — over 100? **~0.05–0.2 ms of CPU each; 500 meshes = 25–100 ms/frame with
   the GPU idle.** Instance or merge. This is a CPU cost, so a better GPU does not help.
3. **DPR** — quadratic. 2 → 1.5 is 44 % fewer fragments; 2 → 1 is 75 %.
4. **`listStages()`** — anything doing layout in a stage?
5. **Active scenes** — over `maxActiveScenes`? Ramps too long?
6. **Post passes** — each is a full-resolution read+write. At DPR 2 on 1440p that is 14.7 M fragments
   per pass.
7. **Shadow casters** — more than one?
8. **Allocation in `update`** — a sawtooth in the memory timeline.
9. **Texture VRAM** — count them. **2048² RGBA = 16.8 MB regardless of file format.** Six PBR maps =
   134 MB.

**Nine times out of ten it is draw calls or DPR.** Almost never the shader you have been staring at.

### "A 200 KB JPEG still uses 16 MB of VRAM"

Correct, and not a bug. **The GPU stores decoded pixels; the file format is irrelevant once
uploaded.** JPEG optimises download and changes GPU cost by zero. Only KTX2/Basis changes VRAM,
because the GPU keeps it compressed (2048² → ~4 MB instead of 16.8 MB).

### "GPU memory grows every time I scroll through"

**Cause:** an asymmetric `dispose`. Removing an object from the scene frees nothing — `remove()`
unparents; the VRAM stays.

**Fix:** `disposeObject(root)`, which walks the tree and frees geometries, materials, and every
texture-valued property. Verify with `leakWatch(renderer, 'scene-03')` and two full scroll passes.

### "It's fine for two minutes then halves"

**Cause:** thermal throttling. Real, common on laptops and phones, and invisible in a short test.

**Fix:** it is what the watchdog is for — it demotes on sustained low frame rate. **It never
promotes**, because an oscillating tier pulses visibly. Test by leaving the peak scene open for ten
minutes.

---

## Build and types

### "A backtick error in an unrelated file"

**Cause:** a backtick inside a GLSL comment terminates the enclosing TypeScript template literal. The
parse error surfaces far from the cause.

**Fix:** never a backtick in a shader comment. Fixed twice in this codebase already
(`transition.ts:155`, `:162`).

### "`Pane.addFolder` is not a function"

**Fix:** `npm i -D @tweakpane/core`. It is a required peer of tweakpane 4.

### "DOM types are missing"

**Cause:** TypeScript 7.0 shipped no `lib.dom.d.ts` on disk in the layout this project hit.

**Fix:** `npm i -D @types/web`. Do not delete the `lib` entry from tsconfig.

### "sharp / ffmpeg-static won't install"

**Cause:** npm 11 blocks install scripts by default; both need a postinstall to fetch a binary.

**Fix:**

```bash
npm rebuild sharp ffmpeg-static --foreground-scripts
```

### "`instanceof THREE.Mesh` is false for an obvious Mesh"

**Cause:** two copies of three in the bundle.

**Fix:** `npm ls three` — one version. Import `THREE` from the kernel's re-export, not directly, in
project code.

### "A circular import gives me `undefined` at module scope"

**Cause:** two modules importing each other. Vite resolves one side to `undefined` at eval time.

**Fix:** the kernel's rule — `state.ts` imports **nothing but types**. It is the leaf of the graph
because everything reads it. When a low-level module needs something from a higher one, pass it in as
an argument (`updateState(delta)`), do not import it.

---

## Mobile

### "The hero is cut off on my phone"

**Cause:** `100vh`. Mobile browser chrome makes it taller than the visible viewport.

**Fix:** `height: calc(var(--vh) * 100)` — `dom-bridge` publishes the real value.

### "The composition is wrong in portrait"

**Cause:** no portrait waypoint, so the landscape shot is being cropped into a tall window.

**Fix:** a real portrait waypoint — further back, wider lens, sometimes a different angle. A phone is
not a narrow desktop.

### "It doesn't run at all on mid-range Android"

Check: DPR (is it forcing 2?), texture VRAM (count × 16.8 MB), draw calls, whether `density` is being
respected, whether `minQuality` is gating the big assets, `maxActiveScenes`.

**Then test on the real device.** Desktop emulation tells you nothing about GPU capability or thermal
behaviour, and this is the platform where cinematic sites actually fail.

---

## Diagnostic flags

| flag | shows |
|---|---|
| `?debug` | Tweakpane, orbit controls, live weights, `cw.waypoint()` |
| `?stats` | frame time, CPU/GPU split |
| `?scene=03` | one scene in isolation |
| `?quality=low` | force a tier |
| `?nomotion` | simulate reduced motion |
| `?wireframe` | geometry only |
| `?axes` | world axes |
| `?waypoints` | camera waypoint markers |

| in the console | tells you |
|---|---|
| `listStages()` | resolved stage order — **first stop for any timing bug** |
| `gpuInfo(renderer)` | geometries, textures, programs, draw calls |
| `leakWatch(renderer, 'label')` | warns when counts grow across enter/exit |
| `assets.live()` | refcounts per asset |
| `cw.waypoint()` | a paste-ready waypoint literal |
| `dominant(instances)` | the current chapter |

---

Related: `fullstack.md` (budgets and the pipeline) · `modules-api.md` · `kernel-api.md` ·
`toolkit/docs/EVIDENCE.md` (line-numbered verification for every three.js claim here, plus §10 on what
is *not* verified).
