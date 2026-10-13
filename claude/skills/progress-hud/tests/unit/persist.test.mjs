// A3 (extended): persist.ts, the snapshot a session's bars are stored as
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { newBar } from '../.build/core/model.mjs'
import { KEEP_STEPS, MAX_SNAPSHOT_CHARS, fitSize, fromPrefs, fromSnapshot, pruneKeys, toSnapshot } from '../.build/core/persist.mjs'

const METER = { input: 1, output: 2, cacheRead: 3, cacheWrite: 4, costUsd: 0.25 }
const META = { sessionId: 's1', cwd: '/w/app', root: '/w/app', repo: 'acme/app' }
const bar = (id, over = {}) => ({ ...newBar(id, 'tool', 100, METER), title: id, stages: [{ name: 'One', steps: [{ title: 'A', status: 'active' }, { title: 'B', status: 'pending' }] }], ...over })
const run = id => ({ id, title: id, state: 'running', tool: 'Grep', startedAt: 1, endedAt: null, depth: 0, calls: 1, errors: 0, streak: 0, output: 9 })
// a bar of n steps with long titles, to make the snapshot big
const fat = (id, n, over = {}) => bar(id, { stages: [{ name: 'S', steps: Array.from({ length: n }, (_, i) => ({ title: `${id}-${i}-${'x'.repeat(100)}`, status: 'done' })) }], ...over })

test('toSnapshot: version, meta, savedAt, and bars without agents', () => {
  const b = bar('a', { agents: [run('r1')], agentsDoneAt: 5 })
  const snap = toSnapshot([b], META, 777)
  assert.deepEqual({ ...snap, bars: undefined }, { v: 1, ...META, savedAt: 777, bars: undefined })
  assert.deepEqual(snap.bars[0].agents, [])
  assert.equal(snap.bars[0].agentsDoneAt, null)
  assert.equal(b.agents.length, 1, 'the bar given is not changed')
})

test('fromSnapshot: a stored snapshot comes back as the same bars', () => {
  const bars = [bar('a'), bar('b', { state: 'done', endedAt: 200, meterEnd: METER, note: 'n', kind: 'todo', mainErrors: 2, mainStreak: 1, lastErrorTool: 'Bash', collapsed: true })]
  bars[0].stages[0].steps[0].doneAt = 150
  bars[0].stages[0].steps[1].taskId = '7'
  const stored = JSON.parse(JSON.stringify(toSnapshot(bars, META, 1)))
  assert.deepEqual(fromSnapshot(stored), bars)
})

test('fromSnapshot: another version or shape is ignored', () => {
  const ok = JSON.parse(JSON.stringify(toSnapshot([bar('a')], META, 1)))
  assert.equal(fromSnapshot({ ...ok, v: 2 }), null)
  assert.equal(fromSnapshot({ ...ok, v: undefined }), null)
  assert.equal(fromSnapshot({ ...ok, bars: 'no' }), null)
  for (const v of [null, undefined, 1, 'x', [], {}, { v: 1 }]) assert.equal(fromSnapshot(v), null)
})

test('fromSnapshot: a bar of the wrong shape is dropped, the others stay', () => {
  const stored = JSON.parse(JSON.stringify(toSnapshot([bar('a'), bar('b'), bar('c'), bar('d')], META, 1)))
  stored.bars[0].state = 'paused'
  stored.bars[1].stages[0].steps[0].status = 'wat'
  delete stored.bars[2].meterStart
  assert.deepEqual(fromSnapshot(stored).map(b => b.id), ['d'])
  assert.deepEqual(fromSnapshot({ v: 1, bars: [] }), [])
})

test('fromSnapshot: stored strips are never restored, whatever the value says', () => {
  const stored = JSON.parse(JSON.stringify(toSnapshot([bar('a')], META, 1)))
  stored.bars[0].agents = [run('r1')]
  stored.bars[0].agentsDoneAt = 99
  const [b] = fromSnapshot(stored)
  assert.deepEqual(b.agents, [])
  assert.equal(b.agentsDoneAt, null)
})

test('fromPrefs', () => {
  assert.deepEqual(fromPrefs({ density: 'compact' }), { density: 'compact' })
  assert.deepEqual(fromPrefs({ density: 'full', extra: 1 }), { density: 'full' })
  for (const v of [null, undefined, {}, { density: 'big' }, 'compact', []]) assert.equal(fromPrefs(v), null)
})

test('fitSize: a snapshot under the limit is returned as it is', () => {
  const snap = toSnapshot([bar('a'), fat('d', 5, { state: 'done' })], META, 1)
  assert.equal(fitSize(snap), snap)
})

test('fitSize: finished bars go first, oldest first, and only as many as needed', () => {
  // a bar of 400 steps with 100-character titles is some 50 000 characters
  const snap = toSnapshot([fat('d1', 400, { state: 'done' }), bar('run'), fat('d2', 400, { state: 'done' }), fat('d3', 400, { state: 'done' })], META, 1)
  assert.ok(JSON.stringify(snap).length > MAX_SNAPSHOT_CHARS)
  const fit = fitSize(snap)
  assert.ok(JSON.stringify(fit).length <= MAX_SNAPSHOT_CHARS)
  assert.deepEqual(fit.bars.map(b => b.id), ['run', 'd3'])
  assert.equal(snap.bars.length, 4, 'the snapshot given is not changed')
})

test('fitSize: with no finished bar left to drop, every bar keeps its last 40 steps', () => {
  const snap = toSnapshot([fat('a', 500, { state: 'running' }), fat('b', 500, { state: 'running' })], META, 1)
  assert.ok(JSON.stringify(snap).length > MAX_SNAPSHOT_CHARS)
  const fit = fitSize(snap)
  assert.ok(JSON.stringify(fit).length <= MAX_SNAPSHOT_CHARS)
  assert.deepEqual(fit.bars.map(b => b.id), ['a', 'b'])
  for (const b of fit.bars) {
    const steps = b.stages.flatMap(s => s.steps)
    assert.equal(steps.length, KEEP_STEPS)
    assert.ok(steps[steps.length - 1].title.startsWith(`${b.id}-499-`), 'the tail is kept')
  }
})

test('fitSize: truncation spans stages and drops the stages it empties', () => {
  const stages = [{ name: 'S1', steps: Array.from({ length: 30 }, (_, i) => ({ title: `a${i}-${'x'.repeat(100)}`, status: 'done' })) }, { name: 'S2', steps: Array.from({ length: 800 }, (_, i) => ({ title: `b${i}-${'x'.repeat(100)}`, status: 'done' })) }]
  const fit = fitSize(toSnapshot([bar('a', { stages, state: 'running' })], META, 1))
  assert.deepEqual(fit.bars[0].stages.map(s => [s.name, s.steps.length]), [['S2', 40]])
  const small = [{ name: 'S1', steps: [{ title: 'only', status: 'done' }] }, ...stages.slice(1)]
  const fit2 = fitSize(toSnapshot([bar('a', { stages: small, state: 'running' })], META, 1))
  assert.deepEqual(fit2.bars[0].stages.map(s => [s.name, s.steps.length]), [['S2', 40]])
})

test('pruneKeys: the oldest bars: keys beyond 30 are the ones to delete', () => {
  const keys = Array.from({ length: 33 }, (_, i) => `bars:s${i}`)
  assert.deepEqual(pruneKeys(keys), ['bars:s0', 'bars:s1', 'bars:s2'])
  assert.deepEqual(pruneKeys(keys.slice(0, 30)), [])
  assert.deepEqual(pruneKeys([]), [])
  assert.deepEqual(pruneKeys(keys, 31), ['bars:s0', 'bars:s1'])
})

test('pruneKeys: other keys neither count nor go', () => {
  const keys = ['prefs', ...Array.from({ length: 31 }, (_, i) => `bars:s${i}`), 'other']
  assert.deepEqual(pruneKeys(keys), ['bars:s0'])
  assert.deepEqual(pruneKeys(['prefs', 'x', 'bars:a']), [])
})
