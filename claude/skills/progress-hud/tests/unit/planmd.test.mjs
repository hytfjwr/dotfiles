// A2: plan-mode markdown to stages.
// Derived from zycck/claude-mods plugins/plan-progress/tests/regress.mjs (commit 549ecee), MIT License, (c) 2026 Kirill Serditov. Modified for progress-hud. See THIRD_PARTY_NOTICES.md.
// The reference had no direct parser cases (T08 to T10 and T30/T31 reached it through ExitPlanMode); these are written fresh against the ported parser.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MAX_STAGES, MAX_STEPS } from '../.build/core/model.mjs'
import { clean, parsePlan } from '../.build/core/planmd.mjs'

const shape = p => p.stages.map(s => `${s.name}[${s.steps.map(x => `${x.title}:${x.status}`).join(',')}]`).join(' ')

test('headings are stages, the first h1 is the title, list items are steps', () => {
  const p = parsePlan('# Fix login\n\n## Analyse\n- Read code\n- Find bug\n## Fix\n- Patch\n- Test')
  assert.equal(p.title, 'Fix login')
  assert.equal(p.kind, 'plan')
  assert.equal(shape(p), 'Analyse[Read code:pending,Find bug:pending] Fix[Patch:pending,Test:pending]')
})

test('without headings the items form one todo stage', () => {
  const p = parsePlan('Some intro\n- One\n- Two\n3. Three')
  assert.equal(p.title, 'Plan')
  assert.equal(p.kind, 'todo')
  assert.equal(shape(p), 'Tasks[One:pending,Two:pending,Three:pending]')
})

test('without headings, nested items turn their parents into stages', () => {
  const p = parsePlan('# Roadmap\n- Backend\n  - API\n  - DB\n- Frontend\n  - Page')
  assert.equal(p.title, 'Roadmap')
  assert.equal(shape(p), 'Backend[API:pending,DB:pending] Frontend[Page:pending]')
})

test('under a heading, items nested below a step are not steps', () => {
  const p = parsePlan('# T\n## A\n- One\n  - detail a\n  - detail b\n- Two\n    - deeper')
  assert.equal(shape(p), 'A[One:pending,Two:pending]')
})

test('a nested item right under a heading is a step (nothing to nest under)', () => {
  const p = parsePlan('# T\n## A\n  - Indented first\n- Second')
  assert.equal(shape(p), 'A[Indented first:pending,Second:pending]')
})

test('ticked boxes are done, open boxes pending', () => {
  const p = parsePlan('# Ship\n- [x] Read code\n- [X] Find bug\n- [ ] Patch')
  assert.equal(shape(p), 'Tasks[Read code:done,Find bug:done,Patch:pending]')
})

test('Japanese headings and items', () => {
  const p = parsePlan('# 注文API改修\n\n## 調査\n- ルート確認\n- 依存洗い出し\n\n## 実装\n1. エンドポイント\n2) バリデーション')
  assert.equal(p.title, '注文API改修')
  assert.equal(shape(p), '調査[ルート確認:pending,依存洗い出し:pending] 実装[エンドポイント:pending,バリデーション:pending]')
})

test('a second h1 and h3/h4 headings become stages; stages with no steps are dropped', () => {
  const p = parsePlan('# Title\n# Other\n- a\n### Deep\n- b\n#### Empty\n## Also empty')
  assert.equal(p.title, 'Title')
  assert.equal(shape(p), 'Other[a:pending] Deep[b:pending]')
})

test('markup is cleaned from headings and items', () => {
  const p = parsePlan('# **Bold** `title`\n## [Link](http://x.y) stage\n- _emph_ **step**\n- [x] **done** thing')
  assert.equal(p.title, 'Bold title')
  assert.equal(shape(p), 'Link stage[emph step:pending,done thing:done]')
  assert.equal(clean('1. [x] hi'), 'hi')
})

test('CRLF line endings and tab indents', () => {
  const p = parsePlan('# T\r\n## A\r\n- One\r\n\t- nested\r\n- Two\r\n')
  assert.equal(shape(p), 'A[One:pending,Two:pending]')
})

test('a plan with nothing to show is null', () => {
  assert.equal(parsePlan(''), null)
  assert.equal(parsePlan('   \n\n'), null)
  assert.equal(parsePlan('# Only a title'), null)
  assert.equal(parsePlan('## A heading and no steps\nplain text'), null)
  assert.equal(parsePlan('-   \n- **'), null)
})

test('a single stage is a todo, several are a plan', () => {
  assert.equal(parsePlan('# T\n## Only\n- a').kind, 'todo')
  assert.equal(parsePlan('# T\n## One\n- a\n## Two\n- b').kind, 'plan')
})

test('an over-long plan is cut to the stage and step limits', () => {
  const stages = Array.from({ length: 20 }, (_, i) => `## S${i}\n- a${i}\n- b${i}\n- c${i}\n- d${i}\n- e${i}\n- f${i}\n- g${i}`).join('\n')
  const p = parsePlan(`# Big\n${stages}`)
  assert.ok(p.stages.length <= MAX_STAGES)
  assert.equal(p.stages.flatMap(s => s.steps).length, MAX_STEPS)
  const flat = parsePlan(`# Big\n${Array.from({ length: 200 }, (_, i) => `- s${i}`).join('\n')}`)
  assert.equal(flat.stages[0].steps.length, MAX_STEPS)
})

test('step titles are cut at 120 characters', () => {
  const p = parsePlan(`# T\n## A\n- ${'x'.repeat(300)}`)
  assert.equal(p.stages[0].steps[0].title.length, 120)
})

test('the input is not changed', () => {
  const md = '# T\n## A\n- One'
  parsePlan(md)
  assert.equal(md, '# T\n## A\n- One')
})
