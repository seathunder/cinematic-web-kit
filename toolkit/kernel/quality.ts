/**
 * Quality tiers.
 *
 * A cinematic site that runs at 12fps is not a cinematic site. The tier is decided once at
 * boot from cheap signals, then *demoted* at runtime if the frame budget is actually blown.
 * It is never promoted: a site that gets prettier halfway down the page draws attention to
 * the fact that it was ugly before.
 *
 * What each tier is allowed to cost is declared here, in one table, so a scene never has to
 * guess. Read `tier()` and branch; never sniff the user agent inside a scene.
 */
import { state } from './state'
import type { QualityTier } from './types'

export interface QualityBudget {
  /** Max device pixel ratio. The single biggest lever on GPU load — it is quadratic. */
  dpr: number
  antialias: boolean
  shadows: boolean
  /** Bloom / DOF / grain chain enabled at all. */
  postprocessing: boolean
  /** Multiplier on particle counts, grass blades, instanced copies. */
  density: number
  /** Shadow map resolution. 0 = no shadows. */
  shadowMap: number
  /** Anisotropic filtering samples. */
  anisotropy: number
  /** Max simultaneously-active scenes to update. Beyond this, only the heaviest render. */
  maxActiveScenes: number
}

export const BUDGETS: Record<QualityTier, QualityBudget> = {
  low: {
    dpr: 1,
    antialias: false,
    shadows: false,
    postprocessing: false,
    density: 0.25,
    shadowMap: 0,
    anisotropy: 1,
    maxActiveScenes: 2,
  },
  medium: {
    dpr: 1.5,
    antialias: false,
    shadows: true,
    postprocessing: true,
    density: 0.6,
    shadowMap: 1024,
    anisotropy: 2,
    maxActiveScenes: 3,
  },
  high: {
    dpr: 2,
    antialias: true,
    shadows: true,
    postprocessing: true,
    density: 1,
    shadowMap: 2048,
    anisotropy: 4,
    maxActiveScenes: 4,
  },
}

export const budget = (): QualityBudget => BUDGETS[state.quality]

/**
 * Pick a starting tier.
 *
 * deviceMemory and hardwareConcurrency are the only two useful signals the platform actually
 * exposes, and Safari reports neither — hence the conservative fallback for touch devices.
 * This is a guess by design; the watchdog below is what makes it correct.
 */
export function detectQuality(): QualityTier {
  const nav = navigator as Navigator & { deviceMemory?: number; hardwareConcurrency?: number }
  const mem = nav.deviceMemory ?? 0
  const cores = nav.hardwareConcurrency ?? 0
  const touch = matchMedia('(hover: none)').matches
  const smallScreen = Math.min(window.innerWidth, window.innerHeight) < 500

  // No WebGL2 means no KTX2 transcoding target worth having and no float render targets.
  const probe = document.createElement('canvas')
  const hasWebGL2 = !!probe.getContext('webgl2')
  if (!hasWebGL2) return 'low'

  // Honour the user's own signal before any hardware guess.
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return 'medium'
  // Chrome-only, but when present it is the most reliable signal available.
  if (matchMedia('(prefers-reduced-data: reduce)').matches) return 'low'

  if (mem && mem <= 2) return 'low'
  if (mem && mem <= 4) return 'medium'
  if (cores && cores <= 4) return touch ? 'low' : 'medium'
  if (touch && smallScreen) return 'medium'
  return 'high'
}

/**
 * Frame-budget watchdog.
 *
 * Demotes a tier when the rolling average frame time stays over budget. The sample window is
 * deliberately long (90 frames ≈ 1.5s) and the trigger requires a sustained overrun, because
 * a single 200ms hitch during asset decode is normal and must not demote a capable machine.
 *
 * `onDemote` is where a project rebuilds what the new budget changed — usually setPixelRatio,
 * disabling the post chain, and asking scenes to thin out their instance counts.
 */
export function createWatchdog(
  onDemote: (tier: QualityTier, prev: QualityTier) => void,
  opts: { targetFps?: number; samples?: number; graceMs?: number } = {},
) {
  const target = opts.targetFps ?? 50
  const budgetMs = 1000 / target
  const windowSize = opts.samples ?? 90
  const graceMs = opts.graceMs ?? 3000

  const times: number[] = []
  let cursor = 0
  let sum = 0
  let startedAt = performance.now()
  let demotions = 0

  return function sample(delta: number): void {
    // Ignore everything during startup: decode, compile and first paint all land here.
    if (performance.now() - startedAt < graceMs) return
    if (state.quality === 'low') return

    const ms = delta * 1000
    if (times.length < windowSize) {
      times.push(ms)
      sum += ms
      return
    }
    sum -= times[cursor]
    times[cursor] = ms
    sum += ms
    cursor = (cursor + 1) % windowSize

    const avg = sum / windowSize
    if (avg <= budgetMs * 1.25) return

    const prev = state.quality
    state.quality = prev === 'high' ? 'medium' : 'low'
    demotions++
    console.warn(
      `[quality] ${Math.round(1000 / avg)}fps average over ${windowSize} frames — ` +
        `demoting ${prev} -> ${state.quality}`,
    )
    onDemote(state.quality, prev)

    // Reset the window and the grace period so the rebuild itself isn't measured.
    times.length = 0
    cursor = 0
    sum = 0
    startedAt = performance.now()
    if (demotions >= 2) state.quality = 'low'
  }
}
