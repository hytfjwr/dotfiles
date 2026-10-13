// Derived from zycck/claude-mods plugins/plan-progress/tests/scenarios.mjs (commit 549ecee), MIT License, (c) 2026 Kirill Serditov. Modified for progress-hud. See THIRD_PARTY_NOTICES.md.
// B9 (the terminal band, the footer button, the status line, the tick), B11 (commands and the demo) and the sound, DESIGN 11.2,
// through the real transpiled register.tsx on the stub engine. Every tree a render returns is checked against the surface's
// element table and props by surface-validator.mjs inside E.render. Drawing for the desktop is not here yet.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { INTERNAL_ERROR } from './.build/core/rules.mjs'
import { wavBase64 } from './.build/sound/synth.mjs'
import { TEXT } from './.build/view/i18n.mjs'
import { S, boot, findAll, plain } from './engine.mjs'
import { BELOW, create, three } from './fixtures.mjs'


// ---------- B9: the band on the terminal ----------

test('B9 no bar, a hidden band or a survey: what is beneath is returned as it is', async () => {
  const E = await boot()
  assert.equal(await E.band(), null)
  assert.equal(await E.band({ below: BELOW }), BELOW)
  await create(E)
  assert.equal(await E.band({ props: { hasSurvey: true }, below: BELOW }), BELOW, 'a survey holds the band')
  assert.equal(await E.band({ props: { hasSurvey: true } }), null)
  await E.command('hud', 'hide')
  assert.equal(await E.band({ below: BELOW }), BELOW)
  assert.equal(await E.band(), null)
})

test('B9 with bars the band is a column of rows, with what is beneath last; nothing beneath adds no child', async () => {
  const E = await boot()
  await create(E, 'a')
  await create(E, 'b')
  const alone = await E.band()
  assert.equal(alone.type, 'Box')
  assert.equal(alone.props.flexDirection, 'column')
  assert.equal(alone.children.flat(Infinity).length, 2)
  assert.ok(alone.children.flat(Infinity).every(c => c !== null && c !== undefined))
  const withBelow = await E.band({ below: BELOW })
  assert.equal(withBelow.children.at(-1), BELOW)
  assert.equal(withBelow.children.flat(Infinity).length, 3)
})

test('B9 a row shows the glyph, title, track, percentage, stage, clock and the close button, in raw hex colours only', async () => {
  const E = await boot()
  await create(E, 't', [S('調査', 'ルート', '依存'), S('実装', 'A', 'B')], '注文API改修')
  await E.advance(75_000)
  const tree = await E.band()
  const text = plain(tree)
  assert.match(text, /^● 注文API改修 /)
  assert.match(text, /[█░▏▎▍▌▋▊▉┊]{8,}/)
  assert.match(text, /\s 0% 調査 1\/2\s+1:15 ✕$/)
  const buttons = findAll(tree, n => n.type === 'Button')
  assert.deepEqual(buttons.map(b => [b.props.key, b.props.label, b.props.plain, b.props.dimColor]), [['hud-close-t', '✕', true, true]])
  assert.deepEqual(findAll(tree, n => n.type === 'Svg' || n.type === 'Raster' || n.type === 'Image'), [])
  const colours = new Set(findAll(tree, n => n.props?.color).map(n => n.props.color))
  assert.ok([...colours].every(c => /^#[0-9A-F]{6}$/.test(c)), [...colours].join())
  assert.deepEqual([...colours], ['#7858CA'])
  assert.ok(findAll(tree, n => n.type === 'Text' && n.props.wrap === 'truncate').length >= 1)
})

test('B9 states change the glyph, the colour and the note row', async () => {
  const E = await boot()
  await create(E, 'a', three(), 'a')
  await E.call({ id: 'a', state: 'needs_input', note: '公開してよいですか？' })
  await create(E, 'b', three(), 'b')
  await E.call({ id: 'b', failed: 'A', note: 'boom' })
  await create(E, 'c', three(), 'c')
  await E.call({ id: 'c', state: 'done' })
  const text = plain(await E.band({ props: { maxRows: 30 } }))
  const rows = text.split('\n')
  assert.match(rows[0], /^\? a /)
  assert.match(rows[1], /^ {2}└ 公開してよいですか？$/)
  assert.match(rows[2], /^! b /)
  assert.match(rows[3], /^ {2}└ boom$/)
  assert.match(rows[4], /^✓ c /)
  const tree = await E.band({ props: { maxRows: 30 } })
  const colours = new Set(findAll(tree, n => n.props?.color).map(n => n.props.color))
  assert.deepEqual([...colours].sort(), ['#18883A', '#AD6400', '#C5353E'])
})

test('B9 strips are drawn under their bar, with tool and clock', async () => {
  const E = await boot()
  await create(E)
  await E.spawn('a1', 'Scan tests')
  await E.spawn('a2', 'Read docs', { model: 'claude-sonnet-5-5' })
  await E.agentTool('a1', 'Grep')
  await E.step('a2', { model: 'claude-sonnet-5-5', effort: 'medium' })
  await E.settle()
  await E.advance(56_000)
  const rows = plain(await E.band()).split('\n')
  assert.equal(rows.length, 3)
  assert.match(rows[1], /^ {2}├ ● Scan tests \(haiku 4\.5\)\s+Grep\s+0:56$/)
  assert.match(rows[2], /^ {2}└ ● Read docs \(sonnet 5\.5 · medium\)\s+起動中\s+0:56$/)
})

test('B9 the band follows the width and the rows it may take', async () => {
  const E = await boot()
  await create(E, 't', three(), '注文API改修')
  for (let i = 0; i < 6; i++) await E.spawn(`a${i}`, `agent ${i}`)
  const rowsAt = async (columns, maxRows) => plain(await E.band({ props: { bodyColumns: columns, maxRows } })).split('\n')
  const wide = await rowsAt(160, 20)
  const narrow = await rowsAt(40, 20)
  assert.ok(wide[0].length > narrow[0].length)
  assert.match(narrow[0], /✕$/)
  assert.ok(wide.length >= narrow.length)
  const compact = await rowsAt(100, 1)
  assert.equal(compact.length, 1)
  assert.match(compact[0], /⚙6/)
  assert.equal((await rowsAt(100, 0)).length, 1, 'with no room at all the band is empty text')
})

test('B9 a turn that is not running and no agent running: the bar is idle', async () => {
  const E = await boot()
  await create(E)
  const idle = plain(await E.band({ props: { isWorking: false } }))
  assert.match(idle, /^○ Task .* 待機中 /)
  const working = plain(await E.band({ props: { isWorking: true } }))
  assert.match(working, /^● Task /)
  await E.spawn('a1')
  assert.match(plain(await E.band({ props: { isWorking: false } })), /^● Task /, 'an agent is running')
})

test('B9 the language setting reaches the band, the toast and the command words', async () => {
  const E = await boot({ options: { language: 'en' } })
  await create(E)
  await E.call({ id: 't', state: 'needs_input', note: 'Go?' })
  assert.match(plain(await E.band()), /needs input 1\/2/)
  assert.equal((await E.command('hud', 'bogus')).text, 'Usage: /hud [show|hide|compact|full]')
})

test('B9 the close button removes the bar and the homes of its agents, and the status line follows', async () => {
  const E = await boot({ options: { statusLine: 'always' } })
  await create(E, 'a')
  await create(E, 'b')
  await E.spawn('x1')
  assert.deepEqual(Object.values(E.homes()), ['b'])
  const tree = await E.band()
  assert.deepEqual(findAll(tree, n => n.type === 'Button').map(b => b.props.key), ['hud-close-a', 'hud-close-b'])
  await E.press(tree, 'hud-close-b')
  assert.deepEqual(E.bars().map(b => b.id), ['a'])
  assert.deepEqual(E.homes(), {})
  assert.equal(E.statuses.at(-1), 'HUD ▸ Task 0% One 1/2')
  await E.advance(2000)
  assert.deepEqual(JSON.parse(E.store.get('bars:session-1')).bars.map(b => b.id), ['a'], 'saved without it')
  await E.press(await E.band(), 'hud-close-a')
  assert.deepEqual(E.bars(), [])
  assert.equal(E.statuses.at(-1), undefined)
  assert.equal(await E.band({ below: BELOW }), BELOW)
})

test('B9 on the desktop, with no bar, a hidden band or a survey, what is beneath is returned as it is', async () => {
  const E = await boot({ surfaces: ['terminal', 'desktop'] })
  assert.equal(await E.band({ surface: 'desktop', below: BELOW }), BELOW)
  await create(E)
  assert.equal(await E.band({ surface: 'desktop', props: { hasSurvey: true }, below: BELOW }), BELOW)
  await E.command('hud', 'hide')
  assert.equal(await E.band({ surface: 'desktop', below: BELOW }), BELOW)
  assert.equal(await E.band({ surface: 'desktop' }), null)
})

test('B9 only the terminal\'s drawing reads the tick, so only it follows the clock', async () => {
  const E = await boot({ surfaces: ['terminal', 'desktop'] })
  await create(E)
  const readsOf = async draw => {
    E.reads.length = 0
    await draw()
    return E.reads
  }
  assert.ok((await readsOf(() => E.band())).includes('progress-hud:tick'))
  assert.equal((await readsOf(() => E.band({ surface: 'desktop' }))).includes('progress-hud:tick'), false)
  assert.equal((await readsOf(() => E.mode())).includes('progress-hud:tick'), false)
  assert.equal((await readsOf(() => E.band({ props: { hasSurvey: true } }))).length, 0, 'a survey: nothing read')
})

test('B9 a failing read draws nothing of ours and passes what is beneath on', async () => {
  const E = await boot()
  await create(E)
  E.fail.stateGet = true
  assert.equal(await E.band({ below: BELOW }), BELOW)
  assert.equal(await E.mode({ below: BELOW }), BELOW)
  E.fail.stateGet = false
  assert.ok(await E.band())
  assert.ok(E.logs.some(l => l.text.startsWith('progress-hud: band:')))
})

test('B9 the render hooks call next exactly once, with or without bars, with a survey, on either surface', async () => {
  const E = await boot({ surfaces: ['terminal', 'desktop'] })
  await E.band()
  await E.mode()
  await create(E)
  await E.band()
  await E.band({ props: { hasSurvey: true } })
  await E.band({ surface: 'desktop' })
  await E.mode({ surface: 'desktop' })
  await E.command('hud', 'hide')
  await E.band()
  const renders = E.stats.filter(s => s.event === 'ui.render')
  assert.equal(renders.length, 7)
  for (const s of renders) {
    assert.equal(s.coreRuns, 1)
    assert.ok(s.hooks.every(h => h.nexts === 1 && h.threw === null))
  }
  for (const h of E.hooks.filter(x => x.event === 'ui.render')) assert.equal(typeof h.catchFn, 'function')
})

// ---- the footer button ----

test('B9 the HUD button: label by the number of bars, dim while there is nothing to show or the band is hidden', async () => {
  const E = await boot()
  const dim = tree => findAll(tree, n => n.type === 'Button')[0].props.dimColor
  const label = tree => findAll(tree, n => n.type === 'Button')[0].props.label
  let tree = await E.mode()
  assert.deepEqual([label(tree), dim(tree)], ['HUD', true])
  await create(E, 'a')
  tree = await E.mode()
  assert.deepEqual([label(tree), dim(tree)], ['HUD', false])
  await create(E, 'b')
  tree = await E.mode()
  assert.deepEqual([label(tree), dim(tree)], ['HUD 2', false])
  await E.command('hud', 'hide')
  assert.equal(dim(await E.mode()), true)
  assert.equal(findAll(tree, n => n.type === 'Button')[0].props.key, 'hud-toggle')
})

test('B9 the HUD button joins what is beneath in a row; with nothing beneath it stands alone', async () => {
  const E = await boot()
  const alone = await E.mode()
  assert.deepEqual([alone.type, alone.props.flexDirection, alone.props.alignItems, alone.props.gap], ['Box', 'row', 'center', 1])
  assert.equal(alone.children.flat(Infinity).length, 1)
  const joined = await E.mode({ below: BELOW })
  assert.equal(joined.children.flat(Infinity).at(-1), BELOW)
  const desktop = await boot({ surfaces: ['desktop'] })
  assert.equal(findAll(await desktop.mode({ surface: 'desktop' }), n => n.type === 'Button').length, 1)
})

test('B9 pressing the HUD button: a toast with no bar, else the band is shown or hidden', async () => {
  const E = await boot()
  await E.press(await E.mode(), 'hud-toggle')
  assert.deepEqual(E.toasts, [{ text: TEXT.ja['toast.empty'] }])
  await create(E)
  await E.press(await E.mode(), 'hud-toggle')
  assert.equal(E.view().isOpen, false)
  assert.equal(await E.band({ below: BELOW }), BELOW)
  await E.press(await E.mode(), 'hud-toggle')
  assert.equal(E.view().isOpen, true)
  assert.notEqual(await E.band({ below: BELOW }), BELOW)
  assert.equal(E.toasts.length, 1)
})

// ---- the status line ----

test('B9 status line auto: nothing while the band shows; the bar in one line once it is hidden; the same line is not sent twice', async () => {
  const E = await boot()
  assert.deepEqual(E.statuses, [undefined], 'cleared once at start')
  await create(E, 'order-api', [S('調査', 'a', 'b'), S('DB移行', 'c', 'd')], '注文API改修')
  assert.deepEqual(E.statuses, [undefined])
  await E.command('hud', 'hide')
  assert.equal(E.statuses.at(-1), 'HUD ▸ 注文API改修 0% 調査 1/2')
  const n = E.statuses.length
  await E.call({ id: 'order-api', note: 'same line' })
  assert.equal(E.statuses.length, n, 'nothing changed in the line')
  await E.call({ id: 'order-api', done: ['a', 'b'] })
  assert.equal(E.statuses.at(-1), 'HUD ▸ 注文API改修 50% DB移行 1/2')
  await create(E, 'second')
  assert.equal(E.statuses.at(-1), undefined, 'a new bar opens the band again')
  await E.command('hud', 'hide')
  assert.equal(E.statuses.at(-1), 'HUD ▸ Task 0% One 1/2 (+1)')
  await E.command('hud', 'show')
  assert.equal(E.statuses.at(-1), undefined)
})

test('B9 status line always: shown with the band; off: never', async () => {
  const always = await boot({ options: { statusLine: 'always' } })
  await create(always)
  assert.equal(always.statuses.at(-1), 'HUD ▸ Task 0% One 1/2')
  await always.call({ id: 't', next: true })
  assert.equal(always.statuses.at(-1), 'HUD ▸ Task 33% One 2/2')
  await always.command('hud-clear')
  assert.equal(always.statuses.at(-1), undefined)
  const off = await boot({ options: { statusLine: 'off' } })
  await create(off)
  await off.command('hud', 'hide')
  assert.ok(off.statuses.every(s => s === undefined))
})

test('B9 a reload sends the status line again, since the engine may have dropped it', async () => {
  const E = await boot({ options: { statusLine: 'always' } })
  await create(E)
  const n = E.statuses.length
  await E.sessionStart()
  assert.equal(E.statuses.length, n + 1)
  assert.equal(E.statuses.at(-1), 'HUD ▸ Task 0% One 1/2')
})

// ---- the tick ----

test('B9 the tick: each second while a turn runs on a running bar, none otherwise; the desktop alone does not tick', async () => {
  const E = await boot()
  await E.advance(3000)
  assert.equal(E.tick(), 0, 'no bar, no turn')
  await create(E)
  await E.advance(3000)
  assert.equal(E.tick(), 0, 'a bar but no turn running')
  await E.turnStart()
  await E.advance(3000)
  assert.equal(E.tick(), 3)
  await E.turnComplete()
  await E.advance(3000)
  assert.equal(E.tick(), 3, 'the turn is over')
  await E.turnStart()
  await E.call({ id: 't', state: 'done' })
  await E.advance(3000)
  assert.equal(E.tick(), 3, 'no running bar')
  const desktop = await boot({ surfaces: ['desktop'] })
  await create(desktop)
  await desktop.turnStart()
  await desktop.spawn('a1')
  await desktop.advance(3000)
  assert.equal(desktop.tick(), 0)
  const both = await boot({ surfaces: ['desktop', 'terminal'] })
  await create(both)
  await both.turnStart()
  await both.advance(2000)
  assert.equal(both.tick(), 2)
})

test('B9 the tick runs while an agent runs, turn or not; the strips fold with one more tick five seconds after the last one ends', async () => {
  const E = await boot()
  await create(E)
  await E.spawn('a1')
  await E.advance(3000)
  assert.equal(E.tick(), 3)
  await E.turnComplete({ agentId: 'a1' })
  const done = E.bar('t').agentsDoneAt
  assert.equal(done, E.now())
  const before = E.tick()
  await E.advance(5000)
  assert.equal(E.tick(), before, 'not yet due')
  await E.advance(1000)
  assert.equal(E.tick(), before + 1, 'due: one tick to redraw without the strips')
  await E.advance(5000)
  assert.equal(E.tick(), before + 1, 'and no more')
  await E.spawn('a2')
  await E.turnComplete({ agentId: 'a2' })
  await E.advance(6000)
  assert.equal(E.tick(), before + 2, 'the next batch folds on its own')
})

test('B9 a reload keeps one ticker, not two', async () => {
  const E = await boot()
  await create(E)
  await E.turnStart()
  await E.sessionStart()
  await E.sessionStart()
  await E.advance(3000)
  assert.equal(E.tick(), 3)
})

// ---------- B11: commands ----------

test('B11 the four commands are registered with their hints; a refused name is skipped and logged, the rest are kept', async () => {
  const E = await boot()
  assert.deepEqual(E.registeredCommands, [
    { name: 'hud', description: 'HUD の表示を切り替える', argumentHint: '[show|hide|compact|full]', immediate: true },
    { name: 'hud-clear', description: 'HUD のバーを消す', argumentHint: '[id]', immediate: true },
    { name: 'hud-demo', description: 'サンプルの進捗バーを再生する' },
    { name: 'hud-sounds', description: '決定・エラー・完了の音を鳴らす' },
  ])
  const en = await boot({ options: { language: 'en' } })
  assert.equal(en.registeredCommands[0].description, 'Show or hide the HUD')
  const refused = await boot({ refuseCommands: ['hud-demo'] })
  assert.deepEqual(refused.registeredCommands.map(c => c.name), ['hud', 'hud-clear', 'hud-sounds'])
  assert.ok(refused.logs.some(l => l.text.includes('start:command:hud-demo')))
  assert.equal(refused.registeredTools.length, 1, 'the tool and the timer are still set up')
})


test('B11 /hud: no bar says so and changes nothing; with bars it toggles, shows and hides', async () => {
  const E = await boot()
  for (const args of ['', 'show', 'hide']) assert.equal((await E.command('hud', args)).text, TEXT.ja['cmd.none'], args)
  assert.equal(E.view().isOpen, false)
  await create(E)
  assert.equal((await E.command('hud')).text, 'HUD を隠しました')
  assert.equal(E.view().isOpen, false)
  assert.equal((await E.command('hud')).text, 'HUD を表示しました')
  assert.equal((await E.command('hud', ' HIDE ')).text, 'HUD を隠しました')
  assert.equal((await E.command('hud', 'show')).text, 'HUD を表示しました')
  assert.equal(E.view().isOpen, true)
  assert.equal((await E.command('hud', 'bogus')).text, '使い方: /hud [show|hide|compact|full]')
  assert.equal(E.view().isOpen, true)
})

test('B11 /hud compact and full change the density and keep it for the next session', async () => {
  const store = new Map()
  const E = await boot({ store })
  await create(E)
  for (let i = 0; i < 3; i++) await E.spawn(`a${i}`)
  assert.equal(plain(await E.band()).split('\n').length, 4)
  assert.equal((await E.command('hud', 'compact')).text, 'HUD をコンパクト表示にしました')
  assert.equal(E.view().density, 'compact')
  assert.equal(plain(await E.band()).split('\n').length, 1)
  assert.deepEqual(JSON.parse(store.get('prefs')), { density: 'compact' })
  const again = await boot({ store })
  assert.equal(again.view().density, 'compact')
  assert.equal((await again.command('hud', 'full')).text, 'HUD を通常表示にしました')
  assert.equal(again.view().density, 'full')
  assert.deepEqual(JSON.parse(store.get('prefs')), { density: 'full' })
  assert.deepEqual([...store.keys()].sort(), ['prefs'])
})

test('B11 /hud compact still works when the store refuses the write', async () => {
  const E = await boot()
  E.fail.storeSet = true
  assert.equal((await E.command('hud', 'compact')).text, 'HUD をコンパクト表示にしました')
  assert.equal(E.view().density, 'compact')
})

test('B11 /hud-clear removes every bar, or one by id; an unknown id or no bar says there is none', async () => {
  const E = await boot()
  assert.equal((await E.command('hud-clear')).text, TEXT.ja['cmd.none'])
  await create(E, 'order-api')
  await create(E, 'b')
  await E.spawn('x1')
  assert.equal((await E.command('hud-clear', 'nope')).text, TEXT.ja['cmd.none'])
  assert.equal(E.bars().length, 2)
  assert.equal((await E.command('hud-clear', 'Order API')).text, 'HUD のバーを消しました')
  assert.deepEqual(E.bars().map(b => b.id), ['b'])
  assert.deepEqual(E.homes(), { x1: 'b' }, 'the agent on the bar that stays keeps its home')
  assert.equal((await E.command('hud-clear')).text, 'HUD のバーを消しました')
  assert.deepEqual(E.bars(), [])
  assert.deepEqual(E.homes(), {})
  await E.advance(2000)
  assert.equal(E.store.size, 0, 'the saved copy is gone with the bars')
  const en = await boot({ options: { language: 'en' } })
  await create(en)
  assert.equal((await en.command('hud-clear')).text, 'HUD bars removed')
})

test('B11 the demo plays to the end on the mock clock: two bars, ten agents, a question, a failure, a changed plan, both done', async () => {
  const E = await boot()
  assert.equal((await E.command('hud-demo')).text, 'サンプルを再生します（約12秒）')
  const state = () => E.bars().map(b => `${b.id}:${b.state}`).join(' ')
  const agentsOf = id => E.bar(id).agents.map(a => `${a.id.slice(5)}${a.depth ? '*' : ''}:${a.state[0]}`).join(' ')
  await E.advance(100)
  assert.equal(state(), 'demo-plan:running demo-todo:running')
  assert.equal(E.bar('demo-plan').title, '注文モジュール改修')
  assert.equal(E.steps('demo-plan').split(' ')[0], 'ルート確認:active')
  assert.equal(E.bar('demo-todo').kind, 'todo')
  assert.equal(E.view().isOpen, true)
  await E.advance(1200)
  assert.equal(agentsOf('demo-plan'), 'a1:r a2:r')
  assert.equal(agentsOf('demo-todo'), 'a7:r a8:r')
  assert.equal(E.bar('demo-plan').agents[1].effort, 'medium')
  await E.advance(1000)
  assert.equal(agentsOf('demo-plan'), 'a1:r a2:r a3:r a4*:r', 'a child sits right under its parent')
  await E.advance(3100)
  assert.equal(E.bar('demo-todo').state, 'needs_input')
  assert.equal(E.bar('demo-todo').note, '公開してよいですか？')
  assert.deepEqual(E.chimes(), ['decision'])
  await E.advance(700)
  assert.equal(E.bar('demo-plan').agents.find(a => a.id === 'demo-a4').state, 'error')
  assert.deepEqual(E.chimes(), ['decision', 'error'])
  await E.advance(600)
  assert.equal(E.bar('demo-todo').state, 'running', 'answered')
  await E.advance(700)
  assert.equal(E.bar('demo-plan').state, 'error')
  assert.equal(E.bar('demo-plan').note, '2件失敗')
  await E.advance(900)
  assert.equal(E.bar('demo-plan').state, 'running', 'the plan changed')
  assert.ok(E.steps('demo-plan').includes('ログ出力:'))
  await E.advance(4000)
  assert.equal(state(), 'demo-plan:done demo-todo:done')
  const all = E.bars().flatMap(b => b.agents)
  assert.equal(all.length, 10)
  assert.deepEqual(all.filter(a => a.state === 'error').map(a => a.id), ['demo-a4'])
  assert.ok(all.every(a => a.state === 'done' || a.id === 'demo-a4'))
  assert.deepEqual(E.chimes(), ['decision', 'error', 'error', 'done', 'done'])
  assert.deepEqual(E.homes(), {}, 'the demo agents never get a home')
  assert.deepEqual(E.toasts, [], 'and no toast')
  await E.advance(5000)
  assert.equal(E.store.size, 0, 'nothing of it is stored')
  assert.deepEqual(E.calls.filter(c => c.startsWith('process') || c.startsWith('fs')), [])
})

test('B11 the demo draws without errors on every frame', async () => {
  const E = await boot()
  await E.command('hud-demo')
  for (let t = 0; t < 12_500; t += 500) {
    await E.advance(500)
    for (const columns of [40, 100]) for (const maxRows of [3, 12]) await E.band({ props: { bodyColumns: columns, maxRows } })
  }
  assert.equal(E.bars().length, 2)
})

test('B11 the demo in English, and it leaves a real bar alone', async () => {
  const E = await boot({ options: { language: 'en' } })
  await create(E, 'real', three(), 'My own work')
  await E.command('hud-demo')
  assert.equal((await E.command('hud-demo')).text, 'Playing a sample (about 12 s)')
  await E.advance(100)
  assert.deepEqual(E.bars().map(b => b.id), ['real', 'demo-plan', 'demo-todo'])
  assert.equal(E.bar('demo-plan').title, 'Orders module')
  assert.equal(E.steps('real'), 'A:active B:pending C:pending')
})

test('B11 playing the demo again starts over: the first run stops, nothing is doubled', async () => {
  const E = await boot()
  await E.command('hud-demo')
  await E.advance(3000)
  assert.ok(E.bars().flatMap(b => b.agents).length >= 5)
  await E.command('hud-demo')
  await E.advance(100)
  assert.deepEqual(E.bars().map(b => b.id), ['demo-plan', 'demo-todo'])
  assert.equal(E.bars().flatMap(b => b.agents).length, 0, 'a fresh run')
  assert.equal(E.steps('demo-plan').split(' ')[0], 'ルート確認:active')
  await E.advance(12_000)
  assert.equal(E.bars().flatMap(b => b.agents).length, 10)
  assert.equal(E.bars().length, 2)
})

test('B11 clearing during the demo stops it', async () => {
  const E = await boot()
  await E.command('hud-demo')
  await E.advance(2000)
  await E.command('hud-clear')
  await E.advance(15_000)
  assert.deepEqual(E.bars(), [])
})

test('B11 every command has a .catch that answers with the internal-error line, and none of them calls next', async () => {
  const E = await boot()
  for (const h of E.hooks.filter(x => x.event === 'command.run')) {
    assert.equal(typeof h.catchFn, 'function')
    assert.deepEqual(await h.catchFn(E.$, { args: '' }, () => 'no'), { text: INTERNAL_ERROR })
  }
  E.fail.stateGet = true
  assert.deepEqual((await E.command('hud', 'hide')).text, INTERNAL_ERROR)
  assert.equal((await E.command('hud-clear')).text, INTERNAL_ERROR)
  E.fail.stateGet = false
  for (const s of E.stats.filter(x => x.event === 'command.run')) assert.equal(s.coreRuns, 0)
})

// ---------- sound ----------

const settle = async E => {
  await E.settle()
  await E.settle()
}

test('sound: a sound is played with the right wave, the mime and the volume as gain', async () => {
  const E = await boot()
  await create(E)
  await E.call({ id: 't', state: 'done' })
  await settle(E)
  assert.equal(E.sounds.length, 1)
  assert.deepEqual(E.sounds[0].src, { base64: wavBase64('done'), mime: 'audio/wav' })
  assert.equal(E.sounds[0].gain, 0.6)
  assert.equal(Buffer.from(E.sounds[0].src.base64, 'base64').subarray(0, 4).toString(), 'RIFF')
  for (const [volume, gain] of [[100, 1], [0, 0], [25, 0.25], [150, 1], [-5, 0]]) {
    const V = await boot({ options: { volume } })
    await create(V)
    await V.call({ id: 't', state: 'done' })
    await settle(V)
    assert.equal(V.sounds[0].gain, gain, `volume ${volume}`)
  }
})

test('sound: each kind has its own wave: decision for a question, error for a failure, done for the end', async () => {
  const E = await boot()
  await create(E)
  await E.call({ id: 't', state: 'needs_input', note: 'ok?' })
  await settle(E)
  await E.advance(2000)
  await E.call({ id: 't', failed: 'A' })
  await settle(E)
  await E.advance(2000)
  await E.call({ id: 't', state: 'done' })
  await settle(E)
  assert.deepEqual(E.sounds.map(s => s.src.base64), [wavBase64('decision'), wavBase64('error'), wavBase64('done')])
  assert.deepEqual(E.chimes(), ['decision', 'error', 'done'])
})

test('sound: the same kind is not played again within 1.5 s, any kind not within 0.4 s; every request is still recorded', async () => {
  const E = await boot()
  const ask = async () => {
    await E.askUser()
    await settle(E)
  }
  await ask()
  await ask()
  assert.equal(E.sounds.length, 1)
  await E.advance(1499)
  await ask()
  assert.equal(E.sounds.length, 1, '1499 ms: still too soon')
  await E.advance(1)
  await ask()
  assert.equal(E.sounds.length, 2, '1500 ms: allowed')
  assert.equal(E.chimes().length, 4)
  const F = await boot()
  await create(F)
  await F.call({ id: 't', state: 'needs_input' })
  await F.call({ id: 't', failed: 'A' })
  await settle(F)
  assert.deepEqual(F.sounds.map(s => s.src.base64), [wavBase64('decision')], 'a different kind at once is held back too')
  await F.advance(399)
  await F.call({ id: 't', state: 'running' })
  await F.call({ id: 't', failed: 'A' })
  await settle(F)
  assert.equal(F.sounds.length, 1)
  await F.advance(1)
  await F.call({ id: 't', state: 'running' })
  await F.call({ id: 't', failed: 'A' })
  await settle(F)
  assert.deepEqual(F.sounds.map(s => s.src.base64), [wavBase64('decision'), wavBase64('error')], '400 ms: allowed')
})

test('sound: with sound off nothing is played or even tried, and the requests are still recorded', async () => {
  const E = await boot({ options: { sound: false } })
  await create(E)
  await E.call({ id: 't', state: 'done' })
  await E.askUser()
  await settle(E)
  assert.deepEqual(E.sounds, [])
  assert.equal(E.playAttempts(), 0)
  assert.deepEqual(E.chimes(), ['done', 'decision'])
})

test('sound: a play that fails is logged once and the mod is silent from then on', async () => {
  const E = await boot()
  E.fail.audioPlay = true
  await create(E)
  const r = await E.call({ id: 't', state: 'done' })
  assert.equal(r.result, 't: 3/3, done', 'the tool call is not affected')
  await settle(E)
  assert.equal(E.playAttempts(), 1)
  assert.equal(E.logs.filter(l => l.text.startsWith('progress-hud: sound:')).length, 1)
  E.fail.audioPlay = false
  await E.advance(5000)
  await E.askUser()
  await E.call({ id: 't', failed: 'A' })
  await settle(E)
  assert.equal(E.playAttempts(), 1, 'no further attempt')
  assert.deepEqual(E.sounds, [])
  assert.equal(E.chimes().length, 3)
  assert.equal((await E.command('hud-sounds')).text, '音: 決定・エラー・完了（音量 60）', 'the command still answers')
  await E.advance(2000)
  assert.equal(E.playAttempts(), 1)
})

test('sound: a play that never returns does not hold up any hook', async () => {
  const E = await boot()
  E.fail.audioHang = true
  await create(E)
  const r = await E.call({ id: 't', state: 'done' })
  assert.equal(r.result, 't: 3/3, done')
  assert.deepEqual(await E.turnStart(), { turnId: 't' })
  assert.deepEqual(await E.stop('ok'), {})
  await E.askUser()
  await E.settle()
  assert.equal(E.playAttempts(), 1)
})

test('sound: the demo makes its sounds under the same rules, and none when muted', async () => {
  const E = await boot()
  await E.command('hud-demo')
  for (let i = 0; i < 24; i++) {
    await E.advance(500)
    await E.settle()
  }
  assert.ok(E.sounds.length >= 3 && E.sounds.length <= E.chimes().length)
  assert.ok(E.sounds.every(s => s.src.mime === 'audio/wav' && s.gain === 0.6))
  const quiet = await boot({ options: { sound: false } })
  await quiet.command('hud-demo')
  await quiet.advance(13_000)
  await quiet.settle()
  assert.deepEqual(quiet.sounds, [])
  assert.equal(quiet.playAttempts(), 0)
})

test('sound: /hud-sounds plays decision, error and done at 0, 900 and 1800 ms, whatever was played before', async () => {
  const E = await boot()
  await E.askUser()
  await settle(E)
  const t0 = E.now()
  const r = await E.command('hud-sounds')
  assert.equal(r.text, '音: 決定・エラー・完了（音量 60）')
  await settle(E)
  assert.equal(E.sounds.length, 2, 'the command does not wait for the 1.5 s of the question before it')
  await E.advance(900)
  await settle(E)
  await E.advance(900)
  await settle(E)
  const mine = E.sounds.slice(1)
  assert.deepEqual(mine.map(s => s.src.base64), [wavBase64('decision'), wavBase64('error'), wavBase64('done')])
  assert.deepEqual(mine.map(s => s.at - t0), [0, 900, 1800])
  assert.equal((await boot({ options: { language: 'en', volume: 30 } }).then(x => x.command('hud-sounds'))).text, 'Sounds: decision, error, done (volume 30)')
})

test('sound: /hud-sounds says it is muted and plays nothing when sound is off', async () => {
  const E = await boot({ options: { sound: false } })
  assert.equal((await E.command('hud-sounds')).text, 'ミュート中です（/config の progress-hud.sound）')
  await E.advance(3000)
  await settle(E)
  assert.deepEqual(E.sounds, [])
  assert.deepEqual(E.chimes(), [])
  const en = await boot({ options: { sound: false, language: 'en' } })
  assert.equal((await en.command('hud-sounds')).text, 'Muted (progress-hud.sound in /config)')
})

test('every $ call made by the view, command and sound code is on the allow list', async () => {
  const { ALLOWED } = await import('./engine.mjs')
  const E = await boot({ options: { statusLine: 'always', language: 'auto' }, env: { LANG: 'ja_JP.UTF-8' } })
  await create(E)
  await E.band()
  await E.mode()
  await E.command('hud', 'compact')
  await E.command('hud-sounds')
  await E.command('hud-demo')
  await E.advance(13_000)
  await E.settle()
  assert.ok(E.calls.length > 50)
  for (const c of E.calls) assert.ok(ALLOWED.includes(c), c)
  for (const need of ['ui.status', 'audio.play', 'command.register', 'clock.every', 'session.surfaces', 'ui.resolve']) assert.ok(E.calls.includes(need), need)
})
