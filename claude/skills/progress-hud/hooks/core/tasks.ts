import type { Bar, HudStep, StepStatus } from '../../types'
import { TEXT } from '../view/i18n'
import { TASKS_ID, settleBar } from './bars'
import type { Ctx } from './bars'
import type { Lang } from './config'
import { isRecord } from './guards'
import { MAX_STEPS, isFinished, newBar, same, str } from './model'

// the title of the tasks bar, and the stage name while no task is in progress
export const TASKS_TITLE: Record<Lang, string> = { ja: TEXT.ja['bar.tasks'], en: TEXT.en['bar.tasks'] }

// the three built-in task tools as the mirror reads them: input and result stay unknown and are checked here (the result type of
// a matched tool is a union of all three). A shape that is not the expected one changes nothing: the bar comes back as it was

const rec = (v: unknown): Record<string, unknown> | null => (isRecord(v) ? v : null)
const id = (v: unknown) => (typeof v === 'string' && v !== '' ? v : typeof v === 'number' ? String(v) : null)
const STATUS: Record<string, StepStatus> = { pending: 'pending', in_progress: 'active', completed: 'done' }

const allFinished = (steps: readonly HudStep[]) => steps.length > 0 && steps.every(s => isFinished(s.status))
const stepsOf = (bar: Bar | null) => bar?.stages.flatMap(s => s.steps) ?? []

// a new tasks bar; strips on the old one stay
function fresh(prev: Bar | null, ctx: Ctx): Bar {
  return { ...newBar(TASKS_ID, 'tasks', ctx.now, ctx.meter), title: TASKS_TITLE[ctx.lang], kind: 'todo', agents: prev?.agents ?? [], agentsDoneAt: prev?.agentsDoneAt ?? null }
}

// the bar with these steps and stage name: all finished is done, a done bar with open work is running again, any other state stays
function rebuild(base: Bar, steps: HudStep[], name: string, ctx: Ctx): Bar {
  const state = allFinished(steps) ? 'done' : base.state === 'done' ? 'running' : base.state
  return settleBar({ ...base, stages: [{ name, steps }], state, note: state === 'done' ? null : base.note, updatedAt: ctx.now }, ctx)
}

// the TaskCreate that succeeded: input { subject }, result { task: { id, subject } }
export function onTaskCreate(bar: Bar | null, input: unknown, result: unknown, ctx: Ctx): Bar | null {
  const task = rec(rec(result)?.task)
  const taskId = id(task?.id)
  const title = str(rec(input)?.subject, 120) || str(task?.subject, 120)
  if (!taskId || !title) return bar
  const base = !bar || bar.state === 'done' ? fresh(bar, ctx) : bar
  const steps = stepsOf(base)
  if (steps.length >= MAX_STEPS || steps.some(s => s.taskId === taskId)) return bar
  return rebuild(base, [...steps, { title, status: 'pending', taskId }], base.stages[0]?.name ?? TASKS_TITLE[ctx.lang], ctx)
}

// the TaskUpdate that succeeded: input { taskId, status?, subject?, activeForm? }; a task the bar does not know is ignored.
// The stage name is the activeForm of the task now in progress, else the word for tasks
export function onTaskUpdate(bar: Bar | null, input: unknown, result: unknown, ctx: Ctx): Bar | null {
  const i = rec(input)
  const taskId = id(i?.taskId)
  if (!bar || !i || !taskId || rec(result)?.success === false) return bar
  const steps = stepsOf(bar)
  const at = steps.findIndex(s => s.taskId === taskId)
  const cur = steps[at]
  if (!cur) return bar
  const asked = typeof i.status === 'string' ? i.status : undefined
  let next = steps
  if (asked === 'deleted') next = steps.filter((_, k) => k !== at)
  else {
    const status = (asked && STATUS[asked]) || cur.status
    const title = str(i.subject, 120) || cur.title
    const { doneAt: _was, ...rest } = cur
    const updated: HudStep = status === 'done' ? { ...rest, title, status, doneAt: cur.doneAt ?? ctx.now } : { ...rest, title, status }
    next = steps.map((s, k) => (k === at ? updated : s))
  }
  if (next.length === 0) return null
  const word = TASKS_TITLE[ctx.lang]
  const form = asked === 'in_progress' ? str(i.activeForm, 80) : ''
  const name = next.some(s => s.status === 'active') ? form || (bar.stages[0]?.name ?? word) : word
  if (JSON.stringify(next) === JSON.stringify(steps) && name === bar.stages[0]?.name) return bar
  return rebuild(bar, next, name, ctx)
}

// TodoWrite: the whole list replaces the steps; a content that was done keeps its doneAt.
// An empty or unreadable list changes nothing. A new list with open work on a done bar starts the bar again
export function onTodoWrite(bar: Bar | null, input: unknown, ctx: Ctx): Bar | null {
  const todos = rec(input)?.todos
  if (!Array.isArray(todos)) return bar
  const prev = stepsOf(bar)
  const items = todos.flatMap(t => {
    const r = rec(t)
    const title = str(r?.content, 120)
    return r && title ? [{ title, status: (typeof r.status === 'string' && STATUS[r.status]) || 'pending', form: str(r.activeForm, 80) }] : []
  }).slice(0, MAX_STEPS)
  if (items.length === 0) return bar
  const steps: HudStep[] = items.map(t => {
    const was = prev.find(s => s.status === 'done' && same(s.title, t.title))
    return t.status === 'done' ? { title: t.title, status: 'done', doneAt: was?.doneAt ?? ctx.now } : { title: t.title, status: t.status }
  })
  const word = TASKS_TITLE[ctx.lang]
  const name = items.find(t => t.status === 'active')?.form || word
  const base = bar && !(bar.state === 'done' && !allFinished(steps)) ? bar : fresh(bar, ctx)
  if (bar && base === bar && JSON.stringify(steps) === JSON.stringify(prev) && name === bar.stages[0]?.name) return bar
  return rebuild(base, steps, name, ctx)
}
