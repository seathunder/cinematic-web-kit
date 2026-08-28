# Recipes

Working code. Every signature here was transcribed from source. Copy, adapt, delete what you do not
need.

---

## 0. `main.ts` — the whole wiring, in order

```ts
import { boot, budget } from './kernel'
import { manifest } from './scenes/manifest'
import { assets } from './assets'
import { createPreloader, preloaderHooks } from './modules/preloader'
import { createPost, bindVelocityToGrade } from './modules/post'
import { createCursor, initMagnetic } from './modules/cursor'
import { createAudio } from './modules/audio'
import { createTransitionLayer } from './modules/transition'
import { initDomBridge, initReveal, createAnchors } from './modules/dom-bridge'
import { initSplits } from './modules/text-split'

const audio = createAudio({ volume: 0.7, fftSize: 1024, reactive: true })

const pre = createPreloader({
  gate: true,                      // MANDATORY when there is audio
  enter: '[data-preloader-enter]',
  minMs: 1200,
})

// Fetch one-shots during the preloader; they decode at unlock.
await Promise.all([
  audio.loadSfx('thock', '/audio/thock.mp3'),
  audio.loadSfx('tick', '/audio/tick.mp3'),
])

// Synchronous inside the gesture handler. This is the whole trick.
document.querySelector('[data-preloader-enter]')!
  .addEventListener('click', () => { void audio.unlock() })

const app = await boot({
  manifest,
  assets,
  renderer: { tone: 'aces', exposure: 1.1, clearColor: 0x05060a, shadows: true },
  camera:   { parallaxStrength: 0.35, parallaxTilt: 0.04, ease: 0.07, velocityRoll: 0.02 },
  scroll:   { duration: 1.1 },
  decoders: { dracoPath: '/decoders/draco/', basisPath: '/decoders/basis/' },
  ...preloaderHooks(pre),
})

// 1. Post — returns null when the tier forbids it, so the `if` is the contract
const post = createPost(app.stage, {
  bloom:  { strength: 0.45, radius: 0.5, threshold: 0.85, half: true },
  dof:    { focus: 4.2, aperture: 0.0012, maxblur: 0.006 },
  grade:  { uGrain: 0.045, uVignette: 0.32, uSaturation: 0.92, uContrast: 1.06 },
  samples: budget().antialias ? 4 : 0,        // real MSAA — FXAA is not the fix
})
if (post) {
  app.scenes.setMainRender(post.render)
  post.setTint(0x1a2740, 0xffd9a0)
  bindVelocityToGrade(post, { aberration: 6, vignette: 0.08, grain: 0.02 })
}

// 2. DOM bridge, splits, reveals
initDomBridge({ sceneWeights: true, precision: 3 })
initSplits('[data-split]', { modes: ['lines'], mask: true, responsive: true, aria: true })
initReveal(app.scenes.instances, { selector: '[data-reveal]', stagger: 0.06 })

// 3. Cursor
const cursor = createCursor({ dotEase: 0.35, ringEase: 0.1, stretch: 0.08 })
const offMagnetic = initMagnetic('[data-magnetic]', { strength: 0.22, radius: 140, ease: 0.14 })

// 4. Transitions
const layer = createTransitionLayer(app.stage)

// 5. Ambience
const ambience = audio.music('/audio/dusk-drone.mp3', { loop: true, volume: 0.55 })
void ambience.play(3)
audio.bindScrollFilter({ minHz: 600, maxHz: 20000 })

// 6. Mute toggle, styled entirely from the attribute the module writes
const btn = document.querySelector<HTMLButtonElement>('.sound-toggle')!
btn.addEventListener('click', () => {
  const muted = audio.mute()
  btn.setAttribute('aria-pressed', String(!muted))
})

document.documentElement.dataset.ready = 'true'

// Expose for the console in development
Object.assign(globalThis, { app, post, audio, layer, cursor })
```

**Order matters:** post before `setMainRender`; DOM bridge before reveals (they read published
values); audio before the ambience.

---

## 1. `dom` scene — the one you will write most

No renderer, no cost, full lifecycle. Half your scenes should look like this.

```ts
import type { SceneDefinition } from '../../kernel/types'
import { splitText, textTimeline, type SplitText, type Timeline } from '../../modules/text-split'

let split: SplitText | null = null
let tl: Timeline | null = null

export default {
  id: '02-context',
  renderer: 'dom',
  section: '#chapter-context',
  ramp: { enter: 0.6, exit: 0.6 },

  build(ctx) {
    split = splitText(ctx.el!.querySelector('h2')!, {
      modes: ['lines'], mask: true, responsive: true, aria: true,
    })
    tl = textTimeline(split, { level: 'lines', duration: 0.9, stagger: 0.06, y: 100 })
    // returned PAUSED on purpose — you drive it
  },

  enter(dir) {
    if (dir > 0) tl?.play()
    else tl?.progress(1)          // arriving from below: already revealed, no re-animation
  },

  update(w, ctx) {
    ctx.el!.style.setProperty('--w', w.toFixed(3))     // let CSS do the rest
  },

  dispose() {
    tl?.kill(); tl = null
    split?.revert(); split = null
  },
} satisfies SceneDefinition
```

```css
#chapter-context { opacity: calc(0.3 + var(--w, 0) * 0.7); }
```

**`enter(dir)` matters.** Scrolling back up into a section that already played should not replay it —
`progress(1)` puts it at its end state instantly.

---

## 2. `three` scene — an artifact you can inspect

The one interactive beat. Telephoto, still, pickable, with a proxy.

```ts
import * as THREE from 'three'
import type { SceneDefinition } from '../../kernel/types'
import { damped, damp, smooth, lerp } from '../../kernel/state'
import { disposeObject, budget } from '../../kernel'
import { createPicker, type Picker } from '../../modules/raycast'

let katana: THREE.Object3D | null = null
let picker: Picker | null = null
let unregister: (() => void) | null = null
let lantern: THREE.PointLight | null = null
const glow = damped(0, 0.12)
const _v = new THREE.Vector3()

export default {
  id: '03-artifact',
  renderer: 'three',
  section: '#chapter-artifact',
  assets: ['katana', 'env-dusk'],
  waypoint: {
    landscape: { position: [0.6, 1.35, 2.9], focus: [0, 1.15, 0], fov: 30 },
    portrait:  { position: [0,   1.35, 4.6], focus: [0, 1.15, 0], fov: 42 },
  },
  ramp: { enter: 0.8, exit: 0.8 },

  build(ctx) {
    katana = ctx.assets.get<THREE.Object3D>('katana')     // throws if undeclared — good
    ctx.parallax.add(katana)                              // parallax, so it reacts to the pointer

    // One key light, low angle, and darkness everywhere else.
    const key = new THREE.DirectionalLight(0xffe0b0, 3.2)
    key.position.set(-2, 3, 1.5)
    key.castShadow = budget().shadows
    if (key.castShadow) {
      key.shadow.mapSize.setScalar(budget().shadowMap)
      key.shadow.bias = -0.0005
      key.shadow.camera.near = 1
      key.shadow.camera.far = 12               // tighten the frustum or shadows go soft and blurry
    }
    ctx.world.add(key, new THREE.AmbientLight(0x223044, 0.1))

    // A practical light: the viewer reconciles source and effect and stops seeing CG.
    lantern = new THREE.PointLight(0xffb066, 2.2, 6, 2)
    lantern.position.set(1.4, 1.8, -0.6)
    ctx.world.add(lantern)

    // 12 triangles instead of 120,000.
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.9, 0.12))
    picker = createPicker(ctx.camera, { hz: 30 })
    unregister = picker.add(katana, {
      proxy,
      cursor: 'view',
      priority: 1,
      onEnter: () => { glow.target = 1 },
      onLeave: () => { glow.target = 0 },
    })

    ctx.debug.slider('lantern', lantern, 'intensity', { min: 0, max: 6 })   // no-op in production
  },

  update(w, ctx) {
    const t = ctx.state.time.elapsed

    // Two summed sines at incommensurate rates: a flame, not a pulse.
    if (lantern) {
      lantern.intensity = (2.2 + Math.sin(t * 7.3) * 0.12 + Math.sin(t * 11.9) * 0.06) * w
    }

    // A 2% push across the section, and a quarter turn. Scrub with LOCAL.
    if (katana) {
      katana.rotation.y = lerp(-0.35, 0.35, smooth(ctx.frame.local))
      katana.position.copy(_v.set(0, 1.1 + w * 0.04, 0))     // scratch vector, no allocation
    }

    // Damp the hover response. Setting emissive directly on enter/leave pops.
    damp(glow, ctx.state.time.delta)
  },

  dispose() {
    unregister?.(); unregister = null
    picker?.dispose(); picker = null
    if (katana) disposeObject(katana)
    katana = null; lantern = null
  },
} satisfies SceneDefinition
```

---

## 3. `video` scene — scrubbed footage

```ts
import * as THREE from 'three'
import type { SceneDefinition } from '../../kernel/types'
import { createVideoScrub, type VideoScrub } from '../../modules/video-scrub'
import { visibleSizeAt } from '../../modules/raycast'
import { onReflow } from '../../kernel'

let scrub: VideoScrub | null = null
let plane: THREE.Mesh | null = null
let offReflow: (() => void) | null = null

export default {
  id: '05-approach',
  renderer: 'video',
  section: '#chapter-approach',
  waypoint: { landscape: { position: [0, 0, 5], focus: [0, 0, 0], fov: 45 } },
  ramp: { enter: 0.5, exit: 0.5 },

  async build(ctx) {
    scrub = createVideoScrub('/video/approach.mp4', { lookahead: 4, cacheSize: 24 })
    await scrub.ready

    plane = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: scrub.texture, transparent: true }),
    )
    ctx.world.add(plane)

    const fit = () => {
      const d = ctx.camera.position.z - plane!.position.z
      const { width, height } = visibleSizeAt(d, ctx.camera)
      // cover, not contain: fill the viewport, crop the overflow
      const s = Math.max(width / (scrub!.width / scrub!.height), height)
      plane!.scale.set(s * (scrub!.width / scrub!.height), s, 1)
    }
    fit()
    offReflow = onReflow(fit)
  },

  update(w, ctx) {
    scrub?.seek(ctx.frame.local)          // LOCAL. `weight` would play it forward then rewind
    if (plane) (plane.material as THREE.MeshBasicMaterial).opacity = w
  },

  dispose() {
    offReflow?.(); offReflow = null
    scrub?.dispose(); scrub = null
    plane?.geometry.dispose()
    ;(plane?.material as THREE.Material | undefined)?.dispose()
    plane = null
  },
} satisfies SceneDefinition
```

**Encode it correctly or none of this works:**

```bash
ffmpeg -i in.mov -c:v libx264 -crf 22 -g 10 -bf 0 -pix_fmt yuv420p -movflags +faststart -an out.mp4
```

---

## 4. `canvas2d` scene

```ts
import type { SceneDefinition } from '../../kernel/types'
import { range, lerp } from '../../kernel/state'

let ctx2d: CanvasRenderingContext2D | null = null

export default {
  id: '07-diagram',
  renderer: 'canvas2d',
  section: '#chapter-diagram',

  build(ctx) {
    ctx2d = (ctx.el as HTMLCanvasElement).getContext('2d')    // kernel sizes it, DPR-correct
  },

  // canvas2d and video scenes must draw themselves — the kernel does not
  render(w, ctx) {
    if (!ctx2d) return
    const { width: cw, height: ch } = ctx2d.canvas
    ctx2d.clearRect(0, 0, cw, ch)
    ctx2d.globalAlpha = w
    ctx2d.strokeStyle = '#d8c9a3'
    ctx2d.lineWidth = 1.5

    const p = range(ctx.frame.local, 0.1, 0.9)
    ctx2d.beginPath()
    ctx2d.moveTo(cw * 0.1, ch * 0.5)
    ctx2d.lineTo(lerp(cw * 0.1, cw * 0.9, p), ch * 0.5)
    ctx2d.stroke()
  },

  dispose() { ctx2d = null },
} satisfies SceneDefinition
```

---

## 5. `none` scene — text over dark, the cheapest strong beat

```ts
import type { SceneDefinition } from '../../kernel/types'

export default {
  id: '04-transmission',
  renderer: 'none',
  section: '#chapter-transmission',
  ramp: { enter: 0.4, exit: 0.4 },

  build() {},

  enter(dir) { if (dir > 0) audio.play('tick', { volume: 0.25 }) },

  update(w) {
    // Fade the GL layer out entirely. The most striking scene renders nothing.
    post?.set('uFade', w * 0.92)
  },

  exit() { post?.set('uFade', 0) },
  dispose() { post?.set('uFade', 0) },
} satisfies SceneDefinition
```

**Zero render cost, and often the moment people quote back to you.** It also gives the GPU a rest
before the peak.

---

## 6. Persist — one world, four shots

The cheapest structure in the toolkit and what most expensive-feeling sites actually do. One scene
spanning four sections, four waypoints, one build.

```ts
import * as THREE from 'three'
import type { SceneDefinition, Waypoint } from '../../kernel/types'
import { range, clamp } from '../../kernel/state'

const SHOTS: Waypoint[] = [
  { position: [0, 1.6, 9.0], focus: [0,  1.2,  0], fov: 46 },   // wide
  { position: [2.2, 1.4, 5.2], focus: [0.4, 1.1, 0], fov: 34 }, // approach
  { position: [0.5, 1.3, 2.6], focus: [0,  1.15, 0], fov: 30 }, // close
  { position: [-1.8, 2.4, 4.0], focus: [0, 0.9,  0], fov: 32 }, // above, leaving
]
const _a = new THREE.Vector3()
const _b = new THREE.Vector3()

export default {
  id: '05-world',
  renderer: 'three',
  section: '#chapter-world',        // ONE tall section, 4vh
  assets: ['village', 'env-dusk'],
  waypoint: { landscape: SHOTS[0]! },   // the fallback; update() overrides

  build(ctx) { ctx.parallax.add(ctx.assets.get<THREE.Object3D>('village')) },

  update(_w, ctx) {
    // Interpolate between shots along `local`, then hand the result to the rig.
    const n = SHOTS.length - 1
    const t = clamp(ctx.frame.local) * n
    const i = Math.min(Math.floor(t), n - 1)
    const f = t - i
    const a = SHOTS[i]!, b = SHOTS[i + 1]!

    camera.targetPosition.lerpVectors(_a.fromArray(a.position), _b.fromArray(b.position), f)
    camera.targetFocus.lerpVectors(_a.fromArray(a.focus), _b.fromArray(b.focus), f)
    camera.fov.target = (a.fov ?? 40) + ((b.fov ?? 40) - (a.fov ?? 40)) * f
  },

  dispose() {},
} satisfies SceneDefinition
```

**This is the one sanctioned exception to law 6** — writing the rig's `targetPosition` rather than
`camera.position` directly. The rig still damps it, so it stays smooth, and it still averages with any
other active scene's waypoint.

---

## 7. A world transition — five changes behind one cover

```ts
import { createTransitionLayer } from '../modules/transition'

const layer = createTransitionLayer(app.stage)

async function toAsh() {
  await layer.run(async () => {
    // NOTHING here is visible. Change everything at once.
    picker.setEnabled(false)
    await swapWorldAssets('village-ash')
    app.camera.snapToTargets()                  // teleport with no visible ease
    post?.setTint(0x2a1810, 0xffe8c0)
    post?.set('uGrain', 0.06)
    audio.setLowpass(2200, 0.01)
    void ashAmbience.play(0.5)
    void duskAmbience.pause(0.4)
    document.documentElement.dataset.world = 'ash'
    picker.setEnabled(true)
  }, 'ink', { duration: 1.3, softness: 0.35, lockScroll: true })
}
```

**Five changes behind one cover reads as one event.** That is the only place you may change all the
rules at once, and it is what makes it feel like a cut in a film rather than a page change.

`snapToTargets()` is the important one — without it the camera spends the next second easing from the
old position, *visibly*, after the cover lifts.

Or bind it to a scroll position:

```ts
import { createScrollCut } from '../modules/transition'
createScrollCut(layer, { kind: 'ink', from: 0.45, to: 0.55, onCovered: () => void toAsh() })
```

---

## 8. GPU-animated field — 40,000 blades, one uniform write

```ts
import * as THREE from 'three'
import { createInstancedField, gpuAnimate, instanceTime, layouts } from '../../modules/instancing'
import { budget } from '../../kernel'

// Module scope, so there is a handle to write to later.
// three stores the REFERENCE, not a copy — this is the whole trick.
const uWind = { value: 0.2 }

let field: ReturnType<typeof createInstancedField> | null = null

build(ctx) {
  const count = Math.floor(40_000 * budget().density)     // 10,000 on the low tier

  const aSeed = new THREE.InstancedBufferAttribute(new Float32Array(count), 1)
  const aSway = new THREE.InstancedBufferAttribute(new Float32Array(count), 1)
  for (let i = 0; i < count; i++) {
    aSeed.setX(i, Math.random())
    aSway.setX(i, 0.04 + Math.random() * 0.06)
  }

  const material = new THREE.MeshStandardMaterial({ color: 0x4a5238, roughness: 0.9 })

  gpuAnimate(material, {
    glsl: `
      float phase = aSeed * 6.283185;
      float amp = aSway * uWind;
      transformed.x += sin(uTime * 1.4 + phase) * amp;
      transformed.z += cos(uTime * 0.9 + phase) * amp * 0.35;
    `,
    attributes: { aSeed, aSway },
    uniforms: { uTime: instanceTime, uWind },
    space: 'local',
    cacheKey: 'grass-sway',        // REQUIRED. Omit it and a second field animates like the first
  })

  field = createInstancedField({
    geometry: bladeGeometry, material, count,
    layout: layouts.scatterPlane(28, 28),
  })
  ctx.parallax.add(field.mesh)
}

update(_w, ctx) {
  // One float per frame drives 40,000 blades. The CPU alternative is 640,000 multiplies.
  uWind.value = 0.15 + Math.min(0.6, Math.abs(ctx.state.velocity.current) * 0.5)
}

dispose() { field?.dispose(); field = null }
```

**Note the shadow caveat:** `onBeforeCompile` injections are invisible to the depth material, so this
mesh casts a **static** shadow. For grass, turn the caster off.

---

## 9. Frame sequence with alpha

```ts
import { createFrameSequence, type FrameSequence } from '../../modules/frame-sequence'

let seq: FrameSequence | null = null

async build(ctx) {
  seq = createFrameSequence({
    src: (i) => `/frames/draw/f_${String(i + 1).padStart(4, '0')}.webp`,
    count: 96,
    window: 16,                  // decoded ImageBitmaps held either side of the playhead
    concurrency: 6,
    onProgress: (p) => ctx.debug.log('frames', p),
  })
  await seq.ready

  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.MeshBasicMaterial({ map: seq.texture, transparent: true }),
  )
  ctx.world.add(plane)
}

update(_w, ctx) { seq?.seek(ctx.frame.local) }
dispose() { seq?.dispose(); seq = null }
```

```bash
ffmpeg -i draw.mov -vf "fps=24,scale=1600:-2" -c:v libwebp -quality 82 frames/draw/f_%04d.webp
```

Use this over `video-scrub` for **alpha** and for **line art** — no codec mush on hand-drawn edges.

---

## 10. DOM labels on 3D objects

Law 10: words are DOM.

```ts
import { createAnchors } from '../../modules/dom-bridge'

let anchors: ReturnType<typeof createAnchors> | null = null
let off: (() => void) | null = null

build(ctx) {
  anchors = createAnchors(ctx.camera)
  off = anchors.add(
    ctx.el!.querySelector<HTMLElement>('.label-blade')!,
    katana!,
    { offset: new THREE.Vector3(0, 0.45, 0), cull: true, scaleWithDepth: true },
  )
}

dispose() { off?.(); anchors?.dispose(); anchors = null; off = null }
```

`cull: true` hides the element when the point is behind the camera — without it, labels for things
behind you pile up in a corner.

---

## 11. Pointer-following effect — no picker, no geometry

```ts
import { createPlaneProbe } from '../../modules/raycast'

const probe = createPlaneProbe(ctx.camera)         // y-up plane through the origin
const uPointer = { value: new THREE.Vector3() }

update() {
  const p = probe.read()                           // reads the RAW pointer, deliberately
  if (p) uPointer.value.copy(p)                    // null when the ray misses the plane
}
```

**One ray/plane intersection** — about a dozen floating-point operations. The alternative (a giant
invisible plane mesh plus a raycast) is hundreds of times more expensive for identical output.

**It reads `pointerX.target`, not `.current`, on purpose** — the damped value trails ~100 ms and puts
the effect behind the cursor, which reads as sitewide lag.

---

## 12. A custom loop stage

```ts
import { addStage, removeStage } from '../../kernel'

build() {
  addStage({
    order: 300,                        // project band: 100–899
    name: 'fog-drift',
    after: ['state', 'weights'],       // throws AT REGISTRATION if either is missing
    fn: (delta, elapsed) => {
      uFog.value = 0.02 + Math.sin(elapsed * 0.23) * 0.008
    },
  })
}

dispose() { removeStage('fog-drift') }
```

---

## 13. Scene-local audio, crossfading for free

```ts
import type { MusicHandle } from '../../modules/audio'

let ambience: MusicHandle | null = null

build() {
  ambience = audio.music('/audio/duel-bed.mp3', { loop: true, volume: 0 })
  void ambience.play(0.01)                      // start silent; weight drives it
}

update(w) {
  ambience?.setVolume(w * 0.6, 0.2)             // a bell — crossfades with neighbours, no coordination
  katanaLight.intensity = 0.8 + audio.bass * 3 * w
}

enter(dir) {
  if (dir > 0) {
    audio.play('thock', { volume: 0.85, rate: 0.95 + Math.random() * 0.1 })
    audio.duck(0.4, 1.8)
  }
}

dispose() { ambience?.dispose(); ambience = null }
```

**Because `weight` is a bell, crossfading two ambiences between chapters is free** and needs no
coordination between the scenes. Law 5 pays off in audio too.

---

## 14. The manifest

```ts
import type { SceneDefinition } from '../kernel/types'
import arrival      from './01-arrival'
import context      from './02-context'
import artifact     from './03-artifact'
import transmission from './04-transmission'
import world        from './05-world'
import theCut       from './06-the-cut'
import aftermath    from './07-aftermath'
import work         from './08-work'
import departure    from './09-departure'

// Import order IS the scroll order. Do not sort this alphabetically.
export const manifest = [
  arrival, context, artifact, transmission, world, theCut, aftermath, work, departure,
] satisfies SceneDefinition[]
```

---

## 15. `assets.ts`

```ts
import type { AssetSpec } from './kernel/types'

export const assets = [
  { key: 'env-dusk', url: '/textures/dusk.hdr',      kind: 'hdr',     weight: 2 },
  { key: 'katana',   url: '/models/katana.glb',      kind: 'gltf',    weight: 3 },
  { key: 'village',  url: '/models/village.glb',     kind: 'gltf',    weight: 8, minQuality: 'medium' },
  { key: 'paper',    url: '/textures/paper.ktx2',    kind: 'ktx2',    weight: 1 },
] satisfies AssetSpec[]
```

**`weight` is roughly the size in MB.** Without it a 12 MB glTF and a 3 KB JSON each count as one
unit, and the progress bar sits at 90 % for eight seconds.

**`minQuality: 'medium'`** skips the asset on the low tier — so the scene that needs it must handle
`get()` throwing, or declare a lower-fidelity alternative.

---

Related: `kernel-api.md` · `modules-api.md` · `troubleshooting.md` · `syntax.md` ·
`toolkit/docs/` (nine sections per unit, with more recipes).
