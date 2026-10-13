// A9: layoutBand: the band as rows of runs (DESIGN 5.7); snapshots are the rows' text with the spacer expanded to the width
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { newBar } from '../.build/core/model.mjs'
import { bandText, isRowA, layoutBand, rowCells, statusText } from '../.build/view/layout.mjs'
import { cells } from '../.build/view/width.mjs'
import { ZERO as M, bandModel } from '../fixtures.mjs'

const NOW = 195_000
const st = (title, status) => ({ title, status })
const run = (id, title, state, tool, model, effort, depth = 0, started = 0, ended = null) => ({ id, title, state, tool, startedAt: started, endedAt: ended, depth, model, effort, calls: 0, errors: 0, streak: 0, output: 0 })

// "order-api": 4 stages of 3, 4, 3 and 3 steps, 4 of 13 done; two strips
const bar1 = () => ({
  ...newBar('order-api', 'tool', 0, M), title: '注文API改修', startedAt: 0,
  stages: [
    { name: '調査', steps: [st('a', 'done'), st('b', 'done'), st('c', 'done')] },
    { name: 'DB移行', steps: [st('d', 'done'), st('e', 'active'), st('f', 'pending'), st('g', 'pending')] },
    { name: 'API', steps: [st('h', 'pending'), st('i', 'pending'), st('j', 'pending')] },
    { name: '検証', steps: [st('k', 'pending'), st('l', 'pending'), st('m', 'pending')] },
  ],
  agents: [run('1', 'ルート調査', 'running', 'Grep', 'claude-haiku-4-5-20251001', undefined, 0, 132_000), run('2', 'サービス一覧', 'done', '', 'claude-sonnet-5-5', 'medium', 0, 150_000, 162_000)],
})
// "release": waiting on the person, with a note
const bar2 = () => ({ ...newBar('release', 'tool', 0, M), title: 'リリースノート', state: 'needs_input', note: '公開してよいですか？', startedAt: 120_000, stages: [{ name: 'x', steps: [st('a', 'done'), st('b', 'done'), st('c', 'done'), st('d', 'active')] }] })
const model = (bars, extra = {}) => bandModel(bars, { now: NOW, sessionMetrics: 'off', ...extra })
const lay = (W, bars, extra, maxRows = 12) => layoutBand(model(bars, extra), { columns: W, maxRows })
const text = (W, bars, extra, maxRows) => bandText(lay(W, bars, extra, maxRows), W)
const SNAP = {
  "40": [
    "● 注文API改修   ███▊░┊░░┊░░░  31% 3:15 ✕",
    "  ├ ● ルート調査 (haiku…     Grep 1:03",
    "  └ ✓ サービス一覧 (son…          0:12",
    "? リリースノ…   █████████░░░  75% 1:15 ✕",
    "  └ 公開してよいですか？"
  ],
  "50": [
    "● 注文API改修     ██████▏░░░┊░░░┊░░░░░  31% 3:15 ✕",
    "  ├ ● ルート調査 (haiku 4.5)           Grep 1:03",
    "  └ ✓ サービス一覧 (sonnet …                0:12",
    "? リリースノート  ███████████████░░░░░  75% 1:15 ✕",
    "  └ 公開してよいですか？"
  ],
  "60": [
    "● 注文API改修     █████▎░░┊░░░┊░░░░  31% DB移行 2/4   3:15 ✕",
    "  ├ ● ルート調査 (haiku 4.5)                     Grep 1:03",
    "  └ ✓ サービス一覧 (sonnet 5.5 ·…                     0:12",
    "? リリースノート  ████████████▊░░░░  75% 入力待ち 4/4 1:15 ✕",
    "  └ 公開してよいですか？"
  ],
  "100": [
    "● 注文API改修              ██████████████▊░░░░░░░░░░┊░░░░░░░░░░┊░░░░░░░░░░░  31% DB移行 2/4   3:15 ✕",
    "  ├ ● ルート調査 (haiku 4.5)                                                             Grep 1:03",
    "  └ ✓ サービス一覧 (sonnet 5.5 · medium)                                                      0:12",
    "? リリースノート           ████████████████████████████████████░░░░░░░░░░░░  75% 入力待ち 4/4 1:15 ✕",
    "  └ 公開してよいですか？"
  ],
  "160": [
    "● 注文API改修                                                                          ██████████████▊░░░░░░░░░░┊░░░░░░░░░░┊░░░░░░░░░░░  31% DB移行 2/4   3:15 ✕",
    "  ├ ● ルート調査 (haiku 4.5)                                                                                                                         Grep 1:03",
    "  └ ✓ サービス一覧 (sonnet 5.5 · medium)                                                                                                                  0:12",
    "? リリースノート                                                                       ████████████████████████████████████░░░░░░░░░░░░  75% 入力待ち 4/4 1:15 ✕",
    "  └ 公開してよいですか？"
  ],
  "compact": [
    "● 注文API改修           ██████████████▊░░░░░░░░░░┊░░░░░░░░░░┊░░░░░░░░░░░  31% DB移行 2/4   ⚙1 3:15 ✕",
    "? リリースノート        ████████████████████████████████████░░░░░░░░░░░░  75% 入力待ち 4/4    1:15 ✕"
  ],
  "idle": [
    "○ 注文API改修                    ██████████████▊░░░░░░░░░░┊░░░░░░░░░░┊░░░░░░░░░░░  31% 待機中 3:15 ✕",
    "  └ ✓ サービス一覧 (sonnet 5.5 · medium)                                                      0:12"
  ],
  "en": [
    "● 注文API改修           ██████████████▊░░░░░░░░░░┊░░░░░░░░░░┊░░░░░░░░░░░  31% DB移行 2/4      3:15 ✕",
    "  ├ ● ルート調査 (haiku 4.5)                                                             Grep 1:03",
    "  └ ✓ サービス一覧 (sonnet 5.5 · medium)                                                      0:12",
    "? Release notes         ████████████████████████████████████░░░░░░░░░░░░  75% needs input 4/4 1:15 ✕",
    "  └ Publish it?"
  ]
}

test('snapshots: two bars, Japanese titles, at 40, 50, 60, 100 and 160 columns', () => {
  for (const W of [40, 50, 60, 100, 160]) assert.deepEqual(text(W, [bar1(), bar2()]), SNAP[W], `W=${W}`)
})

test('snapshot: compact density has one row a bar, the number of running agents after the stage, no strips and no notes', () => {
  assert.deepEqual(text(100, [bar1(), bar2()], { density: 'compact' }), SNAP.compact)
})

test('snapshot: a bar no one is working on is idle: open circle, dim, the word for idle in the stage column', () => {
  const l = lay(100, [{ ...bar1(), agents: [bar1().agents[1]] }], { isWorking: false })
  assert.deepEqual(bandText(l, 100), SNAP.idle)
  const row = l.rows[0]
  assert.deepEqual([row.glyph.text, row.glyph.dim, row.glyph.color], ['○', true, undefined])
  assert.ok(row.track.every(s => s.dim === true), 'every part of the track is dim')
  assert.equal(row.extras[0].dim, true)
})

test('snapshot: English words follow the language', () => {
  assert.deepEqual(bandText(lay(100, [bar1(), { ...bar2(), title: 'Release notes', note: 'Publish it?' }], { lang: 'en' }), 100), SNAP.en)
})

test('no row is wider than the band: 40, 60, 100 and 160 columns, 1 to 3 bars, 0 to 7 agents', () => {
  for (const W of [40, 60, 100, 160]) {
    for (let nBars = 1; nBars <= 3; nBars++) {
      for (let nAgents = 0; nAgents <= 7; nAgents++) {
        const bars = Array.from({ length: nBars }, (_, i) => ({
          ...bar1(), id: `b${i}`, title: ['注文API改修', 'Release notes for the whole quarter', 'ＡＢＣ全角タイトルの長いもの'][i],
          agents: Array.from({ length: nAgents }, (_, k) => run(`a${i}-${k}`, `エージェント${k}号 with a long name`, ['running', 'waiting', 'done', 'error'][k % 4], 'WebSearch', 'claude-sonnet-5-5', 'medium', k % 3 === 2 ? 1 : 0, 1000 * k, 5000 + k)),
        }))
        const l = lay(W, bars)
        const label = `W=${W} bars=${nBars} agents=${nAgents}`
        for (const row of l.rows) assert.ok(rowCells(row) <= W, `${label}: ${rowCells(row)} cells in ${JSON.stringify(bandText({ rows: [row] }, W)[0])}`)
        assert.ok(l.rows.length <= 12, label)
        assert.deepEqual(l.rows.filter(isRowA).map(r => r.barId), bars.map(b => b.id), label)
        for (const line of bandText(l, W)) assert.ok(cells(line) <= W, `${label}: text is ${cells(line)} cells`)
      }
    }
  }
})

test('a row of text is as wide as the band when it has a track, so the columns stay on the right', () => {
  for (const W of [60, 100, 160]) for (const line of text(W, [bar1(), bar2()]).filter((_, i, a) => i === 0 || i === a.length - 2)) assert.equal(cells(line), W)
})

test('the track takes what is left but never more than 48 cells', () => {
  const trackCells = W => lay(W, [bar1()]).rows[0].track.reduce((n, s) => n + cells(s.text), 0)
  assert.equal(trackCells(160), 48)
  assert.equal(trackCells(100), 48)
  assert.ok(trackCells(60) < 48 && trackCells(60) >= 8)
})

test('parts go in the order stage, then agent count, then clock as the band narrows; with no room there is no track', () => {
  // the distinct sets of columns met while the width goes from 120 down to 20
  const seen = (bars, extra) => {
    const sets = []
    for (let W = 120; W >= 20; W--) {
      const row = lay(W, bars, extra).rows[0]
      const key = row.extras.map(s => s.text.trim()).join('|')
      if (sets.at(-1)?.key !== key) sets.push({ key, W, track: row.track !== null })
      assert.ok(rowCells(row) <= W, `W=${W}`)
    }
    return sets
  }
  const full = seen([bar1()])
  assert.deepEqual(full.map(x => x.key), ['DB移行 2/4|3:15', '3:15', ''])
  const compact = seen([bar1()], { density: 'compact' })
  assert.deepEqual(compact.map(x => x.key), ['DB移行 2/4|⚙1|3:15', '⚙1|3:15', '3:15', ''])
  for (const sets of [full, compact]) {
    assert.ok(sets.slice(0, -1).every(x => x.track), 'the track stays while columns are dropped')
    assert.equal(sets.at(-1).track, true, 'the track is the last to go, after the clock')
  }
  const narrow = lay(20, [bar1()]).rows[0]
  assert.equal(narrow.track, null)
  assert.deepEqual(narrow.extras, [])
  assert.ok(rowCells(narrow) <= 20)
})

test('the title is cut to a third of the width, at most 28 cells, at least 6, with …', () => {
  const long = { ...bar1(), title: 'とても長いタイトルのバーがここにあります。さらに続きます' }
  const cut = lay(100, [long]).rows[0].title.text
  assert.ok(cells(cut) <= 28 && cells(cut) >= 27, 'a wide character does not fit in the last cell')
  assert.ok(cut.endsWith('…'))
  assert.ok(cells(lay(40, [long]).rows[0].title.text) <= 12)
  assert.equal(lay(100, [{ ...bar1(), title: 'ab' }]).rows[0].title.text, 'ab')
})

test('the track: filled in state colour to the eighth, boundaries in the empty part, done is all full, idle dim', () => {
  const W = 100
  const track = (bar, extra) => lay(W, [bar], extra).rows[0].track
  const joined = segs => segs.map(s => s.text).join('')
  const t1 = track(bar1())
  assert.equal(cells(joined(t1)), 48)
  assert.equal(t1[0].color, '#7858CA')
  assert.match(joined(t1), /^█{14}▊░/)
  assert.equal(joined(t1).split('┊').length - 1, 2, 'the last stage ends the bar, so three stages\' ends make two marks')
  assert.ok(joined(t1).indexOf('┊') > joined(t1).indexOf('░'), 'marks only after the fill')
  assert.ok(t1.filter(s => s.text.includes('░')).every(s => s.dim === true))
  const done = track({ ...bar1(), state: 'done' })
  assert.deepEqual(done, [{ text: '█'.repeat(48), color: '#18883A' }])
  const err = track({ ...bar1(), state: 'error' })
  assert.equal(err[0].color, '#C5353E')
  const wait = track(bar2())
  assert.equal(wait[0].color, '#AD6400')
  const none = track({ ...bar1(), stages: [{ name: 's', steps: [st('a', 'active'), st('b', 'pending')] }] })
  assert.equal(joined(none), '░'.repeat(48))
  const eighth = track({ ...bar1(), stages: [{ name: 's', steps: Array.from({ length: 80 }, (_, i) => st(`s${i}`, i < 1 ? 'done' : 'pending')) }] })
  assert.match(joined(eighth), /^▋░{47}$/, '1/80 of 48 cells is 4.8 eighths: five')
})

test('the percentage is a right-aligned dim column; the glyph and the stage take the state colour', () => {
  const [a, b] = lay(100, [bar1(), bar2()]).rows.filter(isRowA)
  assert.deepEqual([a.pct.text, a.pct.dim], [' 31%', true])
  assert.deepEqual([b.pct.text], [' 75%'])
  assert.deepEqual([a.glyph.text, a.glyph.color], ['●', '#7858CA'])
  assert.deepEqual([b.glyph.text, b.glyph.color], ['?', '#AD6400'])
  assert.deepEqual([a.extras[0].color, b.extras[0].color], ['#7858CA', '#AD6400'])
  assert.equal(lay(100, [{ ...bar1(), state: 'error' }]).rows[0].glyph.text, '!')
  assert.equal(lay(100, [{ ...bar1(), state: 'done' }]).rows[0].glyph.text, '✓')
  assert.equal(a.collapse, false)
  assert.equal(a.close, true)
})

test('a flat list shows its step in progress where a plan shows its stage', () => {
  const todo = { ...bar2(), state: 'running', kind: 'todo', stages: [{ name: 'タスク', steps: [st('下書きを書く', 'active'), st('b', 'pending')] }] }
  assert.match(text(100, [todo])[0], /下書きを書く/)
  assert.equal(text(100, [{ ...todo, state: 'done' }])[0].includes('完了'), true)
})

test('notes show for needs_input and error only, in the state colour', () => {
  const rows = bar => lay(100, [bar]).rows
  assert.deepEqual(rows(bar2()).map(r => r.kind ?? 'bar'), ['bar', 'note'])
  assert.deepEqual(rows(bar2())[1].segs, [{ text: '└ 公開してよいですか？', color: '#AD6400' }])
  assert.equal(rows({ ...bar2(), state: 'error', note: 'boom' })[1].segs[0].color, '#C5353E')
  assert.deepEqual(rows({ ...bar2(), state: 'running' }).map(r => r.kind ?? 'bar'), ['bar'])
  assert.deepEqual(rows({ ...bar2(), note: null }).map(r => r.kind ?? 'bar'), ['bar'])
  assert.ok(cells(bandText({ rows: rows({ ...bar2(), note: 'x'.repeat(300) }) }, 100)[1]) <= 100)
})

test('strips: tree marks, dots in the agent colours, model and effort, tool and clock on the right', () => {
  const l = lay(100, [bar1()])
  const [first, last] = l.rows.filter(r => r.kind === 'agent')
  assert.equal(first.segs[0].text, '├ ')
  assert.equal(last.segs[0].text, '└ ')
  assert.deepEqual([first.segs[1].text, first.segs[1].color], ['●', '#7858CA'])
  assert.deepEqual([last.segs[1].text, last.segs[1].color], ['✓', '#18883A'])
  assert.deepEqual(first.segs.filter(s => s.dim && s.text.startsWith(' (')).map(s => s.text), [' (haiku 4.5)'])
  assert.equal(first.indent, 2)
  const waiting = lay(100, [{ ...bar1(), agents: [run('w', 'wait', 'waiting', 'Needs approval', undefined, undefined, 0, 190_000), run('e', 'oops', 'error', '', undefined, undefined, 0, 0, 5000)] }])
  const [w, e] = waiting.rows.filter(r => r.kind === 'agent')
  assert.deepEqual([w.segs[1].text, w.segs[1].color], ['?', '#AD6400'])
  assert.deepEqual([e.segs[1].text, e.segs[1].color], ['✗', '#C5353E'])
})

test('a child strip is indented one level and a finished strip shows how long it took', () => {
  const bars = [{ ...bar1(), agents: [run('p', 'parent', 'running', 'Grep', undefined, undefined, 0, 100_000), run('c', 'child', 'done', '', undefined, undefined, 1, 100_000, 130_000)] }]
  const [p, c] = lay(100, bars).rows.filter(r => r.kind === 'agent')
  assert.equal(c.indent, p.indent + 2)
  assert.ok(bandText({ rows: [c] }, 100)[0].endsWith('0:30'))
})

test('too many strips fold into one "+N" row that counts the finished ones; unfinished strips stay', () => {
  const agents = Array.from({ length: 8 }, (_, i) => run(`a${i}`, `agent ${i}`, i % 2 ? 'done' : 'running', 'Grep', undefined, undefined, 0, 1000 * i, 9000))
  const rows = lay(100, [{ ...bar1(), agents }]).rows
  const shown = rows.filter(r => r.kind === 'agent')
  assert.equal(shown.length, 4, 'one bar: 5 rows, one of them the "+N" row')
  assert.ok(shown.every(r => r.segs[1].text === '●'), 'the four running ones')
  const more = rows.find(r => r.kind === 'more')
  assert.deepEqual(more.segs, [{ text: '└ 他 4 件（完了 4）', dim: true }])
  assert.equal(shown.at(-1).segs[0].text, '├ ', 'the last strip is not the end of the list')
  assert.equal(bandText({ rows: [more] }, 100)[0], '  └ 他 4 件（完了 4）')
  const en = lay(100, [{ ...bar1(), agents }], { lang: 'en' }).rows.find(r => r.kind === 'more')
  assert.equal(en.segs[0].text, '└ 4 more · 4 done')
})

test('the strip limit is 5 rows for one bar, 4 for two and 3 for three or more', () => {
  const many = id => ({ ...bar1(), id, agents: Array.from({ length: 9 }, (_, i) => run(`${id}${i}`, `a${i}`, 'running', 'Grep', undefined, undefined, 0, 0)) })
  const count = n => lay(100, Array.from({ length: n }, (_, i) => many(`b${i}`)), {}, 99).rows.filter(r => r.kind === 'agent').length / n
  assert.deepEqual([count(1), count(2), count(3)], [4, 3, 2])
})

test('over maxRows: fewer strips first, then compact, then the rows are cut', () => {
  const many = id => ({ ...bar1(), id, agents: Array.from({ length: 7 }, (_, i) => run(`${id}${i}`, `a${i}`, 'running', 'Grep', undefined, undefined, 0, 0)) })
  const bars = [many('x'), many('y'), many('z')]
  const kinds = l => l.rows.filter(r => !isRowA(r)).length
  const roomy = lay(100, bars, {}, 99)
  assert.equal(roomy.density, 'full')
  assert.equal(roomy.rows.length, 3 + 3 * 3)
  const fewer = lay(100, bars, {}, 8)
  assert.equal(fewer.density, 'full')
  assert.ok(fewer.rows.length <= 8 && kinds(fewer) > 0, 'strips remain, fewer of them')
  assert.ok(fewer.rows.length < roomy.rows.length)
  const compact = lay(100, bars, {}, 3)
  assert.deepEqual([compact.density, compact.rows.length, compact.truncated], ['compact', 3, false])
  assert.ok(compact.rows.every(isRowA))
  const cut = lay(100, bars, {}, 2)
  assert.deepEqual([cut.density, cut.rows.length, cut.truncated], ['compact', 2, true])
  assert.deepEqual(lay(100, bars, {}, 0).rows, [])
  assert.equal(lay(100, bars, { density: 'compact' }, 99).rows.length, 3)
})

test('the strips of a finished batch fold after five seconds; a failed one stays', () => {
  const finished = (state, doneAt) => ({ ...bar1(), agentsDoneAt: doneAt, agents: [run('a', 'agent', state, '', undefined, undefined, 0, 0, doneAt)] })
  const agentRows = (bar, now) => lay(100, [bar], { now }).rows.filter(r => r.kind === 'agent').length
  assert.equal(agentRows(finished('done', 190_000), 195_000), 1)
  assert.equal(agentRows(finished('done', 190_000), 195_001), 0)
  assert.equal(agentRows(finished('error', 190_000), 300_000), 1)
})

test('the whole-session line: only for sessionMetrics "all", items without a figure left out', () => {
  const g = { startedAt: 0, contextPercent: 41.4, fiveHourPercent: 22.6 }
  const m = { ...M, costUsd: 1.234 }
  const all = lay(100, [bar2()], { sessionMetrics: 'all', gauge: g, meter: m }).rows.at(-1)
  assert.deepEqual([all.kind, all.segs[0].text], ['metrics', '◷ 3:15 · $1.23 · ctx 41% · 5h 23%'])
  assert.equal(all.segs[0].dim, true)
  const part = lay(100, [bar2()], { sessionMetrics: 'all', gauge: { startedAt: null, contextPercent: 7, fiveHourPercent: null } }).rows.at(-1)
  assert.equal(part.segs[0].text, '◷ ctx 7%')
  assert.equal(lay(100, [bar2()], { sessionMetrics: 'all' }).rows.some(r => r.kind === 'metrics'), false, 'no figure at all: no line')
  for (const mode of ['desktop', 'off']) assert.equal(lay(100, [bar2()], { sessionMetrics: mode, gauge: g, meter: m }).rows.some(r => r.kind === 'metrics'), false)
  assert.equal(lay(100, [bar2()], { sessionMetrics: 'all', gauge: g, meter: { ...M, costUsd: 0.001 } }).rows.at(-1).segs[0].text, '◷ 3:15 · <$0.01 · ctx 41% · 5h 23%')
})

test('the metrics line is the first to go when rows run out', () => {
  const g = { startedAt: 0, contextPercent: 41, fiveHourPercent: 22 }
  const l = lay(100, [bar1(), bar2()], { sessionMetrics: 'all', gauge: g, density: 'compact' }, 2)
  assert.equal(l.rows.length, 2)
  assert.ok(l.rows.every(isRowA))
  assert.equal(l.truncated, true)
})

test('the status line: auto only while the band is hidden, always, off; the main bar, its percentage and the others', () => {
  const bars = [bar1(), bar2()]
  assert.equal(statusText(bars, true, 'auto', 'ja'), undefined)
  assert.equal(statusText(bars, false, 'auto', 'ja'), 'HUD ▸ リリースノート 75% 入力待ち 4/4 (+1)')
  assert.equal(statusText(bars, true, 'always', 'ja'), 'HUD ▸ リリースノート 75% 入力待ち 4/4 (+1)')
  assert.equal(statusText([bars[1], bars[0]], true, 'always', 'ja'), 'HUD ▸ 注文API改修 31% DB移行 2/4 (+1)', 'the latest one')
  assert.equal(statusText(bars, false, 'off', 'ja'), undefined)
  assert.equal(statusText([], false, 'always', 'ja'), undefined)
  assert.equal(statusText([bar1()], false, 'auto', 'en'), 'HUD ▸ 注文API改修 31% DB移行 2/4')
  assert.equal(statusText([bar2(), { ...bar1(), state: 'done' }], false, 'always', 'en'), 'HUD ▸ リリースノート 75% needs input 4/4 (+1)', 'a bar that is done yields to one that is not')
})

test('layout never changes the bars or the model it is given', () => {
  const deepFreeze = o => {
    if (o && typeof o === 'object') Object.values(o).forEach(deepFreeze)
    return Object.freeze(o)
  }
  const m = deepFreeze(model([bar1(), bar2()], { sessionMetrics: 'all' }))
  assert.doesNotThrow(() => layoutBand(m, { columns: 60, maxRows: 5 }))
  assert.doesNotThrow(() => statusText(m.bars, false, 'always', 'ja'))
})

// ---------- X9: the animations ----------

const SPIN = /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/g
const HEXC = /^#[0-9A-F]{6}$/
const still = (W, bars, extra) => text(W, bars, extra)
const moving = (W, bars, frame, extra) => bandText(layoutBand(model(bars, { frame, ...extra }), { columns: W, maxRows: 12 }), W)
const colorsOf = layout => layout.rows.flatMap(r => (isRowA(r) ? [r.glyph, ...(Array.isArray(r.title) ? r.title : [r.title]), ...(r.track ?? []), r.pct, ...r.extras] : r.segs)).map(s => s.color).filter(c => c !== undefined)

test('X9 with no frame (null, or left out) the layout is what it was: the same data, field for field', () => {
  for (const W of [40, 60, 100, 160]) {
    const none = layoutBand(model([bar1(), bar2()]), { columns: W, maxRows: 12 })
    assert.deepEqual(layoutBand(model([bar1(), bar2()], { frame: null }), { columns: W, maxRows: 12 }), none)
    assert.deepEqual(layoutBand(model([bar1(), bar2()], { frame: undefined }), { columns: W, maxRows: 12 }), none)
    assert.deepEqual(bandText(none, W), SNAP[W])
  }
  const row = layoutBand(model([bar1()]), { columns: 100, maxRows: 12 }).rows[0]
  assert.equal(Array.isArray(row.title), false)
  assert.equal(row.title.text, '注文API改修')
})

test('X9 with a frame the text is the still text, but for the spinners, at 40, 60, 100 and 160 columns on every frame of two turns', () => {
  for (const W of [40, 60, 100, 160]) {
    const base = still(W, [bar1(), bar2()])
    for (let f = 0; f < 40; f++) {
      const lines = moving(W, [bar1(), bar2()], f)
      assert.deepEqual(lines.map(l => l.replace(SPIN, '●')), base, `W=${W} frame ${f}`)
    }
  }
})

test('X9 a frame changes no row, no width: each row is as wide as the still one and no wider than the band', () => {
  const bars = () => [bar1(), bar2(), { ...bar1(), id: 'c', title: 'ＡＢＣ全角のとても長いタイトルがここに' }]
  for (const W of [40, 60, 100, 160]) {
    const a = layoutBand(model(bars()), { columns: W, maxRows: 12 })
    for (const f of [0, 1, 7, 13, 99]) {
      const b = layoutBand(model(bars(), { frame: f }), { columns: W, maxRows: 12 })
      assert.equal(b.rows.length, a.rows.length)
      assert.deepEqual([b.density, b.truncated], [a.density, a.truncated])
      b.rows.forEach((row, i) => {
        assert.equal(rowCells(row), rowCells(a.rows[i]), `W=${W} frame ${f} row ${i}`)
        assert.ok(rowCells(row) <= W)
      })
    }
  }
})

test('X9 the spinner: a running bar and a running agent turn through ten dots, one cell wide; every other mark stands still', () => {
  const dots = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
  for (let f = 0; f < 25; f++) {
    const rows = layoutBand(model([bar1()], { frame: f }), { columns: 100, maxRows: 12 }).rows
    const a = rows[0].glyph
    assert.equal(a.text, dots[f % 10])
    assert.equal(cells(a.text), 1)
    assert.equal(a.color, '#7858CA')
    const agent = rows.filter(r => r.kind === 'agent')
    assert.equal(agent[0].segs[1].text, dots[f % 10], 'the running agent')
    assert.equal(agent[1].segs[1].text, '✓', 'a finished agent stands still')
  }
  const states = [run('w', 'wait', 'waiting', 'x', undefined, undefined, 0, 0), run('e', 'oops', 'error', '', undefined, undefined, 0, 0, 5000), run('d', 'done', 'done', '', undefined, undefined, 0, 0, 5000)]
  const rows = layoutBand(model([{ ...bar1(), agents: states }], { frame: 4 }), { columns: 100, maxRows: 12 }).rows.filter(r => r.kind === 'agent')
  assert.deepEqual(rows.map(r => r.segs[1].text), ['?', '✗', '✓'])
})

test('X9 the shimmer: a running title is runs of its own colours, whose text is the title; the band moves between frames', () => {
  const titles = f => layoutBand(model([bar1()], { frame: f }), { columns: 100, maxRows: 12 }).rows[0].title
  for (let f = 0; f < 30; f++) {
    const t = titles(f)
    assert.ok(Array.isArray(t))
    assert.equal(t.map(s => s.text).join(''), '注文API改修')
    for (const s of t) assert.match(s.color, HEXC)
  }
  assert.notDeepEqual(titles(3), titles(4))
  const seen = new Set(Array.from({ length: 30 }, (_, f) => JSON.stringify(titles(f))))
  assert.ok(seen.size >= 8, `${seen.size} different frames`)
  const rest = titles(0)
  assert.deepEqual(rest, [{ text: '注文API改修', color: '#7858CA' }], 'at rest it is the state colour')
  const lit = titles(5).map(s => s.color)
  assert.ok(lit.includes('#7858CA') && lit.some(c => c !== '#7858CA'))
  assert.ok(Array.isArray(layoutBand(model([{ ...bar1(), title: 'とても長いタイトルのバーがここにあります。さらに続きます' }], { frame: 9 }), { columns: 100, maxRows: 12 }).rows[0].title))
})

test('X9 the title turns once in the width of the title cells plus 8 frames', () => {
  // 注文API改修 is 11 cells, and alone in the band it is as wide as the title column
  const title = f => JSON.stringify(layoutBand(model([bar1()], { frame: f }), { columns: 100, maxRows: 12 }).rows[0].title)
  for (let f = 0; f < 19; f++) assert.equal(title(f), title(f + 19), `frame ${f}`)
  assert.notEqual(title(2), title(3))
  assert.notEqual(title(4), title(4 + 18), 'not a turn of 18')
})

test('X9 a bar that is not running stands still: needs_input, error, done, and one nobody works on', () => {
  const frames = [0, 3, 9, 17]
  const rows = (bar, extra) => frames.map(f => layoutBand(model([bar], { frame: f, ...extra }), { columns: 100, maxRows: 12 }).rows[0])
  for (const [bar, extra, glyph] of [
    [bar2(), {}, '?'],
    [{ ...bar1(), state: 'error', note: 'x' }, {}, '!'],
    [{ ...bar1(), state: 'done', endedAt: 1 }, {}, '✓'],
    [{ ...bar1(), agents: [] }, { isWorking: false }, '○'],
  ]) {
    const [first, ...more] = rows(bar, extra)
    assert.equal(first.glyph.text, glyph)
    assert.equal(Array.isArray(first.title), false, 'the title is one run')
    for (const r of more) assert.deepEqual(r, first, `${glyph} is the same on every frame`)
  }
})

test('X9 the tip of the fill twinkles while a bar runs: its colour changes with the frame, its text never does', () => {
  const row = f => layoutBand(model([bar1()], { frame: f }), { columns: 100, maxRows: 12 }).rows[0]
  const staticTrack = layoutBand(model([bar1()]), { columns: 100, maxRows: 12 }).rows[0].track
  const tips = []
  for (let f = 0; f < 60; f++) {
    const track = row(f).track
    assert.equal(track.map(s => s.text).join(''), staticTrack.map(s => s.text).join(''))
    const tip = track.find(s => s.text.length === 1 && /[▏▎▍▌▋▊▉█]/.test(s.text) && s.color !== undefined)
    tips.push(tip.color)
    for (const s of track) if (s.color) assert.match(s.color, HEXC)
  }
  assert.ok(new Set(tips).size >= 3, `${new Set(tips).size} tip colours`)
  // the fill itself keeps the state colour
  assert.equal(row(7).track[0].color, '#7858CA')
  assert.ok(tips.includes('#7858CA'), 'level 0 is the plain colour')
})

test('X9 the tip is the last full block when the fill has no partial block; nothing twinkles with nothing filled', () => {
  const exact = { ...bar1(), stages: [{ name: 'S', steps: [st('a', 'done'), st('b', 'done'), st('c', 'active'), st('d', 'pending')] }] }
  const track = layoutBand(model([exact], { frame: 5 }), { columns: 100, maxRows: 12 }).rows[0].track
  const still0 = layoutBand(model([exact]), { columns: 100, maxRows: 12 }).rows[0].track
  assert.equal(track.map(s => s.text).join(''), still0.map(s => s.text).join(''))
  assert.ok(track.length >= still0.length)
  const empty = { ...bar1(), stages: [{ name: 'S', steps: [st('a', 'active'), st('b', 'pending')] }] }
  const t0 = layoutBand(model([empty], { frame: 5 }), { columns: 100, maxRows: 12 }).rows[0].track
  assert.equal(t0.length, 1)
  assert.equal(t0[0].dim, true)
})

test('X9 a bar that has just finished glows white-ward for 600 ms: glyph and fill, then the done colour', () => {
  const NOW = 195_000
  const done = ended => ({ ...bar1(), state: 'done', endedAt: ended, stages: bar1().stages.map(s => ({ ...s, steps: s.steps.map(x => ({ ...x, status: 'done' })) })) })
  const at = (ended, frame = 3) => layoutBand(model([done(ended)], { frame }), { columns: 100, maxRows: 12 }).rows[0]
  const lum = c => parseInt(c.slice(1, 3), 16) + parseInt(c.slice(3, 5), 16) + parseInt(c.slice(5, 7), 16)
  const fresh = at(NOW)
  const half = at(NOW - 300)
  const late = at(NOW - 540)
  const over = at(NOW - 600)
  assert.equal(fresh.glyph.text, '✓')
  assert.match(fresh.glyph.color, HEXC)
  assert.match(fresh.track[0].color, HEXC)
  assert.ok(lum(fresh.glyph.color) > lum(half.glyph.color) && lum(half.glyph.color) > lum(late.glyph.color) && lum(late.glyph.color) > lum('#18883A'), 'it fades')
  assert.equal(fresh.track[0].color, fresh.glyph.color, 'the fill and the glyph glow alike')
  assert.equal(over.glyph.color, '#18883A')
  assert.equal(over.track[0].color, '#18883A')
  assert.deepEqual(over, layoutBand(model([done(NOW - 600)]), { columns: 100, maxRows: 12 }).rows[0], 'after the glow: the still row')
  assert.deepEqual(at(null), layoutBand(model([done(null)]), { columns: 100, maxRows: 12 }).rows[0], 'no end time: no glow')
  assert.deepEqual(layoutBand(model([done(NOW)]), { columns: 100, maxRows: 12 }).rows[0].glyph.color, '#18883A', 'with no frame: no glow')
  assert.equal(fresh.track.map(s => s.text).join(''), '█'.repeat(48))
})

test('X9 the glow does not wait for the frame: it is a function of the time, so the same frame at two times differs', () => {
  const mk = now => layoutBand(model([{ ...bar1(), state: 'done', endedAt: 195_000 }], { frame: 4, now }), { columns: 100, maxRows: 12 }).rows[0].glyph.color
  assert.notEqual(mk(195_000), mk(195_300))
})

test('X9 the same model and frame give the same layout', () => {
  for (const f of [0, 5, 123]) {
    const a = layoutBand(model([bar1(), bar2()], { frame: f }), { columns: 100, maxRows: 12 })
    const b = layoutBand(model([bar1(), bar2()], { frame: f }), { columns: 100, maxRows: 12 })
    assert.deepEqual(a, b)
  }
})

test('X9 colours are #RRGGBB wherever there is one, on every frame, in every density', () => {
  for (const density of ['full', 'compact']) {
    for (let f = 0; f < 20; f++) {
      const layout = layoutBand(model([bar1(), bar2(), { ...bar1(), id: 'done', state: 'done', endedAt: 195_000 - f * 40 }], { frame: f, density }), { columns: 100, maxRows: 12 })
      for (const c of colorsOf(layout)) assert.match(c, HEXC)
    }
  }
})

test('X9 compact density animates too: the spinner and the shimmer, on a row of its own', () => {
  const row = layoutBand(model([bar1()], { frame: 2, density: 'compact' }), { columns: 100, maxRows: 12 }).rows[0]
  assert.equal(row.glyph.text, '⠹')
  assert.ok(Array.isArray(row.title))
})

test('X9 the status line has no animation: statusText takes no frame and shows the plain bar', () => {
  const line = statusText([bar1(), bar2()], false, 'always', 'ja')
  assert.equal(line.replace(SPIN, ''), line)
  assert.equal(line, 'HUD ▸ リリースノート 75% 入力待ち 4/4 (+1)')
  assert.equal(statusText.length, 4)
  assert.equal(statusText([bar1()], false, 'always', 'ja'), 'HUD ▸ 注文API改修 31% DB移行 2/4')
})

test('X9 a frame costs little: layoutBand with a frame, 3 bars with 5 agents each at 100 columns, 1,000 times', () => {
  const agents = Array.from({ length: 5 }, (_, i) => run(`a${i}`, `agent ${i} of the crowd`, i % 2 ? 'done' : 'running', 'Grep', 'claude-sonnet-5-5', 'medium', i === 3 ? 1 : 0, 1000 * i, i % 2 ? 9000 : null))
  const bars = [0, 1, 2].map(i => ({ ...bar1(), id: `bar-${i}`, title: ['注文API改修', 'Release notes for the quarter', 'リリースノート'][i], agents }))
  const m = f => model(bars, { frame: f })
  for (let f = 0; f < 50; f++) layoutBand(m(f), { columns: 100, maxRows: 40 }) // warm up
  const start = performance.now()
  for (let f = 0; f < 1000; f++) layoutBand(m(f), { columns: 100, maxRows: 40 })
  const each = (performance.now() - start) / 1000
  console.log(`layoutBand with a frame: ${each.toFixed(3)} ms a call`)
  assert.ok(each < 5, `${each} ms a call`)
  const base = performance.now()
  for (let f = 0; f < 1000; f++) layoutBand(model(bars), { columns: 100, maxRows: 40 })
  console.log(`layoutBand without one:  ${((performance.now() - base) / 1000).toFixed(3)} ms a call`)
})
