// X9: the terminal's animations as functions of a frame (view/anim.ts)
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FLASH_MS, FRAME_MS, flashColor, flashLevel, isFlashing, mixHex, shimmerSegs, sparkleColor, sparkleLevel, spinnerGlyph } from '../.build/view/anim.mjs'
import { cells } from '../.build/view/width.mjs'

const HEX = /^#[0-9A-F]{6}$/
const BASE = '#000000'
const HI = '#FFFFFF'
const join = segs => segs.map(s => s.text).join('')
// the index of the character a shimmer lights fully, or -1
const lit = (text, frame, opts) => {
  let at = 0
  for (const s of shimmerSegs(text, frame, BASE, HI, opts)) {
    if (s.color === HI) return at
    at += [...s.text].length
  }
  return -1
}

test('the frame is 125 ms and a glow lasts 600 ms', () => {
  assert.equal(FRAME_MS, 125)
  assert.equal(FLASH_MS, 600)
})

test('mixHex: the ends, the middle, upper case, held to 0..1', () => {
  assert.equal(mixHex('#7858CA', '#FFFFFF', 0), '#7858CA')
  assert.equal(mixHex('#7858CA', '#FFFFFF', 1), '#FFFFFF')
  assert.equal(mixHex('#000000', '#FFFFFF', 0.5), '#808080')
  assert.equal(mixHex('#000000', '#FF0000', 0.25), '#400000')
  assert.equal(mixHex('#7858ca', '#ffffff', 0), '#7858CA', 'lower case in, upper case out')
  assert.equal(mixHex('#7858CA', '#FFFFFF', -3), '#7858CA')
  assert.equal(mixHex('#7858CA', '#FFFFFF', 7), '#FFFFFF')
  assert.equal(mixHex('#7858CA', '#18883A', NaN), '#7858CA', 'not a number: a')
  for (let t = 0; t <= 1; t += 0.1) assert.match(mixHex('#AD6400', '#C5353E', t), HEX)
})

test('mixHex rounds each channel and moves from a to b in order', () => {
  assert.equal(mixHex('#000000', '#010101', 0.4), '#000000')
  assert.equal(mixHex('#000000', '#010101', 0.6), '#010101')
  const reds = [0, 0.25, 0.5, 0.75, 1].map(t => parseInt(mixHex('#102030', '#F0E0D0', t).slice(1, 3), 16))
  assert.deepEqual([...reds].sort((a, b) => a - b), reds)
})

test('spinnerGlyph: ten braille dots, a turn in ten frames, each one cell wide', () => {
  const turn = Array.from({ length: 10 }, (_, f) => spinnerGlyph(f))
  assert.equal(turn.join(''), '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏')
  assert.equal(new Set(turn).size, 10)
  for (const g of turn) assert.equal(cells(g), 1, g)
  for (const f of [10, 25, 1003]) assert.equal(spinnerGlyph(f), spinnerGlyph(f % 10))
  assert.equal(spinnerGlyph(-1), '⠏')
  assert.equal(spinnerGlyph(3.7), spinnerGlyph(3))
})

test('shimmerSegs: the runs put together are the text, whatever the text', () => {
  for (const text of ['Hello world', '注文API改修', 'ＡＢＣ全角', 'éx', '😀ab', 'a', '한글', '…']) {
    for (let f = 0; f < 40; f++) assert.equal(join(shimmerSegs(text, f, '#7858CA', '#D7CFEF')), text, `${text} @${f}`)
  }
  assert.deepEqual(shimmerSegs('', 3, BASE, HI), [])
})

test('shimmerSegs: every colour is #RRGGBB, and runs of one colour are one run', () => {
  for (let f = 0; f < 30; f++) {
    const segs = shimmerSegs('Quarterly report', f, '#7858CA', '#D7CFEF')
    for (const s of segs) assert.match(s.color, HEX)
    for (let i = 1; i < segs.length; i++) assert.notEqual(segs[i].color, segs[i - 1].color)
    for (const s of segs) assert.deepEqual(Object.keys(s).sort(), ['color', 'text'])
  }
})

test('shimmerSegs: the band is lit at its centre, half at each side, and moves a character a frame to the right', () => {
  const text = 'abcdefgh'
  const frame3 = shimmerSegs(text, 3, BASE, HI)
  assert.deepEqual(frame3.map(s => [s.text, s.color]), [['a', '#808080'], ['b', '#FFFFFF'], ['c', '#808080'], ['defgh', '#000000']])
  const centres = Array.from({ length: 8 }, (_, k) => lit(text, k + 2))
  assert.deepEqual(centres, [0, 1, 2, 3, 4, 5, 6, 7])
})

test('shimmerSegs: the band comes in from the left edge half lit, leaves at the right, and the title rests before the next turn', () => {
  const text = 'abcdef'
  assert.deepEqual(shimmerSegs(text, 0, BASE, HI).map(s => s.color), ['#000000'], 'frame 0: the band is still outside')
  assert.deepEqual(shimmerSegs(text, 1, BASE, HI).map(s => [s.text, s.color]), [['a', '#808080'], ['bcdef', '#000000']])
  const period = 6 + 8
  const rest = Array.from({ length: period }, (_, f) => lit(text, f)).filter(i => i === -1).length
  assert.ok(rest >= 6, `${rest} frames with no character fully lit`)
  assert.deepEqual(shimmerSegs(text, period - 1, BASE, HI).map(s => s.color), ['#000000'], 'the last frame of the turn: at rest')
  for (let f = 0; f < period; f++) assert.deepEqual(shimmerSegs(text, f, BASE, HI), shimmerSegs(text, f + period, BASE, HI), `a turn is ${period} frames`)
})

test('shimmerSegs: the period can be given, and a negative frame counts back', () => {
  const text = 'abc'
  assert.deepEqual(shimmerSegs(text, 5, BASE, HI, { period: 5 }), shimmerSegs(text, 0, BASE, HI, { period: 5 }))
  assert.deepEqual(shimmerSegs(text, -1, BASE, HI, { period: 20 }), shimmerSegs(text, 19, BASE, HI, { period: 20 }))
  assert.equal(lit('abcdefghij', 6, { period: 100 }), 4)
})

test('shimmerSegs: a wide character is one character, lit whole, and moves the band two cells', () => {
  const text = '日本語タイトル'
  for (let f = 0; f < 30; f++) {
    const segs = shimmerSegs(text, f, BASE, HI)
    for (const s of segs) for (const ch of s.text) assert.ok(text.includes(ch))
    assert.equal(join(segs), text)
  }
  // the centre is on cell 1 at frame 3: the first character (cells 0-1) is lit, the second (cells 2-3) is next to the centre
  assert.deepEqual(shimmerSegs(text, 3, BASE, HI).slice(0, 2).map(s => [s.text, s.color]), [['日', '#FFFFFF'], ['本', '#808080']])
  assert.equal(lit(text, 5), 1, 'cell 3 is the second character')
  assert.equal(lit(text, 7), 2)
})

test('shimmerSegs: a mark that takes no cell goes with the character before it', () => {
  const segs = shimmerSegs('éxyz', 2, BASE, HI)
  assert.equal(segs[0].text, 'é')
  assert.equal(segs[0].color, HI)
})

test('sparkleLevel: 0 to 3, the same for the same bar and frame, twinkling across frames, different for another bar', () => {
  const levels = Array.from({ length: 400 }, (_, f) => sparkleLevel('order-api', f))
  assert.ok(levels.every(l => Number.isInteger(l) && l >= 0 && l <= 3))
  assert.deepEqual(levels, Array.from({ length: 400 }, (_, f) => sparkleLevel('order-api', f)))
  assert.deepEqual([...new Set(levels)].sort(), [0, 1, 2, 3])
  const counts = [0, 1, 2, 3].map(l => levels.filter(x => x === l).length)
  assert.ok(counts.every(c => c > 40), `spread ${counts}`)
  const other = Array.from({ length: 400 }, (_, f) => sparkleLevel('release', f))
  assert.notDeepEqual(levels, other)
  assert.equal(sparkleLevel('x', 5), sparkleLevel('x', 5.9), 'a frame is a whole number')
})

test('sparkleColor: level 0 is the colour itself, the others lighter, all #RRGGBB', () => {
  assert.equal(sparkleColor('#7858CA', 0), '#7858CA')
  const lum = c => parseInt(c.slice(1, 3), 16) + parseInt(c.slice(3, 5), 16) + parseInt(c.slice(5, 7), 16)
  const colors = [0, 1, 2, 3].map(l => sparkleColor('#7858CA', l))
  for (const c of colors) assert.match(c, HEX)
  assert.deepEqual([...colors].sort((a, b) => lum(a) - lum(b)), colors)
  assert.equal(sparkleColor('#7858CA', 9), '#7858CA', 'a level out of range: no change')
})

test('flashLevel: all of it at the moment, half at 300 ms, none at 600 ms and after, none without an end', () => {
  assert.equal(flashLevel(1000, 1000), 1)
  assert.equal(flashLevel(1300, 1000), 0.5)
  assert.ok(Math.abs(flashLevel(1150, 1000) - 0.75) < 1e-9)
  assert.equal(flashLevel(1600, 1000), 0)
  assert.equal(flashLevel(1601, 1000), 0)
  assert.equal(flashLevel(99_999, 1000), 0)
  assert.equal(flashLevel(1000, null), 0)
  assert.equal(flashLevel(900, 1000), 1, 'before the end it is held to 1')
})

test('isFlashing: for 600 ms after the end, never without one', () => {
  assert.equal(isFlashing(1000, 1000), true)
  assert.equal(isFlashing(1599, 1000), true)
  assert.equal(isFlashing(1600, 1000), false)
  assert.equal(isFlashing(1000, null), false)
})

test('flashColor: white-ward at the start, the colour itself when it is over', () => {
  assert.equal(flashColor('#18883A', 0), '#18883A')
  assert.notEqual(flashColor('#18883A', 1), '#18883A')
  assert.match(flashColor('#18883A', 0.5), HEX)
  const lum = c => parseInt(c.slice(1, 3), 16) + parseInt(c.slice(3, 5), 16) + parseInt(c.slice(5, 7), 16)
  assert.ok(lum(flashColor('#18883A', 1)) > lum(flashColor('#18883A', 0.5)))
  assert.ok(lum(flashColor('#18883A', 0.5)) > lum('#18883A'))
})

test('nothing in the animations reads the time or a random source', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('../../hooks/view/anim.ts', import.meta.url), 'utf8').split('\n').filter(l => !l.trim().startsWith('//')).join('\n')
  assert.doesNotMatch(src, /Math\.random|Date\.now|new Date|performance\./)
})
