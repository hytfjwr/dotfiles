// A6: meter: adding usage, differences, number formats, the finished-bar toast
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { newBar } from '../.build/core/model.mjs'
import { EMPTY_METER as M0, addUsage, diff, formatCost, formatTokens, toastText } from '../.build/core/meter.mjs'


test('addUsage adds the four counts and leaves the cost alone', () => {
  const m = addUsage({ ...M0, costUsd: 1 }, { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 30, cache_creation_input_tokens: 40, model: 'x' })
  assert.deepEqual(m, { input: 10, output: 20, cacheRead: 30, cacheWrite: 40, costUsd: 1 })
  assert.deepEqual(addUsage(m, { output_tokens: 5 }), { input: 10, output: 25, cacheRead: 30, cacheWrite: 40, costUsd: 1 })
})

test('addUsage: no usage, or one that is not an object, gives the same meter; bad numbers count as 0', () => {
  for (const u of [undefined, null, 5, 'x']) assert.equal(addUsage(M0, u), M0)
  assert.deepEqual(addUsage(M0, { input_tokens: 'many', output_tokens: NaN, cache_read_input_tokens: Infinity }), M0)
})

test('diff: end minus start, never below zero; the cost is null when either side has none', () => {
  const a = { input: 100, output: 50, cacheRead: 10, cacheWrite: 5, costUsd: 2.5 }
  const b = { input: 40, output: 60, cacheRead: 10, cacheWrite: 0, costUsd: 1 }
  assert.deepEqual(diff(a, b), { input: 60, output: 0, cacheRead: 0, cacheWrite: 5, costUsd: 1.5 })
  assert.equal(diff(a, { ...b, costUsd: null }).costUsd, null)
  assert.equal(diff({ ...a, costUsd: null }, b).costUsd, null)
  assert.equal(diff(b, a).costUsd, 0)
})

test('formatTokens: 999, 1.2k, 48k, 1.2M', () => {
  const t = [[0, '0'], [999, '999'], [1000, '1k'], [1200, '1.2k'], [9949, '9.9k'], [10_000, '10k'], [48_000, '48k'], [48_499, '48k'], [999_499, '999k'], [999_500, '1M'], [1_000_000, '1M'], [1_200_000, '1.2M'], [12_400_000, '12M'], [-5, '0']]
  for (const [n, want] of t) assert.equal(formatTokens(n), want, String(n))
})

test('formatCost: $0.31, <$0.01 under a cent, null without a figure', () => {
  assert.equal(formatCost(0.31), '$0.31')
  assert.equal(formatCost(12.345), '$12.35')
  assert.equal(formatCost(0.01), '$0.01')
  assert.equal(formatCost(0.0099), '<$0.01')
  assert.equal(formatCost(0), '<$0.01')
  assert.equal(formatCost(null), null)
})

const done = (over = {}) => ({ ...newBar('t', 'tool', 1000, { ...M0, output: 100, costUsd: 1 }), title: '注文API改修', state: 'done', endedAt: 1000 + 252_000, meterEnd: { ...M0, output: 48_100, costUsd: 1.31 }, ...over })

test('toastText: title, time, cost and output of the period, in Japanese and English', () => {
  assert.equal(toastText(done(), M0, 'ja'), '✓ 注文API改修 完了 — 4:12 · $0.31 · 出力 48k')
  assert.equal(toastText(done({ title: 'Orders' }), M0, 'en'), '✓ Orders done — 4:12 · $0.31 · out 48k')
})

test('toastText: no cost without a figure, no tokens when none, an hour as h:mm:ss', () => {
  assert.equal(toastText(done({ meterEnd: { ...M0, output: 48_100, costUsd: null } }), M0, 'en'), '✓ 注文API改修 done — 4:12 · out 48k')
  assert.equal(toastText(done({ meterEnd: { ...done().meterStart } }), M0, 'ja'), '✓ 注文API改修 完了 — 4:12 · <$0.01')
  assert.equal(toastText(done({ endedAt: 1000 + 3_725_000 }), M0, 'ja').split(' — ')[1].split(' · ')[0], '1:02:05')
})

test('toastText: without meterEnd the current meter stands in', () => {
  const b = done({ meterEnd: null })
  assert.equal(toastText(b, { ...M0, output: 1_100, costUsd: 1.5 }, 'ja'), '✓ 注文API改修 完了 — 4:12 · $0.50 · 出力 1k')
})
