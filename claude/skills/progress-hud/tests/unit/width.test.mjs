// A7: terminal cell widths
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cells, padEndCells, padStartCells, pxWidth, truncateCells } from '../.build/view/width.mjs'

test('cells: ASCII one each, CJK, kana, full-width and Hangul two each', () => {
  assert.equal(cells(''), 0)
  assert.equal(cells('abc 123'), 7)
  assert.equal(cells('日本語'), 6)
  assert.equal(cells('ひらがなカタカナ'), 16)
  assert.equal(cells('ＡＢＣ１２３'), 12)
  assert.equal(cells('한글'), 4)
  assert.equal(cells('注文API改修'), 11)
  assert.equal(cells('，。「」'), 8)
})

test('cells: half-width katakana is one, combining marks and joiners none, control characters none', () => {
  assert.equal(cells('ｶﾀｶﾅ'), 4)
  assert.equal(cells('é'), 1)
  assert.equal(cells('が'), 2)
  assert.equal(cells('が'), 2)
  assert.equal(cells('a‍b'), 2)
  assert.equal(cells('a\u0007\u001bb'), 2)
  assert.equal(cells('x️'), 1)
})

test('cells: ambiguous characters count as one', () => {
  for (const ch of ['●', '○', '█', '░', '┊', '✓', '✗', '▸', '─', '◷', '⚙', '└', '├', '✕', '…']) assert.equal(cells(ch), 1, ch)
  assert.equal(cells('●█░┊✓○'), 6)
  assert.equal(cells('αβγ'), 3)
})

test('cells: emoji are two', () => {
  assert.equal(cells('😀'), 2)
  assert.equal(cells('🚀x'), 3)
})

test('truncateCells: what fits stays, else the cut ends in … and fits', () => {
  assert.equal(truncateCells('abc', 3), 'abc')
  assert.equal(truncateCells('abc', 10), 'abc')
  assert.equal(truncateCells('abcdef', 4), 'abc…')
  assert.equal(truncateCells('日本語テスト', 7), '日本語…')
  assert.equal(truncateCells('日本語', 6), '日本語')
  assert.equal(truncateCells('日本語', 5), '日本…')
  assert.equal(truncateCells('日本語', 4), '日…', 'a wide character that does not fit is left out')
  assert.equal(truncateCells('日本語', 1), '…')
  assert.equal(truncateCells('日本語', 0), '')
  assert.equal(truncateCells('日本語', -3), '')
  assert.equal(truncateCells('', 4), '')
})

test('truncateCells: never wider than asked, whatever the text', () => {
  const samples = ['abcdefghij', '日本語のタイトルです', 'ＡＢＣ全角mixed text', 'éééé', '😀😀😀😀', 'a日b本c語d']
  for (const s of samples) for (let n = 0; n <= 14; n++) assert.ok(cells(truncateCells(s, n)) <= n, `${s} at ${n}`)
})

test('pad helpers add spaces to the cell width, never cut', () => {
  assert.equal(padEndCells('日本', 6), '日本  ')
  assert.equal(padStartCells('3:12', 7), '   3:12')
  assert.equal(padEndCells('abcdef', 3), 'abcdef')
  assert.equal(padStartCells('abcdef', 3), 'abcdef')
})

test('pxWidth: CJK and full-width 12 px, narrow letters 3.4, wide letters 9.5, the rest 6.7', () => {
  assert.equal(pxWidth(''), 0)
  assert.equal(pxWidth('日本'), 24)
  assert.equal(pxWidth('ＡＢ'), 24)
  assert.equal(pxWidth('한'), 12)
  assert.ok(Math.abs(pxWidth('abc') - 20.1) < 1e-9)
  assert.ok(Math.abs(pxWidth('ilI') - 10.2) < 1e-9)
  assert.equal(pxWidth('MW'), 19)
  assert.equal(pxWidth('é'), 6.7)
  assert.ok(pxWidth('注文API') > pxWidth('API'))
})
