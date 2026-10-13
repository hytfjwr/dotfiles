// Derived from zycck/claude-mods plugins/plan-progress/tests/scenarios.mjs and regress.mjs (commit 549ecee), MIT License, (c) 2026 Kirill Serditov. Modified for progress-hud. See THIRD_PARTY_NOTICES.md.
// B6 (agent strips), B7 (metrics and toasts) and B8 (the task mirror), DESIGN 11.2, through the real transpiled register.tsx on the stub engine.
// Drawing is not here yet, so what is checked is the state the strips are drawn from. Folding after 5 s is the pure visibleAgents (A5).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { GATE_DENY } from './.build/core/rules.mjs'
import { S, boot } from './engine.mjs'
import { bar, create, three } from './fixtures.mjs'

const agents = (E, id) => E.bar(id).agents
const agent = (E, barId, agentId) => agents(E, barId).find(a => a.id === agentId)
const CHECK = 'claude-haiku-4-5-20251001'

// ---------- B6: agent strips ----------

test('B6 with no open bar a spawn makes the agents bar, opens the band and records the agent\'s home', async () => {
  const E = await boot()
  await E.spawn('a1', 'Scan tests')
  const b = E.bar('agents:auto')
  assert.deepEqual([b.source, b.kind, b.title, b.state], ['agents', 'todo', 'エージェント', 'running'])
  assert.deepEqual(b.agents, [{ id: 'a1', title: 'Scan tests', state: 'running', tool: '起動中', model: CHECK, startedAt: E.now(), endedAt: null, depth: 0, calls: 0, errors: 0, streak: 0, output: 0 }])
  assert.equal(E.steps('agents:auto'), 'Scan tests:active')
  assert.deepEqual(E.homes(), { a1: 'agents:auto' })
  assert.equal(E.view().isOpen, true)
  assert.equal(b.rev, 1)
})

test('B6 the strip goes on the latest open bar (tool, plan or tasks), not on a done or demo bar', async () => {
  const E = await boot()
  await create(E, 'a')
  await create(E, 'b')
  await E.spawn('x1')
  assert.deepEqual(agents(E, 'b').map(a => a.id), ['x1'])
  await E.call({ id: 'b', state: 'done' })
  await E.spawn('x2')
  assert.deepEqual(agents(E, 'a').map(a => a.id), ['x2'])
  assert.deepEqual(E.homes(), { x1: 'b', x2: 'a' })
  assert.equal(E.bar('agents:auto'), undefined)
  E.seedBars([bar('demo-x', { source: 'demo' }), bar('tasks', { source: 'tasks' }), bar('p', { source: 'plan' })])
  await E.spawn('x3')
  assert.deepEqual(agents(E, 'p').map(a => a.id), ['x3'])
  E.seedBars([bar('demo-x', { source: 'demo' }), bar('done-one', { state: 'done' })])
  await E.spawn('x4')
  assert.deepEqual(agents(E, 'agents:auto').map(a => a.id), ['x4'])
  E.seedBars([bar('t1', { source: 'tasks' }), bar('demo-y', { source: 'demo' })])
  await E.spawn('x5')
  assert.deepEqual(agents(E, 't1').map(a => a.id), ['x5'])
})

test('B6 the agents bar is not a home for later agents while a tool bar is open', async () => {
  const E = await boot()
  await E.spawn('a1')
  await create(E, 't')
  await E.spawn('a2')
  assert.deepEqual(agents(E, 't').map(a => a.id), ['a2'])
  assert.deepEqual(agents(E, 'agents:auto').map(a => a.id), ['a1'])
})

test('B6 an agent started by an agent goes on its parent\'s bar, one level in, after the parent\'s other children', async () => {
  const E = await boot()
  await create(E, 'a')
  await E.spawn('p1')
  await create(E, 'b')
  await E.spawn('p2')
  assert.deepEqual(E.homes(), { p1: 'a', p2: 'b' })
  await E.spawn('c1', 'child', { parentAgentId: 'p1' })
  await E.spawn('c2', 'child two', { parentAgentId: 'p1' })
  assert.deepEqual(agents(E, 'a').map(a => `${a.id}:${a.depth}`), ['p1:0', 'c1:1', 'c2:1'])
  assert.equal(E.homes().c1, 'a')
  assert.equal(agents(E, 'b').length, 1)
})

test('B6 a parent whose bar is gone does not hold the child: it goes to an open bar or the agents bar', async () => {
  const E = await boot()
  await create(E, 'a')
  await E.spawn('p1')
  E.seedBars([])
  await E.spawn('c1', 'child', { parentAgentId: 'p1' })
  assert.deepEqual(agents(E, 'agents:auto').map(a => `${a.id}:${a.depth}`), ['c1:0'])
})

test('B6 a spawn the engine refused or that has no id leaves no strip; the title is cut at 60 and falls back to the type', async () => {
  const E = await boot()
  await E.spawn(undefined, 'No id')
  assert.deepEqual(E.bars(), [])
  await E.spawn('a1', '')
  await E.spawn('a2', 'x'.repeat(100))
  const titles = agents(E, 'agents:auto').map(a => a.title)
  assert.deepEqual(titles, ['general-purpose', 'x'.repeat(60)])
})

test('B6 an agent\'s call names its tool, then counts: calls, errors and the run of failures', async () => {
  const E = await boot()
  await create(E)
  await E.spawn('a1')
  await E.agentTool('a1', 'Grep')
  assert.deepEqual([agent(E, 't', 'a1').tool, agent(E, 't', 'a1').state, agent(E, 't', 'a1').calls], ['Grep', 'running', 1])
  const w = E.stateWrites()
  await E.agentTool('a1', 'Grep')
  assert.equal(E.stateWrites() - w, 1, 'the same tool again: only the count is written')
  await E.agentTool('a1', 'Bash', { isError: true })
  await E.agentTool('a1', 'Bash', { isError: true })
  assert.deepEqual([agent(E, 't', 'a1').calls, agent(E, 't', 'a1').errors, agent(E, 't', 'a1').streak], [4, 2, 2])
  await E.agentTool('a1', 'Read')
  assert.deepEqual([agent(E, 't', 'a1').calls, agent(E, 't', 'a1').errors, agent(E, 't', 'a1').streak, agent(E, 't', 'a1').tool], [5, 2, 0, 'Read'])
  await E.agentTool('a1', 'Edit', { deny: true })
  assert.equal(agent(E, 't', 'a1').calls, 5, 'a refused call is not counted')
  assert.equal(agent(E, 't', 'a1').tool, 'Edit')
})

test('B6 an agent the mod does not track leaves no trace; an agent\'s edits do not count for the nudges', async () => {
  const E = await boot()
  await create(E)
  const w = E.stateWrites()
  const r = await E.agentTool('ghost', 'Grep')
  assert.deepEqual(r, { result: {}, text: '' })
  assert.equal(E.stateWrites(), w)
  await E.spawn('a1')
  await E.turnStart()
  for (let i = 0; i < 8; i++) assert.equal((await E.agentTool('a1', 'Edit')).context, undefined)
  assert.equal((await E.work('Edit')).context, undefined, 'the 1st edit of the main loop')
})

test('B6 a call held for a permission turns the strip to waiting after 600 ms, and back when it goes on', async () => {
  const E = await boot()
  await E.spawn('a1')
  const seen = []
  const at = () => `${agent(E, 'agents:auto', 'a1').state}/${agent(E, 'agents:auto', 'a1').tool}/${E.bar('agents:auto').state}`
  await E.agentTool('a1', 'Bash', {
    useId: 'tu1',
    check: async useId => {
      await E.check('Bash', useId)
      await E.advance(599)
      seen.push(at())
      await E.advance(1)
      seen.push(at())
    },
  })
  assert.deepEqual(seen, ['running/Bash/running', 'waiting/承認待ち/needs_input'])
  assert.equal(at(), 'running/Bash/running')
  assert.deepEqual(E.chimes(), ['decision'])
})

test('B6 a call settled before 600 ms never waits; an allowed call never waits; other tools are not watched', async () => {
  const E = await boot()
  await E.spawn('a1')
  await E.agentTool('a1', 'Bash', { useId: 'tu1', check: useId => E.check('Bash', useId) })
  await E.advance(5000)
  assert.equal(agent(E, 'agents:auto', 'a1').state, 'running')
  await E.agentTool('a1', 'Bash', { useId: 'tu2', check: useId => E.check('Bash', useId, 'allow') })
  await E.agentTool('a1', 'Bash', {
    useId: 'tu3',
    check: async useId => {
      await E.check('Bash', useId, 'allow')
      await E.advance(2000)
      assert.equal(agent(E, 'agents:auto', 'a1').state, 'running')
    },
  })
  await E.check('Edit', 'unknown-use')
  await E.advance(2000)
  assert.equal(agent(E, 'agents:auto', 'a1').state, 'running')
  assert.deepEqual(E.chimes(), [])
})

test('B6 turn.step: an agent\'s model and effort are noted; nothing is written when they did not change', async () => {
  const E = await boot()
  await E.spawn('a1')
  await E.step('a1', { effort: 'low' })
  await E.settle()
  assert.deepEqual([agent(E, 'agents:auto', 'a1').model, agent(E, 'agents:auto', 'a1').effort], [CHECK, 'low'])
  const w = E.stateWrites()
  await E.step('a1', { effort: 'low' })
  await E.settle()
  assert.equal(E.stateWrites(), w)
  await E.step('a1', { model: 'claude-sonnet-5-5', effort: 'medium' })
  await E.settle()
  assert.deepEqual([agent(E, 'agents:auto', 'a1').model, agent(E, 'agents:auto', 'a1').effort], ['claude-sonnet-5-5', 'medium'])
  await E.step('a1', { model: 'claude-sonnet-5-5' })
  await E.settle()
  assert.equal('effort' in agent(E, 'agents:auto', 'a1'), false, 'no effort now')
})

test('B6 turn.step: the main loop and an agent without a strip are ignored, only step 0 counts (V18), and the stream passes through', async () => {
  const E = await boot()
  await E.spawn('a1')
  const w = E.stateWrites()
  await E.step(undefined, { model: 'claude-sonnet-5-5' })
  await E.step('ghost', { model: 'claude-sonnet-5-5' })
  await E.step('a1', { model: 'claude-sonnet-5-5', index: 1 })
  await E.settle()
  assert.equal(E.stateWrites(), w)
  // the hook checks the index itself, in case the matcher does not narrow it
  const hook = E.hooks.find(x => x.event === 'turn.step')
  assert.deepEqual(hook.matcher, { index: 0 })
  const gen = hook.fn(E.$, { agentId: 'a1', index: 3, model: 'claude-sonnet-5-5', turnId: 't', messageCount: 1 }, async function* () { return 'passed' })
  for (;;) {
    const x = await gen.next()
    if (x.done) { assert.equal(x.value, 'passed'); break }
  }
  await E.settle()
  assert.equal(E.stateWrites(), w)
  const r = await E.step('a1', { model: CHECK })
  assert.deepEqual(r, { turnId: 't', index: 0 })
})

test('B6 an agent\'s turn ends its strip: done, or an error when interrupted or failed; its output is added; it leaves agentHome', async () => {
  const E = await boot()
  await create(E)
  for (const id of ['a1', 'a2', 'a3', 'a4']) await E.spawn(id)
  await E.advance(3000)
  await E.turnComplete({ agentId: 'a1', usage: { input_tokens: 1, output_tokens: 120, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: CHECK } })
  const a1 = agent(E, 't', 'a1')
  assert.deepEqual([a1.state, a1.tool, a1.endedAt, a1.output], ['done', '完了', E.now(), 120])
  assert.deepEqual(Object.keys(E.homes()), ['a2', 'a3', 'a4'])
  assert.equal(E.bar('t').agentsDoneAt, null)
  assert.deepEqual(E.chimes(), [])
  await E.turnComplete({ agentId: 'a2', reason: 'aborted' })
  await E.turnComplete({ agentId: 'a3', reason: 'error' })
  await E.turnComplete({ agentId: 'a4', reason: 'refusal' })
  assert.deepEqual(agents(E, 't').map(a => `${a.state}/${a.tool}`), ['done/完了', 'error/中断', 'error/失敗', 'error/失敗'])
  assert.equal(E.bar('t').agentsDoneAt, E.now())
  assert.equal(E.bar('t').state, 'running', 'a task bar keeps its own state')
  assert.deepEqual(E.chimes(), ['error', 'error', 'error'], 'a failed strip on a task bar sounds')
  assert.deepEqual(E.homes(), {})
})

test('B6 an agent turn that is not tracked changes no strip but still goes to the meter', async () => {
  const E = await boot()
  await create(E)
  await E.turnComplete({ agentId: 'ghost', usage: { output_tokens: 7 } })
  assert.equal(E.meter().output, 7)
  assert.equal(E.bar('t').agents.length, 0)
})

test('B6 on the agents bar the bar\'s own state sounds: done once all are over, error if one failed (and no second sound)', async () => {
  const E = await boot()
  await E.spawn('a1')
  await E.spawn('a2')
  await E.turnComplete({ agentId: 'a1' })
  assert.deepEqual(E.chimes(), [])
  await E.advance(65_000)
  await E.turnComplete({ agentId: 'a2' })
  assert.deepEqual(E.chimes(), ['done'])
  assert.equal(E.bar('agents:auto').state, 'done')
  assert.equal(E.bar('agents:auto').agentsDoneAt, E.now())
  assert.deepEqual(E.toasts, [{ text: '✓ エージェント 完了 — 1:05', timeoutMs: 6000 }])
  const F = await boot()
  await F.spawn('a1')
  await F.turnComplete({ agentId: 'a1', reason: 'error' })
  assert.deepEqual(F.chimes(), ['error'])
  assert.equal(F.bar('agents:auto').state, 'error')
})

test('B6 a new batch after the last one ended replaces the old strips and the agents bar runs again', async () => {
  const E = await boot()
  await E.spawn('a1')
  await E.turnComplete({ agentId: 'a1' })
  assert.equal(E.bar('agents:auto').state, 'done')
  await E.advance(10_000)
  await E.spawn('b1')
  assert.deepEqual(agents(E, 'agents:auto').map(a => a.id), ['b1'])
  assert.equal(E.bar('agents:auto').state, 'running')
  assert.equal(E.bar('agents:auto').startedAt, E.now())
  assert.equal(E.bar('agents:auto').agentsDoneAt, null)
})

test('B6 a reload: strips still running are checked against $.agent.list(); agentHome keeps the live ones only', async () => {
  const E = await boot()
  await create(E)
  for (const id of ['a1', 'a2', 'a3', 'a4', 'a5']) await E.spawn(id)
  await E.turnComplete({ agentId: 'a5' })
  E.setAgents([{ id: 'a1', status: 'completed' }, { id: 'a2', status: 'failed' }, { id: 'a3', status: 'killed' }, { id: 'a4', status: 'running' }])
  await E.advance(1000)
  await E.sessionStart()
  const by = Object.fromEntries(agents(E, 't').map(a => [a.id, `${a.state}/${a.tool}`]))
  assert.deepEqual(by, { a1: 'done/完了', a2: 'error/失敗', a3: 'error/中断', a4: 'running/起動中', a5: 'done/完了' })
  assert.deepEqual(Object.keys(E.homes()), ['a4'])
  E.setAgents([])
  await E.sessionStart()
  assert.equal(agent(E, 't', 'a4').state, 'error')
  assert.equal(agent(E, 't', 'a4').tool, '不明')
  assert.equal(E.bar('t').agentsDoneAt, E.now())
  assert.deepEqual(E.homes(), {})
})

test('B6 a reload with no running strip does not ask for the agent list', async () => {
  const E = await boot()
  await create(E)
  await E.sessionStart()
  await E.spawn('a1')
  await E.turnComplete({ agentId: 'a1' })
  await E.sessionStart()
  assert.equal(E.calls.includes('agent.list'), false)
  await E.spawn('a2')
  await E.sessionStart()
  assert.equal(E.calls.includes('agent.list'), true)
})

test('B6 a restart restores bars without strips, and the agents bar is not stored at all', async () => {
  const store = new Map()
  const first = await boot({ store })
  await create(first)
  await first.spawn('a1')
  await first.advance(2000)
  assert.deepEqual(JSON.parse(store.get('bars:session-1')).bars.map(b => [b.id, b.agents.length]), [['t', 0]])
  const second = await boot({ store })
  assert.deepEqual(second.bars().map(b => [b.id, b.agents.length]), [['t', 0]])
  const only = await boot({ session: { id: 'only-agents' } })
  await only.spawn('a1')
  await only.sessionEnd()
  assert.equal(only.store.size, 0)
})

test('B6 /clear forgets the agents\' homes too', async () => {
  const E = await boot()
  await E.spawn('a1')
  await E.sessionEnd('clear')
  assert.deepEqual(E.homes(), {})
  assert.deepEqual(E.bars(), [])
})

// ---------- B7: metrics ----------

test('B7 every turn adds its usage to the meter, the main loop\'s and the agents\'; no usage writes nothing', async () => {
  const E = await boot()
  const u = (o = 0) => ({ input_tokens: 10, output_tokens: 20 + o, cache_read_input_tokens: 30, cache_creation_input_tokens: 40, model: CHECK })
  await E.turnComplete({ usage: u() })
  await E.turnComplete({ usage: u(5), agentId: 'ghost' })
  assert.deepEqual(E.meter(), { input: 20, output: 45, cacheRead: 60, cacheWrite: 80, costUsd: null })
  const w = E.stateWrites()
  await E.turnComplete()
  await E.turnComplete({ agentId: 'ghost' })
  assert.equal(E.stateWrites(), w)
})

test('B7 session.measure sets the cost (replacing it) and the gauge; units that did not change are left alone', async () => {
  const E = await boot()
  const startedAt = E.gauge().startedAt
  assert.equal(startedAt, E.now(), 'the session clock starts at session.start')
  await E.measure({ cost: 0.5, percent: 41, five: 23.5 })
  assert.equal(E.meter().costUsd, 0.5)
  assert.deepEqual(E.gauge(), { startedAt, contextPercent: 41, fiveHourPercent: 23.5 })
  await E.measure({ cost: 0.75, percent: 99, five: 99, changed: ['cost'] })
  assert.equal(E.meter().costUsd, 0.75)
  assert.equal(E.gauge().contextPercent, 41)
  await E.measure({ cost: 9, percent: 50, changed: ['context'] })
  assert.equal(E.meter().costUsd, 0.75)
  assert.equal(E.gauge().contextPercent, 50)
  await E.measure({ changed: ['cost', 'rateLimits'] })
  assert.equal(E.meter().costUsd, null, 'no cost ledger: null')
  assert.equal(E.gauge().fiveHourPercent, null)
})

test('B7 session.measure writes nothing when the figures are the same', async () => {
  const E = await boot()
  await E.measure({ cost: 0.5, percent: 41, five: 23.5 })
  const w = E.stateWrites()
  await E.measure({ cost: 0.5, percent: 41, five: 23.5 })
  assert.equal(E.stateWrites(), w)
})

test('B7 a bar takes the meter when it is made and again when it is done, then the end is fixed; the toast shows the difference', async () => {
  const E = await boot()
  await E.turnComplete({ usage: { output_tokens: 100 } })
  await E.measure({ cost: 1 })
  await create(E, 'order-api', [S('調査', 'ルート', '依存')], '注文API改修')
  assert.deepEqual(E.bar('order-api').meterStart, { input: 0, output: 100, cacheRead: 0, cacheWrite: 0, costUsd: 1 })
  assert.equal(E.bar('order-api').meterEnd, null)
  await E.advance(252_000)
  await E.turnComplete({ usage: { output_tokens: 48_000 } })
  await E.measure({ cost: 1.31 })
  assert.deepEqual(E.toasts, [])
  await E.call({ id: 'order-api', state: 'done' })
  assert.deepEqual(E.bar('order-api').meterEnd, { input: 0, output: 48_100, cacheRead: 0, cacheWrite: 0, costUsd: 1.31 })
  assert.equal(E.bar('order-api').endedAt - E.bar('order-api').startedAt, 252_000)
  assert.deepEqual(E.toasts, [{ text: '✓ 注文API改修 完了 — 4:12 · $0.31 · 出力 48k', timeoutMs: 6000 }])
  await E.turnComplete({ usage: { output_tokens: 5000 } })
  await E.measure({ cost: 2 })
  assert.equal(E.bar('order-api').meterEnd.output, 48_100, 'the end stays')
  assert.equal(E.toasts.length, 1)
})

test('B7 the toast says what a bar took in English, and leaves out the cost when the engine reports none', async () => {
  const E = await boot({ options: { language: 'en' } })
  await create(E, 't', three(), 'Orders')
  await E.advance(75_000)
  await E.call({ id: 't', state: 'done' })
  assert.deepEqual(E.toasts, [{ text: '✓ Orders done — 1:15', timeoutMs: 6000 }])
})

test('B7 language auto follows LANG: ja for ja_JP, else en; LANG is read only for auto', async () => {
  const done = async env => {
    const E = await boot({ options: { language: 'auto' }, env })
    await create(E, 't', three(), 'X')
    await E.call({ id: 't', state: 'done' })
    return [E.toasts[0].text, E.calls.filter(c => c === 'env.get').length]
  }
  assert.deepEqual(await done({ LANG: 'ja_JP.UTF-8' }), ['✓ X 完了 — 0:00', 1])
  assert.deepEqual(await done({ LANG: 'en_US.UTF-8' }), ['✓ X done — 0:00', 1])
  assert.deepEqual(await done({}), ['✓ X done — 0:00', 1])
  const fixed = await boot({ options: { language: 'ja' } })
  await create(fixed)
  await fixed.call({ id: 't', state: 'done' })
  assert.equal(fixed.calls.includes('env.get'), false)
})

test('B7 toastOnDone off shows no toast but the done chime still sounds', async () => {
  const E = await boot({ options: { toastOnDone: false } })
  await create(E)
  await E.call({ id: 't', state: 'done' })
  assert.deepEqual(E.toasts, [])
  assert.deepEqual(E.chimes(), ['done'])
})

test('B7 a bar that finishes by itself at the end of the turn, by an approved plan, or by its agents also shows its toast, once', async () => {
  const E = await boot()
  E.seedBars([bar('finished', { stages: [{ name: 'S', steps: [{ title: 'a', status: 'done' }] }] }), bar('demo-1', { source: 'demo', stages: [{ name: 'S', steps: [{ title: 'a', status: 'done' }] }] })])
  await E.turnComplete()
  await E.turnComplete()
  assert.deepEqual(E.toasts.map(t => t.text.split(' ')[1]), ['finished'], 'the demo bar shows none')
  assert.deepEqual(E.chimes(), ['done', 'done'], 'both finish, the demo one with its sound')
  await E.exitPlan({ result: { plan: '# Ship\n- [x] Read\n- [x] Patch' } })
  assert.equal(E.toasts.length, 2)
  assert.equal(E.bar('plan').state, 'done')
  await E.exitPlan({ result: { plan: '# Ship\n- [x] Read\n- [x] Patch' } })
  assert.equal(E.toasts.length, 2, 'a done bar written done again is not a new finish')
})

test('B7 a bar that is reopened and finished again shows a second toast', async () => {
  const E = await boot()
  await create(E)
  await E.call({ id: 't', state: 'done' })
  await E.call({ id: 't', stages: [S('One', 'A', 'B', 'C', 'D')] })
  await E.call({ id: 't', state: 'done' })
  assert.equal(E.toasts.length, 2)
})

// ---------- B8: the task mirror ----------

test('B8 TaskCreate x3 makes the bar "tasks" with no call of our own; the band opens; the call is answered as it was', async () => {
  const E = await boot()
  const r1 = await E.taskCreate('Read code', { id: '1' })
  await E.taskCreate('Fix bug', { id: '2' })
  await E.taskCreate('Run tests', { id: '3' })
  const b = E.bar('tasks')
  assert.deepEqual([b.source, b.kind, b.title, b.state], ['tasks', 'todo', 'タスク', 'running'])
  assert.equal(E.steps('tasks'), 'Read code:pending Fix bug:pending Run tests:pending')
  assert.deepEqual(b.stages[0].steps.map(s => s.taskId), ['1', '2', '3'])
  assert.equal(E.view().isOpen, true)
  assert.deepEqual(r1, { result: { task: { id: '1', subject: 'Read code' } }, text: '' })
  assert.equal(E.stats.at(-1).coreRuns, 1)
})

test('B8 TaskUpdate: in_progress, completed and deleted; the stage name follows the task in progress; all done finishes the bar', async () => {
  const E = await boot()
  for (const [s, id] of [['A', '1'], ['B', '2']]) await E.taskCreate(s, { id })
  await E.taskUpdate('1', { status: 'in_progress', activeForm: 'Reading A' })
  assert.equal(E.steps('tasks'), 'A:active B:pending')
  assert.equal(E.bar('tasks').stages[0].name, 'Reading A')
  await E.advance(4000)
  await E.taskUpdate('1', { status: 'completed' })
  assert.equal(E.bar('tasks').stages[0].steps[0].doneAt, E.now())
  assert.equal(E.bar('tasks').stages[0].name, 'タスク')
  await E.taskUpdate('2', { status: 'completed' })
  assert.equal(E.bar('tasks').state, 'done')
  assert.deepEqual(E.chimes(), ['done'])
  assert.deepEqual(E.toasts.map(t => t.text), ['✓ タスク 完了 — 0:04'])
  await E.taskCreate('C', { id: '3' })
  assert.equal(E.steps('tasks'), 'C:pending', 'a new task after done starts the bar again')
  assert.equal(E.bar('tasks').state, 'running')
  await E.taskUpdate('3', { status: 'deleted' })
  assert.equal(E.bar('tasks'), undefined, 'the last task deleted: no bar')
})

test('B8 TaskUpdate of a task the bar does not know, or one that failed, changes nothing and writes nothing', async () => {
  const E = await boot()
  await E.taskCreate('A', { id: '1' })
  const w = E.stateWrites()
  await E.taskUpdate('99', { status: 'completed' })
  await E.taskUpdate('1', { status: 'completed' }, { success: false })
  await E.taskUpdate('1', { description: 'only text' })
  assert.equal(E.stateWrites(), w)
  assert.equal(E.steps('tasks'), 'A:pending')
})

test('B8 TodoWrite replaces the list, carries doneAt, and the activeForm names the stage', async () => {
  const E = await boot()
  const todo = (content, status, activeForm = `${content}ing`) => ({ content, status, activeForm })
  await E.todoWrite([todo('Read', 'completed'), todo('Fix', 'in_progress', 'Fixing the bug'), todo('Test', 'pending')])
  assert.equal(E.steps('tasks'), 'Read:done Fix:active Test:pending')
  assert.equal(E.bar('tasks').stages[0].name, 'Fixing the bug')
  const readDone = E.bar('tasks').stages[0].steps[0].doneAt
  await E.advance(9000)
  await E.todoWrite([todo('Read', 'completed'), todo('Fix', 'completed'), todo('Test', 'in_progress')])
  assert.equal(E.bar('tasks').stages[0].steps[0].doneAt, readDone)
  assert.equal(E.bar('tasks').stages[0].steps[1].doneAt, E.now())
  await E.todoWrite([todo('Read', 'completed'), todo('Fix', 'completed'), todo('Test', 'completed')])
  assert.equal(E.bar('tasks').state, 'done')
  assert.deepEqual(E.chimes(), ['done'])
  const w = E.stateWrites()
  await E.todoWrite([todo('Read', 'completed'), todo('Fix', 'completed'), todo('Test', 'completed')])
  await E.todoWrite([])
  assert.equal(E.stateWrites(), w, 'the same list, or none: nothing written')
})

test('B8 an agent\'s task calls, refused calls and failed calls are not mirrored', async () => {
  const E = await boot()
  await E.tool('TaskCreate', { subject: 'From an agent' }, () => ({ result: { task: { id: '1', subject: 'x' } }, text: '' }), 'ag1')
  await E.tool('TodoWrite', { todos: [{ content: 'x', status: 'pending', activeForm: 'x' }] }, () => ({ result: {}, text: '' }), 'ag1')
  await E.taskCreate('Failed', { id: '2', isError: true })
  await E.tool('TaskCreate', { subject: 'Denied' }, () => ({ deny: 'no' }))
  await E.todoWrite([{ content: 'x', status: 'pending', activeForm: 'x' }], { isError: true })
  assert.equal(E.bar('tasks'), undefined)
  assert.equal(E.view().isOpen, false)
})

test('B8 an unexpected result shape changes nothing and does not break the call', async () => {
  const E = await boot()
  const r = await E.tool('TaskCreate', { subject: 'X' }, () => ({ result: { surprise: true }, text: 'ok' }))
  assert.equal(r.text, 'ok')
  await E.tool('TaskCreate', { subject: 'X' }, () => ({ result: null, text: 'ok' }))
  await E.tool('TodoWrite', { todos: 'nope' }, () => ({ result: {}, text: 'ok' }))
  assert.equal(E.bar('tasks'), undefined)
})

test('B8 the progress tool cannot touch the bar "tasks"', async () => {
  const E = await boot()
  await E.taskCreate('A', { id: '1' })
  const before = E.bar('tasks')
  for (const input of [{ id: 'tasks', next: true }, { id: 'tasks', title: 'x', stages: three() }, { id: 'tasks', state: 'done' }]) {
    assert.equal((await E.call(input)).deny, 'progress-hud: "tasks" mirrors TaskCreate/TaskUpdate; update those tasks instead.')
  }
  assert.deepEqual(E.bar('tasks'), before)
})

test('B8 the tasks bar counts toward maxBars like any bar', async () => {
  const E = await boot({ options: { maxBars: 2 } })
  await create(E, 'a')
  await create(E, 'b')
  await E.taskCreate('A', { id: '1' })
  assert.deepEqual(E.bars().map(b => b.id), ['b', 'tasks'])
})

test('B8 the tasks bar takes strips, and a question to the user pauses it only when no other bar runs', async () => {
  const E = await boot()
  await E.taskCreate('A', { id: '1' })
  await E.spawn('a1')
  assert.deepEqual(agents(E, 'tasks').map(a => a.id), ['a1'])
  const seen = []
  await E.askUser(() => seen.push(E.bar('tasks').state))
  assert.deepEqual(seen, ['needs_input'])
  assert.equal(E.bar('tasks').state, 'running')
  await E.taskCreate('B', { id: '2' })
  assert.deepEqual(agents(E, 'tasks').map(a => a.id), ['a1'], 'adding a task keeps the strips')
})

test('B8 a task call that worked counts as an update for the nudges; one that failed does not', async () => {
  const soft = await boot()
  await soft.turnStart()
  await soft.taskCreate('A', { id: '1' })
  const edit = async n => {
    let last
    for (let i = 0; i < n; i++) last = await soft.work('Edit')
    return last
  }
  assert.equal((await edit(5)).context, undefined)
  await soft.taskUpdate('1', { status: 'in_progress', activeForm: 'Working' })
  assert.equal((await edit(5)).context, undefined, 'the update restarted the count')
  assert.equal((await edit(1)).context?.length, 1, 'the 6th edit since the update')
  const failed = await boot()
  await failed.turnStart()
  await failed.taskCreate('A', { id: '1' })
  for (let i = 0; i < 5; i++) await failed.work('Edit')
  await failed.taskUpdate('1', { status: 'completed' }, { isError: true })
  assert.equal((await failed.work('Edit')).context?.length, 1, 'the failed update did not restart it')
})

test('B8 strict: a task written this turn means a bar exists, so the gate does not refuse; a failed one does not count', async () => {
  const E = await boot({ options: { nudge: 'strict' } })
  await E.turnStart()
  await E.taskCreate('Failed', { id: '1', isError: true })
  for (let i = 0; i < 3; i++) await E.work('Edit')
  assert.equal((await E.work('Edit')).deny, GATE_DENY)
  await E.turnStart()
  await E.todoWrite([{ content: 'x', status: 'in_progress', activeForm: 'x' }])
  for (let i = 0; i < 5; i++) assert.equal((await E.work('Edit')).deny, undefined)
})

test('B8 strict Stop: an open tasks bar left after edits with no task update is sent back; a task update before Stop is enough', async () => {
  const E = await boot({ options: { nudge: 'strict' } })
  await E.turnStart()
  await E.taskCreate('A', { id: '1' })
  await E.work('Edit')
  assert.ok((await E.stop('All set.')).block)
  await E.turnStart()
  await E.work('Edit')
  await E.taskUpdate('1', { status: 'in_progress', activeForm: 'Working' })
  assert.equal((await E.stop('All set.')).block, undefined)
})

test('B8 the mirror is saved with the other bars and comes back after a restart', async () => {
  const store = new Map()
  const first = await boot({ store })
  await first.taskCreate('A', { id: '1' })
  await first.taskUpdate('1', { status: 'in_progress', activeForm: 'Working' })
  await first.sessionEnd()
  const second = await boot({ store })
  assert.equal(second.steps('tasks'), 'A:active')
  assert.equal(second.bar('tasks').source, 'tasks')
  await second.taskUpdate('1', { status: 'completed' })
  assert.equal(second.bar('tasks').state, 'done')
})

// ---------- hooks: next once, .catch ----------

test('the new hooks ran next exactly once, and every $ call they made is on the allow list', async () => {
  const { ALLOWED } = await import('./engine.mjs')
  const E = await boot({ options: { nudge: 'strict' } })
  await E.turnStart()
  await E.taskCreate('A', { id: '1' })
  await E.taskUpdate('1', { status: 'in_progress', activeForm: 'x' })
  await E.todoWrite([{ content: 'x', status: 'pending', activeForm: 'x' }])
  await E.spawn('a1')
  await E.spawn('c1', 'child', { parentAgentId: 'a1' })
  await E.spawn(undefined)
  await E.agentTool('a1', 'Bash', { useId: 'tu1', check: async id => (await E.check('Bash', id), await E.advance(700)) })
  await E.agentTool('a1', 'Edit', { isError: true })
  await E.agentTool('ghost', 'Grep')
  await E.step('a1', { effort: 'high' })
  await E.step()
  await E.measure({ cost: 1, percent: 5, five: 5 })
  await E.turnComplete({ agentId: 'a1', usage: { output_tokens: 3 } })
  await E.turnComplete({ agentId: 'c1', reason: 'aborted' })
  await E.turnComplete({ usage: { output_tokens: 3 } })
  await E.sessionStart()
  await E.settle()
  assert.ok(E.stats.length > 15)
  for (const s of E.stats) {
    assert.ok(s.coreRuns <= 1, `${s.event}: the core ran at most once`)
    for (const h of s.hooks) {
      assert.equal(h.threw, null, `${s.event}: no hook threw`)
      assert.equal(h.nexts, 1, `${s.event}: next once`)
    }
  }
  for (const c of E.calls) assert.ok(ALLOWED.includes(c), c)
  assert.ok(['agent.list', 'ui.toast', 'clock.after'].every(c => ALLOWED.includes(c)))
})

test('with every write failing, agent, meter, mirror and measure events still pass through untouched', async () => {
  const E = await boot()
  await create(E)
  await E.spawn('a1')
  E.fail.stateSet = true
  const r = await E.spawn('a2')
  assert.equal(r.agentId, 'a2')
  assert.deepEqual(await E.agentTool('a1', 'Grep'), { result: {}, text: '' })
  assert.deepEqual(await E.check('Bash', 'x'), { decision: 'ask' })
  assert.deepEqual(await E.step('a1', { effort: 'low' }), { turnId: 't', index: 0 })
  await E.settle()
  assert.deepEqual(await E.measure({ cost: 1 }), { changed: ['cost', 'context', 'rateLimits'] })
  assert.deepEqual(await E.turnComplete({ agentId: 'a1', usage: { output_tokens: 1 } }), { text: 'done' })
  const t = await E.taskCreate('X', { id: '9' })
  assert.deepEqual(t, { result: { task: { id: '9', subject: 'X' } }, text: '' })
  assert.deepEqual(await E.sessionStart(), {})
  assert.ok(E.logs.length > 0)
})
