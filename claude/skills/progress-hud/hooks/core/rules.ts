// Derived from zycck/claude-mods plugins/plan-progress/hooks/register.tsx (commit 549ecee), MIT License, (c) 2026 Kirill Serditov. Modified for progress-hud. See THIRD_PARTY_NOTICES.md.
import type { Bar } from '../../types'
import { isLive } from './agents'
import { TASKS_ID } from './bars'
import { STATUSES, str, where } from './model'
import type { Refusal } from './model'

export const TOOL_NAME = 'progress'
export const TOOL = 'mcp__progress-hud__progress'
export const RULES_ID = 'progress-hud:rules'

// substeps are left out: the bar never draws them and short ops cannot reach them
const STEP_SCHEMA = {
  type: 'object',
  required: ['title'],
  properties: {
    title: { type: 'string' },
    status: { enum: STATUSES, description: 'Default pending' },
  },
}

// what the tool registration takes: the model reads the description and the schema
export const TOOL_SPEC = {
  name: TOOL_NAME,
  description: 'Live progress bar above the prompt, one per id. Create with title + stages; update with short ops (next, done, skip, active, failed) or state.',
  inputSchema: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', description: 'Bar id; reuse it for updates' },
      title: { type: 'string' },
      kind: { enum: ['plan', 'todo'] },
      stages: {
        type: 'array',
        description: 'Full breakdown: when creating, or resent under the same id when the plan changes',
        items: { type: 'object', required: ['name', 'steps'], properties: { name: { type: 'string' }, steps: { type: 'array', items: STEP_SCHEMA } } },
      },
      next: { type: 'boolean', description: 'Active step finished, start the next one' },
      done: { type: 'array', items: { type: 'string' }, description: 'Step titles now finished' },
      skip: { type: 'array', items: { type: 'string' }, description: 'Step titles dropped without doing them' },
      active: { type: 'string', description: 'Step title now in progress' },
      failed: { type: 'string', description: 'Step title that failed' },
      state: { enum: ['running', 'needs_input', 'error', 'done'] },
      note: { type: 'string', description: 'One line for needs_input or error' },
    },
  },
}

// the section prompt.compose adds; at most 700 characters
export const RULES = `# Progress HUD
Use the live bar proactively, without being asked. For any work with 2+ steps, edits or commands, put it on the bar BEFORE the first step and keep it current until the work ends. If you track it with TaskCreate/TaskUpdate or TodoWrite, that list is the bar: keep its statuses current. For staged work use ${TOOL} instead: create once {id, title, stages:[{name, steps:[{title}]}]} (2-7 stages, titles of at most 4 words in the user's language), then short ops: {id, next:true}, {id, done:[...], active:"..."}, {id, skip:[...]}, {id, failed:"...", note}. Resend stages under the same id when the plan changes. Before asking the user to decide, send {id, state:"needs_input", note}. Skip the bar only for one-step answers. Never describe the bar to the user.`

export const INTERNAL_ERROR = 'progress-hud: internal error; continue without the bar'

// the refusal the model reads and retries from
export function denyText(r: Refusal): string {
  switch (r.refusal) {
    case 'missing':
      return `progress-hud: "${r.id}" has no step ${r.titles.map(t => `"${t}"`).join(', ')}. Its steps: ${r.steps.join(', ').slice(0, 400)}`
    case 'nobar':
      return `progress-hud: no bar "${r.id}" yet; create it with title and stages.`
    case 'limit':
      return 'progress-hud: too many stages or steps (max 12 stages, 80 steps).'
    case 'reserved':
      return r.id === TASKS_ID
        ? 'progress-hud: "tasks" mirrors TaskCreate/TaskUpdate; update those tasks instead.'
        : 'progress-hud: "agents:auto" is managed by the HUD.'
  }
}

// the tool's answer: <id>: <done>/<total>, <state>[, active "<title>"][, agents <running> running of <n>]
export function resultText(bar: Bar): string {
  const w = where(bar)
  const active = bar.state === 'done' ? undefined : bar.stages.flatMap(s => s.steps).find(st => st.status === 'active')
  const live = bar.agents.filter(isLive).length
  const agents = bar.agents.length ? `, agents ${live} running of ${bar.agents.length}` : ''

  return `${bar.id}: ${Math.min(w.pos, w.total)}/${w.total}, ${bar.state}${active ? `, active "${active.title}"` : ''}${agents}`
}

// added to the context of an ExitPlanMode result once the plan is on the bar
export const PLAN_CONTEXT = 'progress-hud: bar "plan" shows this plan; move it with {id:"plan", next:true} as steps finish.'

// 6 edits without an update (nudge soft and strict); ids are the open bars
export const reminderText = (ids: readonly string[]) =>
  `progress-hud: ${ids.join(', ') || 'the bar'} not updated for a while; send {id, next:true} or {id, done, active}, or update your tasks.`

// nudge strict: the 4th edit without a bar is refused once
export const GATE_DENY = `progress-hud: several changes ahead. Create a bar with ${TOOL} first, then retry.`

// nudge strict: a turn that did work and left a bar unexplained is sent back once at Stop
export const stopBlockText = (ids: readonly string[]) =>
  `progress-hud: ${ids.join(', ')} still open. Update each with ${TOOL}: {id, next:true}, or state "done", "needs_input" or "error" with a note.`

// one line for the model at each prompt while bars are open, at most 120 characters
export function openBarsLine(entries: readonly { id: string; label: string }[]): string {
  return `progress-hud open bars: ${entries.map(e => `${str(e.id, 40)} (${e.label})`).join(', ')}`.slice(0, 120)
}
