# PATTERNS

**How to compose the units into an actual site.**

The per-unit guides in [`kernel/`](kernel/) and [`modules/`](modules/) tell you what each piece does.
This file is the other half: the patterns that combine them, the nine scene archetypes, how to sequence
transitions, how the art direction and the code are the same decision, and how to produce every asset for
free on one Windows machine.

Read [`../BIBLE.md`](../BIBLE.md) first for the ten laws.

---

## 1. The five composition patterns

Almost every cinematic site is these five patterns in some arrangement.

### 1.1 Scrub — one shot, driven by scroll position

The section owns a range of scroll; `local` drives a timeline, a video, or a frame sequence forward. The
user is the projectionist.

```ts
update(_w, ctx) { seq.seek(ctx.frame.local) }        // or tl.progress(ctx.frame.local)
```

**Use `local`, never `weight`.** Scrubbing with `weight` plays the shot forward then rewinds it as the
section leaves — the symptom is unmistakable once you have seen it.

**Reads as:** control, inspection, deliberate revelation. The user feels responsible for the motion.

### 1.2 Blend — two scenes overlapping in the same space

Two scenes' `weight` bells overlap. Both render; each fades by its own weight. No scene knows the other
exists.

```ts
render(w, ctx) { material.opacity = w; ctx.renderer.render(ctx.scene, ctx.camera) }
```

The camera does the rest for free — it is the weighted average of both waypoints, so it *travels* from one
composition to the other rather than jumping.

**Reads as:** dissolve, memory, one world becoming another. The most elegant transition in the toolkit
because it needs no transition code at all.

**Cost:** both scenes are live. Two `three` scenes at full DPR is two full renders — watch
`maxActiveScenes` in the quality budget.

### 1.3 Cut — cover the seam

When two moments have nothing in common, you cannot blend them honestly. Cover the screen, change
everything at once, uncover. See [`modules/transition.md`](modules/transition.md).

```ts
await layer.run(async () => { /* change lighting, palette, audio, scroll position */ }, 'ink')
```

**Reads as:** an edit. A chapter break. The one moment you are allowed to change the rules.

**Budget: two or three in a nine-scene site.** More than that and it reads as a slideshow.

### 1.4 Persist — one world, many chapters

One `three` scene stays built across several sections; the camera moves through it. Sections exist to own
scroll ranges and fire `enter`/`exit`; the geometry never rebuilds.

Implement as one scene with a long `section` (or a scene whose `ramp` spans several viewport heights) plus
`dom`/`none` scenes layered on top for the text.

**Reads as:** a continuous space you are travelling through — the strongest "digital world" feeling
available, and cheaper than four separate scenes because nothing is built or disposed mid-scroll.

### 1.5 Overlay — DOM on top of GL

Type, navigation, captions and buttons live in the DOM, positioned either by normal layout or by
`createAnchors` projecting a 3D point. The GL layer never draws text.

**Reads as:** authored. Also: accessible, indexable, selectable, and translatable — four things a texture
atlas of type is not.

**The rule:** if it is words a human should read, it is DOM. See
[`modules/dom-bridge.md`](modules/dom-bridge.md).

---

## 2. The nine scene archetypes

A nine-scene cinematic site is not nine arbitrary sections. These are the roles that actually recur, in
roughly the order they appear. Use them as a screenplay: pick five to nine, in an order that has an arc.

| # | archetype | job in the story | renderer | primary driver | camera | sound |
|---|---|---|---|---|---|---|
| 0 | **arrival** | establish the world in one frame; earn the scroll | `three` or `video` | `local` (slow) | wide, slow push | the bed fades in |
| 1 | **world** | let the user travel; prove the space is real | `three` (persist) | `local` + pointer parallax | long travel through | ambience, `bindScrollFilter` |
| 2 | **transmission** | deliver information without breaking the spell | `dom` over GL | `weight` for the backdrop, `data-revealed` for the type | held still | drops to a murmur |
| 3 | **artifact** | one object, examined; the interactive beat | `three` | pointer + `local` orbit | close, telephoto | one hover sound, one impact |
| 4 | **character** | a performance; the emotional centre | `video` or frame sequence | `local` | locked, or a single push | the score's peak |
| 5 | **dissolution** | destabilise; signal that this world is ending | `three` + post | `weight` (dissolve out) | drifting, losing anchor | filter closes, drone detunes |
| 6 | **editorial** | the actual content: work, credits, prose | `dom` | `data-revealed` + split text | not used | near silence |
| 7 | **index-grid** | let the user choose; the portfolio hinge | `dom` (+ `canvas2d` hover) | pointer | not used | ticks on hover |
| 8 | **departure** | close the loop; the CTA that does not feel like one | `three` or `none` | `local` | pull back out, mirroring arrival | the bed returns, then fades |

### What each one actually needs

**arrival** — the whole load budget lives here. One hero asset, a preloader gate, and a first frame that
would work as a poster. If the user has to scroll to understand what the site is, arrival failed.
Waypoint: wide. `ramp: { enter: 0, exit: 0.6 }` so it holds at full strength before yielding.

**world** — the *persist* pattern. Build once, travel through. Use `parallaxGroup` for the pointer so
scroll and pointer never fight (scroll writes `camera.position`, pointer writes the group). Instanced
fields with `gpuAnimate` for anything repeated — this is where `instancing.ts` earns its place.

**transmission** — resist the urge to make this 3D. `dom` over a dimmed GL backdrop, `initReveal` +
`splitText`. The backdrop's `weight` drives a `post` grade so the mood shifts under the words.

**artifact** — the only scene where picking is worth the cost. Low-poly `proxy`, damped hover response,
`onClick` into a detail state. A telephoto FOV (~28–35°) is what makes an object read as *significant*.

**character** — the hardest and the most valuable. Either a properly encoded scrubbed video
(`-g 10 -bf 0`) or a frame sequence with alpha. Do not attempt a rigged 3D character performance unless
the budget includes an animator; a filmed or pre-rendered sequence at 90–140 frames beats a mediocre rig
every time.

**dissolution** — post-processing does the work: raise `uGrain`, drop saturation, pull `uVignette`, push
DOF. A `gpuAnimate` dissolve on the geometry (`cwOffset` along the normal, driven by `1 - weight`) sells
it. This is the scene that earns a `cut` afterwards.

**editorial** — `renderer: 'dom'` or `'none'`. No WebGL context wasted on a paragraph. This is where the
client's actual content lives and where SEO happens; treat it as the most important scene, because
commercially it is.

**index-grid** — magnetic tiles, a custom cursor state, `data-cursor-text` naming the project. A
`canvas2d` layer for a hover distortion is affordable here; a `three` scene is not, because the grid must
stay instantly responsive.

**departure** — mirror arrival's camera in reverse. The symmetry is what makes the experience feel closed
rather than abandoned. One CTA, one line, silence.

### Ordering rules

- **Arc, not list.** Something has to *change* between scene 0 and scene 8, or it is a showreel.
- **Alternate density.** A `three` scene followed by another `three` scene exhausts the viewer. Put
  `transmission` or `editorial` between the heavy ones — it also gives the GPU a rest and the next
  scene's assets time to load.
- **One interactive beat, not five.** `artifact` is the beat. If everything is interactive, nothing is.
- **The cut goes where the world changes**, not where the section changes.

---

## 3. Transition sequencing

The catalogue of *kinds* is in [`modules/transition.md`](modules/transition.md). This is how to sequence
them across a whole site.

### Pick a vocabulary of two

A transition kind is part of the design system, like a typeface. Two kinds for the whole site:

| site character | primary | accent |
|---|---|---|
| Japanese / hand-made / brush | `ink` | `fade` |
| editorial / Swiss / graphic | `wipe` | `fade` |
| classical cinema / narrative | `iris` | `dissolve` |
| technological / signal / sci-fi | `glitch` | `wipe` |
| atmospheric / weather / memory | `dissolve` | `fade` |

Mixing `ink` and `glitch` in one site is incoherent — not because a rule says so, but because they imply
two different worlds.

### The pacing ladder

| between | use | why |
|---|---|---|
| two shots of the same place | **blend** (overlapping weights) | no transition code; the camera travels |
| two places in the same world | **blend** + a camera move, or `fade` 0.3 s | continuity is the point |
| two chapters of the same story | `wipe` / `iris` 0.6–0.9 s | the audience should register the edit |
| two worlds | `ink` / `glitch` 1.2 s + a full state change | this is where you change the rules |
| a real page navigation | `navigateWithTransition` | the cover hides the document load |

### Where a cut earns its cost

A cover is the only honest moment to change all of these at once:

```ts
await layer.run(async () => {
  post?.setTint(0x2a1408, 0xffd9a0)      // palette
  post?.set('uSaturation', 0.85)         // grade
  audio.setLowpass(20000, 0.6)           // the space opens
  ambienceA.pause(0.3); void ambienceB.play(1.5)
  scrollTo('#chapter-4', { immediate: true })
}, 'ink', { duration: 1.2, softness: 0.35 })
```

Changing three of those five without a cover looks like a bug. Changing all five behind one looks like
filmmaking.

---

## 4. Art direction and code are the same decision

Every art-direction choice below maps to a specific parameter. If a client asks for "more cinematic", one
of these is the answer.

### 4.1 Camera

| intent | FOV | motion | parameter |
|---|---|---|---|
| epic, landscape, small human | 55–70° | slow push | waypoint distance + `fov` |
| natural, documentary | 40–50° | handheld drift | `parallax` + a low-amplitude noise on rotation |
| **significant, portrait, jewel** | **28–35°** | almost still | telephoto compresses depth; this is the "expensive" look |
| claustrophobic, urgent | 75–90° | fast, close | wide-angle distortion near the edges |

**The single most effective camera note:** move *less*, and use a longer lens. Amateur 3D sites orbit
constantly at 60°+. A held telephoto frame with a 2 % push reads as expensive.

**Roll is the cheapest cinematic tell.** A 0.5–1.5° roll bound to scroll velocity — `camera.ts` already
supports it — makes the whole site feel operated by a human.

### 4.2 Light

| look | setup |
|---|---|
| **one clear direction** (default for everything) | one directional light + a dim hemisphere/ambient at 0.1–0.2. Never three equal lights — that is what makes 3D look like a product render |
| dusk / golden | warm directional at a low angle + a cool ambient. The *contrast between* warm key and cool fill is the whole effect |
| overcast / diffuse | HDR environment only, no directional. `envMapIntensity` does the work |
| night / interior | two small point lights, high falloff, plus bloom. Darkness is 90 % of the frame |
| silhouette / graphic | backlight only. No fill. Extremely cheap and extremely strong |

**Shadows are optional.** `shadowMap` is 0 on the low tier and the site must still look intentional. A
baked contact shadow plane under a hero object is often better than a real shadow map — it is free, it
never flickers, and it reads correctly on every tier.

### 4.3 Colour and grade

Do the grade in [`modules/post.md`](modules/post.md), not in materials. A grade you can animate is worth
ten materials you cannot.

| palette | `setTint(shadow, highlight)` | `uSaturation` | reads as |
|---|---|---|---|
| neutral | `0x000000, 0xffffff` | 1.0 | documentary |
| **dusk / warm** | `0x2a1408, 0xffd9a0` | 0.85 | memory, nostalgia, Japan at golden hour |
| cold / clinical | `0x0a1420, 0xe8f4ff` | 0.9 | technology, isolation |
| bleach bypass | `0x1a1a18, 0xfff8e8` | 0.55 | violence, heat, dust |
| monochrome | any | 0.0–0.15 | archival; a chapter that is a *record*, not an event |

**Two-colour tinting (shadow + highlight) is worth more than any LUT.** It is two `vec3` uniforms and it
is how film stocks actually differ from each other.

### 4.4 Type

| role | treatment |
|---|---|
| chapter titles | `splitText` lines + `mask: true`, 0.9 s, stagger 0.09. The curtain-rise |
| a manifesto line | words mode, stagger 0.12 — each word is its own event |
| a name, a date, a logotype | chars mode. The only place chars are worth the DOM |
| body copy | never split. Fade or slide the block |
| numbers, credits, labels | monospace or wide-tracked caps; `--i` staggering from CSS only |

**One display face, one text face, maximum.** A cinematic site's typographic interest comes from *scale
and space*, not from variety.

**Set type against the frame, not the content.** 12–16 vw display sizes, generous margins, and one axis
of alignment held across every scene.

### 4.5 Sound

The full API is in [`modules/audio.md`](modules/audio.md). The direction:

- **One bed, three one-shots.** That is a complete sound design for a nine-scene site.
- **`bindScrollFilter()` before anything else.** Muffling with speed does more for physicality than any
  number of samples.
- **Silence is a tool.** `editorial` and `departure` should be near-silent; that is what makes the
  `character` scene's peak land.
- **Duck under impacts**, do not just add. `duck(0.4, 1.8)` around a `thock` is the difference between
  a sound effect and a moment.

### 4.6 Motion feel

| feel | `ease` on damped values | GSAP ease |
|---|---|---|
| crisp, product, UI | 0.2–0.3 | `power3.out` |
| **cinematic, weighty** | **0.06–0.12** | `expo.out` / `power4.out` |
| dreamlike | 0.03–0.05 | `power2.inOut` |

Lower ease = more lag = more weight. The camera should be the *slowest* thing on the page and the cursor
dot the fastest; that spread is what makes a site feel like it has physics.

---

## 5. The free asset pipeline

Everything below runs on this Windows machine, from `node_modules`, at zero cost. Wrapped by
`cw assets` / `cw frames`; the raw commands are here so you can reason about them.

### 5.1 The arithmetic that decides everything

A 2048² PNG texture:

| form | wire | **VRAM** |
|---|---|---|
| PNG | ~4 MB | **16 MB** (always — GPUs do not store PNG) |
| JPEG q80 | ~400 KB | **16 MB** |
| **KTX2 / Basis (UASTC or ETC1S)** | ~1 MB | **~4 MB** |

**Compressed textures are the only thing that reduces VRAM.** JPEG makes the download smaller and the
GPU cost identical. A scene with 12 PNG textures at 2048² is 192 MB of VRAM before a single triangle is
drawn — that is the actual reason a scene dies on a mid-range phone.

### 5.2 glTF → optimised glTF

```bash
npx gltfpack -i model.glb -o public/media/model.glb -cc -tc -kn
```

| flag | does |
|---|---|
| `-cc` | Meshopt compression (geometry). Needs the Meshopt decoder at runtime |
| `-tc` | textures → KTX2/BasisU |
| `-kn` | keep node names, so your code can still find `scene.getObjectByName('katana')` |

`gltfpack` ships a WASM encoder — no native toolchain, no Docker, nothing to install beyond npm.

For finer control (per-texture quality, welding, quantisation) use
[`@gltf-transform/cli`](https://github.com/donmccurdy/glTF-Transform) (MIT), also installed:

```bash
npx gltf-transform optimize in.glb out.glb --compress meshopt --texture-compress ktx2
```

**Then check the draw-call count**, because compression does not merge meshes:

```ts
console.log(gpuInfo(renderer))   // from kernel/dispose.ts
```

300 nodes in a glTF is 300 draw calls. Merge in Blender, or instance.

### 5.3 Images

```bash
npx sharp -i hero.png -o public/media/hero.webp --format webp --quality 82
```

**WebP q82 at the size you will actually display** is the answer for ~everything DOM-side. Do not ship a
2560 px image into a 1280 px slot; that is the most common wasted megabyte on a portfolio site.

For GL textures, do not stop at WebP — go to KTX2 via `gltfpack` or `gltf-transform`, for the VRAM reason
above.

### 5.4 Video for scrubbing

```bash
ffmpeg -i source.mov \
  -c:v libx264 -crf 22 -preset slow \
  -g 10 -bf 0 \
  -pix_fmt yuv420p \
  -movflags +faststart -an \
  public/media/shot.mp4
```

| flag | why it is not optional |
|---|---|
| **`-g 10`** | keyframe every 10 frames. **This single flag is the difference between smooth scrubbing and unusable.** Default GOP is 250 — a seek can be 8 s of decode away from the nearest keyframe |
| **`-bf 0`** | no B-frames. B-frames reference *future* frames, so backward scrubbing has to decode forward first |
| `-movflags +faststart` | moov atom at the front, so playback starts before the file finishes downloading |
| `-an` | strip audio. A scrubbed video's audio is never used and is pure bytes |
| `-crf 22` | visually transparent for this purpose; 18 if it is the hero and you can afford it |

Encoding is where scrubbing is won or lost. See [`modules/video-scrub.md`](modules/video-scrub.md).

### 5.5 Frame sequences

```bash
ffmpeg -i draw.mov -vf "scale=1280:-2,fps=30" \
  -c:v libwebp -quality 82 -compression_level 6 \
  public/media/draw/frame-%04d.webp
```

**WebP q82 at 1280 px is roughly 4× smaller than the JPEG sequences these usually ship as**, with alpha
for free. AVIF is smaller again and encodes far more slowly — worth it for one hero sequence.

`%04d` starts at `0001`, so `src: (i) => …${i + 1}…` if your index starts at 0. A blank first frame is
almost always this.

### 5.6 HDR environments

Use a 1k or 2k `.hdr` and let `envMapIntensity` do the work. A 4k HDR is 32 MB of VRAM for a reflection
nobody can resolve. Free sources: [Poly Haven](https://polyhaven.com) (CC0).

### 5.7 Decoders must be copied to `public/`

Draco, KTX2/Basis and Meshopt decoders are separate files three fetches at runtime. `cw decoders` copies
them from `node_modules/three/examples/jsm/libs/` into `public/decoders/`. A 404 there is the most common
cause of a preloader that never reaches 100 %.

### 5.8 The delivery budget

| tier | total wire | largest single asset | scenes | notes |
|---|---|---|---|---|
| tier-1 one-pager | < 2 MB | 600 KB | 1–2 | no preloader needed |
| **tier-2 cinematic** | **4–8 MB** | 2 MB | 5–9 | preloader + gate; sparse-first for sequences |
| showcase / awards | 12–20 MB | 5 MB | 9+ | only with a client who understands the trade |

Above 8 MB you are choosing to lose visitors on Indian mobile data. That is sometimes the right creative
call — make it a decision, not an accident.

---

## 6. Building a site: the actual order of work

1. **Write the screenplay first.** Nine lines, one per scene, in prose. If it does not read as an arc on
   paper, no amount of WebGL will fix it.
2. **Pick archetypes and renderer kinds** from §2. Decide now which scenes are `dom` — usually more than
   you expect.
3. **Build `index.html` with real sections and real content.** The site should be readable and navigable
   with zero JavaScript before you add a single scene.
4. **`boot()` with an empty manifest.** Confirm the loop, `?debug`, and `data-ready`.
5. **One scene at a time, `renderer: 'none'` first.** Get the scroll range, `enter`/`exit`, and the
   `local`/`weight` behaviour right with nothing rendering.
6. **Add the heaviest scene second, not last.** If `character` cannot hit budget, everything downstream of
   that decision changes.
7. **Post-processing last.** It is a multiplier on whatever is already there; adding it early hides
   lighting problems you should have fixed.
8. **Sound after post.** Two hours of sound work is worth more than two more days of shader work.
9. **Then measure:** `?stats`, `gpuInfo()`, `leakWatch()`, and a real mid-range Android over a throttled
   connection.
10. **Then cut.** Remove the weakest scene. A seven-scene site that holds beats a nine-scene site with two
    dead ones.

---

Related: [`../BIBLE.md`](../BIBLE.md) (the ten laws, the loop table),
[`EVIDENCE.md`](EVIDENCE.md) (where the numbers in this file come from),
[`kernel/`](kernel/) and [`modules/`](modules/) (per-unit guides).
