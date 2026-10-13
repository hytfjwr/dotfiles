// Derived from zycck/claude-mods plugins/plan-progress/tests/scenarios.mjs (commit 549ecee), MIT License, (c) 2026 Kirill Serditov. Modified for progress-hud. See THIRD_PARTY_NOTICES.md.
// B10 (DESIGN 11.2): the band on the desktop, through the real transpiled register.tsx on the stub engine. Every tree is checked
// against the desktop's element table and props by surface-validator.mjs inside E.render. What the desktop does with the
// drawings (flicker, hover, the px per column) can only be seen in the app; look.mjs writes look.html for a browser
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MAX_SOURCE } from './.build/view/svg.mjs'
import { S, boot, findAll, plain, st } from './engine.mjs'
import { BELOW, create, three } from './fixtures.mjs'
import { validateTree } from './surface-validator.mjs'

const BOTH = { surfaces: ['terminal', 'desktop'] }
const desk = (E, o = {}) => E.band({ surface: 'desktop', ...o })
const svgs = tree => findAll(tree, n => n.type === 'Svg').map(n => n.props)
const strips = (tree, id) => svgs(tree).filter(p => String(p.key).startsWith(`strip-${id}-`))
const bySource = list => Object.fromEntries(list.map(p => [p.key, p.source]))
const trackOf = (tree, id) => findAll(tree, n => n.type === 'Box' && n.props.key === `track-${id}`)[0].children.flat(Infinity)

test('B10 the band is a column of rows; the tree is valid on the desktop and holds no Raster, no Image', async () => {
  const E = await boot(BOTH)
  await create(E, 'a', three(), '注文API改修')
  await E.spawn('g1', 'Scan tests')
  const tree = await desk(E)
  assert.deepEqual(validateTree(tree, 'desktop'), [])
  assert.equal(tree.type, 'Box')
  assert.equal(tree.props.flexDirection, 'column')
  assert.deepEqual(findAll(tree, n => n.type === 'Raster' || n.type === 'Image'), [])
  const row = findAll(tree, n => n.type === 'Box' && n.props.key === 'bar-a')[0]
  assert.equal(row.props.flexDirection, 'row')
  assert.equal(row.props.alignItems, 'flex-start')
  assert.match(plain(findAll(row, n => n.type === 'Text')[0]), /^●$/)
  assert.deepEqual(findAll(row, n => n.type === 'Button').map(b => [b.props.key, b.props.label]), [['hud-close-a', '✕']])
  assert.deepEqual(validateTree(tree, 'terminal').map(p => p.split(': ')[1]).filter(Boolean).slice(0, 1), ['Svg is not an element of terminal'], 'and it would not do on a terminal')
})

test('B10 a bar is a track with a see-through hover layer over it, strips under it; alts say what they show', async () => {
  const E = await boot(BOTH)
  await create(E, 't', [S('DB移行', st('a', 'done'), st('b', 'active'), 'c', 'd')], '注文API改修')
  await E.spawn('a1', 'Scan tests')
  await E.spawn('a2', 'Read docs')
  const tree = await desk(E)
  const [track, overlay] = findAll(tree, n => n.type === 'Svg').map(n => n.props)
  assert.equal(track.isInteractive, undefined)
  assert.equal(overlay.isInteractive, true)
  assert.equal(track.alt, '注文API改修: DB移行 2/4、25%')
  assert.match(overlay.alt, /注文API改修/)
  const [first, second] = strips(tree, 't')
  assert.match(first.alt, /^エージェント Scan tests: 実行中、起動中$/)
  assert.match(second.alt, /^エージェント Read docs/)
  for (const p of svgs(tree)) {
    assert.ok(p.alt.trim() !== '')
    assert.ok(p.source.length <= MAX_SOURCE)
    assert.ok(p.width > 0 && p.height > 0)
  }
  const wrapper = findAll(tree, n => n.type === 'Box' && n.props.position === 'absolute')
  assert.equal(wrapper.length, 1)
  assert.deepEqual([wrapper[0].props.top, wrapper[0].props.left], [0, 0])
  assert.equal(trackOf(tree, 't')[0].props.source, track.source)
})

test('B10 the band is as wide as the columns say, 8 px each, at least 320', async () => {
  const E = await boot(BOTH)
  await create(E)
  const widthAt = async cols => svgs(await desk(E, { props: { bodyColumns: cols } }))[0].width
  const [narrow, mid, wide, huge] = [await widthAt(20), await widthAt(100), await widthAt(150), await widthAt(400)]
  assert.ok(narrow >= 120 && narrow <= 180, `a 320 px band leaves the track about 150 px: ${narrow}`)
  assert.ok(narrow < mid && mid < wide)
  assert.equal(huge, 1400)
  const tree = await desk(E, { props: { bodyColumns: 100 } })
  assert.ok(svgs(tree)[0].width <= 800)
})

test('B10 time passing alone leaves the picture as it is: the same sources for the track and the strips, a hover layer from now', async () => {
  const E = await boot({ surfaces: ['desktop'] })
  await create(E)
  await E.spawn('a1', 'Scan tests')
  await E.spawn('a2', 'Read docs')
  const first = await desk(E)
  const writes = E.stateWrites()
  await E.advance(7000)
  const later = await desk(E)
  assert.equal(E.stateWrites(), writes, 'drawing writes nothing')
  assert.equal(svgs(later)[0].source, svgs(first)[0].source, 'the track')
  assert.deepEqual(bySource(strips(later, 't')), bySource(strips(first, 't')), 'the strips: their clocks run inside the drawing')
  assert.notEqual(svgs(later)[1].source, svgs(first)[1].source, 'the hover layer is built again with the time')
  assert.match(svgs(later)[1].source, /--d:-7\.0s/)
})

test('B10 a change to one agent redraws its strip and that strip only; keys stay', async () => {
  const E = await boot(BOTH)
  await create(E)
  await E.spawn('a1', 'Scan tests')
  await E.spawn('a2', 'Read docs')
  const first = await desk(E)
  await E.agentTool('a1', 'Bash')
  const next = await desk(E)
  const a = bySource(strips(first, 't'))
  const b = bySource(strips(next, 't'))
  assert.deepEqual(Object.keys(b), ['strip-t-a1', 'strip-t-a2'])
  assert.deepEqual(Object.keys(b), Object.keys(a))
  assert.notEqual(b['strip-t-a1'], a['strip-t-a1'])
  assert.match(b['strip-t-a1'], />Bash</)
  assert.equal(b['strip-t-a2'], a['strip-t-a2'])
  assert.equal(svgs(next)[0].source, svgs(first)[0].source, 'the track is drawn again, to the same picture')
})

test('B10 a step finished moves the fill with a glide; the bar before it has none', async () => {
  const E = await boot(BOTH)
  await create(E)
  assert.doesNotMatch(svgs(await desk(E))[0].source, /<animate /)
  await E.call({ id: 't', next: true })
  assert.match(svgs(await desk(E))[0].source, /<animate attributeName="width" from="0\.0"/)
})

test('B10 the desktop does not read the clock tick, so only the terminal redraws with it', async () => {
  const E = await boot(BOTH)
  await create(E)
  E.reads.length = 0
  await desk(E)
  assert.equal(E.reads.includes('progress-hud:tick'), false)
  assert.ok(E.reads.includes('progress-hud:bars'))
  E.reads.length = 0
  await E.band()
  assert.equal(E.reads.includes('progress-hud:tick'), true)
  await E.turnStart()
  const before = E.tick()
  await E.advance(3000)
  assert.equal(E.tick() - before, 3, 'the terminal in the same session keeps ticking')
})

test('B10 a survey, a hidden band, or no bar: what is beneath is returned; otherwise it is last in the column', async () => {
  const E = await boot(BOTH)
  assert.equal(await desk(E, { below: BELOW }), BELOW)
  await create(E)
  assert.equal(await desk(E, { props: { hasSurvey: true }, below: BELOW }), BELOW)
  const tree = await desk(E, { below: BELOW })
  assert.equal(tree.children.flat(Infinity).at(-1), BELOW)
  const alone = await desk(E)
  assert.ok(alone.children.flat(Infinity).every(c => c && c !== BELOW))
  await E.command('hud', 'hide')
  assert.equal(await desk(E, { below: BELOW }), BELOW)
  assert.equal(await desk(E), null)
})

test('B10 the close button removes the bar and its agents\' homes', async () => {
  const E = await boot(BOTH)
  await create(E, 'a')
  await create(E, 'b')
  await E.spawn('x1')
  const tree = await desk(E)
  assert.deepEqual(findAll(tree, n => n.type === 'Button').map(b => b.props.key), ['hud-close-a', 'hud-close-b'])
  await E.press(tree, 'hud-close-b')
  assert.deepEqual(E.bars().map(b => b.id), ['a'])
  assert.deepEqual(E.homes(), {})
  const after = await desk(E)
  assert.deepEqual(findAll(after, n => n.type === 'Button').map(b => b.props.key), ['hud-close-a'])
})

test('B10 two bars are told apart by a hairline between them, with an alt', async () => {
  const E = await boot(BOTH)
  await create(E, 'a')
  await create(E, 'b')
  const tree = await desk(E)
  const dividers = svgs(tree).filter(p => String(p.key).startsWith('div-'))
  assert.equal(dividers.length, 1)
  assert.equal(dividers[0].key, 'div-b')
  assert.equal(dividers[0].height, 1)
  assert.equal(dividers[0].alt, '区切り線')
  assert.equal(findAll(await desk(E, { surface: 'desktop', props: {} }), n => n.type === 'Svg' && String(n.props.key).startsWith('div-')).length, 1)
  assert.equal(tree.props.gap, 1)
})

test('B10 the session line: sessionMetrics desktop (the default) and all show it on the desktop; off does not; the terminal only for all', async () => {
  const cases = [['desktop', true, false], ['all', true, true], ['off', false, false]]
  for (const [mode, onDesktop, onTerminal] of cases) {
    const E = await boot({ ...BOTH, options: { sessionMetrics: mode } })
    await E.measure({ cost: 1.23, percent: 41, five: 23 })
    await create(E)
    await E.advance(124_000)
    const d = plain(await desk(E))
    const t = plain(await E.band())
    assert.equal(d.includes('◷ 2:04 · $1.23 · ctx 41% · 5h 23%'), onDesktop, `${mode}: desktop`)
    assert.equal(t.includes('◷ 2:04 · $1.23 · ctx 41% · 5h 23%'), onTerminal, `${mode}: terminal`)
  }
  const E = await boot(BOTH)
  await create(E)
  const tree = await desk(E)
  assert.deepEqual(findAll(tree, n => n.props?.key === 'hud-metrics').map(plain), ['◷ 0:00'], 'nothing known yet but the clock: the session started a moment ago')
})

test('B10 the session line is the last thing in the band, dim, only with the figures there are', async () => {
  const E = await boot(BOTH)
  await E.measure({ percent: 7, changed: ['context'] })
  await create(E)
  const tree = await desk(E)
  const line = tree.children.flat(Infinity).at(-1)
  assert.equal(line.props.key, 'hud-metrics')
  assert.equal(line.props.dimColor, true)
  assert.match(plain(line), /^◷ 0:00 · ctx 7%$/)
})

test('B10 a finished bar: a fixed pill, and the hover shows the time, cost and output of its period', async () => {
  const E = await boot(BOTH)
  await E.turnComplete({ usage: { output_tokens: 100 } })
  await E.measure({ cost: 1 })
  await create(E, 'order', three(), '注文API改修')
  await E.advance(252_000)
  await E.turnComplete({ usage: { output_tokens: 48_000 } })
  await E.measure({ cost: 1.31 })
  await E.call({ id: 'order', state: 'done' })
  const tree = await desk(E)
  const [track, overlay] = svgs(tree)
  assert.match(track.source, />4m12s</)
  assert.match(overlay.source, />4m12s · \$0\.31 · 出力 48k</)
  assert.equal(track.alt, '注文API改修: 完了、3 ステップ、4m12s')
  assert.doesNotMatch(overlay.source, /kc0/)
  const en = await boot({ ...BOTH, options: { language: 'en' } })
  await create(en, 'o', three(), 'Orders')
  await en.call({ id: 'o', state: 'done' })
  assert.match(svgs(await desk(en))[0].alt, /^Orders: done, 3 steps in 0s$/)
})

test('B10 a running bar has its clock in the hover layer, set from the time of the draw', async () => {
  const E = await boot(BOTH)
  await create(E)
  await E.advance(83_000)
  const overlay = svgs(await desk(E))[1].source
  assert.match(overlay, /class="kc0 /)
  assert.match(overlay, /--d:-83\.0s/)
})

test('B10 states change the drawings: colour on the pill and the fill, the note in the alt, strips in the agent colours', async () => {
  const E = await boot(BOTH)
  await create(E, 'a', three(), 'a')
  await E.call({ id: 'a', state: 'needs_input', note: '公開してよいですか？' })
  await create(E, 'b', three(), 'b')
  await E.call({ id: 'b', failed: 'A', note: 'boom' })
  await E.spawn('g1', 'x')
  const tree = await desk(E)
  const [a, , , b] = svgs(tree)
  assert.match(a.source, /fill="#AD6400"/)
  assert.match(a.alt, / — 公開してよいですか？$/)
  assert.match(b.source, /fill="#C5353E"/)
  assert.match(b.alt, / — boom$/)
  const glyphs = findAll(tree, n => n.type === 'Text' && n.props.color).map(n => [plain(n), n.props.color])
  // no bar is running, so the agent lands on the agents bar, a third row
  assert.deepEqual(glyphs, [['?', '#AD6400'], ['!', '#C5353E'], ['●', '#7858CA']])
})

test('B10 the percentage is a dim text with figure spaces so it keeps its width', async () => {
  const E = await boot({ ...BOTH, options: { sessionMetrics: 'off' } })
  await create(E)
  const texts = findAll(await desk(E), n => n.type === 'Text' && n.props.dimColor).map(plain)
  assert.deepEqual(texts, ['  0%'])
})

test('B10 strips fold into a "+N" strip past the limit, and a batch that is over folds away after 5 s', async () => {
  const E = await boot(BOTH)
  await create(E)
  for (let i = 0; i < 8; i++) await E.spawn(`a${i}`, `agent ${i}`)
  const keys = strips(await desk(E), 't').map(p => p.key)
  assert.equal(keys.length, 5)
  assert.equal(keys.at(-1), 'strip-t-+')
  assert.match(strips(await desk(E), 't').at(-1).alt, /^他 \d 件（完了 0）$/)
  for (let i = 0; i < 8; i++) await E.turnComplete({ agentId: `a${i}` })
  await E.advance(5000)
  assert.ok(strips(await desk(E), 't').length > 0)
  await E.advance(1000)
  assert.equal(strips(await desk(E), 't').length, 0)
})

test('B10 /hud compact leaves the desktop band without strips', async () => {
  const E = await boot(BOTH)
  await create(E)
  await E.spawn('a1')
  assert.equal(strips(await desk(E), 't').length, 1)
  await E.command('hud', 'compact')
  assert.equal(strips(await desk(E), 't').length, 0)
  assert.equal(findAll(await desk(E), n => n.type === 'Box' && n.props.key === 'bar-t')[0].props.alignItems, 'center')
})

test('B10 the demo draws on every frame on the desktop, within the size limit, at several widths', async () => {
  const E = await boot(BOTH)
  await E.command('hud-demo')
  for (let t = 0; t < 12_500; t += 500) {
    await E.advance(500)
    for (const columns of [20, 60, 120, 300]) {
      const tree = await desk(E, { props: { bodyColumns: columns } })
      for (const p of svgs(tree)) assert.ok(p.source.length <= MAX_SOURCE && p.alt.trim() !== '')
    }
  }
})

test('B10 a failing read draws nothing of ours on the desktop either', async () => {
  const E = await boot(BOTH)
  await create(E)
  E.fail.stateGet = true
  assert.equal(await desk(E, { below: BELOW }), BELOW)
  E.fail.stateGet = false
  assert.ok(await desk(E))
})

test('B10 the terminal draws as before when the desktop is on too', async () => {
  const E = await boot(BOTH)
  await create(E, 't', [S('調査', 'ルート', '依存'), S('実装', 'A', 'B')], '注文API改修')
  await E.advance(75_000)
  const text = plain(await E.band())
  assert.match(text, /^● 注文API改修 /)
  assert.match(text, /\s 0% 調査 1\/2\s+1:15 ✕$/)
  assert.deepEqual(findAll(await E.band(), n => n.type === 'Svg'), [])
  assert.deepEqual(validateTree(await E.band(), 'terminal'), [])
  assert.deepEqual(validateTree(await desk(E), 'desktop'), [])
})

test('B10 the drawings never go into the saved state', async () => {
  const E = await boot(BOTH)
  await create(E)
  await E.spawn('a1')
  await desk(E)
  await E.sessionEnd()
  const stored = [...E.store.values()].join('')
  assert.doesNotMatch(stored, /<svg|<style/)
})
