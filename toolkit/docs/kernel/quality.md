# `kernel/quality.ts`

## Purpose

One table that says what each device class is allowed to cost, plus a watchdog that demotes the tier
when the frame budget is actually being blown. A scene reads the budget and branches; it never sniffs
the user agent.

## When to use it

- `budget()` anywhere you are about to decide a count, a resolution or whether to build something.
- `detectQuality()` once, in `boot()`, before the renderer exists.
- `createWatchdog(onDemote)` once, in `boot()`; `boot()` registers it at stage 995.

## When NOT to use it

- **Not to detect a browser.** The tier is about capability, not identity. `if (isSafari)` belongs
  nowhere in this codebase.
- **Not to hide content.** A low tier gets a *cheaper* version of the experience, not a broken or
  empty one. If a scene has no low-tier version, mark it `quality: 'medium'` in its definition and
  give the section real DOM content so there is still something there.
- **Not per frame for expensive branches.** `budget()` is a property lookup, so calling it in a loop
  is fine — but rebuilding geometry because the budget changed is not. React to `onDemote`.

## Signature

```ts
export interface QualityBudget {
  dpr: number              // max device pixel ratio — the biggest lever, and it is quadratic
  antialias: boolean
  shadows: boolean
  postprocessing: boolean  // whether the bloom/DOF/grain chain exists at all
  density: number          // multiplier on particle counts, instanced copies, grass blades
  shadowMap: number        // shadow map resolution; 0 = none
  anisotropy: number
  maxActiveScenes: number  // how many simultaneously-weighted scenes to keep updating
}

export const BUDGETS: Record<QualityTier, QualityBudget>
export const budget: () => QualityBudget

export function detectQuality(): QualityTier

export function createWatchdog(
  onDemote: (tier: QualityTier, prev: QualityTier) => void,
  opts?: { targetFps?: number; samples?: number; graceMs?: number },
): (delta: number) => void
```

## Inputs

The three tiers, verbatim from `BUDGETS`:

| | low | medium | high |
|---|---|---|---|
| `dpr` | 1 | 1.5 | 2 |
| `antialias` | ✗ | ✗ | ✓ |
| `shadows` | ✗ | ✓ | ✓ |
| `postprocessing` | ✗ | ✓ | ✓ |
| `density` | 0.25 | 0.6 | 1 |
| `shadowMap` | 0 | 1024 | 2048 |
| `anisotropy` | 1 | 2 | 4 |
| `maxActiveScenes` | 2 | 3 | 4 |

**`detectQuality()`'s decision order**, which matters because the early returns win:

1. **No WebGL2 → `low`.** Without WebGL2 there are no float render targets and no useful KTX2
   transcode target, so the expensive path is not even available.
2. **`prefers-reduced-motion: reduce` → `medium`.** The user's own stated signal outranks any hardware
   guess. (Reduced *motion* is handled separately and completely — see `state.reducedMotion`.)
3. **`prefers-reduced-data: reduce` → `low`.** Chrome-only, but when present it is the single most
   reliable signal the platform offers.
4. `deviceMemory <= 2` → `low`; `<= 4` → `medium`.
5. `hardwareConcurrency <= 4` → `low` on touch, `medium` otherwise.
6. touch **and** smaller dimension < 500px → `medium`.
7. otherwise `high`.

`deviceMemory` and `hardwareConcurrency` are the only two useful signals exposed, and **Safari reports
neither** — hence the conservative touch fallbacks. This is a guess by design. The watchdog is what
makes it correct.

**Watchdog tuning:**

| option | default | meaning |
|---|---|---|
| `targetFps` | 50 | budget is `1000 / targetFps` ms |
| `samples` | 90 | rolling window ≈ 1.5 s at 60 fps |
| `graceMs` | 3000 | ignore everything for the first 3 s |

## Outputs

`budget()` reads `state.quality` live, so it reflects a demotion immediately.

The watchdog function is called with `delta` every frame (stage 995). It:

- returns immediately during the grace period, and immediately once already at `low`
- maintains a rolling sum over `samples` frames
- demotes only when the **average** exceeds budget by **25 %** — `avg > budgetMs * 1.25`
- logs `[quality] 34fps average over 90 frames — demoting high -> medium`
- calls `onDemote(next, prev)`
- resets the window **and** the grace period so the rebuild it just triggered is not itself measured
- after two demotions, pins to `low`

## Transitions and applications

**Demote-only, never promote.** A site that gets prettier halfway down the page advertises that it was
ugly before. Promotion also oscillates: raise the tier, blow the budget, drop it, repeat, forever.

**DPR is the biggest lever and it is quadratic.** DPR 2 → 1.5 is not 25 % fewer pixels, it is
`1 - (1.5/2)² = 44 %` fewer. DPR 2 → 1 is **75 %** fewer. Nothing else in the budget comes close;
this is the first thing `onDemote` should act on.

**What `onDemote` should actually do**, in order of value:

```ts
const watchdog = createWatchdog((tier) => {
  const b = budget()

  // 1. DPR — quadratic win, instant, no rebuild. Always do this first.
  stage.renderer.setPixelRatio(Math.min(window.devicePixelRatio, b.dpr))

  // 2. Drop the whole post chain: several full-screen render targets go away at once.
  if (!b.postprocessing && post) {
    scenes.setMainRender(null)      // back to the plain renderer.render() path
    post.dispose()
    post = null
  }

  // 3. Shadows — one depth pass per casting light.
  stage.renderer.shadowMap.enabled = b.shadows
})
```

Note what is *not* in that list: rebuilding scenes. There is no `onQuality` hook on
`SceneDefinition` — a scene reads `budget()` in `build()` and its counts are fixed from then on. If a
project genuinely needs scenes to thin out after a demotion, it must dispose and rebuild them itself,
and that is visible mid-scroll. Prefer the three renderer-level levers above, which are invisible.

**`density` is the number scenes multiply by.** Write counts as an intent, not a literal:

```ts
const count = Math.round(4000 * budget().density)   // 4000 / 2400 / 1000
```

**Reduced motion is not a quality tier.** It is a separate, absolute requirement: `state.reducedMotion`
must cut animation amplitude and disable parallax regardless of how fast the machine is. A 4090 with
reduced-motion set still gets the calm version. See Law 10 in [`../../BIBLE.md`](../../BIBLE.md).

## Gotchas

**The grace period is load-bearing.** Asset decode, shader compile and first paint all produce 200 ms+
frames. Without `graceMs` every machine demotes to `low` during the preloader, and you ship the cheap
version to everyone.

**Two demotions pin to `low`.** If the site is still slow after `high → medium`, one more overrun goes
straight to `low` and stays there. That is intentional: a third rebuild costs more than it saves.

**A demotion rebuild is expensive.** Disposing and rebuilding scenes mid-scroll is visible. Prefer
budget changes that need no rebuild (DPR, post, shadows) and treat scene rebuilds as a last resort.

**`detectQuality()` creates a throwaway canvas** to probe WebGL2. That is fine once at boot; do not
call it repeatedly — each call is a real context creation, and contexts are capped.

**`maxActiveScenes` is advisory unless you enforce it.** Nothing in the kernel truncates the update
loop by default; long `ramp` values on a low tier can put four heavy scenes on screen at once. Keep
ramps short for scenes that matter on mobile.

## Recipe

Boot wiring (this is what `boot()` does):

```ts
import { detectQuality, createWatchdog, budget } from './quality'

state.quality = detectQuality()
state.viewport.dpr = Math.min(window.devicePixelRatio, budget().dpr)

const watchdog = createWatchdog((tier, prev) => {
  debug.log(`quality ${prev} -> ${tier}`)
  stage.renderer.setPixelRatio(Math.min(window.devicePixelRatio, budget().dpr))
})

addStage({ order: 995, name: 'watchdog', fn: (d) => watchdog(d) })
```

`createPost` reads the budget itself and returns `null` when `postprocessing` is false, so the low
tier needs no special-casing at boot — the caller pattern already handles it:

```ts
const post = createPost(stage, { bloom: { strength: 0.4 } })
if (post) scenes.setMainRender(post.render)
```

Inside a scene:

```ts
build(ctx) {
  const b = budget()

  // Counts scale, they are not switched off.
  const field = createInstancedField({
    count: Math.round(6000 * b.density),
    geometry: bladeGeo,
    material: bladeMat,
  })

  // A whole feature can be skipped, but the scene still exists and still reads.
  if (b.postprocessing) {
    volumetricGodRays = buildGodRays()
    ctx.world.add(volumetricGodRays)
  }

  // Texture quality is a per-texture decision, not a per-scene one.
  tex.anisotropy = b.anisotropy
}
```

Related: [`renderer.md`](renderer.md) (DPR, antialias, shadows),
[`assets.md`](assets.md) (`minQuality` skips downloads), [`state.md`](state.md)
(`state.quality`, `state.reducedMotion`), [`index.md`](index.md) (stage 995).
