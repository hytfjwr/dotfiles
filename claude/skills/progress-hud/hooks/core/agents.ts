// Derived from zycck/claude-mods plugins/plan-progress/hooks/register.tsx (commit 549ecee), MIT License, (c) 2026 Kirill Serditov. Modified for progress-hud. See THIRD_PARTY_NOTICES.md.
import type { AgentRun, Bar, HudStep } from '../../types'
import { TEXT } from '../view/i18n'
import { AGENTS_ID, settleBar } from './bars'
import type { Ctx } from './bars'
import type { Lang } from './config'

export const FOLD_MS = 5000 // finished strips stay this long, failed ones stay until the bar closes

// the words a strip shows in place of a tool name, from the table of words (view/i18n.ts)
const wordsOf = (x: (typeof TEXT)[Lang]) => ({ starting: x['agent.starting'], approval: x['agent.approval'], done: x['agent.done'], failed: x['agent.failed'], stopped: x['agent.stopped'], lost: x['agent.lost'] })
export const TOOL_WORDS: Record<Lang, ReturnType<typeof wordsOf>> = { ja: wordsOf(TEXT.ja), en: wordsOf(TEXT.en) }

// the title and the stage name of the agents bar
export const AGENTS_TITLE: Record<Lang, string> = { ja: TEXT.ja['bar.agents'], en: TEXT.en['bar.agents'] }

// rows of strips per bar, the "+N more" row included: the band above the prompt has room for about 300 px
export const stripBudget = (bars: number) => (bars >= 3 ? 3 : bars === 2 ? 4 : 5)

export const isLive = (a: AgentRun) => a.state === 'running' || a.state === 'waiting'

// a strip whose agent's turn is over: done when it answered; an error when it was interrupted (Stopped) or failed
export function endRun(a: AgentRun, ctx: Pick<Ctx, 'now' | 'lang'>, reason: string, outputTokens = 0): AgentRun {
  const word = reason === 'answer' ? 'done' : reason === 'aborted' ? 'stopped' : 'failed'
  return { ...a, state: reason === 'answer' ? 'done' : 'error', tool: TOOL_WORDS[ctx.lang][word], endedAt: ctx.now, output: a.output + outputTokens }
}

// agentHome (agent id -> bar id) with only the entries `keep` says to keep; the atom itself is named by the caller, in the source
export const keepHomes = (homes: Record<string, string>, keep: (agentId: string, barId: string) => boolean): Record<string, string> =>
  Object.fromEntries(Object.entries(homes).filter(([agentId, barId]) => keep(agentId, barId)))

// claude-haiku-4-5-20251001 -> haiku 4.5; an alias stays as given; with an effort: haiku 4.5 · low
export function modelName(m: string, effort?: string): string {
  const r = /^claude-([a-z]+)-(\d+)-(\d+)/.exec(m)
  const name = r ? `${r[1]} ${r[2]}.${r[3]}` : m
  return effort ? `${name} · ${effort}` : name
}

export function newRun(id: string, title: string, model: string | undefined, depth: 0 | 1, ctx: Pick<Ctx, 'now' | 'lang'>): AgentRun {
  return {
    id, title, state: 'running', tool: TOOL_WORDS[ctx.lang].starting, startedAt: ctx.now, endedAt: null, depth,
    ...(model === undefined ? {} : { model }), calls: 0, errors: 0, streak: 0, output: 0,
  }
}

// the agents bar is the mod's own: it mirrors its agents as steps, finished first, so percent and count read done/total.
// Every bar gets agentsDoneAt: set when its whole batch is over, so the strips fold a few seconds later
export function syncAuto(bar: Bar, ctx: Ctx): Bar {
  const agents = bar.agents
  const isOver = agents.length > 0 && agents.every(a => a.state === 'done' || a.state === 'error')
  const agentsDoneAt = isOver ? (bar.agentsDoneAt ?? ctx.now) : null
  if (bar.id !== AGENTS_ID) return agentsDoneAt === bar.agentsDoneAt ? bar : { ...bar, agentsDoneAt }
  const rank = (a: AgentRun) => (a.state === 'done' ? 0 : a.state === 'error' ? 1 : 2)
  const steps: HudStep[] = [...agents]
    .sort((a, b) => rank(a) - rank(b))
    .map(a => ({ title: a.title, status: a.state === 'done' ? 'done' : a.state === 'error' ? 'error' : 'active' }))
  const state = isOver ? (agents.some(a => a.state === 'error') ? 'error' : 'done') : agents.some(a => a.state === 'waiting') ? 'needs_input' : 'running'
  return settleBar({ ...bar, agentsDoneAt, stages: steps.length > 0 ? [{ name: AGENTS_TITLE[ctx.lang], steps }] : [], state }, ctx)
}

// puts a run on the bar: right after its parent and the parent's other children, else last.
// A batch that has finished makes room for the next one, and a finished agents bar starts its clock again
export function addRun(bar: Bar, run: AgentRun, parentId: string | undefined, ctx: Ctx): Bar {
  const list = bar.agentsDoneAt === null ? [...bar.agents] : []
  let at = list.length
  const parentAt = parentId ? list.findIndex(a => a.id === parentId) : -1
  if (parentAt >= 0) {
    at = parentAt + 1
    while (at < list.length && (list[at]?.depth ?? 0) > 0) at++
  }
  list.splice(at, 0, run)
  const restarted = bar.id === AGENTS_ID && bar.state === 'done' ? { ...bar, startedAt: ctx.now, meterStart: ctx.meter } : bar
  return syncAuto({ ...restarted, agents: list, agentsDoneAt: null }, ctx)
}

// changes one run; the bar comes back as it is when the agent is not on it or the change leaves it as it was
export function editRun(bar: Bar, agentId: string, change: (a: AgentRun) => AgentRun, ctx: Ctx): Bar {
  const run = bar.agents.find(a => a.id === agentId)
  if (!run) return bar
  const changed = change(run)
  if (changed === run) return bar
  return syncAuto({ ...bar, agents: bar.agents.map(a => (a.id === agentId ? changed : a)) }, ctx)
}

// which strips show: all of a small batch; in a big one the unfinished first, the rest folded into one line
export function visibleAgents(bar: Pick<Bar, 'agents' | 'agentsDoneAt'>, now: number, max: number): { shown: AgentRun[]; hidden: AgentRun[] } | null {
  const list = bar.agents
  if (list.length === 0) return null
  const hasError = list.some(a => a.state === 'error')
  if (bar.agentsDoneAt !== null && now - bar.agentsDoneAt > FOLD_MS && !hasError) return null
  if (list.length <= max) return { shown: list, hidden: [] }
  const keep = new Set(list.filter(a => a.state !== 'done').slice(0, max - 1).map(a => a.id))
  for (const a of [...list].reverse()) {
    if (keep.size >= max - 1) break
    keep.add(a.id)
  }
  return { shown: list.filter(a => keep.has(a.id)), hidden: list.filter(a => !keep.has(a.id)) }
}

// what $.agent.list() says of a strip that was running: the state it ends in and the word it shows. Any other status (running) leaves it
type Word = keyof (typeof TOOL_WORDS)[Lang]
const ENDED = new Map<string, readonly ['done' | 'error', Word]>([['completed', ['done', 'done']], ['failed', ['error', 'failed']], ['killed', ['error', 'stopped']]])
const LOST = ['error', 'lost'] as const

// after a reload: a strip still running or waiting is checked against $.agent.list().
// completed is done, failed and killed are errors, and an agent the list does not know is lost
export function reconcile(bar: Bar, listed: readonly { id: string; status: string }[], ctx: Ctx): Bar {
  const words = TOOL_WORDS[ctx.lang]
  let next = bar
  for (const run of bar.agents.filter(isLive)) {
    const status = listed.find(l => l.id === run.id)?.status
    const [state, word] = (status === undefined ? LOST : ENDED.get(status)) ?? []
    if (state && word) next = editRun(next, run.id, a => ({ ...a, state, tool: words[word], endedAt: ctx.now }), ctx)
  }
  return next
}
