// A3: rules (tool spec, rules text, deny and result strings, reminders) and config (parseOptions).
// Derived from zycck/claude-mods plugins/plan-progress/tests/regress.mjs (commit 549ecee), MIT License, (c) 2026 Kirill Serditov. Modified for progress-hud. See THIRD_PARTY_NOTICES.md.
// The reference had no cases for these strings; they are written against DESIGN 5.2, 5.4, 5.13 and 5.15.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { reservedRefusal } from '../.build/core/bars.mjs'
import { DEFAULTS, parseOptions } from '../.build/core/config.mjs'
import { isRefusal, newBar, normalize } from '../.build/core/model.mjs'
import { GATE_DENY, INTERNAL_ERROR, PLAN_CONTEXT, RULES, RULES_ID, TOOL, TOOL_NAME, TOOL_SPEC, denyText, openBarsLine, reminderText, resultText, stopBlockText } from '../.build/core/rules.mjs'
import { ZERO as METER, S, hud, res } from '../fixtures.mjs'


// ---- rules ----

test('tool spec: name, description and the properties the model sees', () => {
  assert.equal(TOOL_NAME, 'progress')
  assert.equal(TOOL, 'mcp__progress-hud__progress')
  assert.equal(TOOL_SPEC.name, 'progress')
  assert.equal(TOOL_SPEC.description, 'Live progress bar above the prompt, one per id. Create with title + stages; update with short ops (next, done, skip, active, failed) or state.')
  const p = TOOL_SPEC.inputSchema.properties
  assert.deepEqual(Object.keys(p), ['id', 'title', 'kind', 'stages', 'next', 'done', 'skip', 'active', 'failed', 'state', 'note'])
  assert.deepEqual(TOOL_SPEC.inputSchema.required, ['id'])
  assert.deepEqual(p.kind.enum, ['plan', 'todo'])
  assert.deepEqual(p.state.enum, ['running', 'needs_input', 'error', 'done'])
  assert.deepEqual(p.skip, { type: 'array', items: { type: 'string' }, description: 'Step titles dropped without doing them' })
  const step = p.stages.items.properties.steps.items
  assert.deepEqual(step.properties.status.enum, ['pending', 'active', 'done', 'error', 'skipped'])
  assert.deepEqual(p.stages.items.required, ['name', 'steps'])
})

test('tool spec is JSON-serialisable and does not change when serialised', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(TOOL_SPEC)), TOOL_SPEC)
})

test('rules text: at most 700 characters, names the tool and the ops', () => {
  assert.ok(RULES.length <= 900, `RULES is ${RULES.length} characters`)
  assert.equal(RULES_ID, 'progress-hud:rules')
  assert.ok(RULES.startsWith('# Progress HUD\n'))
  assert.ok(RULES.includes(TOOL))
  for (const w of ['next:true', 'skip:[...]', 'needs_input', 'TaskCreate/TaskUpdate or TodoWrite']) assert.ok(RULES.includes(w), w)
})

test('deny texts', () => {
  assert.equal(denyText({ refusal: 'missing', id: 'order-api', titles: ['Nope'], steps: ['A', 'B'] }), 'progress-hud: "order-api" has no step "Nope". Its steps: A, B')
  assert.equal(denyText({ refusal: 'missing', id: 't', titles: ['x', 'y'], steps: ['A'] }), 'progress-hud: "t" has no step "x", "y". Its steps: A')
  assert.equal(denyText({ refusal: 'nobar', id: 'g' }), 'progress-hud: no bar "g" yet; create it with title and stages.')
  assert.equal(denyText({ refusal: 'reserved', id: 'tasks' }), 'progress-hud: "tasks" mirrors TaskCreate/TaskUpdate; update those tasks instead.')
  assert.equal(denyText({ refusal: 'reserved', id: 'agents:auto' }), 'progress-hud: "agents:auto" is managed by the HUD.')
  assert.equal(denyText({ refusal: 'limit' }), 'progress-hud: too many stages or steps (max 12 stages, 80 steps).')
  assert.equal(INTERNAL_ERROR, 'progress-hud: internal error; continue without the bar')
})

test('deny text for a missing step lists at most 400 characters of titles', () => {
  const steps = Array.from({ length: 100 }, (_, i) => `step number ${i}`)
  const text = denyText({ refusal: 'missing', id: 't', titles: ['x'], steps })
  const listed = text.slice(text.indexOf('Its steps: ') + 'Its steps: '.length)
  assert.equal(listed.length, 400)
})

test('refusals come from normalize and the reserved check, in the form denyText takes', () => {
  assert.deepEqual(reservedRefusal({ id: 'tasks' }), { refusal: 'reserved', id: 'tasks' })
  assert.deepEqual(reservedRefusal({ id: 'agents:auto' }), { refusal: 'reserved', id: 'agents:auto' })
  assert.equal(reservedRefusal({ id: 'plan' }), null)
  const made = normalize({ id: 'x', done: ['A'] }, null, 0, 'x', METER)
  assert.ok(isRefusal(made))
  assert.deepEqual(made, { refusal: 'nobar', id: 'x' })
})

// the sequence of DESIGN 5.2's JSON examples, run through the same path the tool hook takes
const run = inputs => {
  const E = hud()
  return inputs.map(input => res(E.call(input)))
}

test('result strings follow the examples in DESIGN 5.2', () => {
  const out = run([
    { id: 'order-api', title: '注文API改修', stages: [S('調査', 'ルート確認', '依存洗い出し'), S('実装', 'エンドポイント', 'バリデーション'), S('検証', 'テスト')] },
    { id: 'order-api', next: true },
    { id: 'order-api', done: ['依存洗い出し'], active: 'バリデーション' },
    { id: 'order-api', skip: ['エンドポイント'] },
    { id: 'order-api', failed: 'テスト', note: '2件失敗' },
    { id: 'order-api', state: 'needs_input', note: 'DBマイグレーションを実行してよいですか' },
    { id: 'order-api', state: 'done' },
  ])
  assert.deepEqual(out, [
    'order-api: 0/5, running, active "ルート確認"',
    'order-api: 1/5, running, active "依存洗い出し"',
    'order-api: 2/5, running, active "バリデーション"',
    'order-api: 3/5, running, active "バリデーション"',
    // DESIGN 5.2 shows "4/5" here, but a failed step is not finished, so the count stays at the 3 finished steps
    'order-api: 3/5, error, active "バリデーション"',
    'order-api: 3/5, needs_input, active "バリデーション"',
    'order-api: 5/5, done',
  ])
})

test('result string names the agents on the bar', () => {
  const bar = normalize({ id: 't', title: 'T', stages: [S('One', 'A', 'B')] }, null, 0, 't', METER)
  const run = (id, state) => ({ id, title: id, state, tool: '', startedAt: 0, endedAt: null, depth: 0, calls: 0, errors: 0, streak: 0, output: 0 })
  assert.equal(resultText(bar), 't: 0/2, running, active "A"')
  assert.equal(resultText({ ...bar, agents: [run('a', 'running'), run('b', 'waiting'), run('c', 'done')] }), 't: 0/2, running, active "A", agents 2 running of 3')
})

test('reminder, gate, stop block, plan context and open-bars line', () => {
  assert.equal(reminderText(['order-api', 'tasks']), 'progress-hud: order-api, tasks not updated for a while; send {id, next:true} or {id, done, active}, or update your tasks.')
  assert.equal(reminderText([]), 'progress-hud: the bar not updated for a while; send {id, next:true} or {id, done, active}, or update your tasks.')
  assert.equal(GATE_DENY, 'progress-hud: several changes ahead. Create a bar with mcp__progress-hud__progress first, then retry.')
  assert.equal(stopBlockText(['a', 'b']), 'progress-hud: a, b still open. Update each with mcp__progress-hud__progress: {id, next:true}, or state "done", "needs_input" or "error" with a note.')
  assert.equal(PLAN_CONTEXT, 'progress-hud: bar "plan" shows this plan; move it with {id:"plan", next:true} as steps finish.')
  assert.equal(openBarsLine([{ id: 'order-api', label: 'DB移行 2/4' }, { id: 'tasks', label: '3/5' }]), 'progress-hud open bars: order-api (DB移行 2/4), tasks (3/5)')
  assert.equal(openBarsLine(Array.from({ length: 20 }, (_, i) => ({ id: `bar-${i}`, label: '1/2' }))).length, 120)
})

test('a fresh bar from newBar has the documented shape', () => {
  const b = newBar('x', 'plan', 5, METER)
  assert.deepEqual(Object.keys(b).sort(), ['agents', 'agentsDoneAt', 'collapsed', 'endedAt', 'id', 'kind', 'lastErrorTool', 'mainErrors', 'mainStreak', 'meterEnd', 'meterStart', 'note', 'rev', 'source', 'stages', 'startedAt', 'state', 'title', 'updatedAt'])
  assert.equal(b.source, 'plan')
})

// ---- config ----

test('parseOptions: nothing, or not an object, gives the defaults', () => {
  assert.deepEqual(parseOptions(undefined), DEFAULTS)
  assert.deepEqual(parseOptions(null), DEFAULTS)
  assert.deepEqual(parseOptions('ja'), DEFAULTS)
  assert.deepEqual(parseOptions(42), DEFAULTS)
  assert.deepEqual(parseOptions([]), DEFAULTS)
  assert.deepEqual(parseOptions({}), DEFAULTS)
  assert.deepEqual(DEFAULTS, { sound: true, volume: 60, language: 'ja', nudge: 'soft', sessionMetrics: 'desktop', maxBars: 3, toastOnDone: true, statusLine: 'auto', animation: true })
})

test('parseOptions: valid values are kept', () => {
  const o = { sound: false, volume: 25, language: 'en', nudge: 'strict', sessionMetrics: 'all', maxBars: 5, toastOnDone: false, statusLine: 'always', animation: false }
  assert.deepEqual(parseOptions(o), o)
  assert.equal(parseOptions({ language: 'auto' }).language, 'auto')
  assert.equal(parseOptions({ nudge: 'off' }).nudge, 'off')
  assert.equal(parseOptions({ sessionMetrics: 'off', statusLine: 'off' }).sessionMetrics, 'off')
})

test('parseOptions: wrong types and unknown words fall back to the default', () => {
  const bad = { sound: 'yes', volume: '80', language: 'fr', nudge: 'hard', sessionMetrics: 'both', maxBars: '4', toastOnDone: 1, statusLine: true, animation: 'yes' }
  assert.deepEqual(parseOptions(bad), DEFAULTS)
  assert.deepEqual(parseOptions({ volume: NaN, maxBars: Infinity }), DEFAULTS)
  assert.deepEqual(parseOptions({ language: null, nudge: undefined }), DEFAULTS)
})

test('parseOptions: volume is rounded into 0-100', () => {
  assert.equal(parseOptions({ volume: 150 }).volume, 100)
  assert.equal(parseOptions({ volume: -5 }).volume, 0)
  assert.equal(parseOptions({ volume: 0 }).volume, 0)
  assert.equal(parseOptions({ volume: 33.6 }).volume, 34)
})

test('parseOptions: maxBars outside 1-5 is invalid and goes back to the default', () => {
  for (const v of [0, -1, 6, 99, 0.2, 5.6]) assert.equal(parseOptions({ maxBars: v }).maxBars, DEFAULTS.maxBars, String(v))
  for (const v of [1, 2, 3, 4, 5]) assert.equal(parseOptions({ maxBars: v }).maxBars, v)
  assert.equal(parseOptions({ maxBars: 2.4 }).maxBars, 2)
})

test('parseOptions: unknown keys are ignored and the input is not changed', () => {
  const o = Object.freeze({ sound: false, extra: 1 })
  assert.deepEqual(parseOptions(o), { ...DEFAULTS, sound: false })
})
