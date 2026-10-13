// A8: the words and the number formats
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { TEXT, fmtClock, fmtPct, pctOf, t } from '../.build/view/i18n.mjs'

test('Japanese and English have exactly the same keys, none of them empty', () => {
  assert.deepEqual(Object.keys(TEXT.ja).sort(), Object.keys(TEXT.en).sort())
  assert.ok(Object.keys(TEXT.ja).length >= 36)
  for (const lang of ['ja', 'en']) for (const [k, v] of Object.entries(TEXT[lang])) assert.ok(v.trim() !== '', `${lang} ${k}`)
})

test('the same placeholders in both languages', () => {
  const holes = s => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join()
  for (const k of Object.keys(TEXT.ja)) assert.equal(holes(TEXT.ja[k]), holes(TEXT.en[k]), k)
})

test('the words of DESIGN appendix A', () => {
  assert.deepEqual([t('ja', 'state.needs_input'), t('en', 'state.needs_input')], ['入力待ち', 'needs input'])
  assert.deepEqual([t('ja', 'state.idle'), t('en', 'state.idle')], ['待機中', 'idle'])
  assert.deepEqual([t('ja', 'agent.approval'), t('en', 'agent.approval')], ['承認待ち', 'Needs approval'])
  assert.equal(t('ja', 'more', { n: 3, d: 2 }), '他 3 件（完了 2）')
  assert.equal(t('en', 'more', { n: 3, d: 2 }), '3 more · 2 done')
  assert.equal(t('ja', 'eta', { t: '4分' }), '残り約4分')
  assert.equal(t('en', 'eta', { t: '4m' }), '~4m left')
  assert.equal(t('ja', 'dur.hm', { h: 1, m: 5 }), '1時間5分')
  assert.equal(t('en', 'streak', { tool: 'Bash', n: 3 }), 'Bash failed 3× in a row')
  assert.equal(t('ja', 'tokens.out', { v: '48k' }), '出力 48k')
  assert.equal(t('ja', 'toast.done', { title: '注文API改修', metrics: '4:12' }), '✓ 注文API改修 完了 — 4:12')
  assert.equal(t('ja', 'cmd.sounds', { v: 60 }), '音: 決定・エラー・完了（音量 60）')
  assert.equal(t('en', 'cmd.none'), 'No bars yet. /hud-demo shows a sample.')
  assert.equal(t('ja', 'alt.bar', { title: 'T', stage: 'S', i: 2, n: 4, pct: 42, eta: '' }), 'T: S 2/4、42%')
  assert.equal(t('en', 'alt.done', { title: 'T', n: 5, dur: '4m' }), 'T: done, 5 steps in 4m')
})

test('t leaves a placeholder it was not given', () => {
  assert.equal(t('ja', 'more', { n: 3 }), '他 3 件（完了 {d}）')
  assert.equal(t('en', 'more'), '{n} more · {d} done')
})

test('fmtClock: m:ss up to the hour, h:mm:ss after; the same in every language', () => {
  const c = [[0, '0:00'], [999, '0:00'], [1000, '0:01'], [59_000, '0:59'], [59_999, '0:59'], [60_000, '1:00'], [192_000, '3:12'], [3_599_999, '59:59'], [3_600_000, '1:00:00'], [3_723_000, '1:02:03'], [36_000_000, '10:00:00'], [-5000, '0:00']]
  for (const [ms, want] of c) assert.equal(fmtClock(ms), want, String(ms))
})

test('fmtPct is four cells wide; pctOf rounds and stays in 0 to 100', () => {
  assert.equal(fmtPct(0), '  0%')
  assert.equal(fmtPct(7), '  7%')
  assert.equal(fmtPct(42), ' 42%')
  assert.equal(fmtPct(100), '100%')
  assert.equal(pctOf(1, 3), 33)
  assert.equal(pctOf(2, 3), 67)
  assert.equal(pctOf(0, 0), 0)
  assert.equal(pctOf(5, 3), 100)
  assert.equal(pctOf(-1, 3), 0)
})
