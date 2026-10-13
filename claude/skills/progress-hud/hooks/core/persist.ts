import type { Bar, HudStage, Meter } from '../../types'
import { AGENTS_ID } from './bars'
import { isNum, isRecord } from './guards'
import { STATES, STATUSES } from './model'

// what the plugin's store holds under bars:<sessionId>; a contract of this file alone
export type Snapshot = {
  v: 1
  sessionId: string
  savedAt: number
  cwd: string
  root: string // the session's root, to tell worktrees apart
  repo: string | null
  bars: Bar[] // agents: [] on every bar
}
export type Prefs = { density: 'full' | 'compact' }

export const BARS_PREFIX = 'bars:'
export const PREFS_KEY = 'prefs'
export const MAX_SNAPSHOT_CHARS = 96_000
export const MAX_SAVED_SESSIONS = 30
export const KEEP_STEPS = 40

// agents do not outlive the process that ran them, so a bar is stored without strips, and the agents bar, which is only
// a mirror of its strips, is not stored at all; neither are the demo's bars
export function toSnapshot(bars: readonly Bar[], meta: { sessionId: string; cwd: string; root: string; repo: string | null }, now: number): Snapshot {
  return { v: 1, ...meta, savedAt: now, bars: bars.filter(b => b.id !== AGENTS_ID && b.source !== 'demo').map(b => ({ ...b, agents: [], agentsDoneAt: null })) }
}

const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): v is T => allowed.includes(v as T)

function toMeter(v: unknown): Meter | null {
  if (!isRecord(v) || !isNum(v.input) || !isNum(v.output) || !isNum(v.cacheRead) || !isNum(v.cacheWrite)) return null
  if (v.costUsd !== null && !isNum(v.costUsd)) return null
  return { input: v.input, output: v.output, cacheRead: v.cacheRead, cacheWrite: v.cacheWrite, costUsd: v.costUsd }
}

function toStages(v: unknown): HudStage[] | null {
  if (!Array.isArray(v)) return null
  const stages: HudStage[] = []
  for (const s of v) {
    if (!isRecord(s) || typeof s.name !== 'string' || !Array.isArray(s.steps)) return null
    const steps: HudStage['steps'] = []
    for (const st of s.steps) {
      if (!isRecord(st) || typeof st.title !== 'string' || !oneOf(st.status, STATUSES)) return null
      steps.push({ title: st.title, status: st.status, ...(isNum(st.doneAt) ? { doneAt: st.doneAt } : {}), ...(typeof st.taskId === 'string' ? { taskId: st.taskId } : {}) })
    }
    stages.push({ name: s.name, steps })
  }
  return stages
}

// a stored bar, rebuilt field by field; null when its shape is not the current one
function toBar(v: unknown): Bar | null {
  if (!isRecord(v) || typeof v.id !== 'string' || typeof v.title !== 'string') return null
  if (!oneOf(v.kind, ['plan', 'todo']) || !oneOf(v.source, ['tool', 'tasks', 'plan', 'agents', 'demo']) || !oneOf(v.state, STATES)) return null
  if (v.note !== null && typeof v.note !== 'string') return null
  if (!isNum(v.rev) || !isNum(v.startedAt) || !isNum(v.updatedAt) || (v.endedAt !== null && !isNum(v.endedAt))) return null
  const stages = toStages(v.stages)
  const meterStart = toMeter(v.meterStart)
  const meterEnd = v.meterEnd === null ? null : toMeter(v.meterEnd)
  if (!stages || !meterStart || (v.meterEnd !== null && !meterEnd)) return null
  return {
    id: v.id, rev: v.rev, title: v.title, kind: v.kind, source: v.source, stages, state: v.state, note: v.note,
    startedAt: v.startedAt, endedAt: v.endedAt, updatedAt: v.updatedAt, meterStart, meterEnd,
    agents: [], agentsDoneAt: null,
    mainErrors: isNum(v.mainErrors) ? v.mainErrors : 0, mainStreak: isNum(v.mainStreak) ? v.mainStreak : 0,
    lastErrorTool: typeof v.lastErrorTool === 'string' ? v.lastErrorTool : null, collapsed: v.collapsed === true,
  }
}

// the bars of a stored snapshot, without strips; null for a value of another version or shape (it is ignored).
// A bar that does not fit the current shape is dropped, the rest are kept
export function fromSnapshot(v: unknown): Bar[] | null {
  if (!isRecord(v) || v.v !== 1 || !Array.isArray(v.bars)) return null
  return v.bars.flatMap(b => {
    const bar = toBar(b)
    return bar ? [bar] : []
  })
}

export function fromPrefs(v: unknown): Prefs | null {
  return isRecord(v) && oneOf(v.density, ['full', 'compact']) ? { density: v.density } : null
}

const size = (snap: Snapshot) => JSON.stringify(snap).length

// keeps a snapshot under the size limit: finished bars go first, oldest first; then every bar keeps its last 40 steps
export function fitSize(snap: Snapshot): Snapshot {
  if (size(snap) <= MAX_SNAPSHOT_CHARS) return snap
  let bars = [...snap.bars]
  while (size({ ...snap, bars }) > MAX_SNAPSHOT_CHARS) {
    const at = bars.findIndex(b => b.state === 'done')
    if (at < 0) break
    bars = bars.filter((_, i) => i !== at)
  }
  if (size({ ...snap, bars }) > MAX_SNAPSHOT_CHARS) bars = bars.map(lastSteps)
  return { ...snap, bars }
}

function lastSteps(bar: Bar): Bar {
  let skip = Math.max(0, bar.stages.reduce((n, s) => n + s.steps.length, 0) - KEEP_STEPS)
  const stages = bar.stages.flatMap(s => {
    const drop = Math.min(skip, s.steps.length)
    skip -= drop
    const steps = s.steps.slice(drop)
    return steps.length > 0 ? [{ ...s, steps }] : []
  })
  return { ...bar, stages }
}

// the bars: keys to delete so at most max stay; keys come oldest first, as $.store.keys() lists them
export function pruneKeys(keys: readonly string[], max = MAX_SAVED_SESSIONS): string[] {
  const saved = keys.filter(k => k.startsWith(BARS_PREFIX))
  return saved.slice(0, Math.max(0, saved.length - max))
}
