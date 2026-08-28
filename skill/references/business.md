# Business

Scoping, pricing, licensing, and delivery for cinematic web work. The commercial half of the skill.

Every number in §1–2 is field knowledge, not a measurement — a starting point to adjust to your
market and your evidence. §4 is not adjustable: it is a legal constraint.

---

## 1. Tiers

Three products, not infinite custom quotes. A named tier ends the "how much for a website" conversation
in one message and makes the trade-offs explicit.

| | **Tier 1 — One-pager** | **Tier 2 — Cinematic** | **Tier 3 — Showcase** |
|---|---|---|---|
| **scenes** | 3–4 | 7–9 | 9–12 |
| `three` scenes | 1 | 3–4 | 5–6 |
| interactive beats | 0 | 1 | 1–2 |
| covered transitions | 0–1 | 2–3 | 3 |
| custom shaders | 0 | 1–2 | 3–5 |
| 3D assets | stock or none | 2–4 props, optimised | a modelled hero asset |
| audio | none, or one ambience | ambience + 3 one-shots + scroll filter | full design, per-chapter |
| sequences / video scrub | no | one, optional | yes |
| **wire budget** | **< 2 MB** | **4–8 MB** | 12–20 MB |
| **build time** | **1–2 weeks** | **4–6 weeks** | 8–12 weeks |
| CMS | no | optional flat-file | yes |

### What actually drives the number

Not the scene count. These:

| driver | effect |
|---|---|
| **who writes the copy** | if you do, add a week. Copy is the critical path more often than code |
| **whether 3D assets exist** | no assets → either commission (money, and not yours) or restructure to `video`/`dom`/`canvas2d` |
| **the character scene** | the single most expensive thing in the vocabulary. Price it separately or exclude it |
| **the number of stakeholders** | two is fine. Five triples the revision rounds, regardless of the build |
| **mobile expectation** | "must look identical on mobile" is a different, larger project. Say so at intake |
| **CMS** | content editability changes the architecture, not just the admin |

**The character scene deserves its own line item.** A held, lit, art-directed figure — modelled or
from footage — is frequently 30–40 % of a tier-2 build on its own. Quoting it inside "9 scenes" is how
projects lose money.

### Pricing shape, not pricing

Set your own rate; the structure is what matters:

- **Tier 1** ≈ 1× your baseline site rate. It is a real one-pager with one GL scene, not a discount.
- **Tier 2** ≈ 3–4× tier 1. This is the product. Most of the toolkit exists for this tier.
- **Tier 3** ≈ 2–2.5× tier 2, and only for a client with a reason for it — a launch, an award
  submission, a flagship.
- **Character scene** — a separate line, roughly a third of a tier-2 fee.
- **Revisions** — two rounds included, named. A third is billed. This is standard and clients expect it.
- **Deposit** — 40–50 % up front. Non-negotiable, and normal in this field.

**Do not discount by removing scenes.** Removing scenes is how you deliver a worse site for less
money, which nobody wants. Discount by dropping a *tier* — a good tier-1 beats a gutted tier-2, and
the gutted tier-2 is the one that damages your portfolio.

### What does not scale with price

Do these at every tier, including the cheapest:

- accessibility, reduced motion, keyboard, no-JS content
- a real grade (`setTint`, grain), a real lens (FOV under 40°), one clear light
- the wire budget for the tier
- 60 fps on a mid-range Android
- a visible, persisted mute if there is sound

**These are not premium features. They are the job.**

---

## 2. The free stack, and what it costs

The whole pipeline runs locally on one machine at zero cost. This is a real competitive position: no
per-seat licence, no render service, no monthly floor, so a tier-1 job is profitable.

| need | tool | cost |
|---|---|---|
| engine | three.js (MIT) | free |
| motion | GSAP 3.13+ — **all former Club plugins now free** | free |
| smooth scroll | Lenis (MIT) | free |
| build | Vite, TypeScript | free |
| 3D authoring | Blender | free |
| model optimisation | gltfpack, @gltf-transform/cli | free |
| textures | sharp, KTX2/Basis via gltf-transform | free |
| video / frames / audio | ffmpeg | free |
| debug UI | tweakpane, stats-gl | free |
| hosting | **Cloudflare Pages** — unlimited bandwidth | free |
| forms | Cloudflare Pages Functions, or a `mailto:` | free |
| analytics | Cloudflare Web Analytics (no cookie banner needed) | free |
| fonts | self-hosted (variable, subset) | free or one-time |
| **total recurring** | | **a domain, ~$10–15/yr** |

**Cloudflare Pages specifically, because bandwidth is the constraint.** A 15 MB showcase with 5,000
visitors is 75 GB — which exhausts the 100 GB/month free tier on Netlify, Vercel, and GitHub Pages
inside a month. Cloudflare has no egress cap.

The two places money is genuinely worth spending: **a licensed display font** (one-time, and it is
often the single strongest differentiator on the page) and **a sound library or a session with someone
who does sound**. Not tooling.

---

## 3. Client intake

Ten questions. Send them before quoting; do not quote without answers to 5, 7, and 10.

```
1  Who is arriving, and from where?
2  What must they believe by the end?
3  What one thing should they remember?
4  What must they do next?
5  Three references -- and, for each, WHAT SPECIFICALLY about it.
6  Three anti-references -- what it must NOT feel like.
7  What assets exist? (3D? footage? photography? nothing?)
8  Who writes the copy, and by when?
9  What is the mobile expectation?
10 What is the launch date, and what is behind it?
```

| question | what the answer decides |
|---|---|
| **5** | the entire brief. **"I like Studio X" is unusable; "I like that Studio X holds a shot for four seconds before anything moves" is a specification.** The one question that saves the project |
| **7** | the architecture. No assets means `video`/`canvas2d`/`dom` and a character built from footage or type — decided at intake, not discovered in week four |
| **8** | the schedule. Late copy is the most common cause of a slipped launch, and it is not your slip |
| **9** | whether this is one project or two. "Identical on mobile" is a different quote |
| **10** | whether the deadline is real. A date with a reason is a constraint to design within; a date with no reason will move |

Then send back, before any code: **the nine-line screenplay** and **the exclusion list**. Getting a
client to approve nine lines of prose is the cheapest possible alignment, and it is far easier than
getting them to un-approve a built scene.

### The exclusion list is part of the contract

```
NOT a scroll-jacked slideshow.
NOT a WebGL demo with copy pasted on.
NOT nine crescendos.
NOT dependent on JavaScript to read the content.
NOT over 8 MB.
NOT going to require a mouse.
NOT going to autoplay sound.
```

Written exclusions are what make "can we also add…" answerable. The honest answer to the fourth
addition is: **"Yes — and it replaces one of the existing scenes, because a tenth scene makes the site
slower and the arc flatter. Which one do we cut?"** That reframes additions as trades, which is what
they are.

---

## 4. Licensing — read this before using any reference

### 4.1 The hard exclusion

**`https://github.com/davidhckh/portfolio-2025` is NOT open source.**

Its `license.md` states:

- use is restricted to **"personal and educational purposes only"**
- **attribution is required** — David Heckhoff, `https://david-hckh.com`
- **"Commercial use, resale, or redistribution of this project or substantial portions of it is
  prohibited without prior written permission from the author."**

| allowed | not allowed |
|---|---|
| reading it to understand an approach | copying any file, in whole or in part |
| reimplementing a *technique* from scratch, in your own code | copying a function, a shader, or a config block |
| citing it as a reference in research notes | pasting it into client work |
| learning from it | shipping it, in any form, to a paying client |

The patterns learned from it — in/out scene weights, weighted-average waypoint cameras, a parallax
group separate from the camera, scene precompilation — are **ideas**, and ideas are not what the
licence covers. Every one of them is independently implemented in this toolkit's own kernel, from the
maths up. **That reimplementation is the deliverable; the original code is not, and must never be
copied into a project.**

This matters because commercial work is the point of this flow. A licence violation in client work is
the client's problem as much as yours.

Recorded in `toolkit/BIBLE.md`, `specs/RESEARCH.md`, and `toolkit/docs/EVIDENCE.md` §8.1. Also
`SKILL.md` Absolute Rule 3.

### 4.2 What you can ship

| dependency | licence | commercial |
|---|---|---|
| three.js | MIT | yes |
| GSAP 3.13+ (incl. former Club plugins) | GSAP standard "no-charge" licence | **yes for client sites.** Not for a product where the animation *is* the product being resold |
| Lenis | MIT | yes |
| Vite, TypeScript, tweakpane, stats-gl | MIT / Apache-2.0 | yes |
| mp4box.js | BSD-3-Clause | yes |
| three-mesh-bvh | MIT | yes (not currently a dependency) |
| ffmpeg | LGPL/GPL depending on build | **yes as a build-time tool.** Do not bundle a GPL build into a shipped binary |
| Blender | GPL — **the application, not your output** | your models are yours |

**GSAP's licence has one edge worth knowing:** the free licence covers sites and apps, including
client work. It does not cover selling a product where end users pay for the animation itself (a
template marketplace, a paid animation builder). Client sites are unambiguously fine.

### 4.3 Assets — the actual risk area

Code licensing is usually clean. Assets are where projects get letters.

| asset | check |
|---|---|
| **fonts** | a **web** licence, with a pageview tier that covers the client. A desktop licence does not permit `@font-face`. The most commonly violated licence in web work |
| **3D models** | CC0/CC-BY are fine (attribute for BY). "Free for personal use" is not usable in client work |
| HDRIs | Poly Haven is CC0. Verify anything else |
| textures | ambientCG is CC0 |
| **audio** | freesound licences vary **per file** — CC0, CC-BY, and non-commercial all coexist there. Check each one |
| **client-supplied anything** | get in writing that they hold the rights. Photography they "found" is their liability until you ship it, then it is a shared problem |

Keep a `CREDITS.md` in every project with source and licence for every third-party asset. Ten minutes
at the time; unanswerable a year later.

### 4.4 Your own contract terms

- **You own the code until final payment.** Then it transfers, or you licence it — state which.
- **The toolkit stays yours.** Deliver the project, not an exclusive assignment of your kernel. One
  line: *"Reusable framework code remains the property of the developer and is licensed to the client
  for use in this project."* No client has ever objected to this.
- **Portfolio rights.** Explicit, in writing, up front. Add an embargo date if they need one.
- **Attribution.** Ask. Do not add a credit link to a client's footer without permission.

---

## 5. Delivery checklist

Nothing ships until every line passes. Ordered so a failure is cheap to find.

### Build

- [ ] `npx tsc --noEmit` clean
- [ ] `npm run build` clean
- [ ] `du -sh dist` inside the tier's wire budget
- [ ] no `console.log` outside `debug.ts`
- [ ] debug flags off by default; `?debug` still works
- [ ] decoders self-hosted in `public/`, no CDN on the critical path

### Performance

- [ ] 60 fps on the developer machine at `?quality=high`
- [ ] **60 fps on a real mid-range Android on real mobile data** — not the emulator
- [ ] `gpuInfo().calls` under 100
- [ ] texture VRAM counted (× 16.8 MB per 2048²) and defensible
- [ ] `leakWatch` clean across two full scroll passes, both directions
- [ ] ten minutes on the peak scene with no thermal collapse
- [ ] `compileAll()` behind the preloader; no first-frame hitch
- [ ] `?quality=low` still looks deliberate, not broken

### Craft

- [ ] `art-direction.md` §9 — the fourteen-point checklist
- [ ] one peak, and at least one scene where nothing happens
- [ ] two transition kinds, not six
- [ ] portrait waypoints on every `three` scene
- [ ] the last scene tells the viewer what to do

### Accessibility

- [ ] reduced motion on: still good, not stripped
- [ ] full keyboard pass, `:focus-visible` everywhere
- [ ] JavaScript off: content readable
- [ ] contrast 4.5:1 on body text
- [ ] `aria: true` on every split heading
- [ ] audio never autoplays; mute visible, persisted, `aria-pressed` in sync
- [ ] touch targets 44 × 44 px
- [ ] `lang` on `<html>`

### Metadata

- [ ] title, description (written, not generated), canonical
- [ ] og:image — **absolute URL, 1200×630, a real render, not a logo**
- [ ] twitter:card
- [ ] favicon set
- [ ] one `<h1>`, headings in document order
- [ ] `_headers` in place; `index.html` revalidates

### Cross-browser

- [ ] Chrome, Firefox, **Safari macOS, Safari iOS**
- [ ] audio unlocks on iOS specifically
- [ ] video scrubbing on Safari specifically (`pickStrategy()` → `seek`)
- [ ] Windows and macOS trackpad scroll both feel right

### Handover

- [ ] `README.md`: run, build, deploy, where the assets come from
- [ ] `CREDITS.md`: every third-party asset with source and licence
- [ ] a one-page "how to change the copy" note if there is no CMS
- [ ] repository access transferred, or a zip delivered
- [ ] deploy access transferred
- [ ] a recorded walkthrough — five minutes of screen capture prevents a month of emails
- [ ] final invoice sent

---

## 6. The pitch

Two paragraphs, and they are not about technology.

> Most sites are a template with the client's logo in it. This is a *film* they scroll through: nine
> shots, one peak, real photography and type, sound that reacts to how fast they move. It loads in
> under three seconds on a phone and it works with the sound off, the mouse unplugged, and JavaScript
> disabled.
>
> It is built on the same tools the studios use — three.js, GSAP — and it is hand-built rather than
> assembled, which is why it does not look like anything else. Here is the nine-line screenplay. If
> you like the shape, I will build it.

**Show the screenplay in the pitch.** It is the single most persuasive artefact in the process, it
takes twenty minutes to write, and it demonstrates that you are thinking about their story rather than
about shaders.

### What not to say

Do not sell WebGL. Nobody buys WebGL. **Sell the fact that a visitor will remember it** — that is the
only thing the client actually wants, and it is the one thing a template cannot give them.

---

Related: `design-thinking.md` (the intake and screenplay in depth) · `fullstack.md` (budgets,
deployment, the free pipeline) · `art-direction.md` §9 (the quality checklist) ·
`toolkit/docs/EVIDENCE.md` §8.1 (the licence finding, with quoted text).
