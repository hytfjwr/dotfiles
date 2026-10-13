// A5: agent strips: addRun, editRun, syncAuto, visibleAgents, reconcile, modelName
// Derived from zycck/claude-mods plugins/plan-progress/tests/regress.mjs (commit 549ecee), MIT License, (c) 2026 Kirill Serditov. Modified for progress-hud. See THIRD_PARTY_NOTICES.md.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FOLD_MS, TOOL_WORDS, addRun, editRun, isLive, modelName, newRun, reconcile, stripBudget, syncAuto, visibleAgents } from '../.build/core/agents.mjs'
import { newBar } from '../.build/core/model.mjs'
import { ZERO as M0, ctx } from '../fixtures.mjs'

const M1 = { ...M0, output: 10, costUsd: 2 }
const bar = (id = 't', over = {}) => ({ ...newBar(id, id === 'agents:auto' ? 'agents' : 'tool', 0, M0), ...over })
const run = (id, over = {}) => ({ ...newRun(id, id, undefined, 0, ctx()), ...over })
const ids = b => b.agents.map(a => `${a.id}${a.depth ? '*' : ''}`).join(' ')
const add = (b, r, parent, c = ctx()) => addRun(b, r, parent, c)

test('modelName: the version of a known id, an alias as given, the effort after a dot', () => {
  assert.equal(modelName('claude-haiku-4-5-20251001'), 'haiku 4.5')
  assert.equal(modelName('claude-sonnet-5-5'), 'sonnet 5.5')
  assert.equal(modelName('claude-opus-4-1-20250805', 'high'), 'opus 4.1 · high')
  assert.equal(modelName('haiku'), 'haiku')
  assert.equal(modelName('haiku', 'low'), 'haiku · low')
})

test('newRun: running, the word for starting, counters at zero; the model only when there is one', () => {
  const r = newRun('a1', 'Scan', 'claude-haiku-4-5', 0, ctx(5000))
  assert.deepEqual(r, { id: 'a1', title: 'Scan', state: 'running', tool: '起動中', startedAt: 5000, endedAt: null, depth: 0, model: 'claude-haiku-4-5', calls: 0, errors: 0, streak: 0, output: 0 })
  const en = newRun('a2', 'Scan', undefined, 1, ctx(1, { lang: 'en' }))
  assert.equal(en.tool, 'Starting')
  assert.equal(en.depth, 1)
  assert.ok(!('model' in en))
  assert.deepEqual(Object.keys(TOOL_WORDS.ja).sort(), Object.keys(TOOL_WORDS.en).sort())
})

test('addRun: strips go last; a child goes right after its parent and the parent\'s other children', () => {
  let b = bar()
  b = add(b, run('p1'))
  b = add(b, run('p2'))
  b = add(b, run('c1', { depth: 1 }), 'p1')
  b = add(b, run('c2', { depth: 1 }), 'p1')
  assert.equal(ids(b), 'p1 c1* c2* p2')
  b = add(b, run('x', { depth: 1 }), 'unknown')
  assert.equal(ids(b), 'p1 c1* c2* p2 x*')
})

test('addRun: a finished batch makes room for the next, and agentsDoneAt clears', () => {
  let b = add(bar(), run('a'))
  b = editRun(b, 'a', a => ({ ...a, state: 'done' }), ctx(2000))
  assert.equal(b.agentsDoneAt, 2000)
  b = add(b, run('b'), undefined, ctx(3000))
  assert.equal(ids(b), 'b')
  assert.equal(b.agentsDoneAt, null)
})

test('syncAuto on a task bar only sets agentsDoneAt; on the agents bar it mirrors the strips as steps', () => {
  let t = add(bar('t'), run('a'))
  assert.equal(t.stages.length, 0)
  t = editRun(t, 'a', a => ({ ...a, state: 'error' }), ctx(2000))
  assert.equal(t.agentsDoneAt, 2000)
  assert.equal(t.state, 'running', 'a task bar keeps its own state')
  const same = syncAuto(t, ctx(9000))
  assert.equal(same, t, 'nothing changed: the same bar')
})

test('agents bar: steps are finished first, then failed, then active, and the name is the bar word', () => {
  let b = bar('agents:auto')
  b = add(b, run('a'))
  b = add(b, run('b'))
  b = add(b, run('c'))
  b = editRun(b, 'c', a => ({ ...a, state: 'done' }), ctx())
  b = editRun(b, 'b', a => ({ ...a, state: 'error' }), ctx())
  assert.deepEqual(b.stages, [{ name: 'エージェント', steps: [{ title: 'c', status: 'done' }, { title: 'b', status: 'error' }, { title: 'a', status: 'active' }] }])
  assert.equal(b.state, 'running')
  assert.equal(add(bar('agents:auto'), run('a'), undefined, ctx(1, { lang: 'en' })).stages[0].name, 'Agents')
})

test('agents bar state: needs_input while one waits; done or error once all are over, with its end and meter', () => {
  let b = add(add(bar('agents:auto'), run('a')), run('b'))
  b = editRun(b, 'a', a => ({ ...a, state: 'waiting' }), ctx())
  assert.equal(b.state, 'needs_input')
  b = editRun(b, 'a', a => ({ ...a, state: 'running' }), ctx())
  assert.equal(b.state, 'running')
  b = editRun(b, 'a', a => ({ ...a, state: 'done' }), ctx(2000))
  b = editRun(b, 'b', a => ({ ...a, state: 'done' }), ctx(3000, { meter: M1 }))
  assert.equal(b.state, 'done')
  assert.equal(b.agentsDoneAt, 3000)
  assert.equal(b.endedAt, 3000)
  assert.deepEqual(b.meterEnd, M1)
  const failed = editRun(add(bar('agents:auto'), run('a')), 'a', a => ({ ...a, state: 'error' }), ctx())
  assert.equal(failed.state, 'error')
  assert.equal(failed.endedAt, null, 'only done has an end')
})

test('agents bar: a new batch after done starts its clock and meter again', () => {
  let b = add(bar('agents:auto'), run('a'), undefined, ctx(1000))
  b = editRun(b, 'a', a => ({ ...a, state: 'done' }), ctx(2000))
  assert.equal(b.state, 'done')
  b = add(b, run('b'), undefined, ctx(9000, { meter: M1 }))
  assert.equal(b.state, 'running')
  assert.equal(b.startedAt, 9000)
  assert.deepEqual(b.meterStart, M1)
  assert.equal(b.endedAt, null)
  assert.equal(b.meterEnd, null)
})

test('editRun: unknown agent or no change gives the same bar; a change gives a new one without touching the old', () => {
  const b = add(bar(), run('a'))
  assert.equal(editRun(b, 'nope', a => ({ ...a, tool: 'x' }), ctx()), b)
  assert.equal(editRun(b, 'a', a => a, ctx()), b)
  const frozen = Object.freeze({ ...b, agents: Object.freeze([...b.agents]) })
  const next = editRun(frozen, 'a', a => ({ ...a, tool: 'Grep' }), ctx())
  assert.equal(next.agents[0].tool, 'Grep')
  assert.equal(b.agents[0].tool, '起動中')
})

test('isLive and stripBudget', () => {
  assert.equal(isLive(run('a')), true)
  assert.equal(isLive(run('a', { state: 'waiting' })), true)
  assert.equal(isLive(run('a', { state: 'done' })), false)
  assert.deepEqual([1, 2, 3, 4].map(stripBudget), [5, 4, 3, 3])
})

const barWith = (states, over = {}) => ({ agents: states.map((s, i) => run(`a${i}`, { state: s })), agentsDoneAt: null, ...over })

test('visibleAgents: a small batch shows whole; none gives null', () => {
  assert.equal(visibleAgents({ agents: [], agentsDoneAt: null }, 0, 5), null)
  const v = visibleAgents(barWith(['running', 'done', 'error']), 0, 3)
  assert.equal(v.shown.length, 3)
  assert.equal(v.hidden.length, 0)
})

test('visibleAgents: in a big batch the unfinished stay, the rest fold; one slot is left for the "+N" row', () => {
  const b = barWith(['done', 'done', 'running', 'done', 'running', 'running', 'done'])
  const v = visibleAgents(b, 0, 4)
  assert.deepEqual(v.shown.map(a => a.id), ['a2', 'a4', 'a5'], 'the three unfinished ones fill the 3 rows next to the "+N" row')
  assert.equal(v.hidden.length, 4)
  assert.equal(v.shown.length + v.hidden.length, 7)
  const few = visibleAgents(barWith(['done', 'done', 'running', 'done', 'done', 'done', 'done']), 0, 4)
  assert.deepEqual(few.shown.map(a => a.id), ['a2', 'a5', 'a6'], 'one unfinished, then the latest finished ones fill up')
  const many = visibleAgents(barWith(Array(6).fill('running')), 0, 3)
  assert.deepEqual(many.shown.map(a => a.id), ['a0', 'a1'])
  assert.equal(many.hidden.length, 4)
})

test('visibleAgents: finished strips fold after 5 s, failed ones stay', () => {
  const done = barWith(['done', 'done'], { agentsDoneAt: 1000 })
  assert.ok(visibleAgents(done, 1000 + FOLD_MS, 5))
  assert.equal(visibleAgents(done, 1000 + FOLD_MS + 1, 5), null)
  const failed = barWith(['done', 'error'], { agentsDoneAt: 1000 })
  assert.ok(visibleAgents(failed, 1000 + 60_000, 5))
})

test('reconcile: completed is done, failed and killed are errors, unknown is lost, running stays', () => {
  let b = bar('t')
  for (const id of ['a1', 'a2', 'a3', 'a4', 'a5', 'a6']) b = add(b, run(id))
  b = editRun(b, 'a6', a => ({ ...a, state: 'done', tool: '完了' }), ctx())
  const listed = [{ id: 'a1', status: 'completed' }, { id: 'a2', status: 'failed' }, { id: 'a3', status: 'killed' }, { id: 'a4', status: 'running' }, { id: 'a6', status: 'failed' }]
  const out = reconcile(b, listed, ctx(7000))
  const by = Object.fromEntries(out.agents.map(a => [a.id, [a.state, a.tool, a.endedAt]]))
  assert.deepEqual(by, {
    a1: ['done', '完了', 7000],
    a2: ['error', '失敗', 7000],
    a3: ['error', '中断', 7000],
    a4: ['running', '起動中', null],
    a5: ['error', '不明', 7000],
    a6: ['done', '完了', b.agents[5].endedAt],
  })
  assert.equal(out.agentsDoneAt, null, 'a4 still runs')
  assert.equal(reconcile(b, [{ id: 'a1', status: 'completed' }], ctx(1, { lang: 'en' })).agents[1].tool, 'Lost')
})

test('reconcile: nothing live or nothing to change gives the same bar; a batch that ends gets agentsDoneAt', () => {
  const b = add(bar(), run('a'))
  assert.equal(reconcile(b, [{ id: 'a', status: 'running' }], ctx()), b)
  const empty = bar()
  assert.equal(reconcile(empty, [], ctx()), empty)
  const out = reconcile(b, [{ id: 'a', status: 'completed' }], ctx(5000))
  assert.equal(out.agentsDoneAt, 5000)
  const auto = reconcile(add(bar('agents:auto'), run('a')), [], ctx(5000))
  assert.equal(auto.state, 'error')
})
