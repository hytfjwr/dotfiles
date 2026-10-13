// Derived from zycck/claude-mods plugins/plan-progress/hooks/register.tsx (commit 549ecee), MIT License, (c) 2026 Kirill Serditov. Modified for progress-hud. See THIRD_PARTY_NOTICES.md.
import type { HudStage, StepStatus } from '../../types'
import { MAX_STAGES, MAX_STEPS } from './model'

export type ParsedPlan = { title: string; kind: 'plan' | 'todo'; stages: HudStage[] }

export const clean = (s: string) =>
  s
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]/g, '')
    .replace(/^\s*(\d+[.)]|[-*+]|\[[ xX]\])\s+/, '')
    .replace(/^(\d+[.)]|\[[ xX]\])\s+/, '')
    .trim()

// an approved plan-mode plan as stages and steps; null when it holds nothing a bar could show.
// Items nested under a step are not steps of their own, so under a heading they are left out.
// The result stays within the stage and step limits, since an approved plan cannot be refused
export function parsePlan(markdown: string): ParsedPlan | null {
  let title = ''
  const headed: HudStage[] = []
  const items: { depth: number; text: string; status: StepStatus }[] = []
  for (const line of markdown.split(/\r?\n/)) {
    const h = line.match(/^(#{1,4})\s+(.*)$/)
    if (h) {
      const text = clean(h[2] ?? '')
      if (h[1] === '#' && !title) title = text
      else headed.push({ name: text, steps: [] })
      continue
    }
    const li = line.match(/^(\s*)(\d+[.)]|[-*+])\s+(.*)$/)
    if (!li) continue
    const depth = Math.floor((li[1] ?? '').replace(/\t/g, '  ').length / 2)
    const text = clean(li[3] ?? '').slice(0, 120)
    if (!text) continue
    // a ticked box is a step the plan already counts as done
    const status: StepStatus = /^\[[xX]\]\s/.test(li[3] ?? '') ? 'done' : 'pending'
    items.push({ depth, text, status })
    const stage = headed[headed.length - 1]
    if (stage && (depth === 0 || stage.steps.length === 0)) stage.steps.push({ title: text, status })
  }
  let stages = headed.filter(s => s.steps.length > 0)
  if (stages.length === 0) {
    if (items.some(i => i.depth > 0)) {
      for (const item of items) {
        const stage = stages[stages.length - 1]
        if (item.depth === 0 || !stage) stages.push({ name: item.text, steps: [] })
        else stage.steps.push({ title: item.text, status: item.status })
      }
      stages = stages.map(s => (s.steps.length ? s : { ...s, steps: [{ title: s.name, status: 'pending' }] }))
    } else if (items.length > 0) {
      stages = [{ name: 'Tasks', steps: items.map(i => ({ title: i.text, status: i.status })) }]
    }
  }
  if (stages.length === 0) return null

  let room = MAX_STEPS
  stages = stages.slice(0, MAX_STAGES).flatMap(s => {
    const steps = s.steps.slice(0, Math.max(room, 0))
    room -= steps.length
    return steps.length > 0 ? [{ ...s, steps }] : []
  })

  return { title: title || 'Plan', kind: stages.length === 1 ? 'todo' : 'plan', stages }
}
