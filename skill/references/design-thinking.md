# Design Thinking

What happens before any code. This is the step that most often gets skipped, and skipping it is why
sites end up as a pile of effects rather than an experience.

---

## 1. Answer four questions before opening an editor

Write the answers down. One sentence each. If you cannot, you are not ready.

| question | why it decides the build |
|---|---|
| **Who is arriving, and from where?** | An art director from a Twitter link, a recruiter from a CV PDF, and a CFO from a proposal need three different first ten seconds |
| **What do they need to believe by the end?** | This is the whole brief. "That this studio can make things nobody else can" builds a different site from "that this product is trustworthy" |
| **What is the one thing they will remember?** | If the answer is a list, there is no answer. One image, one moment, one sentence |
| **What must they do next?** | Every scene either builds toward this or is decoration |

**A site that cannot answer question 3 becomes a showreel of techniques.** That is the failure mode
this whole toolkit is arranged to prevent — the reason `RendererKind` has five values and the reason
step 10 of the order of work is "cut the weakest scene."

---

## 2. Write the screenplay first

**Nine lines of prose. One per scene. Before any code.**

```
01 ARRIVAL      Dusk. A road. Something is coming but we cannot see what.
02 CONTEXT      Who we are, in the fewest words that will do.
03 ARTIFACT     The blade, held. Close, still, turnable. This is the object the site is about.
04 TRANSMISSION A voice from elsewhere. Text over dark. The only moment with no image.
05 WORLD        The place itself, entered. Wide. We are inside now.
06 THE CUT      Ink. Everything changes. -- THE PEAK
07 AFTERMATH    The same place, after. Ash instead of dusk. Quiet.
08 THE WORK     What we actually make. A grid. Plain, confident, fast.
09 DEPARTURE    A name, an email, and nothing else.
```

### Why prose and not a wireframe

A wireframe hides the two things that actually matter — **whether it builds** and **whether the
middle sags**. Prose exposes both immediately. If line 5 reads as "and then another cool 3D bit," you
have found the dead scene on day one instead of week three.

### The test

Read it aloud. It should take about 40 seconds and it should have a shape. If it reads as a list, it
will *feel* like a list no matter how good the shaders are. **No amount of WebGL fixes a flat
screenplay**, and there is no cheaper moment to find out.

### Then, and only then, assign machinery

| # | scene | archetype | renderer | why |
|---|---|---|---|---|
| 01 | arrival | arrival | `three` | establishes the world. Earns the cost |
| 02 | context | editorial | **`dom`** | it is words. Words are DOM |
| 03 | artifact | artifact | `three` | interactive inspection — the one interactive beat |
| 04 | transmission | transmission | **`none`** | text over dark. Costs nothing |
| 05 | world | world | `three` | the wide shot |
| 06 | the cut | dissolution | `three` + `ink` | the peak, the only full state swap |
| 07 | aftermath | world | `three` | reuses 05's assets, re-graded. Nearly free |
| 08 | the work | index-grid | **`dom`** | a grid of links. Must be fast and plain |
| 09 | departure | departure | **`dom`** | a name and an email |

**Four `dom`/`none` scenes out of nine.** That is the correct ratio, and it is not a compromise — the
quiet scenes are what make the heavy ones land, and they are why the site runs on a phone.

---

## 3. The arc

```
     intensity
        │                        ╭──╮  06 THE CUT
        │              ╭───╮    ╱    ╲
        │      ╭──╮   ╱ 05  ╰──╯      ╲ 07
        │  ╭──╯ 03 ╰─╯                 ╰──╮ 08
        │ ╱ 01        04                   ╰─── 09
        └──────────────────────────────────────►
```

Six structural rules, each of which has a specific failure mode when broken:

| rule | broken → |
|---|---|
| **Alternate density.** Heavy, then quiet | monotony. Nothing lands. And it will not run on a phone |
| **One peak** | two peaks means neither is a peak |
| **One interactive beat** | interaction stops the narrative to ask the viewer to play. Once is a gift, five times is a chore |
| **Cut only where the world changes** | a covered cut is a promise. Spend it on variety and it means nothing |
| **Earn the reveal** | opening on the thing the site is for wastes it |
| **End on rest** | the viewer leaves without doing the thing |

---

## 4. Decide what it is *not*

The most useful hour in the process. Write it down and hold the client to it:

```
NOT a scroll-jacked slideshow.
NOT a WebGL demo with copy pasted on.
NOT nine crescendos.
NOT dependent on JavaScript to read the content.
NOT over 8 MB.
NOT going to require a mouse.
NOT going to autoplay sound.
```

**Constraints are the design.** A site with no stated exclusions accretes features until it is
indistinguishable from a template with a shader on top.

---

## 5. The five composition patterns

These are the only ways a scene can behave. Naming them stops arguments.

| pattern | reads as | drives | costs |
|---|---|---|---|
| **Scrub** | the viewer is operating a machine | `local` → `tl.progress()` / `seek()` | decode or a timeline |
| **Blend** | two shots dissolving | overlapping `weight` bells | two active scenes |
| **Cut** | a hard change of state | `layer.run()` | one covered moment |
| **Persist** | one world, many shots | one scene, many waypoints | nothing — the cheapest structure there is |
| **Overlay** | a voice, a caption, a title | `dom` over anything | nothing |

**Persist is under-used.** A single `three` scene spanning four sections, with four waypoints, is
*one* build, *one* asset set, and four distinct shots. Most sites that feel expensive are doing this,
not building four scenes.

Full treatment with code: `toolkit/docs/PATTERNS.md`.

---

## 6. The nine archetypes

| archetype | job | renderer | typical |
|---|---|---|---|
| **arrival** | establish the world, set the rules | `three` | wide, slow push, ambience swells |
| **world** | inhabit a place | `three` | lateral drift, parallax, practical lights |
| **transmission** | a voice from elsewhere | `dom` / `none` | text over dark. **The most under-used one** |
| **artifact** | one object, examined | `three` | telephoto, turnable, the interactive beat |
| **dissolution** | everything changes | `three` + transition | the peak. Full state swap under one cover |
| **character** | a figure, held | `three` / `video` | the hardest and most rewarding |
| **editorial** | say the thing plainly | `dom` | real type, real prose, confident |
| **index-grid** | show the work | `dom` | must be fast, plain, and linkable |
| **departure** | end, and ask | `dom` | a name, an email, rest |

**`transmission` is the cheapest strong scene in the vocabulary.** Text over black, one sound, no
render at all. It costs nothing, it gives the GPU a rest, and it is often the moment people quote
back to you.

---

## 7. Sketch in the browser, not in Figma

For this kind of work, the design tool is the browser.

**Day one produces a live page with:** real sections at real heights, real type, real copy, and
`renderer: 'none'` on every scene — plus `?debug` showing the weights. No renders at all.

You can already feel the pacing. You can already tell that scene 5 is too long and that the gap
between 2 and 3 is wrong. **Fixing that on day one costs a number; fixing it in week three costs a
scene.**

Then: build the **heaviest** scene second, not last. If the character scene cannot hit budget, every
decision downstream of it changes — and you want to know that before you have built eight other
scenes around it.

---

## 8. Reviewing your own work

Ask these in order. Stop at the first "no" and fix it before continuing.

1. **Does the screenplay still describe the site?** If it drifted, either the site is wrong or the
   screenplay needed to change. Both are fine; unnoticed drift is not.
2. **Which scene would I cut?** There is always one. Cut it. Seven scenes that hold beat nine with
   two dead ones — and the site gets faster for free.
3. **Where does the viewer get bored?** Watch someone scroll it without narrating. Their scroll speed
   tells you more than anything they say afterwards.
4. **Does it work on a phone, on real mobile data?** Not the emulator — a real mid-range Android,
   throttled. This is where most cinematic sites simply do not function.
5. **Does it work with no mouse?** Tab through it. Every interactive element needs `:focus-visible`.
6. **Does it work with reduced motion on?** It should still be *good*, not just functional.
7. **Does it work with JavaScript off?** The content must be readable. GL is enhancement.
8. **What is the one thing they will remember?** Same question as the start. If the answer changed,
   the site is telling a different story than you planned — decide deliberately which one you want.

---

## 9. Working with a client

### The intake, in one page

```
1  Who is arriving, and from where?
2  What must they believe by the end?
3  What one thing should they remember?
4  What must they do next?
5  Three references — and, for each, WHAT SPECIFICALLY about it. "The whole thing" is not an answer
6  Three anti-references — what it must NOT feel like
7  What assets exist? (3D? footage? photography? nothing?)
8  Who writes the copy, and by when?
9  What is the mobile expectation?
10 What is the launch date, and what is behind it?
```

**Question 5 is the one that saves the project.** "I like Studio X" is unusable. "I like that Studio
X holds a shot for four seconds before anything moves" is a specification.

**Question 7 decides the whole architecture.** No assets means `video`/`canvas2d`/`dom` and a
character built from footage or type, not from a 3D model you do not have and cannot commission.

**Question 10 is a real question.** A date with a reason behind it is a constraint to design within.
A date with no reason behind it will move.

### Selling the quiet scenes

Clients ask for more effects because effects are what they can see in a deck. The counter is
comparative, not theoretical: *"scene 4 is text over black — it is why scene 6 works. Take out scene
4 and scene 6 becomes just another 3D bit."*

Show them both. It takes ten minutes with `setStageEnabled` and it ends the conversation.

### The scope trap

"Can we also add…" is fine, once. The honest answer to the fourth one is: **"Yes — and it replaces
one of the existing scenes, because a tenth scene makes the site slower and the arc flatter. Which
one do we cut?"**

That question reframes additions as trades, which is what they actually are.

---

## 10. Common failure modes

| symptom | actual cause | fix |
|---|---|---|
| "It feels like a demo" | no screenplay. Effects without an arc | write the nine lines. Cut two scenes |
| "It's impressive but I don't remember it" | no single peak, or five interactive beats | one peak, one interactive beat |
| "It's beautiful but I don't know what they do" | the reveal never arrived, or arrived too late | move `index-grid` earlier; make `departure` explicit |
| "It's slow" | nine `three` scenes | convert half to `dom`. Check `gpuInfo()` and DPR first |
| "It doesn't work on my phone" | no portrait waypoints, no `--vh`, DPR 2 on a low-end GPU | portrait waypoints, `calc(var(--vh)*100)`, trust the tiers |
| "The client keeps adding things" | no written exclusion list | §4. Reframe additions as trades |
| "The transitions feel random" | six kinds instead of two | pick a vocabulary of two |
| "It looks like every other WebGL site" | 60° FOV, three equal lights, no grade, bloom on everything | `art-direction.md` §1–3. Longer lens, one light, two-colour tint |

---

Related: `art-direction.md` (how it should look) · `toolkit/docs/PATTERNS.md` (composition patterns
and archetypes in depth) · `business.md` (scoping and pricing) · `recipes.md` (once you know what you
are building).
