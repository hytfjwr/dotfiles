// B12 (DESIGN 11.2), whole: parts of $ made to fail one at a time and all together, while every hook of the mod runs.
// What must hold in every case: no hook throws (not even to its .catch), each calls next exactly once (a tool or a command that
// answers for itself, none), and what a hook returns is what the engine would have had with no hook at all, or what the
// mod returns when nothing is wrong. A tool answers { result: INTERNAL_ERROR } and a command { text: INTERNAL_ERROR }; a render
// hands back what is beneath. With every part failing at once the answer is always the fall-back one.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { INTERNAL_ERROR, RULES, RULES_ID, TOOL } from './.build/core/rules.mjs'
import { TEXT } from './.build/view/i18n.mjs'
import { FAULT_NAMES, boot } from './engine.mjs'
import { BELOW, PLAN, three } from './fixtures.mjs'
import { validateTree } from './surface-validator.mjs'

const todo = [{ content: 'Read', status: 'in_progress', activeForm: 'Reading' }, { content: 'Fix', status: 'pending', activeForm: 'Fixing' }]

// kind: how a step answers when something is wrong. 'core': what the engine gave with no hook. 'tool': INTERNAL_ERROR as a result.
// 'command': INTERNAL_ERROR as text. 'compose': the engine's sections and the rules (which need no $). 'render': what is beneath.
// 'healthy': what the mod answers with nothing wrong, for an answer that needs no $ (a refusal, a usage line)
const sequence = [
  ['session.start', 'core', E => E.sessionStart()],
  ['prompt.compose', 'compose', E => E.compose()],
  ['prompt.submit', 'core', E => E.submit('hi', { context: ['kept'] })],
  ['prompt.submit (bridge)', 'core', E => E.submit('hi', { origin: { kind: 'bridge' } })],
  ['turn.start', 'core', E => E.turnStart()],
  ['progress: create', 'tool', E => E.call({ id: 't', title: 'T', stages: three() })],
  ['progress: next', 'tool', E => E.call({ id: 't', next: true })],
  ['progress: unknown step', 'tool', E => E.call({ id: 't', done: ['Nope'] })],
  ['progress: needs_input', 'tool', E => E.call({ id: 't', state: 'needs_input', note: 'ok?' })],
  ['progress: reserved id', 'healthy', E => E.call({ id: 'tasks', next: true })],
  ['edit', 'core', E => E.work('Edit')],
  ['edit that failed', 'core', E => E.work('Edit', { isError: true })],
  ['edit denied by the engine', 'core', E => E.work('Write', { deny: true })],
  ['edit x4', 'core', async E => (await E.work('Edit'), await E.work('Edit'), await E.work('MultiEdit'), E.work('NotebookEdit'))],
  ['shell', 'core', E => E.tool('Bash', { command: 'make SECRET=1' })],
  ['AskUserQuestion', 'core', E => E.askUser()],
  ['ExitPlanMode', 'core', E => E.exitPlan({ result: { plan: PLAN }, text: 'ok' })],
  ['ExitPlanMode refused', 'core', E => E.exitPlan({ deny: 'no' })],
  ['TaskCreate', 'core', E => E.taskCreate('Read code', { id: '1' })],
  ['TaskUpdate', 'core', E => E.taskUpdate('1', { status: 'in_progress', activeForm: 'Reading' })],
  ['TodoWrite', 'core', E => E.todoWrite(todo)],
  ['agent.spawn', 'core', E => E.spawn('a1', 'Scan tests')],
  ['agent.spawn (child)', 'core', E => E.spawn('c1', 'child', { parentAgentId: 'a1' })],
  ['agent.spawn (no id)', 'core', E => E.spawn(undefined, 'none')],
  ['agent tool.call', 'core', E => E.agentTool('a1', 'Grep')],
  ['agent tool.call, held for a permission', 'core', E => E.agentTool('a1', 'Bash', { useId: 'tu1', check: async id => (await E.check('Bash', id), await E.advance(700)) })],
  ['agent tool.call that failed', 'core', E => E.agentTool('a1', 'Bash', { isError: true })],
  ['tool.check', 'core', E => E.check('Bash', 'x')],
  ['turn.step', 'core', async E => (await E.step('a1', { effort: 'high' }), E.step())],
  ['session.measure', 'core', E => E.measure({ cost: 1.5, percent: 40, five: 20 })],
  ['turn.complete (agent)', 'core', E => E.turnComplete({ agentId: 'a1', usage: { output_tokens: 10 } })],
  ['turn.complete (agent, aborted)', 'core', E => E.turnComplete({ agentId: 'c1', reason: 'aborted' })],
  ['turn.complete (main)', 'core', E => E.turnComplete({ usage: { output_tokens: 10 } })],
  ['classic.Stop', 'core', E => E.stop('All done.')],
  ['classic.Stop (question)', 'core', E => E.stop('Shall I go on?')],
  ['AbovePrompt, terminal', 'render', E => E.band({ below: BELOW })],
  ['AbovePrompt, terminal, nothing beneath', 'render', E => E.band()],
  ['AbovePrompt, desktop', 'render', E => E.band({ surface: 'desktop', below: BELOW })],
  ['AbovePrompt, desktop, nothing beneath', 'render', E => E.band({ surface: 'desktop' })],
  ['SessionMode, terminal', 'render', E => E.mode({ below: BELOW })],
  ['SessionMode, desktop', 'render', E => E.mode({ surface: 'desktop', below: BELOW })],
  ['/hud', 'command', E => E.command('hud')],
  ['/hud compact', 'command', E => E.command('hud', 'compact')],
  ['/hud full', 'command', E => E.command('hud', 'full')],
  ['/hud bogus', 'healthy', E => E.command('hud', 'bogus')],
  ['/hud-demo', 'command', E => E.command('hud-demo')],
  ['the demo plays', 'timers', async E => (await E.advance(13_000), await E.settle(), 'played')],
  ['/hud-sounds', 'command', E => E.command('hud-sounds')],
  ['the sounds play', 'timers', async E => (await E.advance(3000), await E.settle(), 'played')],
  ['AbovePrompt after the demo', 'render', E => E.band({ below: BELOW })],
  ['/hud-clear', 'command', E => E.command('hud-clear')],
  ['saves and ticks', 'timers', async E => (await E.advance(10_000), await E.settle(), 'played')],
  ['session.end', 'core', E => E.sessionEnd('other')],
  ['session.end (/clear)', 'core', E => E.sessionEnd('clear')],
]

// the same events with and without the mod, to know what the answers are; the mod boots with no fault. `pre`: a bar and an agent
// made before anything fails, so faults meet a session that is already going
async function run({ file, faults = [], start = true, pre = true, options } = {}) {
  const E = await boot({ file, start, options })
  if (file === undefined && start && pre) {
    await E.call({ id: 'pre', title: 'Before', stages: three() })
    await E.spawn('pre-a', 'Before the faults')
  }
  E.setFaults(faults)
  const out = []
  for (const [name, kind, fn] of sequence) {
    let result
    try {
      result = await fn(E)
    } catch (err) {
      assert.fail(`${name}: threw ${err?.stack ?? err}`)
    }
    out.push({ name, kind, result })
  }
  return { E, out }
}

const fallbackOf = (kind, base, healthy, name) => {
  if (kind === 'tool') return { result: INTERNAL_ERROR }
  if (kind === 'command') return { text: INTERNAL_ERROR }
  if (kind === 'compose') return { sections: [...base.sections, { id: RULES_ID, text: RULES, scope: 'session' }] }
  if (kind === 'healthy') return healthy
  assert.ok(['core', 'render', 'timers'].includes(kind), name)
  return base
}

// the checks that hold in every run. A chain runs in the order of registration: each hook calls next once, until one that answers for itself
// (a tool of ours, a command), which calls none; the hooks after it are never reached
function checkHooks(E, label) {
  assert.ok(E.stats.length > 50, `${label}: ${E.stats.length} events`)
  const own = new Set(E.hooks.filter(h => h.matcher?.tool === TOOL || h.event === 'command.run').map(h => h.index))
  for (const s of E.stats) {
    assert.ok(s.coreRuns <= 1, `${label}: ${s.event}: the engine ran the call more than once`)
    let answered = false
    for (const h of s.hooks) {
      assert.equal(h.threw, null, `${label}: ${s.event}: a hook threw: ${h.threw?.message}`)
      if (answered) assert.equal(h.nexts, 0, `${label}: ${s.event}: hook ${h.index} ran after one that answered`)
      else if (own.has(h.index)) {
        assert.equal(h.nexts, 0, `${label}: ${s.event}: an answering hook called next`)
        answered = true
      } else assert.equal(h.nexts, 1, `${label}: ${s.event}: next called ${h.nexts} times by hook ${h.index}`)
    }
    assert.equal(s.coreRuns, answered ? 0 : 1, `${label}: ${s.event}: the engine's own part runs when no hook answered`)
  }
}

const isTree = (result, surface) => result !== null && typeof result === 'object' && validateTree(result, surface).length === 0

function compare(label, step, got, base, healthy, all) {
  const { name, kind } = step
  const want = fallbackOf(kind, base, healthy, name)
  if (kind === 'render') {
    const surface = name.includes('desktop') ? 'desktop' : 'terminal'
    const beneath = name.includes('nothing beneath') ? null : BELOW
    assert.ok(got === beneath || (!all && isTree(got, surface)), `${label}: ${name}: neither what is beneath nor a valid tree`)
    return
  }
  if (all) return assert.deepEqual(got, want, `${label}: ${name}: with every part failing, the answer is the fall-back one`)
  // a command may also say there is no bar, which is true when the bar could not be written
  const alternatives = [want, healthy, ...(kind === 'command' ? [{ text: TEXT.ja['cmd.none'] }] : [])]
  assert.ok(alternatives.some(a => JSON.stringify(a) === JSON.stringify(got)), `${label}: ${name}: neither the fall-back answer nor the healthy one: ${JSON.stringify(got)}`)
}

const baseline = {}
const healthyRuns = {}
// the answers with no hook and with the mod, nothing failing; `anim` is the animation setting the mod runs with
async function reference(mode, anim = false) {
  const key = `${mode}${anim ? ':anim' : ''}`
  baseline[key] ??= (await run({ file: './empty-register.mjs', start: mode === 'running' })).out
  healthyRuns[key] ??= (await run({ start: mode === 'running', pre: mode === 'running', options: { animation: anim } })).out
  return key
}

for (const mode of ['running', 'startup']) {
  test(`B12 [${mode}] healthy: the mod answers the way the tests of the other groups say (a baseline for what follows)`, async () => {
    await reference(mode)
    const { E } = await run({ start: mode === 'running', pre: mode === 'running' })
    checkHooks(E, `healthy ${mode}`)
    const tools = healthyRuns[mode].filter(r => r.kind === 'tool')
    assert.ok(tools.some(r => String(r.result.result ?? '').startsWith('t: ')), 'the tool did its work')
    assert.ok(healthyRuns[mode].find(r => r.name === '/hud-demo').result.text.includes('12'))
  })

  for (const fault of FAULT_NAMES) {
    test(`B12 [${mode}] only $ ${fault} fails: no hook throws, next once, the answer is the healthy or the fall-back one`, async () => {
      await reference(mode)
      const { E, out } = await run({ faults: [fault], start: mode === 'running', pre: mode === 'running' })
      checkHooks(E, `${fault}/${mode}`)
      out.forEach((r, i) => compare(`${fault}/${mode}`, { name: r.name, kind: r.kind }, r.result, baseline[mode][i].result, healthyRuns[mode][i].result, false))
    })
  }

  test(`B12 [${mode}] every part of $ fails at once: every answer is the fall-back one`, async () => {
    await reference(mode)
    const { E, out } = await run({ faults: 'all', start: mode === 'running', pre: mode === 'running' })
    checkHooks(E, `all/${mode}`)
    out.forEach((r, i) => compare(`all/${mode}`, { name: r.name, kind: r.kind }, r.result, baseline[mode][i].result, healthyRuns[mode][i].result, true))
    assert.equal(E.sounds.length, 0)
    assert.equal(E.store.size, 0)
    assert.deepEqual(E.toasts, [])
  })
}

test('B12 with every part failing and nudge strict, nothing is refused and nothing is sent back', async () => {
  const E = await boot({ options: { nudge: 'strict' } })
  E.setFaults('all')
  await E.turnStart()
  for (let i = 0; i < 8; i++) assert.deepEqual(await E.work('Edit'), { result: {}, text: '' })
  assert.deepEqual(await E.stop('All set.'), {})
  assert.deepEqual(await E.stop('Is it?'), {})
  assert.deepEqual(await E.submit('hi'), { text: 'hi', context: undefined })
})

test('B12 a failure in the log itself is not reported: with the log and a write failing together nothing throws', async () => {
  const E = await boot()
  E.setFaults(['log', 'stateSet', 'stateGet'])
  assert.deepEqual(await E.call({ id: 't', title: 'T', stages: three() }), { result: INTERNAL_ERROR })
  assert.deepEqual(await E.submit('hi'), { text: 'hi', context: undefined })
  assert.deepEqual(E.logs, [])
})

test('B12 a failure is logged once per place, as a debug line, not once per failure', async () => {
  const E = await boot()
  await E.call({ id: 't', title: 'T', stages: three() })
  E.setFaults(['stateSet'])
  for (let i = 0; i < 4; i++) await E.submit('hi')
  await E.call({ id: 't', next: true })
  await E.call({ id: 't', next: true })
  const lines = E.logs.filter(l => l.text.startsWith('progress-hud: '))
  assert.ok(lines.length >= 1)
  assert.equal(new Set(lines.map(l => l.text)).size, lines.length, 'no line twice')
  assert.ok(lines.every(l => l.to === 'debug' && l.text.length <= 260))
})

test('B12 the mod works again once what failed works: nothing is left stuck', async () => {
  const E = await boot()
  E.setFaults('all')
  assert.deepEqual(await E.call({ id: 't', title: 'T', stages: three() }), { result: INTERNAL_ERROR })
  await E.advance(10_000)
  E.setFaults('all', false)
  assert.equal((await E.call({ id: 't', title: 'T', stages: three() })).result, 't: 0/3, running, active "A"')
  await E.advance(2000)
  assert.equal(E.store.size, 1, 'and saves')
  await E.spawn('a1')
  await E.agentTool('a1', 'Grep')
  assert.equal(E.bar('t').agents[0].tool, 'Grep')
})

test('B12 a failing audio is silent from then on, but is the only thing that stops', async () => {
  const E = await boot()
  E.setFaults(['audioPlay'])
  await E.call({ id: 't', title: 'T', stages: three() })
  await E.call({ id: 't', state: 'needs_input' })
  await E.settle()
  E.setFaults(['audioPlay'], false)
  await E.advance(5000)
  await E.call({ id: 't', state: 'done' })
  await E.settle()
  assert.equal(E.sounds.length, 0)
  assert.equal(E.bar('t').state, 'done')
  assert.deepEqual(E.chimes(), ['decision', 'done'])
})

test('B12 the answers a hook gives never carry what the faults would have been', async () => {
  const E = await boot()
  E.setFaults('all')
  const r = await E.work('Edit')
  assert.deepEqual(Object.keys(r).sort(), ['result', 'text'])
  const sub = await E.submit('go')
  assert.equal(sub.drop, undefined)
  const stop = await E.stop('end')
  assert.equal(stop.block, undefined)
})

test('B12 what does not touch state or time does not touch the answer: the tool answers as healthy, the bar is written, with any one of these failing', async () => {
  for (const fault of ['timers', 'toast', 'status', 'audioPlay', 'log', 'agentList', 'session', 'store', 'storeSet', 'env', 'resolve', 'toolRegister', 'commandRegister']) {
    const E = await boot({ options: { language: 'auto' } })
    E.setFaults([fault])
    assert.deepEqual(await E.call({ id: 't', title: 'T', stages: three() }), { result: 't: 0/3, running, active "A"' }, fault)
    assert.deepEqual(await E.call({ id: 't', next: true }), { result: 't: 1/3, running, active "B"' }, fault)
    assert.deepEqual(await E.call({ id: 't', state: 'done' }), { result: 't: 3/3, done' }, fault)
    assert.equal(E.bar('t').state, 'done', fault)
    await E.advance(5000)
    await E.settle()
  }
})

test('B12 hook by hook, a part of $ that fails is the only thing that changes: the other writes still happen', async () => {
  const E = await boot()
  E.setFaults(['toast', 'status', 'audioPlay', 'timers'])
  await E.call({ id: 't', title: 'T', stages: three() })
  await E.spawn('a1')
  await E.agentTool('a1', 'Grep')
  await E.turnComplete({ agentId: 'a1', usage: { output_tokens: 5 } })
  await E.taskCreate('A', { id: '1' })
  assert.equal(E.bar('t').agents[0].state, 'done')
  assert.equal(E.bar('tasks').steps, undefined)
  assert.equal(E.steps('tasks'), 'A:pending')
  assert.equal(E.meter().output, 5)
})

// the animation (X9) adds a frame clock of 125 ms, a refresh of what moves at every change of the bars, the turn and the view, and
// a tick that is written at every frame: the same checks, with it on, for the parts of $ it uses and for every part at once
for (const mode of ['running', 'startup']) {
  for (const faults of [['clock'], ['timers'], ['stateGet'], ['stateSet'], 'all']) {
    test(`B12 [${mode}, animation on] ${faults === 'all' ? 'every part of $ fails at once' : `only $ ${faults[0]} fails`}: no hook throws, next once, the answers hold`, async () => {
      const key = await reference(mode, true)
      const { E, out } = await run({ faults, start: mode === 'running', pre: mode === 'running', options: { animation: true } })
      checkHooks(E, `${faults}/${mode}/anim`)
      out.forEach((r, i) => compare(`${faults}/${mode}/anim`, { name: r.name, kind: r.kind }, r.result, baseline[key][i].result, healthyRuns[key][i].result, faults === 'all'))
      if (faults === 'all') assert.equal(E.tick(), 0, 'nothing could be written')
    })
  }
}

test('B12 the frame clock runs on when its tick cannot be written, and writes again when it can', async () => {
  const E = await boot({ options: { animation: true } })
  await E.turnStart()
  await E.call({ id: 't', title: 'T', stages: three() })
  E.setFaults(['stateSet'])
  await E.advance(1000)
  assert.equal(E.tick(), 0)
  E.setFaults(['stateSet'], false)
  await E.advance(1000)
  assert.equal(E.tick(), 8, 'the clock never stopped')
})

test('B12 with the clock or the timers failing the animation cannot start, and the band still draws', async () => {
  for (const fault of ['clock', 'timers']) {
    const E = await boot({ options: { animation: true }, start: false })
    E.setFaults([fault])
    assert.deepEqual(await E.sessionStart(), {})
    E.setFaults([fault], false)
    await E.turnStart()
    await E.call({ id: 't', title: 'T', stages: three() })
    await E.advance(1000)
    assert.equal(E.tick(), 0, `${fault}: no ticker was started`)
    assert.ok(await E.band())
  }
})
