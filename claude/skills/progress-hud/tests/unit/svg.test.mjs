// A10: the desktop's drawings (svg.ts)
// Derived from zycck/claude-mods plugins/plan-progress/tests/regress.mjs (commit 549ecee), MIT License, (c) 2026 Kirill Serditov. Modified for progress-hud. See THIRD_PARTY_NOTICES.md.
import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { newBar } from '../.build/core/model.mjs'
import { renderDesktopBand } from '../.build/view/desktop.mjs'
import { MAX_SOURCE, Lru, drawDesktop, elapsedText, esc, hoverSource, layoutDesktop, liveSource, resetSvgState, svgCaches, trackSvg } from '../.build/view/svg.mjs'
import { DEFAULT_PALETTE } from '../.build/view/theme.mjs'
import { ZERO as M, bandModel } from '../fixtures.mjs'

const st = (title, status) => ({ title, status })
const run = (id, over = {}) => ({ id, title: id, state: 'running', tool: 'Grep', startedAt: 0, endedAt: null, depth: 0, model: 'claude-haiku-4-5-20251001', calls: 0, errors: 0, streak: 0, output: 0, ...over })
const bar = (id = 't', over = {}) => ({
  ...newBar(id, 'tool', 0, M), title: '注文API改修', rev: 1, startedAt: 0, updatedAt: 0,
  stages: [
    { name: '調査', steps: [st('a', 'done'), st('b', 'done'), st('c', 'done')] },
    { name: 'DB移行', steps: [st('d', 'done'), st('e', 'active'), st('f', 'pending'), st('g', 'pending')] },
    { name: 'API', steps: [st('h', 'pending'), st('i', 'pending'), st('j', 'pending')] },
  ],
  ...over,
})
const model = bandModel
const draw = (bars, over = {}, columns = 120) => {
  const m = model(bars, over)
  const layout = layoutDesktop(m, columns)
  return { layout, svgs: drawDesktop(m, layout) }
}
const allSources = svgs => Object.values(svgs).flatMap(s => [s.base, s.hover, ...s.strips.map(x => x.source)])
const ctx = { palette: DEFAULT_PALETTE, lang: 'ja', meter: M }

// a rough check that markup is well formed: tags balance and every & starts an entity
function wellFormed(src) {
  assert.doesNotMatch(src, /&(?!amp;|lt;|gt;|quot;|#\d+;)/, 'a bare &')
  const stack = []
  for (const m of src.replace(/<style>[\s\S]*?<\/style>/g, '<style/>').matchAll(/<(\/?)([\w:-]+)([^>]*?)(\/?)>/g)) {
    const [, close, name, , self] = m
    if (self) continue
    if (close) assert.equal(stack.pop(), name, `closing ${name}`)
    else stack.push(name)
  }
  assert.deepEqual(stack, [], 'unclosed tags')
}

beforeEach(() => resetSvgState())

test('time passing alone does not change the picture: the track and the strips keep their source, only the hover layer is built again', () => {
  const b = bar('t', { agents: [run('a1'), run('a2', { title: 'Read docs' })] })
  const first = draw([b]).svgs.t
  const later = draw([b], { now: 107_000 }).svgs.t
  assert.equal(later.base, first.base)
  assert.deepEqual(later.strips.map(s => s.source), first.strips.map(s => s.source))
  assert.notEqual(later.hover, first.hover, 'the hover layer takes its clock from now')
})

test('a change to one agent redraws that strip alone', () => {
  const agents = [run('a1'), run('a2', { title: 'Read docs' })]
  const first = draw([bar('t', { agents, rev: 1 })]).svgs.t
  const next = draw([bar('t', { agents: [{ ...agents[0], tool: 'Bash', calls: 1 }, agents[1]], rev: 2 })]).svgs.t
  assert.equal(next.base, first.base, 'the track is the same')
  assert.notEqual(next.strips[0].source, first.strips[0].source)
  assert.equal(next.strips[1].source, first.strips[1].source)
  assert.deepEqual(next.strips.map(s => s.key), first.strips.map(s => s.key), 'keys stay')
})

test('a strip whose status changed blurs the old word out and the new one in, and the tint flows', () => {
  const a = run('a1')
  draw([bar('t', { agents: [a] })])
  const next = draw([bar('t', { agents: [{ ...a, tool: 'Bash', state: 'waiting' }], rev: 2 })]).svgs.t.strips[0].source
  assert.match(next, /class="sn mo"[^>]*>Grep</)
  assert.match(next, /class="sn mi"[^>]*>Bash</)
  assert.match(next, /<animate attributeName="fill" from="#7858CA" to="#AD6400"/)
})

test('a running bar has a live clock in its pill; the same strip does too, until it is done and shows a fixed time', () => {
  const t = draw([bar('t', { startedAt: 17_000, agents: [run('a1', { startedAt: 40_000 })] })], { now: 100_000 }).svgs.t
  assert.match(t.hover, /class="kc0 /)
  assert.match(t.hover, /--d:-83\.0s/)
  assert.doesNotMatch(t.hover, /\{\{T:/)
  assert.match(t.strips[0].source, /class="sc /)
  assert.match(t.strips[0].source, /--d:-60\.0s/)
  const done = draw([bar('t', { startedAt: 17_000, agents: [run('a1', { startedAt: 40_000, state: 'done', endedAt: 52_000, tool: '完了' })], rev: 2 })]).svgs.t
  assert.match(done.strips[0].source, />12s</)
  assert.doesNotMatch(done.strips[0].source, /class="sc /)
})

test('the hover layer carries the clock set from the moment of the draw', () => {
  const b = bar('t', { startedAt: 0 })
  const { overlay } = trackSvg(b, 400, ctx)
  assert.match(overlay, /\{\{T:0\}\}/)
  assert.match(hoverSource(overlay, 83_000), /--d:-83\.0s/)
  assert.doesNotMatch(hoverSource(overlay, 83_000), /\{\{T:/)
})

test('liveSource keeps the source while the template stays, and takes the time again when the template changes', () => {
  const tpl = n => `<svg>--d:-{{T:${n}}}s</svg>`
  const a = liveSource('x', tpl(1000), 5000)
  assert.equal(a, '<svg>--d:-4.0s</svg>')
  assert.equal(liveSource('x', tpl(1000), 99_000), a, 'later, same template: the same source')
  assert.equal(liveSource('x', tpl(2000), 99_000), '<svg>--d:-97.0s</svg>')
  assert.equal(liveSource('y', tpl(1000), 99_000), '<svg>--d:-98.0s</svg>', 'per id')
})

test('a finished bar: a fixed pill with the time it took, and its hover adds cost and output of that time', () => {
  const b = bar('t', { state: 'done', endedAt: 252_000, meterStart: { ...M, output: 100, costUsd: 1 }, meterEnd: { ...M, output: 48_100, costUsd: 1.31 } })
  const t = draw([b], { now: 300_000 }).svgs.t
  assert.match(t.base, />4m12s</)
  assert.match(t.hover, />4m12s · \$0\.31 · 出力 48k</)
  assert.doesNotMatch(t.hover, /class="kc0 /, 'no clock once done')
  assert.match(draw([b], { lang: 'en' }).svgs.t.hover, />4m12s · \$0\.31 · out 48k</)
  const free = draw([{ ...b, meterEnd: { ...M, output: 0, costUsd: null }, rev: 2 }]).svgs.t
  assert.match(free.hover, />4m12s</)
  assert.doesNotMatch(free.hover, /·/, 'no figure for the cost or the tokens: only the time')
})

test('the track: fill to the finished share, the stage name on a pill, marks and tips at the checkpoints', () => {
  const t = draw([bar()]).svgs.t
  assert.match(t.base, /width="\d+" height="22"/)
  assert.match(t.base, />DB移行</)
  assert.match(t.base, /fill="#7858CA"/)
  assert.match(t.base, /<path class="b\d t\d" d="M/)
  assert.equal((t.base.match(/<rect x="[\d.]+" y="6" width="3" height="10"/g) ?? []).length, 2, 'two stage boundaries')
  assert.equal((t.base.match(/<circle cx="[\d.]+" cy="11" r="1.4"/g) ?? []).length, 7, 'the other steps')
  assert.equal((t.hover.match(/class="h\d+"/g) ?? []).length, 9)
  assert.match(t.hover, />調査</, 'the tip at the end of the first stage')
  assert.match(t.hover, />DB移行</)
  assert.match(draw([bar('t', { state: 'error', rev: 2 })]).svgs.t.base, /fill="#C5353E"/)
  assert.match(draw([bar('t', { state: 'needs_input', rev: 3 })]).svgs.t.base, /fill="#AD6400"/)
})

test('a tip names what was finished and how long it took', () => {
  const b = bar('t', {
    startedAt: 0,
    stages: [{ name: 'One', steps: [{ title: 'Read', status: 'done', doneAt: 72_000 }, { title: 'Fix', status: 'active' }] }, { name: 'Two', steps: [{ title: 'Ship', status: 'pending' }] }],
  })
  assert.match(draw([b]).svgs.t.hover, />Read · 1m12s</)
})

test('moves glide from where the bar was; a first draw does not', () => {
  const b1 = bar('t', { rev: 1, stages: [{ name: 'S', steps: [st('a', 'active'), st('b', 'pending')] }] })
  const b2 = bar('t', { rev: 2, stages: [{ name: 'S', steps: [st('a', 'done'), st('b', 'active')] }] })
  assert.doesNotMatch(draw([b1]).svgs.t.base, /<animate attributeName="width"/)
  const next = draw([b2]).svgs.t.base
  assert.match(next, /<animate attributeName="width" from="0\.0" to="\d+\.\d"/)
  assert.match(next, /<animateTransform/)
  assert.doesNotMatch(draw([b2]).svgs.t.base.replace(next, ''), /x/, 'redrawing the same bar gives the same drawing')
  assert.equal(draw([b2]).svgs.t.base, next, 'and the same one again: from the cache')
})

test('narrow: a round dot with the stage number instead of a pill, nothing to hover for the clock', () => {
  const t = draw([bar()], {}, 30).svgs.t
  assert.equal(t.width, 120)
  assert.match(t.base, /<circle cx="0" cy="11" r="11"/)
  assert.doesNotMatch(t.hover, /kc0/)
  assert.match(draw([bar('d', { state: 'done' })], {}, 30).svgs.d.base, /M20 6 9 17l-5-5/)
})

test('under 131,072 characters: with 80 steps, a 1400 px track and a crowd of agents', () => {
  const steps = n => Array.from({ length: n }, (_, i) => ({ title: `step ${i} ${'x'.repeat(100)}`, status: i < 30 ? 'done' : 'pending', doneAt: 1000 * i }))
  const agents = Array.from({ length: 9 }, (_, i) => run(`a${i}`, { title: `agent ${i} ${'y'.repeat(80)}`, effort: 'high' }))
  const b = bar('big', { stages: [{ name: 'A', steps: steps(40) }, { name: 'B', steps: steps(40) }], agents })
  const { svgs } = draw([b, { ...b, id: 'big2' }], {}, 400)
  assert.equal(svgs.big.width, 1400)
  for (const s of allSources(svgs)) assert.ok(s.length <= MAX_SOURCE, String(s.length))
})

test('a drawing that would be too long is drawn with less in it, never cut', () => {
  const b = bar('huge', { stages: [{ name: 'A', steps: Array.from({ length: 700 }, (_, i) => ({ title: `step ${i} ${'x'.repeat(100)}`, status: i < 350 ? 'done' : 'pending' })) }] })
  const t = trackSvg(b, 1400, ctx)
  assert.ok(t.base.length <= MAX_SOURCE)
  assert.ok(t.overlay.length <= MAX_SOURCE)
  assert.ok(t.base.endsWith('</svg>') && t.overlay.endsWith('</svg>'))
  wellFormed(t.base)
  wellFormed(t.overlay.replace(/\{\{T:\d+\}\}/g, '1'))
  const full = trackSvg(bar('small'), 1400, ctx)
  assert.ok(full.base.length > 1000)
  assert.ok(t.base.length < MAX_SOURCE)
})

test('a drawing drawn with less in it still glides from where the bar was, as the full one does', () => {
  const steps = n => Array.from({ length: 700 }, (_, i) => ({ title: `step ${i} ${'x'.repeat(100)}`, status: i < n ? 'done' : 'pending' }))
  const huge = (rev, done) => bar('huge', { rev, stages: [{ name: 'A', steps: steps(done) }] })
  const first = trackSvg(huge(1, 0), 1400, ctx)
  assert.doesNotMatch(first.base, /<animate attributeName="width"/, 'the first draw has nowhere to glide from')
  const moved = trackSvg(huge(2, 350), 1400, ctx)
  assert.ok(moved.base.length <= MAX_SOURCE && !moved.base.includes('<path class="b'), 'drawn with less in it')
  assert.match(moved.base, /<animate attributeName="width" from="0\.0" to="700\.0"/)
  assert.match(moved.base, /<animateTransform/)
})

test('text from the model is cleaned and escaped; it cannot add markup, a placeholder or a control character', () => {
  const nasty = `A<script>alert(1)</script>"q" & 'x' {{T:5}}\u0007\u001b[31m`
  const b = bar('t', {
    stages: [{ name: nasty, steps: [{ title: nasty, status: 'done', doneAt: 5000 }, { title: nasty, status: 'active' }] }, { name: 'Two', steps: [{ title: 'z', status: 'pending' }] }],
    agents: [run('a1', { title: nasty, tool: nasty, effort: nasty })],
  })
  const { svgs } = draw([b], {}, 120)
  for (const s of allSources(svgs)) {
    assert.doesNotMatch(s, /<script/)
    assert.doesNotMatch(s, /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/)
    wellFormed(s.replace(/\{\{T:\d+\}\}/g, '1'))
  }
  const everything = allSources(svgs).join('\n')
  assert.match(everything, /A&lt;script&gt;alert\(1\)&lt;\/script&gt;&quot;q&quot; &amp; &#39;x&#39; &#123;&#123;T:5}}/)
  assert.doesNotMatch(everything, /--d:-\{\{T:5\}\}|\{\{T:5\}\}s/, 'no placeholder from the text')
  assert.equal(esc('a\u0000b<c>&"\'{'), 'ab&lt;c&gt;&amp;&quot;&#39;&#123;')
})

test('no drawing refers outside itself: no href, no url( to anywhere but an id of the drawing', () => {
  const b = bar('t', { agents: [run('a1', { title: '<a href="http://evil">x</a>' })] })
  for (const s of allSources(draw([b]).svgs)) {
    assert.doesNotMatch(s, /<[a-zA-Z][^>]*\b(href|xlink:href)\s*=/i, 'no link attribute in any tag')
    assert.doesNotMatch(s, /<(a|image|script|foreignObject)\b|@import|javascript:/i)
    for (const m of s.matchAll(/url\(([^)]*)\)/g)) assert.match(m[1], /^#/, m[0])
    assert.deepEqual([...s.matchAll(/(?:src|data|action)\s*=\s*"[^"]*:/g)], [], 'no attribute holds a URL')
  }
})

test('every drawing says what it shows: no empty alt, in Japanese and English', () => {
  const agents = [run('a1'), run('a2', { state: 'done', endedAt: 5000, tool: '完了' }), run('a3', { state: 'waiting', tool: '承認待ち' })]
  const bars = [bar('a', { agents }), bar('b', { state: 'done', endedAt: 252_000 })]
  for (const lang of ['ja', 'en']) {
    const { layout, svgs } = draw(bars, { lang })
    assert.ok(layout.dividerAlt.trim() !== '')
    for (const r of layout.rows) assert.ok(r.alt.trim() !== '')
    for (const s of Object.values(svgs)) for (const alt of [s.alt, s.hoverAlt, ...s.strips.map(x => x.alt)]) assert.ok(alt.trim() !== '', lang)
  }
})

test('the alt of a bar says where it is: title, stage, step, percentage; done says how long; a note is added', () => {
  const ja = draw([bar('t', { stages: [{ name: 'DB移行', steps: [st('a', 'done'), st('b', 'active'), st('c', 'pending'), st('d', 'pending')] }, { name: 'x', steps: [] }].slice(0, 1), title: '注文API改修' })]).layout.rows[0].alt
  assert.equal(ja, '注文API改修: DB移行 2/4、25%')
  assert.equal(draw([bar()], { lang: 'en' }).layout.rows[0].alt, '注文API改修: DB移行 step 2 of 4, 40%')
  assert.equal(draw([bar('t', { state: 'done', endedAt: 252_000 })]).layout.rows[0].alt, '注文API改修: 完了、10 ステップ、4m12s')
  assert.equal(draw([bar('t', { state: 'done', endedAt: 252_000 })], { lang: 'en' }).layout.rows[0].alt, '注文API改修: done, 10 steps in 4m12s')
  assert.match(draw([bar('t', { state: 'needs_input', note: '公開してよいですか？' })]).layout.rows[0].alt, / — 公開してよいですか？$/)
  const { svgs } = draw([bar('t', { agents: [run('a1', { title: 'Scan' }), run('a2', { state: 'done', tool: '完了', endedAt: 5 })] })])
  assert.deepEqual(svgs.t.strips.map(s => s.alt), ['エージェント Scan: 実行中、Grep', 'エージェント a2: 完了、—'])
})

test('reduced motion stops every animation', () => {
  const t = draw([bar('t', { agents: [run('a1')] })]).svgs.t
  for (const s of [t.base, t.hover, t.strips[0].source]) assert.match(s, /@media \(prefers-reduced-motion:reduce\)/)
})

test('well-formed markup everywhere, with a bar, strips and a folded "+N"', () => {
  const agents = Array.from({ length: 8 }, (_, i) => run(`a${i}`, { title: `agent ${i}`, state: i % 2 ? 'done' : 'running', endedAt: i % 2 ? 9000 : null, depth: i === 3 ? 1 : 0 }))
  const { svgs } = draw([bar('a', { agents }), bar('b', { state: 'done', endedAt: 5000, meterEnd: M })])
  for (const s of allSources(svgs)) wellFormed(s.replace(/\{\{T:\d+\}\}/g, '1'))
  assert.equal(svgs.a.strips.length, 4, 'one stage of the budget for the "+N" strip')
  assert.equal(svgs.a.strips.at(-1).key, 'strip-a-+')
  assert.match(svgs.a.strips.at(-1).alt, /他 \d 件（完了 \d）/)
})

test('colours come from the palette: a state colour on the pill and the fill, the strips in the agent colours', () => {
  const t = draw([bar('t', { agents: [run('a1'), run('a2', { state: 'error', endedAt: 1000, tool: '失敗' })] })]).svgs.t
  assert.match(t.strips[0].source, /fill="#7858CA"/)
  assert.match(t.strips[1].source, /fill="#C5353E"/)
  const other = { ...DEFAULT_PALETTE, name: 'other', bar: { ...DEFAULT_PALETTE.bar, running: '#112233' } }
  assert.match(draw([bar()], { palette: other }).svgs.t.base, /fill="#112233"/)
})

test('a compact density has no strips', () => {
  const b = bar('t', { agents: [run('a1')] })
  assert.equal(draw([b]).svgs.t.strips.length, 1)
  assert.equal(draw([b], { density: 'compact' }).svgs.t.strips.length, 0)
})

test('the strips of a finished batch fold after 5 s, and come back with the next', () => {
  const done = bar('t', { agentsDoneAt: 90_000, agents: [run('a1', { state: 'done', endedAt: 90_000, tool: '完了' })] })
  assert.equal(draw([done], { now: 95_000 }).svgs.t.strips.length, 1)
  assert.equal(draw([done], { now: 95_001 }).svgs.t.strips.length, 0)
})

// ---- the cache ----

test('Lru: the oldest goes first, a read counts as use, a write of a key renews it', () => {
  const c = new Lru(3)
  for (const k of ['a', 'b', 'c']) c.set(k, k.toUpperCase())
  assert.equal(c.get('a'), 'A')
  c.set('d', 'D')
  assert.deepEqual(c.keys(), ['c', 'a', 'd'])
  assert.equal(c.get('b'), undefined)
  c.set('c', 'C2')
  c.set('e', 'E')
  assert.deepEqual(c.keys(), ['d', 'c', 'e'])
  assert.equal(c.size, 3)
  c.clear()
  assert.equal(c.size, 0)
})

test('the track of an unchanged bar comes from the cache, one of a bar of another rev, width, palette, language or start does not', () => {
  const b = bar()
  const t = trackSvg(b, 400, ctx)
  assert.equal(trackSvg(b, 400, ctx), t)
  assert.equal(trackSvg({ ...b, agents: [run('a')] }, 400, ctx), t, 'strips are not part of the track')
  for (const other of [trackSvg({ ...b, rev: 2 }, 400, ctx), trackSvg(b, 401, ctx), trackSvg(b, 400, { ...ctx, palette: { ...DEFAULT_PALETTE, name: 'x' } }), trackSvg(b, 400, { ...ctx, lang: 'en' }), trackSvg({ ...b, startedAt: 5 }, 400, ctx)]) {
    assert.notEqual(other, t)
  }
})

test('64 drawings are kept; past that the least recently used goes', () => {
  const bars = Array.from({ length: 70 }, (_, i) => bar(`bar-${i}`))
  const first = trackSvg(bars[0], 400, ctx)
  const second = trackSvg(bars[1], 400, ctx)
  for (const b of bars.slice(2)) trackSvg(b, 400, ctx)
  assert.equal(svgCaches.tracks.size, 64)
  assert.notEqual(trackSvg(bars[0], 400, ctx), first, 'the oldest was dropped and drawn again')
  assert.equal(trackSvg(bars[69], 400, ctx), trackSvg(bars[69], 400, ctx), 'the newest is kept')
  assert.equal(svgCaches.tracks.capacity, 64)
  const again = trackSvg(bars[1], 400, ctx)
  assert.ok(again && second)
})

test('strip drawings are kept the same way, 64 of them', () => {
  const agents = Array.from({ length: 5 }, (_, i) => run(`a${i}`))
  for (let i = 0; i < 30; i++) draw([bar(`b${i}`, { agents })])
  assert.equal(svgCaches.rows.size, 64)
  assert.equal(svgCaches.rows.capacity, 64)
})

// ---- the layout ----

test('layout: the band is 8 px a column, at least 320; the track takes what the title leaves, between 120 and 1400', () => {
  assert.equal(layoutDesktop(model([bar()]), 100).total, 800)
  assert.equal(layoutDesktop(model([bar()]), 10).total, 320)
  assert.equal(layoutDesktop(model([bar()]), 0).total, 800, 'no width given: 100 columns')
  const wide = layoutDesktop(model([bar()]), 400)
  assert.equal(wide.trackW, 1400)
  assert.equal(layoutDesktop(model([bar()]), 10).trackW, 120)
  const long = layoutDesktop(model([bar('t', { title: 'とても長いタイトルがここに入ります'.repeat(3) })]), 100)
  const short = layoutDesktop(model([bar('t', { title: 'ab' })]), 100)
  assert.ok(long.trackW < short.trackW)
  assert.ok(long.total * 0.3 + 140 + long.trackW <= long.total + 1, 'the title takes at most 30 %')
})

test('layout: a row has the glyph in the state colour, the title, a percentage with figure spaces, and the alt', () => {
  const { rows } = layoutDesktop(model([bar('a'), bar('b', { state: 'done' }), bar('c', { state: 'error' }), bar('d', { state: 'needs_input' })]), 100)
  assert.deepEqual(rows.map(r => [r.glyph.text, r.glyph.color]), [['●', '#7858CA'], ['✓', '#18883A'], ['!', '#C5353E'], ['?', '#AD6400']])
  assert.deepEqual(rows.map(r => r.pct.text), ['\u200740%', '100%', '\u200740%', '\u200740%'])
  assert.ok(rows.every(r => r.pct.dim === true))
  assert.equal(rows[0].title, '注文API改修')
})

test('layout: the session line shows for sessionMetrics desktop and all, not off', () => {
  const g = { startedAt: 0, contextPercent: 41, fiveHourPercent: 23 }
  const m = { ...M, costUsd: 1.23 }
  for (const mode of ['desktop', 'all']) assert.deepEqual(layoutDesktop(model([bar()], { sessionMetrics: mode, gauge: g, meter: m }), 100).metrics, { text: '◷ 1:40 · $1.23 · ctx 41% · 5h 23%', dim: true })
  assert.equal(layoutDesktop(model([bar()], { sessionMetrics: 'off', gauge: g, meter: m }), 100).metrics, null)
  assert.equal(layoutDesktop(model([bar()], { sessionMetrics: 'desktop' }), 100).metrics, null, 'no figure at all')
  assert.equal(layoutDesktop(model([bar()], { sessionMetrics: 'desktop', gauge: { startedAt: null, contextPercent: 5, fiveHourPercent: null } }), 100).metrics.text, '◷ ctx 5%')
})

test('the band as elements: a row of glyph, title, spacer, track over hover layer with strips beneath, percentage, close', () => {
  const m = model([bar('a', { agents: [run('a1')] }), bar('b')], { sessionMetrics: 'desktop', gauge: { startedAt: 0, contextPercent: 10, fiveHourPercent: null } })
  const layout = layoutDesktop(m, 120)
  const h = (type, props, ...children) => ({ type, props: props ?? {}, children })
  globalThis.h = h
  const table = Object.fromEntries(['Box', 'Text', 'Button', 'Svg'].map(n => [n, n]))
  const pressed = []
  const out = renderDesktopBand(table, layout, drawDesktop(m, layout), { close: id => pressed.push(id) })
  assert.deepEqual(out.map(n => `${n.type}:${n.props.key}`), ['Box:bar-a', 'Svg:div-b', 'Box:bar-b', 'Text:hud-metrics'])
  const row = out[0]
  assert.equal(row.props.flexDirection, 'row')
  assert.equal(row.props.alignItems, 'flex-start', 'strips under the track: the row starts at the top')
  assert.equal(out[2].props.alignItems, 'center')
  assert.deepEqual(row.children.map(c => c.type), ['Text', 'Text', 'Box', 'Box', 'Text', 'Button'])
  const column = row.children[3]
  assert.equal(column.props.flexShrink, 0)
  const trackBox = column.children[0]
  assert.equal(trackBox.props.key, 'track-a')
  assert.deepEqual(trackBox.children.map(c => c.type), ['Svg', 'Box'])
  assert.equal(trackBox.children[1].props.position, 'absolute')
  assert.equal(trackBox.children[1].children[0].props.isInteractive, true)
  assert.equal(trackBox.children[0].props.isInteractive, undefined)
  assert.deepEqual(column.children.slice(1).flat().map(c => c.props.key), ['strip-a-a1'])
  const close = row.children[5]
  assert.deepEqual([close.props.key, close.props.label, close.props.plain, close.props.dimColor], ['hud-close-a', '✕', true, true])
  close.props.onPress()
  assert.deepEqual(pressed, ['a'])
  assert.equal(out[1].props.width, layout.total)
  assert.equal(out[1].props.height, 1)
  assert.equal(out[3].props.dimColor, true)
})

test('the layout and the drawings leave the model alone', () => {
  const deepFreeze = o => {
    if (o && typeof o === 'object') Object.values(o).forEach(deepFreeze)
    return Object.freeze(o)
  }
  const m = deepFreeze(model([bar('a', { agents: [run('a1')] })]))
  assert.doesNotThrow(() => drawDesktop(m, layoutDesktop(m, 120)))
})

test('elapsedText: 59s, 4m12s, 1h5m', () => {
  for (const [ms, want] of [[0, '0s'], [59_000, '59s'], [59_600, '1m0s'], [60_000, '1m0s'], [252_000, '4m12s'], [3_599_000, '59m59s'], [3_900_000, '1h5m'], [-5, '0s']]) assert.equal(elapsedText(ms), want, String(ms))
})
