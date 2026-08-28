# Art Direction

The craft half. Every section ends in a parameter you can actually set, because art direction that
does not reach the code is a mood board.

---

## 1. The single most useful principle

**Move the camera less, and use a longer lens.**

Amateur 3D orbits constantly at a 60°+ field of view. Every expensive-looking piece of film does the
opposite: a long lens, almost still, with a move so small you feel it rather than see it.

| FOV | reads as | use for |
|---|---|---|
| 20–28° | **very telephoto.** Compressed, flat, watchful, ominous | a held portrait, a distant figure, an artifact on a plinth |
| **28–35°** | **the expensive look.** Cinematic, composed, deliberate | your default. Most shots on a good site live here |
| 35–45° | natural, documentary | a room you inhabit, a walk-through |
| 45–60° | wide, energetic, spatial | an establishing shot, a landscape |
| 60–75° | very wide, immersive, distorted at the edges | a subjective rush, a fall, a tunnel |
| 75°+ | fish-eye. A stylistic statement or a mistake | rarely |

**Telephoto compression *is* the look.** A 28° lens flattens depth, makes backgrounds feel closer
and larger, and separates the subject without any postprocessing at all.

Then move almost nothing:

```ts
waypoint: {
  landscape: { position: [0.4, 1.5, 4.2], focus: [0, 1.2, 0], fov: 30 },
}
// the next scene's waypoint, 2% closer:
waypoint: {
  landscape: { position: [0.4, 1.5, 4.1], focus: [0, 1.2, 0], fov: 30 },
}
```

A 2 % push over a full section is a *slow creep*. It is more affecting than a 40-unit fly-through,
and it costs nothing.

### Portrait is a different shot, not a scaled one

```ts
portrait: { position: [0, 1.4, 6.4], focus: [0, 1.1, 0], fov: 44 }
```

Further back, wider lens. Sometimes a genuinely different angle — a phone is a tall window, and a
composition built for a wide one does not crop into it. This is why `WaypointSet` has two entries
instead of a responsive multiplier.

### The moves worth having, and the ones to skip

| move | how | reads as |
|---|---|---|
| **slow push** | 2–5 % closer across the section | attention narrowing. The most useful move there is |
| **slow pull** | 2–5 % further | release, revelation, an ending |
| **lateral drift** | 0.3–1 unit sideways, focus fixed | parallax reveals depth for free |
| **rack focus** | animate `dof.focus`, camera still | the most cinematic thing in this toolkit, and almost nobody does it on the web |
| **roll on velocity** | `velocityRoll: 0.02` | a human is operating this camera |
| orbit | — | skip it. It says "3D demo" |
| shake | — | almost never. It says "video game" |

**Rack focus is under-used and free.** The camera does not move; the *focus plane* moves. It is one
tween on `post.bokeh` and it is the strongest way to move a viewer's eye:

```ts
update(w, ctx) {
  post?.bokeh && (post.bokeh.uniforms.focus.value = lerp(3.2, 8.0, smooth(ctx.frame.local)))
}
```

---

## 2. Light

### One clear direction

**One directional light plus a dim ambient (0.1–0.2). That is the whole setup for most scenes.**

Three lights of similar intensity from three directions is what makes 3D look like a product render
— everything is legible and nothing has shape. Cinematography is *choosing what is dark*.

| setup | lights | reads as |
|---|---|---|
| **single key** | 1 directional at 2–4, ambient 0.1 | stark, sculptural, dramatic. The default |
| key + rim | key 2.5, rim 1.5 behind at 15–30° | separation from the background. A figure |
| key + bounce | key 3, fill 0.4 from below/opposite | naturalistic, softer |
| practical-driven | a point light *at* a visible lamp, intensity 1–3 | the most convincing look available: the light has a source in frame |
| overcast | HDRI only, no directional | flat, calm, editorial. Good for objects, bad for drama |
| silhouette | key **behind** the subject, ambient 0.05 | mystery, arrival, an ending |

### A practical light is the highest-value trick

Put a `PointLight` inside the visible lantern, the visible sign, the visible window. The viewer's
brain reconciles source and effect and stops reading the scene as computer graphics.

```ts
const lantern = new THREE.PointLight(0xffb066, 2.4, 6, 2)
lantern.position.copy(lanternMesh.position)
// then breathe it — a flame is never constant
update(w, ctx) {
  lantern.intensity = (2.2 + Math.sin(ctx.state.time.elapsed * 7.3) * 0.18) * w
}
```

**Flicker with two summed sines at incommensurate rates** (7.3 and 11.9), not one — a single sine
reads as a pulse, two read as a flame.

### Shadows

Expensive: one extra scene render per shadow-casting light. **One caster, maximum.**

```ts
light.shadow.mapSize.setScalar(budget().shadowMap)     // 0 / 1024 / 2048
light.shadow.bias = -0.0005                            // peter-panning vs acne, tune per scene
light.shadow.camera.near = 1                           // tighten the frustum. Loose = soft/blurry
light.shadow.camera.far  = 20
```

**A GPU-animated mesh casts a static shadow** — `onBeforeCompile` injections are invisible to the
depth material. Options: accept it (usually fine for grass), turn off the caster, or inject the same
GLSL into `customDepthMaterial`.

A cheaper, often better option: **a baked shadow plane.** A soft radial-gradient texture on a plane
under the object, no shadow map at all. On the low tier this is the only shadow you get, and it looks
deliberate.

---

## 3. Colour

### Two colours, opposed

```ts
post.setTint(0x1a2740, 0xffd9a0)      // cool shadows, warm highlights
```

This is how film stocks actually differ from one another, and it costs two `vec3` uniforms. A LUT
buys you very little more.

| shadow → highlight | reads as | use for |
|---|---|---|
| `0x1a2740` → `0xffd9a0` | teal/orange. The modern blockbuster | broad appeal, dusk, warmth against cold |
| `0x101820` → `0xf0f4ff` | cold, clinical, silver | technological, precise, sterile |
| `0x2a1810` → `0xffe8c0` | sepia, aged, lamplight | memory, archive, interior |
| `0x0a1410` → `0xd8ffe0` | green shadow, pale highlight | uneasy, sickly, wet forest |
| `0x1a0e1e` → `0xffc8d8` | violet shadow, rose highlight | romantic, dreamlike, dusk |
| `0x14100c` → `0xd8c9a3` | ink on aged paper | **Japanese, brush, restrained** |
| `0x000000` → `0xffffff` | none. Pure contrast | brutalist, editorial, typographic |

### Restraint

**One accent colour. Two neutrals. That is the palette.** A cinematic site is nearly monochrome with
one thing that is allowed to be saturated — and *that* is where the eye goes. Add a second accent and
you have lost the ability to direct attention at all.

Per-chapter shifts belong in CSS, off the published attribute:

```css
[data-active-scene='01-arrival']  { --paper: #0a0c10; --ink: #c8d0dc; --accent: #d8763a; }
[data-active-scene='05-ash']      { --paper: #14100c; --ink: #d8c9a3; --accent: #8a2418; }
```

### Grade parameters

| uniform | range | notes |
|---|---|---|
| `uGrain` | **0.03–0.06** | above 0.08 reads as noise, not film. Non-negotiably present — a perfectly clean digital image looks cheap |
| `uVignette` | 0.25–0.45 | 0.6+ is a "vintage filter" |
| `uVignetteSoft` | 0.4–0.8 | higher = a gentler falloff |
| `uAberration` | 1–3 px | 4+ is a statement. Drive it from velocity |
| `uContrast` | 1.02–1.15 | small numbers. 1.4 crushes everything |
| `uSaturation` | 0.85–1.05 | **desaturating slightly reads as more expensive**, almost always |
| `uBrightness` | ±0.05 | fix exposure at the light, not here |

**Bloom `threshold` is the dial that matters, not `strength`.** A low threshold with high strength is
the "everything glows" look. Raise the threshold to 0.85–0.95 so only genuine highlights bloom, then
`strength` 0.4–0.6 reads as real lens behaviour.

---

## 4. Type

**Words are DOM. Always.** Law 10 — accessible, selectable, indexable, translatable, and crisp at
every DPR. Text drawn into a texture is none of those.

### One display face, one text face

Typographic interest comes from **scale and space**, not from variety. Two faces, maximum.

| role | size | treatment |
|---|---|---|
| chapter title | `clamp(3rem, 9vw, 9rem)` | display face, tight tracking (−0.02em), line-height 0.95 |
| statement / pull quote | `clamp(1.5rem, 3.5vw, 3rem)` | display or text, line-height 1.2, max 2 lines |
| body | 1rem–1.125rem | text face, line-height **1.55–1.7**, `max-width: 62ch` |
| caption / meta | 0.75rem | uppercase, tracking **+0.12em**, 60 % opacity |
| nav | 0.875rem | uppercase, tracking +0.08em |

**`max-width: 62ch` on body copy.** A full-width paragraph on a 27-inch monitor is unreadable, and
no amount of art direction fixes it.

**Uppercase needs positive tracking.** Uppercase at default tracking looks broken; +0.08 to +0.15em
is the range.

### Reveals

| level | when | duration / stagger |
|---|---|---|
| **lines** | **your default.** Paragraphs, statements, everything long | 0.9 s / 0.06 s |
| words | a short statement, 5–10 words | 0.7 s / 0.04 s |
| chars | a title of 3–4 words. **Only.** | 0.6 s / 0.02 s |

**Per-character reveals on a paragraph are the most-overused effect on the web.** They also delay
comprehension, which is the opposite of what type is for.

**`mask: true` is the good one.** Each line in an `overflow: hidden` wrapper, rising from behind a
hard edge:

```ts
const split = splitText('#chapter-title', { modes: ['lines'], mask: true, responsive: true, aria: true })
const tl = textTimeline(split, { level: 'lines', duration: 0.9, stagger: 0.06, y: 100 })
// enter(dir) { dir > 0 ? tl.play() : tl.progress(1) }
```

**`responsive: true` is mandatory with `lines`** — line breaks change with width, and a stale split
leaves words stranded mid-line.

### Type against the GL layer

Two rules, both about legibility:

1. **Never put type over a busy area of the render.** Put it in the dark. Compose the shot with a
   quiet region and place the type there.
2. **Use `createAnchors` for labels on 3D objects** — real HTML tracking a world point, with
   `cull: true` so labels behind the camera do not pile up in a corner.

---

## 5. Sound

Sound is the highest-leverage, least-used tool available. **Two hours of sound work beats two more
days of shader work.** Three sounds, chosen well.

| moment | tool |
|---|---|
| a chapter's ambience | `music(url, { loop: true })`, volume driven by `weight` — crossfades for free |
| a transition impact | `play('thock', { volume: .8, rate: .95 + Math.random() * .1 })` |
| a UI click | `play('tick', { volume: .3 })` |
| a hover on something visible | `play('shimmer', { pan: screenX })` — free spatialisation |
| dialogue over music | `duck(0.35, 2.5)` |
| inside / underwater / a memory | `setLowpass(400, 1.2)` |
| back out | `setLowpass(20000, 0.8)` |
| speed as physicality | `bindScrollFilter({ minHz: 600, maxHz: 20000 })` |

**Start with `bindScrollFilter()`.** Scroll fast and the mix muffles; stop and it opens. It is four
lines and it does more for the sense of *being in a space* than any sample library.

**Randomise `rate` by ±10 % on any repeated one-shot.** Identical playback of the same sample is what
makes UI sound feel cheap.

**Silence is a tool.** A scene with no sound, between two that have it, is the strongest thing you
can do with audio. The quiet scenes are what make the loud one land.

**Audio as animation input** — the geometry breathes in time with the score:

```ts
update(w) {
  lantern.intensity = 1.2 + audio.bass * 2.5 * w
  post?.set('uVignette', 0.3 + audio.level * 0.1)
}
```

And a visible, persisted mute. Always.

---

## 6. Motion feel

**Ease is the whole personality of a site.** One number, and it decides whether the thing feels
heavy and expensive or light and cheap.

| ease | settle | reads as | use for |
|---|---|---|---|
| 0.02–0.05 | very slow | dreamlike, underwater, floating | an atmospheric scene, fog, a memory |
| **0.06–0.12** | slow | **cinematic, weighty, expensive** | **the camera. Your default** |
| 0.12–0.20 | medium | responsive but smooth | parallax layers, a grade reacting to velocity |
| 0.20–0.35 | fast | snappy, direct, alive | the cursor ring, hover states |
| 0.35–0.5 | very fast | immediate, barely damped | the cursor dot |
| 1.0 | none | mechanical | nothing. If you want no damping, do not damp |

**The spread is what matters, not the values.** A site where everything shares one ease feels flat.
The camera should be the *slowest* thing on the page and the cursor dot the *fastest* — that gradient
is what makes it feel like it has physics.

### GSAP eases, for one-shots

| ease | for |
|---|---|
| `power2.out` | almost everything. The safe default |
| `power4.out` | a big reveal — fast start, long tail |
| `expo.out` | a very fast arrival that settles slowly |
| `cubic-bezier(.16,1,.3,1)` | the "expensive" curve. Long, smooth deceleration |
| `power2.inOut` | a move between two states, both at rest |
| `back.out(1.4)` | overshoot. Playful. Almost never in cinematic work |
| `elastic` | never |

**Duration ladder:** micro-interaction 0.15–0.3 s · element reveal 0.6–0.9 s · section transition
0.9–1.4 s · world transition 1.2–1.8 s. Above 2 s a viewer thinks it has broken.

---

## 7. Pacing

**A cinematic site is an arc, not a list of effects.**

```
     intensity
        │                        ╭──╮  peak (ONE. scene 6 or 7)
        │              ╭───╮    ╱    ╲
        │      ╭──╮   ╱     ╰──╯      ╲
        │  ╭──╯    ╰─╯                 ╰──╮  resolution
        │ ╱                                ╰───
        └──────────────────────────────────────► scroll
          1   2   3   4   5   6   7   8   9
```

### The rules

1. **Alternate density.** A heavy `three` scene, then a quiet `dom` one. The rest is what makes the
   next heavy scene land — and it gives the GPU time to breathe.
2. **One peak.** Two peaks means neither is a peak. Nine crescendos is a flat line.
3. **One interactive beat, not five.** Interaction stops the narrative to ask the viewer to play.
   Once is a gift; five times is a chore, and it dilutes the one that mattered.
4. **The cut goes where the world changes.** Do not transition for variety. A covered cut is a
   promise that something is different on the other side.
5. **Earn the reveal.** Whatever the site is *for* — the work, the product, the name — arrives after
   something has been established. Opening on it wastes it.
6. **End on rest.** The last scene should be quiet and should tell the viewer what to do.

### Section length

| length | reads as |
|---|---|
| < 0.8 vh | a glimpse. Too fast to register |
| **1–1.5 vh** | **a beat. The default** |
| 2–3 vh | a held shot, or something being scrubbed |
| 4 vh+ | a set piece. One per site, maximum |

**Long sections need something to scrub.** A 4 vh section with a static image is 4 vh of dead
scrolling.

### Transition vocabulary — pick two

| direction | pair |
|---|---|
| Japanese, brush, ink | `ink` + `fade` |
| editorial, graphic | `wipe` + `fade` |
| classical, filmic | `iris` + `dissolve` |
| technological, broken | `glitch` + `wipe` |
| atmospheric, dreamlike | `dissolve` + `fade` |

**Two or three covered cuts in a nine-scene site.** Six different transitions is a showreel of
transitions, not a film.

---

## 8. The Japanese / samurai direction, specifically

Because this is the reference direction for the flagship build, and because it is very easy to do
badly.

### What makes it read as authentic rather than as a costume

| do | not |
|---|---|
| **negative space as the subject.** Ma (間) — the emptiness is composed, not left over | filling the frame |
| a nearly monochrome palette: ink, aged paper, one blood-red accent | saturated reds and golds everywhere |
| **asymmetry.** Off-centre, weighted low or to one side | centred composition |
| one texture doing all the work: paper grain, ink bleed, wet stone | many competing textures |
| **stillness, then one fast motion.** A held shot, then a cut | continuous movement |
| a long lens: 24–32° | a wide lens |
| brushed, irregular edges — organic dissolves | hard geometric wipes |
| **silence, then one impact** | continuous music |
| vertical composition, vertical type where appropriate | everything horizontal |
| cherry blossom used **once**, or not at all | cherry blossom on every scene |

### Parameters

```ts
post.setTint(0x14100c, 0xd8c9a3)     // ink on aged paper
post.set('uGrain', 0.055)            // higher than usual — paper is not smooth
post.set('uSaturation', 0.82)        // restrained
post.set('uContrast', 1.08)
post.set('uVignette', 0.32)

// lighting: a single key at a low angle, and darkness everywhere else
key.intensity = 3.2; ambient.intensity = 0.08

// camera: long lens, almost still
waypoint: { landscape: { position: [1.2, 1.35, 4.6], focus: [0, 1.15, 0], fov: 28 } }

// transitions: ink, always
layer.run(swap, 'ink', { duration: 1.3, softness: 0.35 })
```

**The single fast motion is the whole idiom.** Four scenes of held stillness, then one 0.4-second
draw. The stillness is not filler — it is what makes the motion mean something. A site where the
sword is always moving has no sword moment at all.

### Sound

A low drone. Wind. **One** wooden impact on the cut. Then nothing. The temptation is a shakuhachi
loop over everything; resist it — it turns a place into a theme restaurant.

---

## 9. The ten-minute quality checklist

Run this before showing anyone anything.

1. Is the camera FOV under 40° in at least half the shots?
2. Is there exactly **one** clear light direction per scene?
3. Is `uGrain` between 0.03 and 0.06 and definitely not zero?
4. Is `uSaturation` at or slightly below 1.0?
5. Is `setTint` doing something — two opposed colours, not two greys?
6. Is the camera the slowest damped thing and the cursor dot the fastest?
7. Is there one accent colour, not three?
8. Is body copy capped at ~62ch?
9. Is there **one** peak, and does at least one scene have nothing happening in it?
10. Is there sound, with a visible mute — and one moment of silence?
11. Does `bindScrollFilter` exist?
12. Is every reveal by **lines**, except one title?
13. Are there two transition kinds, not six?
14. Does the last scene tell the viewer what to do?

If more than three answers are wrong, fix those before writing another shader.

---

Related: `design-thinking.md` (planning before any of this) · `toolkit/docs/PATTERNS.md` (the nine
archetypes, composition patterns) · `modules-api.md` (`post`, `audio`, `text-split`, `transition`).
