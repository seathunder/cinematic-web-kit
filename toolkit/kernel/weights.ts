/**
 * Scene weights.
 *
 * Each scene owns exactly two scalars — `in` and `out` — and its visible strength is
 *
 *     weight = clamp(in * (1 - out))
 *
 * That is the whole crossfade system. It matters because of what it makes impossible: a scene
 * computes its own two numbers from the scroll position and its own cached rect, and never
 * looks at another scene. So scene 04 cannot break scene 03, adding scene 10 cannot shift
 * scene 02, and deleting a scene cannot leave a hole. Compare the usual approach — a global
 * timeline with hand-tuned overlap windows — where every insertion re-times everything after it.
 *
 * `local` is the other number, and it is not the same thing. `weight` is a bell: 0 at both
 * ends, 1 in the middle. `local` is a ramp: 0 at the start, 1 at the end, and it stays at 1.
 * Blend with weight. Scrub with local.
 */
import { state, clamp, range } from './state'
import { addStage } from './loop'
import { measure, onReflow } from './viewport'
import type { SceneInstance } from './types'

/** Below this, a scene's update() and render() are skipped entirely. */
export const ACTIVE_THRESHOLD = 0.001

export function measureScene(inst: SceneInstance): void {
  if (!inst.section) return
  inst.rect = measure(inst.section)
}

export function computeWeights(instances: SceneInstance[]): void {
  const scroll = state.scroll.value
  const vh = state.viewport.height || 1

  for (let i = 0; i < instances.length; i++) {
    const inst = instances[i]
    const { top, height } = inst.rect
    if (height === 0) {
      inst.in = 0
      inst.out = 0
      inst.weight = 0
      continue
    }

    const ramp = inst.def.ramp ?? {}
    const enter = (ramp.enter ?? 1) * vh
    const exit = (ramp.exit ?? 1) * vh

    // in: 0 while the section is still below the fold, 1 once its top reaches the fold.
    inst.in = range(scroll, top - enter, top)
    // out: 0 until the section's bottom reaches the fold, 1 once it is `exit` past it.
    inst.out = range(scroll, top + height - vh, top + height - vh + exit)
    inst.weight = clamp(inst.in * (1 - inst.out))

    // local: pure scrub through the pinned range. Unlike weight it never comes back down,
    // so it is what you feed a scrubbed GSAP timeline or a video's currentTime.
    const localRaw = range(scroll, top, top + height - vh)

    if (inst.ctx) {
      inst.ctx.frame.weight = inst.weight
      inst.ctx.frame.in = inst.in
      inst.ctx.frame.out = inst.out
      inst.ctx.frame.local = localRaw
    }
  }
}

/**
 * Register the weights stage plus the enter/exit edge detection.
 * `onEdge` fires once when a scene crosses the activation threshold in either direction.
 */
export function initWeights(
  instances: SceneInstance[],
  onEdge: (inst: SceneInstance, entering: boolean, dir: number) => void,
): () => void {
  const remeasure = () => {
    for (const inst of instances) measureScene(inst)
  }
  const offReflow = onReflow(remeasure)
  remeasure()

  addStage({
    order: 40,
    name: 'weights',
    after: ['scroll', 'viewport'],
    fn: () => {
      computeWeights(instances)
      for (let i = 0; i < instances.length; i++) {
        const inst = instances[i]
        const shouldBeActive = inst.weight > ACTIVE_THRESHOLD
        if (shouldBeActive !== inst.active) {
          inst.active = shouldBeActive
          onEdge(inst, shouldBeActive, state.direction)
        }
      }
    },
  })

  return offReflow
}

/**
 * The scene with the highest weight. Drives `[data-active-scene]` on <html>, which is how
 * CSS gets to react to the 3D world (nav colour, cursor style, mix-blend-mode) with no JS.
 */
export function dominant(instances: SceneInstance[]): SceneInstance | null {
  let best: SceneInstance | null = null
  let bestW = ACTIVE_THRESHOLD
  for (const inst of instances) {
    if (inst.weight > bestW) {
      bestW = inst.weight
      best = inst
    }
  }
  return best
}
