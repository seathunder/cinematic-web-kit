/**
 * The single render loop.
 *
 * One requestAnimationFrame for the whole site. Stages are numbered and run in ascending
 * order every frame; sparse numbering (0, 10, 20, ...) leaves room to insert work later
 * without renumbering. A stage that declares `after` will refuse to register before its
 * dependency exists — that turns "why is the camera one frame behind" into a startup error.
 *
 * Reserved numbers:
 *   0   time
 *   10  state damping
 *   20  scroll -> progress/velocity
 *   30  viewport (only runs on the reflow frame)
 *   40  scene weights
 *   50  camera
 *   60  scene update()
 *   900 dom bridge (CSS vars)
 *   980 render
 *   999 debug / stats
 */
import { state } from './state'

export interface Stage {
  order: number
  name: string
  fn: (delta: number, elapsed: number) => void
  /** Names of stages that must already be registered. Enforced at register time. */
  after?: string[]
  enabled?: boolean
}

const stages: Stage[] = []
let running = false
let rafId = 0
let last = 0
/** Clamp huge deltas (tab was backgrounded, breakpoint on a slow device) to avoid teleports. */
const MAX_DELTA = 1 / 20

export function addStage(stage: Stage): void {
  for (const dep of stage.after ?? []) {
    if (!stages.some((s) => s.name === dep)) {
      throw new Error(
        `[loop] stage "${stage.name}" declares after:"${dep}" but "${dep}" is not registered yet. ` +
          `Register it first — ordering bugs here cost hours.`,
      )
    }
  }
  if (stages.some((s) => s.name === stage.name)) {
    throw new Error(`[loop] duplicate stage name "${stage.name}"`)
  }
  stage.enabled ??= true
  stages.push(stage)
  stages.sort((a, b) => a.order - b.order)
}

export function removeStage(name: string): void {
  const i = stages.findIndex((s) => s.name === name)
  if (i !== -1) stages.splice(i, 1)
}

export function setStageEnabled(name: string, on: boolean): void {
  const s = stages.find((x) => x.name === name)
  if (s) s.enabled = on
}

export function listStages(): { order: number; name: string; enabled: boolean }[] {
  return stages.map((s) => ({ order: s.order, name: s.name, enabled: s.enabled !== false }))
}

function tick(now: number): void {
  rafId = requestAnimationFrame(tick)
  if (!last) last = now
  let delta = (now - last) / 1000
  last = now
  if (delta > MAX_DELTA) delta = MAX_DELTA
  if (state.paused) return

  state.time.delta = delta
  state.time.elapsed += delta
  state.time.frame++

  for (let i = 0; i < stages.length; i++) {
    const s = stages[i]
    if (s.enabled === false) continue
    s.fn(delta, state.time.elapsed)
  }
}

export function startLoop(): void {
  if (running) return
  running = true
  last = 0
  rafId = requestAnimationFrame(tick)
}

export function stopLoop(): void {
  running = false
  cancelAnimationFrame(rafId)
}

/**
 * Pause on tab hide. Saves battery, and prevents a 30-second delta when the user comes back.
 * Attach once from boot().
 */
export function bindVisibility(): () => void {
  const onVis = () => {
    state.paused = document.hidden
    last = 0
  }
  document.addEventListener('visibilitychange', onVis, { passive: true })
  return () => document.removeEventListener('visibilitychange', onVis)
}

addStage({
  order: 0,
  name: 'time',
  fn: () => {
    /* state.time is written in tick() before stages run; this stage exists so `after: ['time']` reads well */
  },
})
