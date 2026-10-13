// X9 (the terminal's animations), through the real transpiled register.tsx on the stub engine and its mock clock: when the
// frame clock runs and when it rests, what a frame looks like in the tree, and that animation=false is the old once-a-second tick.
// The stub boots with the animation off unless a test says otherwise, so the other groups read a still band.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spinnerGlyph } from './.build/view/anim.mjs'
import { boot, findAll, plain } from './engine.mjs'
import { create } from './fixtures.mjs'
import { validateTree } from './surface-validator.mjs'

const ANIM = { options: { animation: true } }
const STILL = { options: { animation: false } }
const HEXC = /^#[0-9A-F]{6}$/

test('X9 with animation on, a turn running on a running bar ticks every 125 ms', async () => {
  const E = await boot(ANIM)
  await E.turnStart()
  await create(E)
  const t0 = E.tick()
  await E.advance(125)
  assert.equal(E.tick() - t0, 1)
  await E.advance(875)
  assert.equal(E.tick() - t0, 8)
  await E.advance(1000)
  assert.equal(E.tick() - t0, 16)
})

test('X9 the frame is the tick: the band shows the spinner of that frame, and the animation off shows the plain dot at any tick', async () => {
  const E = await boot(ANIM)
  await E.turnStart()
  await create(E)
  for (let i = 0; i < 12; i++) {
    const frame = E.tick()
    const row = plain(await E.band())
    assert.ok(row.startsWith(`${spinnerGlyph(frame)} Task`), row)
    await E.advance(125)
  }
  const S = await boot(STILL)
  await S.turnStart()
  await create(S)
  await S.advance(3000)
  assert.ok(plain(await S.band()).startsWith('● Task'))
})

test('X9 with animation off the tick is the old one a second, and writes the same', async () => {
  const E = await boot(STILL)
  await E.turnStart()
  await create(E)
  const t0 = E.tick()
  const w0 = E.stateWrites()
  await E.advance(125)
  assert.equal(E.tick() - t0, 0)
  await E.advance(875)
  assert.equal(E.tick() - t0, 1)
  await E.advance(3000)
  assert.equal(E.tick() - t0, 4)
  assert.equal(E.stateWrites() - w0, 4, 'one write a second and nothing else')
  const none = await boot({ options: {} })
  await none.turnStart()
  await create(none)
  await none.advance(3000)
  assert.equal(none.tick(), 3, 'the stub engine leaves it off unless a test says')
})

test('X9 the animation rests when nothing runs: no bar, a bar nobody works on, a hidden band, a session with no terminal', async () => {
  const empty = await boot(ANIM)
  await empty.turnStart()
  await empty.advance(2000)
  assert.equal(empty.tick(), 0, 'no bar')

  const idle = await boot(ANIM)
  await create(idle)
  await idle.advance(2000)
  assert.equal(idle.tick(), 0, 'running, but no turn and no agent: the bar waits')
  assert.match(plain(await idle.band({ props: { isWorking: false } })), /^○ Task/)

  const hidden = await boot(ANIM)
  await hidden.turnStart()
  await create(hidden)
  await hidden.command('hud', 'hide')
  const t = hidden.tick()
  await hidden.advance(2000)
  assert.equal(hidden.tick() - t, 2, 'hidden: the once-a-second tick of a running turn, no frames')
  await hidden.command('hud', 'show')
  await hidden.advance(1000)
  assert.equal(hidden.tick() - t - 2, 8, 'and shown again it moves')

  const desktop = await boot({ ...ANIM, surfaces: ['desktop'] })
  await desktop.turnStart()
  await create(desktop)
  await desktop.spawn('a1')
  await desktop.advance(2000)
  assert.equal(desktop.tick(), 0, 'the desktop has CSS clocks and no frame clock')
})

test('X9 the frame clock follows the turn: it stops when the turn ends, and starts with the next', async () => {
  const E = await boot(ANIM)
  await E.turnStart()
  await create(E)
  await E.advance(1000)
  assert.equal(E.tick(), 8)
  await E.turnComplete()
  const t = E.tick()
  await E.advance(2000)
  assert.equal(E.tick(), t, 'the turn is over: the bar is idle')
  await E.turnStart()
  await E.advance(1000)
  assert.equal(E.tick() - t, 8)
})

test('X9 a running agent keeps the animation going without a turn, and its end stops it', async () => {
  const E = await boot(ANIM)
  await create(E)
  await E.spawn('a1', 'Scan')
  await E.advance(1000)
  assert.equal(E.tick(), 8)
  const row = plain(await E.band())
  assert.ok(row.split('\n')[1].includes(`${spinnerGlyph(E.tick())} Scan`), 'the agent\'s dot spins too')
  await E.turnComplete({ agentId: 'a1' })
  const t = E.tick()
  await E.advance(1000)
  assert.equal(E.tick(), t, 'the agent is done and no turn runs')
})

test('X9 a bar that finishes glows for 600 ms: five frames, the last of them the rest, then the tick is quiet', async () => {
  const E = await boot(ANIM)
  await E.turnStart()
  await create(E)
  await E.advance(1000)
  await E.call({ id: 't', state: 'done' })
  const done = E.bar('t').endedAt
  const glyphColor = async () => findAll(await E.band(), n => n.type === 'Text' && n.props.color)[0].props.color
  const t = E.tick()
  const glow = await glyphColor()
  assert.match(glow, HEXC)
  assert.notEqual(glow, '#18883A', 'right after the end: lit')
  await E.advance(125 * 3)
  assert.notEqual(await glyphColor(), glow, 'fading')
  assert.equal(E.tick() - t, 3)
  await E.advance(125 * 2)
  assert.equal(E.tick() - t, 5, 'the last frame of the glow')
  assert.ok(E.now() - done >= 600 - 125)
  assert.equal(await glyphColor(), '#18883A', 'the done colour')
  await E.advance(5000)
  assert.equal(E.tick() - t, 5, 'and then nothing ticks')
})

test('X9 the tick is a once-a-second one again after the glow: a waiting agent is still redrawn each second, not each frame', async () => {
  const E = await boot(ANIM)
  await create(E)
  await E.spawn('a1', 'Scan')
  await E.call({ id: 't', state: 'done' })
  await E.advance(2000)
  const seen = []
  await E.agentTool('a1', 'Bash', {
    useId: 'tu1',
    check: async id => {
      await E.check('Bash', id)
      await E.advance(700)
      assert.equal(E.bar('t').agents[0].state, 'waiting')
      const t = E.tick()
      await E.advance(125)
      seen.push(E.tick() - t)
      await E.advance(875)
      seen.push(E.tick() - t)
      await E.advance(2000)
      seen.push(E.tick() - t)
    },
  })
  assert.deepEqual(seen, [0, 1, 3], 'one a second while an agent waits, none between')
})

test('X9 a reload does not start a second frame clock', async () => {
  const E = await boot(ANIM)
  await E.turnStart()
  await create(E)
  await E.sessionStart()
  await E.sessionStart()
  await E.sessionStart()
  const t = E.tick()
  await E.advance(1000)
  assert.equal(E.tick() - t, 8)
})

test('X9 /clear ends the animation with the bars', async () => {
  const E = await boot(ANIM)
  await E.turnStart()
  await create(E)
  await E.advance(500)
  await E.sessionEnd('clear')
  const t = E.tick()
  await E.advance(2000)
  assert.equal(E.tick(), t)
})

test('X9 the whole animation is a function of the frame: the same tick, the same tree', async () => {
  const E = await boot(ANIM)
  await E.turnStart()
  await create(E)
  await E.advance(125 * 7)
  const strip = tree => JSON.stringify(tree, (k, v) => (typeof v === 'function' ? undefined : v))
  assert.equal(strip(await E.band()), strip(await E.band()))
})

test('X9 every frame of a running, a waiting and a finishing bar is a valid terminal tree with no Svg or Raster and only hex colours', async () => {
  const E = await boot(ANIM)
  await E.turnStart()
  await create(E, 'a')
  await create(E, 'b')
  await E.call({ id: 'b', state: 'needs_input', note: 'ok?' })
  await create(E, 'c')
  await E.spawn('a1', 'Scan')
  const colors = new Set()
  for (let f = 0; f < 45; f++) {
    if (f === 20) await E.call({ id: 'c', state: 'done' })
    const tree = await E.band({ props: { bodyColumns: [40, 100, 160][f % 3] } })
    assert.deepEqual(validateTree(tree, 'terminal'), [])
    assert.deepEqual(findAll(tree, n => n.type === 'Svg' || n.type === 'Raster'), [])
    for (const n of findAll(tree, n => n.props?.color)) colors.add(n.props.color)
    for (const n of findAll(tree, n => n.type === 'Text')) assert.ok(!('blink' in n.props))
    await E.advance(125)
  }
  assert.ok(colors.size > 8, `${colors.size} colours seen`)
  for (const c of colors) assert.match(c, HEXC)
})

test('X9 the title shimmers in the tree: Text runs of hex colours one after another, whose strings make the title', async () => {
  const E = await boot(ANIM)
  await E.turnStart()
  await create(E, 't', undefined, 'Quarterly report')
  await E.advance(125 * 5)
  const tree = await E.band()
  const row = findAll(tree, n => n.type === 'Box' && n.props.key === 'bar-t')[0]
  const titleText = row.children.flat(Infinity).filter(n => n?.type === 'Text')[1]
  assert.equal(titleText.props.wrap, 'truncate')
  const runs = titleText.children.flat(Infinity).filter(n => n?.type === 'Text')
  assert.ok(runs.length >= 2)
  assert.equal(runs.map(r => r.children.join('')).join(''), 'Quarterly report')
  for (const r of runs) assert.match(r.props.color, HEXC)
})

test('X9 the status line and the tool results do not animate', async () => {
  const E = await boot({ options: { animation: true, statusLine: 'always' } })
  await E.turnStart()
  const r = await create(E)
  await E.advance(1000)
  assert.equal(r.result, 't: 0/3, running, active "A"')
  assert.equal(E.statuses.at(-1), 'HUD ▸ Task 0% One 1/2')
  assert.ok(!/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/.test(E.statuses.join('')))
})

test('X9 the animation is a setting: on by default for the plugin, off with animation:false', async () => {
  const { parseOptions } = await import('./.build/core/config.mjs')
  assert.equal(parseOptions({}).animation, true)
  assert.equal(parseOptions({ animation: false }).animation, false)
  assert.equal(parseOptions({ animation: 'yes' }).animation, true)
})
