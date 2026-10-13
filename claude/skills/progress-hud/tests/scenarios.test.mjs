// Derived from zycck/claude-mods plugins/plan-progress/tests/scenarios.mjs and regress.mjs (commit 549ecee), MIT License, (c) 2026 Kirill Serditov. Modified for progress-hud. See THIRD_PARTY_NOTICES.md.
// B1 to B5 and part of B12 (DESIGN 11.2): event sequences through the real, transpiled register.tsx on the stub engine.
// The nudge cases (B4) are the reference's T23 to T25b, stop_still_blocks_open_bar and N2 ported here with their new rules (DESIGN 5.4):
// soft is the default, the gate and the Stop block are strict only, and a reminder comes once per turn.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { GATE_DENY, INTERNAL_ERROR, PLAN_CONTEXT, RULES, RULES_ID, TOOL, TOOL_SPEC, reminderText, stopBlockText } from './.build/core/rules.mjs'
import { ALLOWED, S, boot } from './engine.mjs'
import { PLAN, ZERO, bar, create, res, three } from './fixtures.mjs'

const lines = r => r.context ?? []

// ---------- B1: the progress tool, from creation to done ----------

test('B1 start: the tool is registered with its spec, once, and the hook matcher is the tool name', async () => {
  const E = await boot()
  assert.deepEqual(E.registeredTools, [TOOL_SPEC])
  assert.equal(E.hooks.find(x => x.event === 'tool.call' && x.matcher?.tool?.startsWith('mcp__')).matcher.tool, TOOL)
  assert.equal(E.view().isOpen, false)
  assert.deepEqual(E.bars(), [])
})

test('B1 a bar from creation to done: results, view, chimes, clock', async () => {
  const E = await boot()
  const r1 = await create(E, 'order-api', [S('調査', 'ルート確認', '依存洗い出し'), S('実装', 'エンドポイント')], '注文API改修')
  assert.equal(res(r1), 'order-api: 0/3, running, active "ルート確認"')
  assert.equal(E.view().isOpen, true)
  assert.deepEqual(E.chimes(), [])
  E.view() // opened by the first bar
  await E.advance(5000)
  assert.equal(res(await E.call({ id: 'order-api', next: true })), 'order-api: 1/3, running, active "依存洗い出し"')
  assert.equal(res(await E.call({ id: 'order-api', done: ['依存洗い出し'], active: 'エンドポイント' })), 'order-api: 2/3, running, active "エンドポイント"')
  assert.equal(res(await E.call({ id: 'order-api', skip: ['エンドポイント'] })), 'order-api: 3/3, done')
  const b = E.bar('order-api')
  assert.equal(b.state, 'done')
  assert.equal(b.endedAt, E.now())
  assert.equal(b.startedAt, E.now() - 5000)
  assert.deepEqual(E.chimes(), ['done'])
  assert.equal(b.rev, 4)
})

test('B1 a refused call changes nothing and answers with the deny text', async () => {
  const E = await boot()
  await create(E)
  const rev = E.bar('t').rev
  const r = await E.call({ id: 't', done: ['Nope'] })
  assert.equal(r.deny, 'progress-hud: "t" has no step "Nope". Its steps: A, B, C')
  assert.equal(E.bar('t').rev, rev)
  assert.equal((await E.call({ id: 'ghost', next: true })).deny, 'progress-hud: no bar "ghost" yet; create it with title and stages.')
  assert.equal((await E.call({ id: 'big', title: 'B', stages: Array.from({ length: 13 }, (_, i) => S(`S${i}`, 'x')) })).deny, 'progress-hud: too many stages or steps (max 12 stages, 80 steps).')
  assert.equal(E.bars().length, 1)
})

test('B1 tasks and agents:auto are refused through the tool', async () => {
  const E = await boot()
  const writes = E.stateWrites()
  assert.equal((await E.call({ id: 'tasks', title: 'x', stages: three() })).deny, 'progress-hud: "tasks" mirrors TaskCreate/TaskUpdate; update those tasks instead.')
  assert.equal((await E.call({ id: 'agents:auto', next: true })).deny, 'progress-hud: "agents:auto" is managed by the HUD.')
  assert.deepEqual(E.bars(), [])
  assert.equal(E.view().isOpen, false)
  assert.equal(E.stateWrites(), writes, 'a refused call writes nothing')
})

test('B1 chimes follow state changes: decision, error, done; the same state twice sounds once', async () => {
  const E = await boot()
  await create(E)
  await E.call({ id: 't', state: 'needs_input', note: 'Run the migration?' })
  await E.call({ id: 't', state: 'needs_input', note: 'Run the migration?' })
  assert.deepEqual(E.chimes(), ['decision'])
  await E.call({ id: 't', failed: 'A', note: 'boom' })
  assert.equal(E.bar('t').state, 'error')
  await E.call({ id: 't', state: 'done' })
  assert.deepEqual(E.chimes(), ['decision', 'error', 'done'])
})

test('B1 the number of bars is capped by maxBars: finished ones go first', async () => {
  const E = await boot({ options: { maxBars: 2 } })
  await create(E, 'a')
  await create(E, 'b')
  await E.call({ id: 'a', state: 'done' })
  await create(E, 'c')
  assert.deepEqual(E.bars().map(b => b.id), ['b', 'c'])
  await create(E, 'd')
  assert.deepEqual(E.bars().map(b => b.id), ['c', 'd'])
})

test('B1 two calls in flight at once both land (update re-reads)', async () => {
  const E = await boot()
  await create(E)
  await Promise.all([E.call({ id: 't', next: true }), E.call({ id: 't', next: true })])
  assert.equal(E.steps('t'), 'A:done B:done C:active')
  await Promise.all([create(E, 'x'), create(E, 'y')])
  assert.deepEqual(E.bars().map(b => b.id).sort(), ['t', 'x', 'y'])
})

test('B1 prompt.compose adds the rules last, as a session section', async () => {
  const E = await boot()
  const r = await E.compose()
  assert.deepEqual(r.sections, [{ id: 'intro', text: 'intro', scope: 'shared' }, { id: RULES_ID, text: RULES, scope: 'session' }])
})

// ---------- B2: ExitPlanMode ----------

test('B2 an approved plan becomes the bar "plan", the model is told, and the decision chime sounds at the start', async () => {
  const E = await boot()
  const r = await E.exitPlan({ result: { plan: PLAN }, text: 'ok' })
  assert.equal(E.steps('plan'), 'Read code:active Find bug:pending Patch:pending Test:pending')
  assert.equal(E.bar('plan').title, 'Fix login')
  assert.equal(E.bar('plan').source, 'plan')
  assert.deepEqual(lines(r), [PLAN_CONTEXT])
  assert.equal(r.text, 'ok')
  assert.equal(E.view().isOpen, true)
  assert.deepEqual(E.chimes(), ['decision'])
})

test('B2 a revised plan updates the bar and keeps what was finished; a new title lands on the same bar', async () => {
  const E = await boot()
  await E.exitPlan({ result: { plan: PLAN } })
  await E.call({ id: 'plan', next: true })
  await E.call({ id: 'plan', next: true })
  await E.exitPlan({ result: { plan: PLAN.replace('# Fix login', '# Fix login flow') + '\n- Deploy' } })
  assert.equal(E.steps('plan'), 'Read code:done Find bug:done Patch:active Test:pending Deploy:pending')
  assert.deepEqual(E.bars().map(b => `${b.id}:${b.title}`), ['plan:Fix login flow'])
  assert.equal(E.bar('plan').source, 'plan')
})

test('B2 ticked boxes arrive done', async () => {
  const E = await boot()
  await E.exitPlan({ result: { plan: '# Ship\n- [x] Read code\n- [x] Find bug\n- [ ] Patch' } })
  assert.equal(E.steps('plan'), 'Read code:done Find bug:done Patch:active')
})

test('B2 a denied or failed ExitPlanMode, and a plan that is null or holds no steps, change nothing', async () => {
  const E = await boot()
  const denied = await E.exitPlan({ deny: 'no' })
  assert.equal(denied.deny, 'no')
  const failed = await E.exitPlan({ isError: true, result: { plan: '# X\n- a\n- b' }, text: 'failed' })
  assert.equal(failed.context, undefined)
  const nul = await E.exitPlan({ result: { plan: null }, text: 'x' })
  const num = await E.exitPlan({ result: { plan: 5 }, text: 'x' })
  const none = await E.exitPlan({ result: undefined, text: 'x' })
  const empty = await E.exitPlan({ result: { plan: 'only words' }, text: 'x' })
  for (const r of [nul, num, none, empty]) assert.equal(r.context, undefined)
  assert.deepEqual(E.bars(), [])
  assert.equal(E.view().isOpen, false)
})

test('B2 a plan that is too long is cut to the limits, not refused', async () => {
  const E = await boot()
  const plan = '# Big\n' + Array.from({ length: 20 }, (_, i) => `## S${i}\n- a\n- b\n- c`).join('\n')
  const r = await E.exitPlan({ result: { plan } })
  assert.deepEqual(lines(r), [PLAN_CONTEXT])
  assert.equal(E.bar('plan').stages.length, 12)
})

// ---------- B3: needs_input ----------

test('B3 AskUserQuestion: the latest running bar waits during the question and runs again after it', async () => {
  const E = await boot()
  await create(E, 'a')
  await create(E, 'b')
  const seen = []
  const r = await E.askUser(() => seen.push(E.bars().map(b => `${b.id}:${b.state}`).join(' ')))
  assert.deepEqual(seen, ['a:running b:needs_input'])
  assert.equal(E.bar('b').state, 'running')
  assert.deepEqual(r.result, { answers: {} })
  assert.deepEqual(E.chimes(), ['decision'])
})

test('B3 AskUserQuestion: a bar the model already marked needs_input is left as it is', async () => {
  const E = await boot()
  await create(E)
  await E.call({ id: 't', state: 'needs_input', note: 'Run it?' })
  await E.askUser()
  assert.equal(E.bar('t').state, 'needs_input')
  assert.equal(E.bar('t').note, 'Run it?')
})

test('B3 AskUserQuestion: the tasks mirror only when nothing else runs, the agents bar never; with no bar only the chime', async () => {
  const E = await boot()
  await E.askUser()
  assert.deepEqual(E.chimes(), ['decision'])
  E.seedBars([bar('tasks', { source: 'tasks' }), bar('agents:auto', { source: 'agents' })])
  const seen = []
  await E.askUser(() => seen.push(E.bars().map(b => `${b.id}:${b.state}`).join(' ')))
  assert.deepEqual(seen, ['tasks:needs_input agents:auto:running'])
  seen.length = 0
  E.seedBars([bar('tasks', { source: 'tasks' }), bar('x'), bar('agents:auto', { source: 'agents' })])
  await E.askUser(() => seen.push(E.bars().map(b => `${b.id}:${b.state}`).join(' ')))
  assert.deepEqual(seen, ['tasks:running x:needs_input agents:auto:running'])
})

test('B3 prompt.submit from the composer clears needs_input and the note, and adds one context line for open bars', async () => {
  const E = await boot()
  await create(E, 'order-api', [S('調査', 'ルート', '依存'), S('DB移行', 'スキーマ', 'データ', '索引', '検証')], '注文API')
  await E.call({ id: 'order-api', done: ['ルート', '依存', 'スキーマ'] })
  await E.call({ id: 'order-api', state: 'needs_input', note: 'Run the migration?' })
  const r = await E.submit('yes, go')
  assert.equal(E.bar('order-api').state, 'running')
  assert.equal(E.bar('order-api').note, null)
  assert.deepEqual(r.context, ['progress-hud open bars: order-api (DB移行 2/4)'])
  assert.equal(r.text, 'yes, go')
})

test('B3 prompt.submit keeps the context the engine carried and adds nothing when no bar is open', async () => {
  const E = await boot()
  assert.deepEqual((await E.submit('hi', { context: ['x'] })).context, ['x'])
  await create(E)
  assert.deepEqual((await E.submit('hi', { context: ['x'] })).context, ['x', 'progress-hud open bars: t (One 1/2)'])
  await E.call({ id: 't', state: 'done' })
  assert.equal((await E.submit('hi')).context, undefined)
})

test('B3 prompt.submit that did not come from the composer is left alone', async () => {
  const E = await boot()
  await create(E)
  await E.call({ id: 't', state: 'needs_input' })
  const r = await E.submit('hi', { origin: { kind: 'bridge' } })
  assert.equal(E.bar('t').state, 'needs_input')
  assert.equal(r.context, undefined)
})

test('B3 prompt.submit: the label of a one-stage bar is its count; the tasks mirror counts and the agents bar does not', async () => {
  const E = await boot()
  E.seedBars([bar('tasks', { source: 'tasks', stages: [{ name: 'Tasks', steps: [{ title: 'a', status: 'done' }, { title: 'b', status: 'active' }, { title: 'c', status: 'pending' }] }] }), bar('agents:auto', { source: 'agents' })])
  assert.deepEqual((await E.submit('hi')).context, ['progress-hud open bars: tasks (1/3)'])
})

test('B3 Stop: an answer ending in a question marks the latest open bar needs_input', async () => {
  const E = await boot()
  await create(E, 'a')
  await create(E, 'b')
  await E.stop('Should I publish it?')
  assert.deepEqual(E.bars().map(b => `${b.id}:${b.state}`), ['a:running', 'b:needs_input'])
  assert.deepEqual(E.chimes(), ['decision'])
  await E.stop('公開してよいですか？  ')
  assert.equal(E.bar('a').state, 'needs_input')
})

test('B3 Stop: no open bar, no question, a Stop hook already active, a block from below, or background work: nothing happens', async () => {
  const E = await boot()
  await E.stop('Really?')
  await create(E)
  await E.stop('All done.')
  await E.stop('Really?', { stop_hook_active: true })
  await E.stop('Really?', { background_tasks: [{ id: 'x' }] })
  const blocked = await E.stop('Really?', {}, { block: 'from below' })
  assert.equal(blocked.block, 'from below')
  assert.equal(E.bar('t').state, 'running')
  assert.deepEqual(E.chimes(), [])
})

test('B3 turn.complete settles a running bar whose steps are all finished; others stay', async () => {
  const E = await boot()
  E.seedBars([bar('finished', { stages: [{ name: 'S', steps: [{ title: 'a', status: 'done' }, { title: 'b', status: 'skipped' }] }] }), bar('open'), bar('empty', { stages: [] })])
  await E.advance(1000)
  await E.turnComplete({ agentId: 'ag1' })
  assert.equal(E.bar('finished').state, 'running', 'an agent turn is not the main loop')
  await E.turnComplete()
  assert.deepEqual(E.bars().map(b => `${b.id}:${b.state}`), ['finished:done', 'open:running', 'empty:running'])
  assert.equal(E.bar('finished').endedAt, E.now())
  assert.deepEqual(E.bar('finished').meterEnd, ZERO)
  assert.deepEqual(E.chimes(), ['done'])
  await E.turnComplete()
  assert.deepEqual(E.chimes(), ['done'], 'settled once')
})

// ---------- B4: nudges ----------

const edits = async (E, n) => {
  const out = []
  for (let i = 0; i < n; i++) out.push(await E.work('Edit'))
  return out
}

test('B4 soft (the default): no gate however many edits, a reminder at the 6th edit with a stale bar, once per turn', async () => {
  const E = await boot()
  await E.turnStart()
  const free = await edits(E, 8)
  assert.ok(free.every(r => r.deny === undefined && r.context === undefined), 'no bar: no gate, no reminder')
  await E.turnStart()
  await create(E)
  const out = await edits(E, 12)
  const hits = out.map((r, i) => (lines(r).length ? i + 1 : 0)).filter(Boolean)
  assert.deepEqual(hits, [6])
  assert.deepEqual(lines(out[5]), [reminderText(['t'])])
  assert.equal(lines(out[5])[0], 'progress-hud: t not updated for a while; send {id, next:true} or {id, done, active}, or update your tasks.')
})

test('B4 soft: a new turn starts the count again, an update of the bar restarts it, a refused update does not', async () => {
  const E = await boot()
  await E.turnStart()
  await create(E)
  await edits(E, 5)
  await E.call({ id: 't', next: true })
  assert.equal(lines((await edits(E, 5)).at(-1)).length, 0, '5 edits since the update')
  await E.call({ id: 't', done: ['Nonexistent'] })
  assert.equal(lines((await edits(E, 1))[0]).length, 1, 'the refused call did not reset: this is the 6th')
  await E.turnStart()
  assert.equal(lines((await edits(E, 5)).at(-1)).length, 0)
  assert.equal(lines((await edits(E, 1))[0]).length, 1, 'once per turn, so again in the new turn')
})

test('B4 reminders count edits only: shell calls, failed-to-run edits, agents and other tools do not', async () => {
  const E = await boot()
  await E.turnStart()
  await create(E)
  for (let i = 0; i < 12; i++) {
    const r = await E.tool('Bash', { command: 'ls' })
    assert.equal(r.context, undefined)
  }
  await E.tool('Read', { file_path: '/x' })
  for (let i = 0; i < 10; i++) await E.work('Edit', { agentId: 'ag1' })
  for (let i = 0; i < 5; i++) await E.work('Edit', { deny: true })
  assert.equal(lines((await edits(E, 5)).at(-1)).length, 0)
  assert.equal(lines((await edits(E, 1))[0]).length, 1)
})

test('B4 an edit that errored still counts; MultiEdit, Write and NotebookEdit are edits too', async () => {
  const E = await boot()
  await E.turnStart()
  await create(E)
  await E.work('Edit', { isError: true })
  await E.work('Write')
  await E.work('MultiEdit')
  await E.work('NotebookEdit')
  await E.work('Edit')
  assert.equal(lines(await E.work('Write')).length, 1)
})

test('B4 the reminder names every open bar and keeps the context core gave', async () => {
  const E = await boot()
  await E.turnStart()
  await create(E, 'a')
  await create(E, 'b')
  await edits(E, 5)
  const r = await E.tool('Edit', {}, () => ({ result: {}, text: '', context: ['from core'] }))
  assert.deepEqual(lines(r), ['from core', reminderText(['a', 'b'])])
})

test('B4 off: no reminder, no gate, no block', async () => {
  const E = await boot({ options: { nudge: 'off' } })
  await E.turnStart()
  await create(E)
  const out = await edits(E, 10)
  assert.ok(out.every(r => r.deny === undefined && r.context === undefined))
  assert.equal((await E.stop('All set.')).block, undefined)
})

test('B4 strict: the 4th edit with no bar is refused once, and refused edits do not count', async () => {
  const E = await boot({ options: { nudge: 'strict' } })
  await E.turnStart()
  const out = await edits(E, 3)
  assert.ok(out.every(r => r.deny === undefined))
  const gate = await E.work('Edit')
  assert.equal(gate.deny, GATE_DENY)
  assert.equal(E.stats.at(-1).coreRuns, 0, 'the refused edit never reached the tool')
  assert.equal((await E.work('Edit')).deny, undefined, 'only once')
  assert.equal((await E.work('Edit')).deny, undefined)
  await E.turnStart()
  await edits(E, 3)
  assert.equal((await E.work('Edit')).deny, GATE_DENY, 'once per turn')
})

test('B4 strict: no gate when a bar is open or was written this turn; shell calls are never refused', async () => {
  const E = await boot({ options: { nudge: 'strict' } })
  await E.turnStart()
  await create(E)
  assert.ok((await edits(E, 5)).every(r => r.deny === undefined))
  await E.turnStart()
  await E.call({ id: 't', state: 'done' })
  assert.ok((await edits(E, 5)).every(r => r.deny === undefined), 'a bar written this turn counts, even a finished one')
  await E.turnStart()
  await edits(E, 3)
  assert.equal((await E.tool('Bash', { command: 'make' })).deny, undefined)
  assert.equal((await E.work('Edit')).deny, GATE_DENY)
})

test('B4 strict: the gate counts the main loop only', async () => {
  const E = await boot({ options: { nudge: 'strict' } })
  await E.turnStart()
  for (let i = 0; i < 6; i++) assert.equal((await E.work('Edit', { agentId: 'ag1' })).deny, undefined)
  assert.equal((await edits(E, 3)).filter(r => r.deny).length, 0)
  assert.equal((await E.work('Edit')).deny, GATE_DENY)
})

test('B4 strict: the reminder also comes', async () => {
  const E = await boot({ options: { nudge: 'strict' } })
  await E.turnStart()
  await create(E)
  const out = await edits(E, 6)
  assert.equal(lines(out[5]).length, 1)
})

test('B4 strict Stop: an open bar left unexplained after edits is sent back once per turn', async () => {
  const E = await boot({ options: { nudge: 'strict' } })
  await E.turnStart()
  await create(E)
  await E.work('Edit')
  const r = await E.stop('All set.')
  assert.equal(r.block, stopBlockText(['t']))
  assert.equal(r.block, 'progress-hud: t still open. Update each with mcp__progress-hud__progress: {id, next:true}, or state "done", "needs_input" or "error" with a note.')
  assert.equal((await E.stop('All set.', { stop_hook_active: true })).block, undefined)
  assert.equal((await E.stop('All set.')).block, undefined, 'once per turn')
  await E.turnStart()
  await E.work('Edit')
  assert.ok((await E.stop('All set.')).block)
})

test('B4 strict Stop: no block without edits, after an update, for a question, or when nothing is open', async () => {
  const E = await boot({ options: { nudge: 'strict' } })
  await E.turnStart()
  await create(E)
  assert.equal((await E.stop('All set.')).block, undefined, 'no edit this turn')
  await E.work('Edit')
  await E.call({ id: 't', next: true })
  assert.equal((await E.stop('All set.')).block, undefined, 'updated after the edit')
  await E.work('Edit')
  const q = await E.stop('Shall I go on?')
  assert.equal(q.block, undefined)
  assert.equal(E.bar('t').state, 'needs_input')
  await E.turnStart()
  await E.call({ id: 't', state: 'done' })
  await E.work('Edit')
  assert.equal((await E.stop('All set.')).block, undefined, 'a done bar is not open')
})

test('B4 N2: a plan walked to the end of its steps then stopped on: one bar, no block', async () => {
  const E = await boot({ options: { nudge: 'strict' } })
  await E.turnStart()
  await E.exitPlan({ result: { plan: '# Fix login\n## A\n- One\n## B\n- Two' } })
  await E.work('Edit')
  await E.call({ id: 'plan', next: true })
  await E.call({ id: 'plan', next: true })
  const r = await E.stop('All set.')
  assert.equal(E.bars().length, 1)
  assert.equal(E.bar('plan').state, 'done')
  assert.equal(r.block, undefined)
})

test('B4 soft and off never block at Stop, but a question still marks the bar', async () => {
  for (const nudge of ['soft', 'off']) {
    const E = await boot({ options: { nudge } })
    await E.turnStart()
    await create(E)
    await E.work('Edit')
    assert.equal((await E.stop('All set.')).block, undefined, nudge)
    await E.stop('Ready?')
    assert.equal(E.bar('t').state, 'needs_input', nudge)
  }
})

// ---------- B5: persistence ----------

const saved = (store, id = 'session-1') => JSON.parse(store.get(`bars:${id}`))

test('B5 a write is saved after 2 s of quiet, once, however many writes came', async () => {
  const E = await boot()
  await create(E)
  assert.equal(E.pendingTimers(), 1)
  await E.advance(1500)
  await E.call({ id: 't', next: true })
  await create(E, 'u')
  assert.equal(E.pendingTimers(), 1, 'one timer, not one per write')
  await E.advance(499)
  assert.equal(E.store.size, 0)
  await E.advance(1)
  const snap = saved(E.store)
  assert.equal(snap.v, 1)
  assert.deepEqual(snap.bars.map(b => b.id), ['t', 'u'])
  assert.deepEqual({ sessionId: snap.sessionId, cwd: snap.cwd, root: snap.root, repo: snap.repo, savedAt: snap.savedAt }, { sessionId: 'session-1', cwd: '/work/app', root: '/work/app', repo: 'acme/app', savedAt: E.now() })
  assert.equal(E.pendingTimers(), 0)
  await E.call({ id: 't', next: true })
  assert.equal(E.pendingTimers(), 1, 'the next write schedules again')
})

test('B5 a restart restores the bars without strips and opens the band', async () => {
  const store = new Map()
  const first = await boot({ store })
  await create(first)
  await first.call({ id: 't', next: true })
  first.seedBars(first.bars().map(b => ({ ...b, agents: [{ id: 'ag1', title: 'x', state: 'running', tool: 'Grep', startedAt: 1, endedAt: null, depth: 0, calls: 0, errors: 0, streak: 0, output: 0 }], agentsDoneAt: 7 })))
  await first.sessionEnd()
  const second = await boot({ store })
  assert.equal(second.steps('t'), first.steps('t'))
  assert.deepEqual(second.bar('t').agents, [])
  assert.equal(second.bar('t').agentsDoneAt, null)
  assert.equal(second.view().isOpen, true)
  assert.equal(second.bar('t').startedAt, first.bar('t').startedAt)
})

test('B5 session.start again (a reload) keeps the state it has; it restores only into an empty state', async () => {
  const E = await boot()
  await create(E)
  await E.advance(2000)
  await E.call({ id: 't', next: true })
  await E.sessionStart()
  assert.equal(E.steps('t'), 'A:done B:active C:pending', 'newer than the store, so not overwritten')
  assert.equal(E.registeredTools.length, 2, 'the tool is registered again on each start')
})

test('B5 another session id, or an unknown version, restores nothing', async () => {
  const store = new Map()
  const first = await boot({ store })
  await create(first)
  await first.sessionEnd()
  assert.deepEqual((await boot({ store, session: { id: 'other' } })).bars(), [])
  store.set('bars:session-1', JSON.stringify({ ...saved(store), v: 2 }))
  assert.deepEqual((await boot({ store })).bars(), [])
  store.set('bars:session-1', '{"v":1,"bars":"nope"}')
  assert.deepEqual((await boot({ store })).bars(), [])
})

test('B5 session.end saves at once when there is time, and not when there is none', async () => {
  const store = new Map()
  const E = await boot({ store })
  await create(E)
  await E.sessionEnd('other', 200)
  assert.equal(store.size, 0)
  await E.sessionEnd('other', 1500)
  assert.deepEqual(saved(store).bars.map(b => b.id), ['t'])
})

test('B5 LRU: 30 sessions are kept, the oldest go, a session saved again moves to the end', async () => {
  const store = new Map()
  for (let i = 0; i < 30; i++) {
    const E = await boot({ store, session: { id: `s${i}` } })
    await create(E)
    await E.advance(2000)
  }
  assert.equal(store.size, 30)
  const again = await boot({ store, session: { id: 's0' } })
  await again.call({ id: 't', next: true })
  await again.advance(2000)
  assert.equal([...store.keys()].at(-1), 'bars:s0')
  const next = await boot({ store, session: { id: 's30' } })
  await create(next)
  await next.advance(2000)
  assert.equal(store.size, 30)
  assert.equal(store.has('bars:s1'), false, 'the oldest was dropped')
  assert.equal(store.has('bars:s0'), true, 'the one used again stays')
  assert.equal(store.has('bars:s30'), true)
})

test('B5 other store keys are not counted against the 30', async () => {
  const store = new Map([['prefs', '{"density":"full"}']])
  for (let i = 0; i < 31; i++) {
    const E = await boot({ store, session: { id: `s${i}` } })
    await create(E)
    await E.advance(2000)
  }
  assert.equal(store.has('prefs'), true)
  assert.equal([...store.keys()].filter(k => k.startsWith('bars:')).length, 30)
})

test('B5 size limit: finished bars are dropped from the snapshot oldest first, then each bar is cut to 40 steps', async () => {
  const fat = (id, n, over = {}) => bar(id, { stages: [{ name: 'S', steps: Array.from({ length: n }, (_, i) => ({ title: `${id}-${i}-${'x'.repeat(100)}`, status: 'done' })) }], ...over })
  const store = new Map()
  const E = await boot({ store })
  E.seedBars([fat('old', 400, { state: 'done' }), fat('live', 400), fat('new', 400, { state: 'done' }), fat('last', 400, { state: 'done' })])
  await E.sessionEnd()
  const snap = saved(store)
  assert.ok(JSON.stringify(snap).length <= 96_000)
  assert.deepEqual(snap.bars.map(b => b.id), ['live'], 'old, new and last went, oldest first, until it fit')
  const E2 = await boot({ store: new Map(), session: { id: 'big' } })
  E2.seedBars([fat('a', 500), fat('b', 500)])
  await E2.sessionEnd()
  const cut = saved(E2.store, 'big')
  assert.ok(JSON.stringify(cut).length <= 96_000)
  assert.deepEqual(cut.bars.map(b => b.stages.flatMap(s => s.steps).length), [40, 40])
})

test('B5 no bars: the key is deleted', async () => {
  const store = new Map()
  const E = await boot({ store })
  await create(E)
  await E.advance(2000)
  assert.equal(store.size, 1)
  E.seedBars([])
  await E.sessionEnd()
  assert.equal(store.size, 0)
})

test('B5 /clear saves, then empties bars, agent homes and the timeline, and cancels a pending save', async () => {
  const store = new Map()
  const E = await boot({ store })
  await create(E)
  E.seed('progress-hud', 'agentHome', { ag1: 't' })
  E.seed('progress-hud', 'timeline', [{ at: 1, tone: 'info', text: 'x' }])
  await E.call({ id: 't', next: true })
  assert.equal(E.pendingTimers(), 1)
  await E.sessionEnd('clear')
  assert.deepEqual(E.bars(), [])
  assert.deepEqual(E.homes(), {})
  assert.deepEqual(E.value('progress-hud', 'timeline', null), [])
  assert.deepEqual(saved(store).bars.map(b => b.id), ['t'], 'the old conversation stays stored for --resume')
  assert.equal(E.pendingTimers(), 0)
  await E.advance(10_000)
  assert.deepEqual(saved(store).bars.map(b => b.id), ['t'], 'nothing erased it afterwards')
  E.setSession({ id: 'session-2' })
  await create(E, 'u')
  await E.advance(2000)
  assert.deepEqual([...store.keys()], ['bars:session-1', 'bars:session-2'])
})

test('B5 /clear still empties the state when the budget is too short to save', async () => {
  const store = new Map()
  const E = await boot({ store })
  await create(E)
  await E.sessionEnd('clear', 100)
  assert.deepEqual(E.bars(), [])
  assert.equal(store.size, 0)
})

test('B5 prefs: the density is read at start; a bad value is ignored', async () => {
  const store = new Map([['prefs', '{"density":"compact"}']])
  assert.equal((await boot({ store })).view().density, 'compact')
  store.set('prefs', '{"density":"huge"}')
  assert.equal((await boot({ store })).view().density, 'full')
})

test('B5 the store is touched under bars:<id> and prefs only', async () => {
  const E = await boot()
  await create(E)
  await E.sessionEnd('clear')
  assert.ok([...E.store.keys()].every(k => k.startsWith('bars:') || k === 'prefs'))
})

// ---------- B12 (part): failures leave the session alone ----------

test('B12 state writes failing: the tool answers with the internal-error result, other hooks pass through', async () => {
  const E = await boot()
  await create(E)
  E.fail.stateSet = true
  const r = await E.call({ id: 't', next: true })
  assert.deepEqual(r, { result: INTERNAL_ERROR })
  assert.equal(r.deny, undefined, 'never a deny, so the model is not told to retry')
  const ran = await E.work('Edit')
  assert.deepEqual(ran, { result: {}, text: '' })
  assert.deepEqual((await E.submit('go on')).text, 'go on')
  const q = await E.askUser()
  assert.deepEqual(q.result, { answers: {} })
  assert.deepEqual((await E.exitPlan({ result: { plan: PLAN }, text: 'ok' })).text, 'ok')
  assert.equal((await E.exitPlan({ result: { plan: PLAN }, text: 'ok' })).context, undefined, 'no bar made, so the model is not told about one')
  assert.deepEqual(await E.stop('Is it?'), {})
  assert.deepEqual(await E.turnComplete(), { text: 'done' })
  assert.deepEqual(await E.sessionEnd('clear'), { sessionId: 'session-1' })
  assert.deepEqual(await E.turnStart(), { turnId: 't' })
  assert.ok((await E.compose()).sections.some(s => s.id === RULES_ID))
  assert.ok(E.logs.some(l => l.to === 'debug' && l.text.startsWith('progress-hud: ')))
})

test('B12 session.start survives a failing store and a failing state', async () => {
  const E = await boot({ start: false })
  E.fail.stateSet = true
  E.store.set('bars:session-1', JSON.stringify({ v: 1, bars: [bar('x')] }))
  const r = await E.sessionStart()
  assert.deepEqual(r, {})
  assert.equal(E.registeredTools.length, 1)
})

test('B12 store writes failing: tool calls are unaffected and the failure is logged once', async () => {
  const E = await boot()
  E.fail.storeSet = true
  assert.equal(res(await create(E)), 't: 0/3, running, active "A"')
  await E.advance(2000)
  await E.call({ id: 't', next: true })
  await E.advance(2000)
  assert.equal(E.store.size, 0)
  assert.equal(E.logs.filter(l => l.text.includes('save')).length, 1, 'reported once, not at every failure')
  assert.equal(E.bar('t').rev, 2)
  assert.deepEqual(await E.sessionEnd(), { sessionId: 'session-1' })
})

test('B12 audio failing changes nothing (nothing plays yet, so nothing can fail)', async () => {
  const E = await boot()
  E.fail.audioPlay = true
  await create(E)
  assert.equal(res(await E.call({ id: 't', state: 'done' })), 't: 3/3, done')
  assert.deepEqual(E.sounds, [])
})

// ---------- hooks: next once, .catch everywhere ----------

test('every hook ran next exactly once, except the tool answering for itself and a refusing gate', async () => {
  const E = await boot({ options: { nudge: 'strict' } })
  await E.compose()
  await E.submit('hi')
  await E.turnStart()
  await create(E)
  await E.call({ id: 't', done: ['Nope'] })
  await edits(E, 3)
  await E.work('Edit', { isError: true })
  await E.work('Edit', { deny: true })
  await E.tool('Bash', { command: 'ls' })
  await E.askUser()
  await E.exitPlan({ result: { plan: PLAN } })
  await E.exitPlan({ deny: 'no' })
  await E.stop('Is it?')
  await E.stop('Done.')
  await E.turnComplete()
  await E.turnComplete({ agentId: 'ag1' })
  await E.sessionEnd('other')
  await E.sessionEnd('clear')
  await E.turnStart()
  await edits(E, 3)
  assert.equal((await E.work('Edit')).deny, GATE_DENY)
  const own = E.hooks.find(x => x.matcher?.tool === TOOL).index
  assert.ok(E.stats.length > 25)
  for (const s of E.stats) {
    assert.ok(s.coreRuns <= 1, `${s.event}: the tool was reached once at most`)
    for (const h of s.hooks) {
      assert.equal(h.threw, null, `${s.event}: no hook threw`)
      assert.ok(h.nexts <= 1, `${s.event}: next at most once`)
      if (s.coreRuns === 1 && h.index !== own) assert.equal(h.nexts, 1, `${s.event}: when the tool ran, next was called once`)
      if (s.event !== 'tool.call') assert.equal(h.nexts, 1, `${s.event}: next once`)
    }
  }
})

test('every hook has a .catch; the tool\'s answers with the internal-error result, the others pass the event on', async () => {
  const E = await boot()
  assert.equal(E.hooks.length, 22)
  const event = { x: 1 }
  for (const h of E.hooks) {
    assert.equal(typeof h.catchFn, 'function', `${h.event} has a .catch`)
    const passed = []
    // turn.step streams: its hook and its .catch are generators, next(e) a stream
    const isStream = h.event === 'turn.step'
    const next = isStream ? async function* (ev) { passed.push(ev); return 'from below' } : ev => (passed.push(ev), 'from below')
    let out = await h.catchFn(E.$, event, next)
    if (isStream) for (;;) { const x = await out.next(); if (x.done) { out = x.value; break } }
    if (h.matcher?.tool === TOOL) assert.deepEqual(out, { result: INTERNAL_ERROR })
    else if (h.event === 'command.run') assert.deepEqual(out, { text: INTERNAL_ERROR }, 'a command answers for itself')
    else {
      assert.equal(out, 'from below', `${h.event} passes the event on`)
      assert.deepEqual(passed, [event])
    }
  }
})

test('the stub engine refuses a $ call outside the allow list', async () => {
  const E = await boot()
  assert.throws(() => E.$.process, /not in the allow list/)
  assert.throws(() => E.$.fs, /not in the allow list/)
  assert.throws(() => E.$.http, /not in the allow list/)
  assert.throws(() => E.$.store.list, /not in the allow list/)
  assert.throws(() => E.$.clock.sleep, /not in the allow list/)
  assert.throws(() => E.$.audio.speak, /not in the allow list/)
})

test('every $ call the hooks made is on the allow list, and the store keys are bars:<id> or prefs', async () => {
  const E = await boot()
  await create(E)
  await E.exitPlan({ result: { plan: PLAN } })
  await E.advance(2000)
  await E.submit('x')
  await E.sessionEnd('clear')
  assert.ok(E.calls.length > 10)
  for (const c of E.calls) assert.ok(ALLOWED.includes(c), c)
})
