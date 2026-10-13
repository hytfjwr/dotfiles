// Derived from zycck/claude-mods plugins/plan-progress/hooks/register.tsx (commit 549ecee), MIT License, (c) 2026 Kirill Serditov. Modified for progress-hud. See THIRD_PARTY_NOTICES.md.
import type { Bar, BarSource, BarState, HudStage, HudStep, Meter, StepStatus } from '../../types'

export type Raw = Record<string, unknown>

// what a call may carry, past which it is refused instead of drawn
export const MAX_STAGES = 12
export const MAX_STEPS = 80
const MAX_TITLE = 80
const MAX_STAGE_NAME = 80
const MAX_NOTE = 160
const MAX_ID = 40

// the reason a call is refused; core/rules.ts turns it into the text the model reads
export type Refusal =
  | { refusal: 'missing'; id: string; titles: string[]; steps: string[] }
  | { refusal: 'nobar'; id: string }
  | { refusal: 'limit' }
  | { refusal: 'reserved'; id: 'tasks' | 'agents:auto' }

export const isRefusal = (v: Bar | Refusal): v is Refusal => 'refusal' in v

export const STATUSES: StepStatus[] = ['pending', 'active', 'done', 'error', 'skipped']
export const STATES: BarState[] = ['running', 'needs_input', 'error', 'done']

export const str = (v: unknown, max = 120) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')
const status = (v: unknown): StepStatus => (STATUSES.includes(v as StepStatus) ? (v as StepStatus) : 'pending')
const list = (v: unknown): Raw[] => (Array.isArray(v) ? v.filter(x => x && typeof x === 'object') : []) as Raw[]
export const isFinished = (s: StepStatus) => s === 'done' || s === 'skipped'

// full-width and half-width forms match; an engine without String.prototype.normalize falls back to trim + lowercase
const fold = (s: string) => (typeof s.normalize === 'function' ? s.normalize('NFKC') : s).trim().toLowerCase()
export const same = (a: string, b: string) => fold(a) === fold(b)

export const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '')
    .slice(0, MAX_ID) || 'plan'

// short updates: {next:true}, {done:[titles]}, {skip:[titles]}, {active:title}, {failed:title} against the stored stages;
// titles it cannot find come back in missing, so the call is refused instead of passing as a success
export function applyOps(stages: readonly HudStage[], input: Raw, now: number): { stages: HudStage[]; missing: string[] } {
  const next = stages.map(s => ({ ...s, steps: s.steps.map(st => ({ ...st })) }))
  const steps = next.flatMap(s => s.steps)
  const missing: string[] = []
  // a step finishing now remembers when, for the time its checkpoint shows
  const finish = (st: HudStep, to: 'done' | 'skipped' = 'done') => {
    if (!isFinished(st.status)) Object.assign(st, { status: to, doneAt: now })
  }
  // a title used twice means the one still open
  const find = (title: string) => {
    const found = steps.find(st => same(st.title, title) && !isFinished(st.status)) ?? steps.find(st => same(st.title, title))
    if (!found) missing.push(title)
    return found
  }
  // the first pending step after `from` becomes the active one; past the last step, work goes back to one left open earlier
  const activateNext = (from: number) => {
    const following = steps.slice(from + 1).find(st => st.status === 'pending') ?? steps.find(st => st.status === 'pending')
    if (following) following.status = 'active'
  }
  if (input.next === true) {
    const active = steps.findIndex(st => st.status === 'active')
    const at = active >= 0 ? active : steps.findIndex(st => !isFinished(st.status))
    const cur = steps[at]
    if (cur) finish(cur)
    activateNext(at)
  }
  let lastDone = -1
  for (const [titles, to] of [[input.done, 'done'], [input.skip, 'skipped']] as const) {
    for (const t of Array.isArray(titles) ? titles : []) {
      const st = typeof t === 'string' ? find(t) : undefined
      if (st?.status === 'active') lastDone = steps.indexOf(st)
      if (st) finish(st, to)
    }
  }
  // finishing the step in progress moves on, as next does, unless the call names the new one itself
  if (lastDone >= 0 && typeof input.active !== 'string' && !steps.some(st => st.status === 'active')) activateNext(lastDone)
  const active = typeof input.active === 'string' ? find(input.active) : undefined
  if (active) {
    const at = steps.indexOf(active)
    steps.forEach((st, i) => {
      if (st.status === 'active' && i !== at) {
        if (i < at) finish(st)
        else st.status = 'pending'
      }
    })
    active.status = 'active'
  }
  const failed = typeof input.failed === 'string' ? find(input.failed) : undefined
  if (failed) failed.status = 'error'

  return { stages: next, missing }
}

// a resent plan keeps what is finished: a step sent as pending under a title that was done stays done
export function carryDone(stages: readonly HudStage[], before: readonly HudStage[]): HudStage[] {
  const finished = new Map(before.flatMap(s => s.steps).filter(st => isFinished(st.status)).map(st => [fold(st.title), st]))
  return stages.map(s => ({
    ...s,
    steps: s.steps.map(st => {
      const was = finished.get(fold(st.title))
      return was && (st.status === 'pending' || st.status === was.status) ? { ...st, status: was.status, doneAt: was.doneAt } : st
    }),
  }))
}

// with nothing in progress, the first open step is the current one
export function pointAt(stages: readonly HudStage[]): HudStage[] {
  const steps = stages.flatMap(s => s.steps)
  if (steps.some(st => st.status === 'active' || st.status === 'error')) return [...stages]
  const first = steps.find(st => st.status === 'pending')
  return stages.map(s => ({ ...s, steps: s.steps.map(st => (st === first ? { ...st, status: 'active' as const } : st)) }))
}

// a bar with nothing on it yet; rev is bumped by placeBar, not here
export function newBar(id: string, source: BarSource, now: number, meter: Meter): Bar {
  return {
    id, rev: 0, title: 'Plan', kind: 'plan', source, stages: [], state: 'running', note: null,
    startedAt: now, endedAt: null, updatedAt: now, meterStart: meter, meterEnd: null,
    agents: [], agentsDoneAt: null, mainErrors: 0, mainStreak: 0, lastErrorTool: null, collapsed: false,
  }
}

// the new bar, or the refusal for a call that names steps the bar does not have.
// prev must be read inside the same update() that stores the result, so the agents and counters it carries are the latest
export function normalize(input: Raw, prev: Bar | null, now: number, id: string, meter: Meter, source: BarSource = 'tool'): Bar | Refusal {
  const sent = list(input.stages)
    .map(s => ({
      name: str(s.name, MAX_STAGE_NAME) || 'Stage',
      steps: list(s.steps).map(st => ({ title: str(st.title) || 'Step', status: status(st.status) })),
    }))
    .filter(s => s.steps.length > 0) as HudStage[]
  if (sent.length > MAX_STAGES || sent.reduce((n, s) => n + s.steps.length, 0) > MAX_STEPS) return { refusal: 'limit' }
  if (sent.length === 0 && !prev) return { refusal: 'nobar', id }
  const isPartial = sent.length === 0 && prev !== null
  // a resent plan keeps what was finished; short ops sent along with it apply on top
  const base = isPartial ? prev.stages : pointAt(prev ? carryDone(sent, prev.stages) : sent)
  const { stages, missing } = applyOps(base, input, now)
  if (missing.length > 0 && base.length > 0) {
    return { refusal: 'missing', id, titles: missing.map(t => str(t, 60)), steps: stages.flatMap(s => s.steps.map(st => st.title)) }
  }
  const title = str(input.title, MAX_TITLE) || prev?.title || 'Plan'
  const steps = stages.flatMap(s => s.steps)
  const isAllDone = steps.length > 0 && steps.every(s => isFinished(s.status))
  const asked = STATES.find(s => s === input.state)
  const failedNow = typeof input.failed === 'string'
  const state: BarState = asked ?? (isAllDone ? 'done' : failedNow ? 'error' : 'running')
  const was = prev ?? newBar(id, source, now, meter)

  return {
    ...was,
    title,
    kind: input.kind === 'todo' || (isPartial && prev?.kind === 'todo') ? 'todo' : 'plan',
    stages,
    state,
    note: str(input.note, MAX_NOTE) || null,
    endedAt: state === 'done' ? (prev?.endedAt ?? now) : null,
    updatedAt: now,
    meterEnd: state === 'done' ? (prev?.meterEnd ?? meter) : null,
  }
}

type Where = { pos: number; total: number; stage: number; step: number; stageSize: number }

// pos counts the finished steps wherever they are; the current step is the active one, else the first still open
export function where(p: Pick<Bar, 'state' | 'stages'>): Where {
  const steps = p.stages.flatMap((s, i) => s.steps.map((step, j) => ({ i, j, step })))
  const pos = p.state === 'done' ? steps.length : steps.filter(x => isFinished(x.step.status)).length
  const cur = p.state === 'done' ? undefined : (steps.find(x => x.step.status === 'active') ?? steps.find(x => !isFinished(x.step.status)))
  const stage = (cur ?? steps[steps.length - 1])?.i ?? 0

  return { pos, total: steps.length, stage, step: cur ? cur.j + 1 : (p.stages[stage]?.steps.length ?? 0), stageSize: p.stages[stage]?.steps.length ?? 0 }
}

// how long each finished step took (from the previous finish, or the bar's start) and each finished stage
export function stepTimes(p: Pick<Bar, 'stages' | 'startedAt'>): { steps: Map<HudStep, number>; stages: (number | undefined)[] } {
  const ends = p.stages.flatMap(s => s.steps).flatMap(st => (st.doneAt === undefined ? [] : [st.doneAt])).sort((a, b) => a - b)
  const startOf = (at: number) => Math.max(p.startedAt, ...ends.filter(t => t < at))
  const steps = new Map<HudStep, number>()
  const stages = p.stages.map(s => {
    for (const st of s.steps) if (st.doneAt !== undefined) steps.set(st, st.doneAt - startOf(st.doneAt))
    const times = s.steps.map(st => st.doneAt)
    if (times.some(t => t === undefined)) return undefined
    const done = times as number[]
    return Math.max(...done) - Math.min(...done.map(startOf))
  })
  return { steps, stages }
}
