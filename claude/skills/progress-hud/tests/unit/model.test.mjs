// A1: model / bars / rules as the progress tool drives them.
// Derived from zycck/claude-mods plugins/plan-progress/tests/regress.mjs (commit 549ecee), MIT License, (c) 2026 Kirill Serditov. Modified for progress-hud. See THIRD_PARTY_NOTICES.md.
//
// The reference ran its cases through the whole register.tsx; here each case runs through the pure functions the tool hook will call
// (reservedRefusal -> normalize -> placeBar -> resultText), in the harness below. Changes against regress.mjs, and why:
//   - plan_progress -> progress, "plan-progress:" -> "progress-hud:" (renamed tool and prefix, DESIGN 1.2 / 5.2)
//   - Plan objects are Bars now (agents, meter and counters are always present), so T16/T17/T16b check the strips on the stored bar
//   - deny text for a missing step has the new form (DESIGN 5.2); T14 still checks the steps are listed
//   - the 80/12 limits and the reserved ids are new (DESIGN 5.1 / 5.2): see the "limits" and "reserved ids" cases
// Not ported here because they need hooks, a clock and counters that live in register.tsx; they come back as scenario tests in S2 (B3, B4)
// and S4 (B6): T23 T24 T25 T25b (nudge counters and gates), stop_still_blocks_open_bar and N2's Stop half (classic.Stop),
// T30/T31's deny / isError halves (ExitPlanMode hook), bars_survive_a_restart (S3), and every drawing case (A10 in S8).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { activeBar, barIdOf, isOpenBar, placeBar, reservedRefusal } from '../.build/core/bars.mjs'
import { applyOps, carryDone, isRefusal, newBar, normalize, pointAt, same, slug, stepTimes, str, where } from '../.build/core/model.mjs'
import { parsePlan } from '../.build/core/planmd.mjs'
import { PLAN_CONTEXT, TOOL_SPEC } from '../.build/core/rules.mjs'
import { ZERO as METER, S, hud, res, st, three } from '../fixtures.mjs'

test('T01 next walks the steps', () => {
  const E = hud()
  E.create()
  E.call({ id: 't', next: true })
  E.call({ id: 't', next: true })
  assert.equal(E.steps('t'), 'A:done B:done C:active')
})

test('T02/T04 a resent plan replaces the steps and stays one bar', () => {
  const E = hud()
  E.create()
  E.call({ id: 't', next: true })
  E.call({ id: 't', stages: [S('New', st('C', 'active'), st('A', 'done'), st('B2', 'pending'))] })
  assert.equal(E.bars().length, 1)
  assert.equal(E.steps('t'), 'C:active A:done B2:pending')
})

test('T03 percent follows the total after steps are appended', () => {
  const E = hud()
  E.create()
  E.call({ id: 't', next: true })
  E.call({ id: 't', next: true })
  assert.equal(E.pct('t'), 67)
  E.call({ id: 't', stages: [S('One', st('A', 'done'), st('B', 'done')), S('Two', st('C', 'active'), 'D')] })
  assert.equal(E.pct('t'), 50)
})

test('T05 a resent plan keeps done by title', () => {
  const E = hud()
  E.create()
  E.call({ id: 't', next: true })
  E.call({ id: 't', next: true })
  E.call({ id: 't', stages: [S('One', 'A', 'B'), S('Two', 'C', 'D')] })
  assert.equal(E.steps('t'), 'A:done B:done C:active D:pending')
})

test('T05b an explicit active redoes a step', () => {
  const E = hud()
  E.create()
  E.call({ id: 't', next: true })
  E.call({ id: 't', stages: [S('One', st('A', 'active'), 'B'), S('Two', 'C')] })
  assert.equal(E.steps('t'), 'A:active B:pending C:pending')
})

test('T06/T07 steps may be created without a status; the schema asks for a title only', () => {
  const E = hud()
  const r = E.call({ id: 't', title: 'Task', stages: [{ name: 'One', steps: [{ title: 'A' }, { title: 'B' }] }] })
  const items = TOOL_SPEC.inputSchema.properties.stages.items.properties.steps.items
  assert.equal(E.steps('t'), 'A:active B:pending')
  assert.equal(res(r), 't: 0/2, running, active "A"')
  assert.deepEqual(items.required, ['title'])
})

test('T08 a revised plan keeps the finished steps', () => {
  const E = hud()
  const plan = '# Fix login\n\n## Analyse\n- Read code\n- Find bug\n## Fix\n- Patch\n- Test'
  E.exitPlan(plan)
  E.call({ id: 'plan', next: true })
  E.call({ id: 'plan', next: true })
  E.exitPlan(plan + '\n- Deploy')
  assert.equal(E.steps('plan'), 'Read code:done Find bug:done Patch:active Test:pending Deploy:pending')
})

test('T09 a new title lands on the same bar', () => {
  const E = hud()
  E.exitPlan('# Fix login\n## A\n- One\n- Two\n## B\n- Three')
  E.exitPlan('# Fix login flow\n## A\n- One\n- Two\n## B\n- Three')
  assert.deepEqual(E.bars().map(b => `${b.id}:${b.title}`), ['plan:Fix login flow'])
})

test('T10 ticked boxes are done', () => {
  const E = hud()
  E.exitPlan('# Ship\n- [x] Read code\n- [x] Find bug\n- [ ] Patch')
  assert.equal(E.steps('plan'), 'Read code:done Find bug:done Patch:active')
})

test('T11 active forward finishes the steps before it and leaves later ones', () => {
  const E = hud()
  E.create()
  E.call({ id: 't', active: 'C' })
  assert.equal(E.steps('t'), 'A:done B:pending C:active')
})

test('T12 stages out of order: count and current stage follow the steps', () => {
  const E = hud()
  const r = E.call({ id: 't', title: 'Task', stages: [S('First', st('A', 'pending')), S('Second', st('B', 'active'), st('C', 'done'))] })
  assert.match(res(r), /1\/3/)
  assert.equal(where(E.bar('t')).stage, 1)
  assert.equal(E.pct('t'), 33)
})

test('T13 a title used twice means the one still open', () => {
  const E = hud()
  E.call({ id: 't', title: 'Task', stages: [S('Backend', st('API', 'active'), 'Tests'), S('Frontend', 'UI', 'Tests')] })
  E.call({ id: 't', done: ['Tests'] })
  E.call({ id: 't', done: ['Tests'] })
  assert.equal(E.steps('t'), 'API:active Tests:done UI:pending Tests:done')
})

test('T14 an unknown step is refused, the bar stays and the steps are listed', () => {
  const E = hud()
  E.create()
  const r = E.call({ id: 't', done: ['Nonexistent'] })
  assert.ok(r.deny)
  assert.ok(r.deny.includes('A, B, C'))
  assert.equal(r.deny, 'progress-hud: "t" has no step "Nonexistent". Its steps: A, B, C')
  assert.equal(E.steps('t'), 'A:active B:pending C:pending')
})

test('T15 ops sent with stages apply on top', () => {
  const E = hud()
  E.create()
  E.call({ id: 't', stages: [S('One', st('A', 'active'), 'B'), S('Two', 'C')], next: true })
  assert.equal(E.steps('t'), 'A:done B:active C:pending')
})

test('T16/T17 a resend keeps the agent strips on the stored bar', () => {
  const E = hud()
  E.create()
  const run = { id: 'ag1', title: 'Scan tests', state: 'running', tool: 'Grep', startedAt: 1, endedAt: null, depth: 0, calls: 0, errors: 0, streak: 0, output: 0 }
  // the agent code writes strips straight onto the bar; the tool hook's next write must not lose them
  E.bars().splice(0, 1, { ...E.bar('t'), agents: [run] })
  E.call({ id: 't', next: true })
  E.call({ id: 't', stages: [S('One', 'A', 'B', 'X'), S('Two', 'C')] })
  assert.deepEqual(E.bar('t').agents, [run])
})

test('T16b strips survive a plan import', () => {
  const E = hud()
  E.exitPlan('# P\n## A\n- One\n## B\n- Two')
  const run = { id: 'ag1', title: 'Scan tests', state: 'running', tool: 'Grep', startedAt: 1, endedAt: null, depth: 0, calls: 0, errors: 0, streak: 0, output: 0 }
  E.bars().splice(0, 1, { ...E.bar('plan'), agents: [run] })
  E.exitPlan('# P\n## A\n- One\n## B\n- Two\n- Three')
  assert.equal(E.bar('plan').agents.length, 1)
})

test('T19 two next calls in a row move two steps (the second sees the first)', () => {
  const E = hud()
  E.create()
  E.call({ id: 't', next: true })
  E.call({ id: 't', next: true })
  assert.equal(E.steps('t'), 'A:done B:done C:active')
})

test('T20 two bars created one after the other stay two bars', () => {
  const E = hud()
  E.create('x')
  E.create('y')
  assert.deepEqual(E.bars().map(b => b.id), ['x', 'y'])
})

test('T21 an unknown failed step is refused and the state stays', () => {
  const E = hud()
  E.create()
  const r = E.call({ id: 't', failed: 'Nope' })
  assert.ok(r.deny)
  assert.equal(E.bar('t').state, 'running')
})

test('T22 the done result names no active step', () => {
  const E = hud()
  E.create()
  const r = E.call({ id: 't', state: 'done' })
  assert.equal(res(r), 't: 3/3, done')
})

test('T27 the schema has no substeps', () => {
  const props = TOOL_SPEC.inputSchema.properties.stages.items.properties.steps.items.properties
  assert.deepEqual(Object.keys(props), ['title', 'status'])
})

test('T30/T31 a plan with nothing to show makes no bar', () => {
  // the deny and isError halves live in the ExitPlanMode hook (S2); the null plan and the empty plan are parsePlan's
  const E = hud()
  assert.equal(E.exitPlan(''), null)
  assert.equal(E.exitPlan('just some words, no list'), null)
  assert.equal(E.bars().length, 0)
})

test('T32 next wraps back to a step left open earlier, then finishes', () => {
  const E = hud()
  E.call({ id: 't', title: 'Task', stages: [S('One', 'A', st('B', 'active'), 'C')] })
  E.call({ id: 't', next: true })
  E.call({ id: 't', next: true })
  assert.equal(E.steps('t'), 'A:active B:done C:done')
  E.call({ id: 't', next: true })
  assert.equal(E.bar('t').state, 'done')
})

test('N1 the model is told the bar id after a plan import', () => {
  assert.ok(PLAN_CONTEXT.includes('"plan"'))
})

test('N2 a plan walked to its end is one bar and no longer open', () => {
  const E = hud()
  E.exitPlan('# Fix login\n## A\n- One\n## B\n- Two')
  assert.equal(isOpenBar(E.bar('plan')), true)
  E.call({ id: 'plan', next: true })
  E.call({ id: 'plan', next: true })
  assert.equal(E.bars().length, 1)
  assert.equal(E.bar('plan').state, 'done')
  assert.equal(isOpenBar(E.bar('plan')), false)
})

test('done on the active step moves on', () => {
  const E = hud()
  E.create()
  const r = E.call({ id: 't', done: ['A'] })
  assert.equal(res(r), 't: 1/3, running, active "B"')
  assert.equal(E.steps('t'), 'A:done B:active C:pending')
})

// ---- new in progress-hud ----

test('skip: a skipped step counts as finished and carries doneAt', () => {
  const E = hud()
  E.create()
  E.tick(5000)
  const r = E.call({ id: 't', skip: ['B'] })
  assert.equal(E.steps('t'), 'A:active B:skipped C:pending')
  assert.equal(E.bar('t').stages[0].steps[1].doneAt, E.now())
  assert.equal(res(r), 't: 1/3, running, active "A"')
})

test('skip: skipping the active step moves on to the next', () => {
  const E = hud()
  E.create()
  const r = E.call({ id: 't', skip: ['A'] })
  assert.equal(E.steps('t'), 'A:skipped B:active C:pending')
  assert.equal(res(r), 't: 1/3, running, active "B"')
})

test('skip: done is applied before skip, and skipping everything finishes the bar', () => {
  const E = hud()
  E.create()
  const r = E.call({ id: 't', done: ['A'], skip: ['B', 'C'] })
  assert.equal(E.steps('t'), 'A:done B:skipped C:skipped')
  assert.equal(res(r), 't: 3/3, done')
})

test('skip: an unknown title is refused and nothing changes', () => {
  const E = hud()
  E.create()
  const before = E.steps('t')
  const r = E.call({ id: 't', skip: ['B', 'Nope'] })
  assert.match(r.deny, /has no step "Nope"/)
  assert.equal(E.steps('t'), before)
})

test('skip: a step already finished is left alone', () => {
  const E = hud()
  E.create()
  E.call({ id: 't', done: ['A'] })
  const at = E.bar('t').stages[0].steps[0].doneAt
  E.tick(1000)
  E.call({ id: 't', skip: ['A'] })
  assert.equal(E.bar('t').stages[0].steps[0].status, 'done')
  assert.equal(E.bar('t').stages[0].steps[0].doneAt, at)
})

test('skip: a resent plan keeps skipped by title', () => {
  const E = hud()
  E.create()
  E.call({ id: 't', skip: ['B'] })
  E.call({ id: 't', stages: [S('One', 'A', 'B'), S('Two', 'C')] })
  assert.equal(E.steps('t'), 'A:active B:skipped C:pending')
})

test('NFKC: full-width and half-width titles are the same step', () => {
  assert.equal(same('ＡＰＩ', 'API'), true)
  assert.equal(same('  Ｒoute Check ', 'route check'), true)
  assert.equal(same('API', 'APIs'), false)
  const E = hud()
  E.call({ id: 't', title: 'Task', stages: [S('One', 'API', 'ＤＢ')] })
  E.call({ id: 't', done: ['ａｐｉ'] })
  E.call({ id: 't', skip: ['db'] })
  assert.equal(E.steps('t'), 'API:done ＤＢ:skipped')
})

test('NFKC: carryDone matches across widths', () => {
  const E = hud()
  E.call({ id: 't', title: 'Task', stages: [S('One', 'ＡＰＩ', 'B')] })
  E.call({ id: 't', done: ['ＡＰＩ'] })
  E.call({ id: 't', stages: [S('One', 'API', 'B', 'C')] })
  assert.equal(E.steps('t'), 'API:done B:active C:pending')
})

test('same falls back to trim + lowercase when String.prototype.normalize is missing', () => {
  const real = String.prototype.normalize
  try {
    // @ts-expect-error simulating an engine without normalize
    String.prototype.normalize = undefined
    assert.equal(same(' Api ', 'API'), true)
    assert.equal(same('ＡＰＩ', 'API'), false)
  } finally {
    String.prototype.normalize = real
  }
})

test('limits: 12 stages and 80 steps pass, one more is refused', () => {
  const stages = n => Array.from({ length: n }, (_, i) => S(`S${i}`, `step ${i}`))
  const E = hud()
  assert.ok(E.call({ id: 'a', title: 'A', stages: stages(12) }).result)
  const r13 = E.call({ id: 'b', title: 'B', stages: stages(13) })
  assert.equal(r13.deny, 'progress-hud: too many stages or steps (max 12 stages, 80 steps).')
  assert.equal(E.bar('b'), undefined)
  const steps = n => [S('One', ...Array.from({ length: n }, (_, i) => `s${i}`))]
  assert.ok(E.call({ id: 'c', title: 'C', stages: steps(80) }).result)
  assert.match(E.call({ id: 'd', title: 'D', stages: steps(81) }).deny, /too many stages or steps/)
})

test('limits: an over-long resend is refused and the bar keeps its steps', () => {
  const E = hud()
  E.create()
  const before = E.steps('t')
  const r = E.call({ id: 't', stages: [S('One', ...Array.from({ length: 81 }, (_, i) => `s${i}`))] })
  assert.ok(r.deny)
  assert.equal(E.steps('t'), before)
})

test('limits: title 80, stage name 80, step title 120, note 160, id 40', () => {
  const E = hud()
  const long = n => 'x'.repeat(n + 50)
  E.call({ id: long(0), title: long(80), stages: [{ name: long(80), steps: [{ title: long(120) }] }], state: 'needs_input', note: long(160) })
  const b = E.bars()[0]
  assert.equal(b.id.length, 40)
  assert.equal(b.title.length, 80)
  assert.equal(b.stages[0].name.length, 80)
  assert.equal(b.stages[0].steps[0].title.length, 120)
  assert.equal(b.note.length, 160)
  assert.equal(slug('é'.repeat(100)).length, 40)
  assert.equal(str('  a \n b  '), 'a b')
})

test('reserved ids: tasks and agents:auto are refused, plan and demo-* are not', () => {
  const E = hud()
  assert.equal(E.call({ id: 'tasks', title: 'x', stages: three() }).deny, 'progress-hud: "tasks" mirrors TaskCreate/TaskUpdate; update those tasks instead.')
  assert.equal(E.call({ id: 'Tasks', next: true }).deny, 'progress-hud: "tasks" mirrors TaskCreate/TaskUpdate; update those tasks instead.')
  assert.equal(E.call({ title: 'Tasks', stages: three() }).deny, 'progress-hud: "tasks" mirrors TaskCreate/TaskUpdate; update those tasks instead.')
  assert.equal(E.call({ id: 'agents:auto', next: true }).deny, 'progress-hud: "agents:auto" is managed by the HUD.')
  assert.equal(E.call({ id: ' Agents:Auto ', stages: three() }).deny, 'progress-hud: "agents:auto" is managed by the HUD.')
  assert.equal(E.bars().length, 0)
  assert.ok(E.call({ id: 'plan', title: 'P', stages: three() }).result)
  assert.ok(E.call({ id: 'demo-x', title: 'D', stages: three() }).result)
  // slug() cannot produce the colon, so a model id can never land on the agents bar
  assert.equal(barIdOf({ id: 'agents:auto' }), 'agents-auto')
})

test('an unknown id without stages is refused', () => {
  const E = hud()
  assert.equal(E.call({ id: 'ghost', next: true }).deny, 'progress-hud: no bar "ghost" yet; create it with title and stages.')
  assert.equal(E.call({ id: 'ghost', state: 'done' }).deny, 'progress-hud: no bar "ghost" yet; create it with title and stages.')
  assert.equal(E.bars().length, 0)
})

test('state: asked state wins; failed gives error; ops without a state return to running and clear the note', () => {
  const E = hud()
  E.create()
  E.call({ id: 't', state: 'needs_input', note: 'Run the migration?' })
  assert.equal(E.bar('t').state, 'needs_input')
  assert.equal(E.bar('t').note, 'Run the migration?')
  E.call({ id: 't', next: true })
  assert.equal(E.bar('t').state, 'running')
  assert.equal(E.bar('t').note, null)
  const r = E.call({ id: 't', failed: 'C', note: '2 failed' })
  assert.equal(E.bar('t').state, 'error')
  assert.match(res(r), /^t: \d\/3, error/)
  E.call({ id: 't', state: 'bogus' })
  assert.equal(E.bar('t').state, 'running')
})

test('a done bar returns to running when new ops arrive', () => {
  const E = hud()
  E.create()
  E.call({ id: 't', state: 'done' })
  assert.equal(E.bar('t').state, 'done')
  assert.notEqual(E.bar('t').endedAt, null)
  E.call({ id: 't', stages: [S('One', 'A', 'B', 'C', 'D')] })
  assert.equal(E.bar('t').state, 'running')
  assert.equal(E.bar('t').endedAt, null)
  assert.equal(E.bar('t').meterEnd, null)
})

test('clock and meter: startedAt and meterStart at creation, endedAt and meterEnd at done, then fixed', () => {
  const start = { ...METER, output: 100, costUsd: 0.5 }
  const E = hud({ meter: start })
  E.create()
  const t0 = E.now()
  E.tick(4000)
  E.call({ id: 't', next: true })
  assert.equal(E.bar('t').startedAt, t0)
  assert.deepEqual(E.bar('t').meterStart, start)
  assert.equal(E.bar('t').meterEnd, null)
  E.tick(1000)
  E.call({ id: 't', state: 'done' })
  const doneAt = E.now()
  assert.equal(E.bar('t').endedAt, doneAt)
  assert.deepEqual(E.bar('t').meterEnd, start)
  E.tick(9000)
  E.call({ id: 't', state: 'done' })
  assert.equal(E.bar('t').endedAt, doneAt)
})

test('new bars carry the defaults the other modules rely on', () => {
  const E = hud()
  E.create()
  const b = E.bar('t')
  assert.deepEqual([b.source, b.kind, b.agents, b.agentsDoneAt, b.mainErrors, b.mainStreak, b.lastErrorTool, b.collapsed], ['tool', 'plan', [], null, 0, 0, null, false])
  E.call({ id: 'k', title: 'K', kind: 'todo', stages: [S('One', 'A')] })
  assert.equal(E.bar('k').kind, 'todo')
  E.call({ id: 'k', next: true })
  assert.equal(E.bar('k').kind, 'todo')
})

test('rev goes up with every write and the new bar starts at 1', () => {
  const E = hud()
  E.create()
  assert.equal(E.bar('t').rev, 1)
  E.call({ id: 't', next: true })
  assert.equal(E.bar('t').rev, 2)
  E.create('u')
  assert.equal(E.bar('t').rev, 2)
  assert.equal(E.bar('u').rev, 1)
})

test('inputs are never changed', () => {
  const deepFreeze = o => {
    if (o && typeof o === 'object') Object.values(o).forEach(deepFreeze)
    return Object.freeze(o)
  }
  const stages = deepFreeze(three())
  const bar = deepFreeze(normalize({ id: 't', title: 'T', stages }, null, 1, 't', METER))
  assert.ok(!isRefusal(bar))
  assert.doesNotThrow(() => normalize({ id: 't', next: true, done: ['B'], skip: ['C'], active: 'A', failed: 'A' }, bar, 2, 't', METER))
  assert.doesNotThrow(() => applyOps(bar.stages, { next: true }, 2))
  assert.doesNotThrow(() => carryDone(stages, bar.stages))
  assert.doesNotThrow(() => pointAt(stages))
  assert.doesNotThrow(() => placeBar([bar], { ...bar, id: 'u' }, 3))
})

test('placeBar: replaces in place, drops done bars first, then the oldest', () => {
  const bar = (id, state = 'running') => ({ ...newBar(id, 'tool', 0, METER), state })
  const ids = list => list.map(b => b.id)
  let list = placeBar([], bar('a'), 3)
  list = placeBar(list, bar('b', 'done'), 3)
  list = placeBar(list, bar('c'), 3)
  assert.deepEqual(ids(list), ['a', 'b', 'c'])
  list = placeBar(list, bar('d'), 3)
  assert.deepEqual(ids(list), ['a', 'c', 'd'])
  list = placeBar(list, bar('e'), 3)
  assert.deepEqual(ids(list), ['c', 'd', 'e'])
  list = placeBar(list, bar('c', 'needs_input'), 3)
  assert.deepEqual(ids(list), ['c', 'd', 'e'])
  assert.equal(list[0].state, 'needs_input')
  assert.deepEqual(ids(placeBar(list, bar('f'), 1)), ['f'])
})

test('isOpenBar and activeBar', () => {
  const mk = (id, state, status = 'pending') => ({ ...newBar(id, 'tool', 0, METER), state, stages: [{ name: 's', steps: [{ title: 'x', status }] }] })
  assert.equal(isOpenBar(mk('a', 'running')), true)
  assert.equal(isOpenBar(mk('a', 'running', 'done')), false)
  assert.equal(isOpenBar(mk('a', 'needs_input')), false)
  assert.equal(isOpenBar(mk('agents:auto', 'running')), false)
  assert.equal(isOpenBar(mk('tasks', 'running')), true)
  const bars = [mk('a', 'running'), mk('tasks', 'running'), mk('b', 'running'), mk('agents:auto', 'running'), mk('c', 'done')]
  assert.equal(activeBar(bars).id, 'b')
  assert.equal(activeBar([mk('a', 'needs_input'), mk('tasks', 'running'), mk('agents:auto', 'running')]).id, 'tasks')
  assert.equal(activeBar([mk('agents:auto', 'running'), mk('c', 'done')]), undefined)
  assert.equal(activeBar([]), undefined)
})

test('where: position, stage and step', () => {
  const E = hud()
  E.call({ id: 't', title: 'T', stages: [S('One', 'A', 'B'), S('Two', 'C', 'D', 'E')] })
  E.call({ id: 't', done: ['A', 'B', 'C'] })
  assert.deepEqual(where(E.bar('t')), { pos: 3, total: 5, stage: 1, step: 2, stageSize: 3 })
  E.call({ id: 't', state: 'done' })
  assert.deepEqual(where(E.bar('t')), { pos: 5, total: 5, stage: 1, step: 3, stageSize: 3 })
  assert.deepEqual(where({ state: 'running', stages: [] }), { pos: 0, total: 0, stage: 0, step: 0, stageSize: 0 })
})

test('stepTimes: a step took the time since the previous finish, a stage the time across its steps', () => {
  const bar = {
    startedAt: 1000,
    stages: [
      { name: 'One', steps: [{ title: 'A', status: 'done', doneAt: 1100 }, { title: 'B', status: 'done', doneAt: 1400 }] },
      { name: 'Two', steps: [{ title: 'C', status: 'done', doneAt: 1500 }, { title: 'D', status: 'active' }] },
    ],
  }
  const t = stepTimes(bar)
  assert.deepEqual([...t.steps.values()], [100, 300, 100])
  assert.deepEqual(t.stages, [400, undefined])
})

test('barIdOf: the id, else the title, else plan', () => {
  assert.equal(barIdOf({ id: 'Order API!' }), 'order-api')
  assert.equal(barIdOf({ title: '注文API改修' }), '注文api改修')
  assert.equal(barIdOf({}), 'plan')
})
