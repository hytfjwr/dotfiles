// Derived from zycck/claude-mods plugins/plan-progress/hooks/register.tsx (commit 549ecee), MIT License, (c) 2026 Kirill Serditov. Modified for progress-hud. See THIRD_PARTY_NOTICES.md.
import type { Bar, Meter } from '../../types'
import type { Lang } from './config'
import { isFinished, slug, str } from './model'
import type { Raw, Refusal } from './model'

// the mod's own bars: the model never owes them an update
export const TASKS_ID = 'tasks' // mirror of TaskCreate / TaskUpdate / TodoWrite
export const PLAN_ID = 'plan' // the approved plan-mode plan; a revised plan updates it instead of opening a second one
export const AGENTS_ID = 'agents:auto' // slug() never yields ':', so no model id can take it
export const DEMO_PREFIX = 'demo-'

export const isDemoBar = (id: string) => id.startsWith(DEMO_PREFIX)

// the id a progress call names: the given id, else the title
export const barIdOf = (input: Raw): string => slug(str(input.id, 60) || str(input.title, 80))

// tasks and agents:auto are written by the HUD alone; plan and demo-* stay open to the model's own calls
export function reservedRefusal(input: Raw): Refusal | null {
  if (str(input.id, 60).toLowerCase() === AGENTS_ID) return { refusal: 'reserved', id: AGENTS_ID }
  if (barIdOf(input) === TASKS_ID) return { refusal: 'reserved', id: TASKS_ID }
  return null
}

// a running bar with something left to do; the agents bar never counts
export const isOpenBar = (b: Bar) => b.id !== AGENTS_ID && b.state === 'running' && !b.stages.flatMap(s => s.steps).every(s => isFinished(s.status))

// the bar a question to the user pauses: the latest running one, else the tasks mirror; never the agents bar
export function activeBar(bars: readonly Bar[]): Bar | undefined {
  const running = bars.filter(b => b.state === 'running')
  return [...running].reverse().find(b => b.id !== AGENTS_ID && b.id !== TASKS_ID) ?? running.find(b => b.id === TASKS_ID)
}

// a bar after a change: its rev goes up, the cache key of its drawings, and its updatedAt is now
export const touch = (b: Bar, now: number): Bar => ({ ...b, rev: b.rev + 1, updatedAt: now })

// adds or replaces one bar by id and bumps its rev; keeps at most maxBars, dropping finished ones first.
// call it inside update() on the latest list, so concurrent writers (parallel agents) do not drop each other
export function placeBar(list: readonly Bar[], next: Bar, maxBars: number): Bar[] {
  const prev = list.find(b => b.id === next.id)
  const placed = { ...next, rev: (prev?.rev ?? next.rev) + 1 }
  // an update keeps its row; a new bar goes to the bottom
  const rest = prev ? list.map(b => (b.id === next.id ? placed : b)) : [...list, placed]
  while (rest.length > Math.max(1, maxBars)) {
    const doneAt = rest.findIndex(b => b.state === 'done')
    rest.splice(doneAt >= 0 ? doneAt : 0, 1)
  }
  return rest
}

// what a pure reducer needs from the outside: the time, the session's meter and the language of the words it writes
export type Ctx = { now: number; meter: Meter; lang: Lang }

// a bar's end follows its state: a done bar has endedAt and meterEnd (kept once set), any other has neither
export function settleBar(bar: Bar, ctx: Pick<Ctx, 'now' | 'meter'>): Bar {
  if (bar.state === 'done') {
    return bar.endedAt !== null && bar.meterEnd !== null ? bar : { ...bar, endedAt: bar.endedAt ?? ctx.now, meterEnd: bar.meterEnd ?? ctx.meter }
  }
  return bar.endedAt === null && bar.meterEnd === null ? bar : { ...bar, endedAt: null, meterEnd: null }
}
