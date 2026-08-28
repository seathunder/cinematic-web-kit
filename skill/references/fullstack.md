# Fullstack

Build, asset pipeline, performance budgets, accessibility, SEO, testing, deployment. Everything
between "the scene works on my machine" and "it works for a stranger on mobile data".

**Everything here is free.** No paid service, no license fee, no server.

---

## 1. Toolchain

```
vite 8.2.2  ·  typescript 7.0.2  ·  vite-plugin-glsl
three 0.185.1  ·  gsap 3.15.0  ·  lenis 1.3.26  ·  mp4box 2.4.1
tweakpane 4.0.5 (+ @tweakpane/core)  ·  stats-gl
gltfpack  ·  @gltf-transform/cli  ·  sharp  ·  ffmpeg-static
```

**GSAP 3.13+ made every former Club plugin free** — SplitText, ScrollSmoother, MorphSVG, DrawSVG,
all of it, from the public registry. Verified by installing gsap@3.15.0 with no auth. Any advice to
"use the free alternative because SplitText is paid" is out of date.

**`@tweakpane/core` is a required peer**, not optional — `Pane.addFolder` fails without it.

**npm 11 blocks install scripts by default**, which breaks `sharp` and `ffmpeg-static` (both need a
postinstall to fetch a binary). If they are missing:

```bash
npm rebuild sharp ffmpeg-static --foreground-scripts
```

### `vite.config.ts`

```ts
import { defineConfig } from 'vite'
import glsl from 'vite-plugin-glsl'

export default defineConfig({
  plugins: [glsl()],
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,          // never inline a texture as base64: +33% and uncacheable
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],        // the big one, cached across deploys
          motion: ['gsap', 'lenis'],
        },
      },
    },
  },
  server: { host: true },          // test on a real phone over the LAN. Do this daily
})
```

**`server: { host: true }` and then open the LAN URL on your actual phone.** The single highest-value
line in this file. Desktop device emulation tells you nothing about GPU capability, thermal
throttling, or real touch behaviour.

### `tsconfig.json`

```jsonc
{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "types": ["vite/client"],
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "noEmit": true
  }
}
```

`noUncheckedIndexedAccess` is worth the friction here — this codebase indexes arrays constantly
(instances, waypoints, frames) and it catches the off-by-one that would otherwise be an
`undefined.position` at runtime.

**TypeScript 7.0 ships no `lib.dom.d.ts` on disk** in the layout this project encountered. If DOM
types go missing, the fix is `@types/web` in `devDependencies`, not deleting the `lib` entry.

---

## 2. Asset pipeline — all free, all local

### Models

```bash
npx gltfpack -i model.glb -o out.glb -cc -tc -kn
```

| flag | does |
|---|---|
| `-cc` | Draco-style mesh compression |
| `-tc` | textures → KTX2/Basis |
| `-kn` | keep node names — **required** if your code does `getObjectByName` |

**Decoders must be self-hosted.** Both Draco and KTX2 need WASM/JS decoders at runtime; a CDN path is
a third-party dependency on your critical path and a privacy problem. Copy them into `public/`:

```bash
cp -r node_modules/three/examples/jsm/libs/draco/  public/decoders/draco/
cp -r node_modules/three/examples/jsm/libs/basis/  public/decoders/basis/
```

```ts
boot({ decoders: { dracoPath: '/decoders/draco/', basisPath: '/decoders/basis/' } })
```

**Check the draw-call count before optimising the file size.** A 300-node glTF is 300 draw calls, and
`gltfpack` does not merge meshes. Merge in Blender first. `gpuInfo(renderer).calls` tells you the
truth.

### Textures — the number that matters is VRAM, not KB

**A GPU stores decoded pixels. The file format is irrelevant once it is uploaded.**

| texture | VRAM (RGBA8) | + mipmaps |
|---|---|---|
| 512² | 1.05 MB | 1.4 MB |
| 1024² | 4.19 MB | 5.6 MB |
| **2048²** | **16.8 MB** | **22.4 MB** |
| 4096² | 67.1 MB | 89.5 MB |
| 2048² **KTX2/Basis** | **~4 MB** | ~5.3 MB |

**A 200 KB JPEG and a 3 MB PNG at 2048² both cost 16.8 MB of VRAM.** JPEG optimises download and
changes GPU cost by **zero**. Only KTX2 changes VRAM, because the GPU keeps it compressed.

Six 2048² PBR maps = **134 MB of VRAM** on a phone with maybe 300 MB to spare for the whole page.

```bash
# WebP for anything that will not be a GPU texture (UI, posters, thumbnails)
npx sharp -i src.png -o out.webp --webp-quality 82

# KTX2 for GPU textures
npx @gltf-transform/cli etc1s in.glb out.glb        # smaller, lower quality
npx @gltf-transform/cli uastc in.glb out.glb        # larger, better for normal maps
```

Rules: **2048 is a ceiling, not a default.** Most props are fine at 1024. Roughness/metalness/AO pack
into one RGB texture. `anisotropy` from `budget()`, never a hard 16.

### Video for scrubbing

```bash
ffmpeg -i in.mov -c:v libx264 -crf 22 -g 10 -bf 0 \
  -pix_fmt yuv420p -movflags +faststart -an out.mp4
```

**`-g 10` is the whole thing.** x264's default `keyint` is **250**; a seek decodes from the previous
keyframe, so a 250-frame GOP means up to 250 frames decoded *per seek*. That is the difference
between smooth scrubbing and a slideshow.

`-bf 0` removes B-frame reordering. `+faststart` moves the moov atom to the front so playback starts
before the download finishes. `-an` — audio is dead weight in a scrub.

### Frame sequences (alpha, or line art)

```bash
ffmpeg -i in.mov -vf "fps=24,scale=1600:-2" -c:v libwebp -quality 82 frames/f_%04d.webp
```

Then `createFrameSequence` — encoded Blobs plus a sliding window of decoded `ImageBitmap`s.
**1920×1080×4 = 8.29 MB per decoded frame; ×240 = 1.99 GB** if you decode eagerly, which every
open-source implementation surveyed for this toolkit does.

### Audio

```bash
ffmpeg -i in.wav -c:a libopus -b:a 96k out.opus       # ambience: Opus, best ratio
ffmpeg -i in.wav -c:a aac -b:a 128k out.m4a           # Safari fallback
ffmpeg -i hit.wav -c:a libmp3lame -b:a 128k hit.mp3   # one-shots: universal, tiny
```

Ambience: mono is fine and halves the size. One-shots: under 100 KB each, always.

---

## 3. Performance budgets

### The wire

| tier | total | JS | textures | models | video |
|---|---|---|---|---|---|
| tier-1 one-pager | **< 2 MB** | < 350 KB gz | < 800 KB | < 400 KB | none |
| tier-2 cinematic | **4–8 MB** | < 500 KB gz | < 3 MB | < 2 MB | < 3 MB |
| showcase | 12–20 MB | < 600 KB gz | < 8 MB | < 6 MB | < 8 MB |

**Above 8 MB you are choosing to lose visitors on mobile data.** That can be the right call for a
showcase piece — make it a decision with a number attached, not an accident.

### The frame

| metric | target | measure with |
|---|---|---|
| frame time | **< 16.6 ms** (60 fps) | `?stats` |
| draw calls | < 100, ideally < 50 | `gpuInfo().calls` |
| textures | < 40 | `gpuInfo().textures` |
| programs | < 30 | `gpuInfo().programs` |
| active scenes | ≤ `budget().maxActiveScenes` | `?debug` |

### Draw-call arithmetic

**~0.05–0.2 ms of CPU each.**

| meshes | CPU/frame | |
|---|---|---|
| 10 | 0.5–2 ms | fine |
| 100 | 5–20 ms | marginal |
| **500** | **25–100 ms** | **12 fps with the GPU completely idle** |

This is a CPU cost, so a better GPU does not help. Instance or merge.

### Raycast arithmetic

A 120k-triangle character, `intersectObjects(scene.children, true)`, on a 120 Hz pointer:
**14.4 million ray/triangle intersections per second** to answer one boolean. A 12-triangle proxy is
**120,000 → 12**, one line of code.

### Fill rate

DPR is **quadratic**: 2 → 1.5 is **44 %** fewer fragments; 2 → 1 is **75 %**. At DPR 2 on a 1440p
screen, one full-screen pass is **14.7 million fragment invocations**. Four passes is 59 million.

**Order of levers:** DPR → `density` → `postprocessing` → `shadowMap`. Always DPR first.

### Time to interactive

| phase | budget |
|---|---|
| HTML + critical CSS | < 300 ms |
| JS parsed and `boot()` entered | < 1 s |
| preloader visible with real progress | < 1.2 s |
| first interactive frame | < 3 s on 4G |

**`compileAll()` behind the preloader is not optional.** three compiles shaders lazily on first draw;
without it, the frame a material first appears in stalls 50–300 ms — exactly at the reveal you
art-directed.

---

## 4. Accessibility

Not a checklist item. A cinematic site is exactly the kind of site that excludes people by default.

| requirement | implementation |
|---|---|
| **reduced motion** | `state.reducedMotion` — cursor off, magnetics off, `duration: 0` on Lenis, damped values snapped. Plus a CSS `@media` block for transitions the JS never sees |
| **keyboard** | `:focus-visible` on everything interactive. A growing cursor ring is not an affordance |
| **no-JS** | real content in the DOM. GL is enhancement |
| **screen readers** | `initSplits({ aria: true })` — 40 spans in a heading is otherwise unreadable |
| **audio** | never autoplay; visible, persisted mute; `aria-pressed` kept in sync |
| **contrast** | 4.5:1 for body text. Type over a render needs a scrim or a dark composition |
| **touch targets** | 44×44 px minimum |
| **skip link** | if there is a nav |
| **`lang`** | on `<html>` |
| **video** | captions if there is speech; `-an` scrub video has no audio to caption |

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; }
  .cursor { display: none; }
}
```

**Reduced motion should still be good.** Not a stripped fallback — the same composition, the same
grade, the same type, arriving without motion. Many people turn it on because motion makes them
unwell, not because they want less design.

---

## 5. SEO and metadata

A WebGL site is invisible to a crawler unless the DOM carries the content — which, if you followed
law 10, it does.

```html
<title>Studio Name — one clear line about what you make</title>
<meta name="description" content="150 characters. Written, not generated.">
<link rel="canonical" href="https://example.com/">

<meta property="og:title" content="…">
<meta property="og:description" content="…">
<meta property="og:image" content="https://example.com/og.jpg">   <!-- 1200x630, absolute URL -->
<meta name="twitter:card" content="summary_large_image">

<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Organization",
 "name":"Studio Name","url":"https://example.com/"}
</script>
```

**The og:image must be absolute and must be a real render, not a logo.** It is the only frame of your
cinematic site that most people will ever see. Take a screenshot of the best shot — `?debug` gets you
the framing, then screenshot at DPR 2.

Real `<h1>`/`<h2>` in document order. One `<h1>`. Real `<a href>` for navigation — a `<div onclick>`
is invisible to a crawler and to a keyboard.

---

## 6. Testing

There is no test framework here, deliberately — the failure modes are visual and platform-specific,
which unit tests do not catch. What actually works:

### Every commit

```bash
npx tsc --noEmit          # the whole toolkit typechecks clean. Keep it that way
npm run build             # a build that fails on a shader import is a build you find at 2am
```

### Every scene

| check | how |
|---|---|
| does it build in isolation? | `?scene=03` |
| does it work at the low tier? | `?quality=low` |
| does it leak? | `leakWatch(renderer, '03-artifact')`, scroll through twice, watch the counts |
| does it dispose? | `?scene=03`, scroll past it and back, check `gpuInfo()` |
| does it work in portrait? | resize to 390×844. Not devtools emulation for GPU behaviour — resize the real window |
| does `local` scrub and `weight` blend? | `?debug` shows both numbers live |

### Before delivery

1. **A real mid-range Android on real mobile data.** Not the emulator. This is where cinematic sites
   fail, and no desktop test predicts it.
2. **Safari on macOS and iOS.** Different video seek behaviour (hence `pickStrategy()` returning
   `seek` on WebKit), a historically tight limit on `AudioContext`s, and different colour handling.
3. **Reduced motion on.**
4. **JavaScript off.** Content readable.
5. **Tab through the whole page.**
6. **Throttle to 4G in devtools** and watch the preloader tell the truth.
7. **Scroll to the bottom and back up twice**, watching `gpuInfo()`. Growing counts = a broken
   `dispose`.
8. **Leave it open for ten minutes** on the peak scene. Thermal throttling on a laptop shows up here
   and nowhere else.

---

## 7. Deployment — free

| host | free tier | notes |
|---|---|---|
| **Cloudflare Pages** | unlimited bandwidth | **the right default for a heavy site.** No egress cap |
| Netlify | 100 GB/mo | good DX; a 20 MB showcase can burn that |
| Vercel | 100 GB/mo | same |
| GitHub Pages | 100 GB/mo soft | fine for tier-1 |

**Cloudflare Pages, because bandwidth is the constraint.** A 15 MB site with 5,000 visitors is 75 GB
— which exhausts every other free tier in a month.

```
build command:  npm run build
output dir:     dist
node version:   22
```

### Headers

`public/_headers` (Cloudflare/Netlify):

```
/assets/*
  Cache-Control: public, max-age=31536000, immutable

/decoders/*
  Cache-Control: public, max-age=31536000, immutable

/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(), microphone=(), camera=()
```

Vite hashes filenames in `assets/`, so `immutable` is safe and correct there. Do **not** put a long
max-age on `/*` — `index.html` must revalidate or nobody gets your next deploy.

### Compression

Brotli is automatic on all four hosts. Do not pre-compress. **Do not gzip a KTX2, a WebP, or an
MP4** — they are already compressed, and the extra pass costs CPU for no bytes.

### A pre-deploy gate

```bash
npm run build && du -sh dist && npx tsc --noEmit
```

If `du` exceeds the tier budget, that is a decision to make now rather than after launch.

---

## 8. What to check when it is slow

In order. Stop when you find it.

1. **`?stats`** — is the frame time CPU or GPU?
2. **`gpuInfo().calls`** — over 100? Instancing or merging, not shaders.
3. **DPR** — `state.viewport.dpr`. At 2 on a big screen, try 1.5 and see if you can tell.
4. **`listStages()`** — is something registered that should not be? Is a project stage doing layout?
5. **Active scene count** — over `maxActiveScenes`? Ramps too long?
6. **Postprocessing passes** — how many full-screen reads? Each is DPR² fragments.
7. **Shadow maps** — more than one caster?
8. **Allocation in `update`** — a sawtooth in the memory timeline means a `new` in a loop stage.
9. **`getBoundingClientRect` in a stage** — forced synchronous layout, every frame.
10. **Texture VRAM** — count them and multiply. §2's table.

**Nine times out of ten it is draw calls or DPR.** It is almost never the shader you have been
staring at.

---

Related: `troubleshooting.md` (specific symptoms) · `art-direction.md` (what to spend the budget on)
· `business.md` (tiers and pricing) · `toolkit/docs/EVIDENCE.md` (which of these numbers is measured
and which is field knowledge).
