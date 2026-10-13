// the default palette (DESIGN appendix B) and the demo script (5.12.1)
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEFAULT_PALETTE, resolvePalette } from '../.build/view/theme.mjs'
import { DEMO_MS, demoScript } from '../.build/demo/script.mjs'

test('the default palette is the four colours of appendix B', () => {
  assert.deepEqual(DEFAULT_PALETTE.bar, { running: '#7858CA', needs_input: '#AD6400', error: '#C5353E', done: '#18883A' })
  assert.deepEqual(DEFAULT_PALETTE.agent, { running: '#7858CA', waiting: '#AD6400', done: '#18883A', error: '#C5353E' })
  assert.equal(resolvePalette({ language: 'ja' }, { themeName: 'dark', hasTerminal: true }), DEFAULT_PALETTE)
  assert.equal(resolvePalette({}, { themeName: null, hasTerminal: false }), DEFAULT_PALETTE)
})

const shape = lang => demoScript(lang).map(s => `${s.at}:${s.kind}:${s.id ?? s.input?.id ?? ''}`)

test('the demo is about 12 seconds of two bars and ten agents, all with demo ids', () => {
  const script = demoScript('ja')
  assert.equal(DEMO_MS, 12_000)
  assert.ok(script.every(s => s.at >= 0 && s.at < DEMO_MS))
  assert.ok(Math.max(...script.map(s => s.at)) >= 11_000, 'it runs to the end')
  const bars = script.filter(s => s.kind === 'bar')
  assert.deepEqual([...new Set(bars.map(s => s.input.id))], ['demo-plan', 'demo-todo'])
  const spawns = script.filter(s => s.kind === 'spawn')
  assert.equal(spawns.length, 10)
  assert.deepEqual(spawns.map(s => s.id), Array.from({ length: 10 }, (_, i) => `demo-a${[1, 2, 7, 8, 3, 4, 5, 9, 6, 10][i]}`))
  assert.ok(spawns.every(s => s.id.startsWith('demo-a') && s.bar.startsWith('demo-')))
  assert.equal(new Set(spawns.map(s => s.title)).size, 10)
})

test('it has a question, a failure, a plan that changes on the way, and both bars done', () => {
  const script = demoScript('ja')
  assert.ok(script.some(s => s.kind === 'bar' && s.input.state === 'needs_input' && s.input.note))
  assert.ok(script.some(s => s.kind === 'end' && s.ok === false), 'an agent fails')
  assert.ok(script.some(s => s.kind === 'bar' && s.input.failed), 'a step fails')
  const resends = script.filter(s => s.kind === 'bar' && s.input.id === 'demo-plan' && s.input.stages)
  assert.equal(resends.length, 2, 'created, then resent')
  assert.ok(resends[1].input.stages.flatMap(g => g.steps).length > resends[0].input.stages.flatMap(g => g.steps).length)
  assert.ok(resends[1].at > 5000)
  const done = script.filter(s => s.kind === 'bar' && s.input.state === 'done')
  assert.deepEqual(done.map(s => s.input.id).sort(), ['demo-plan', 'demo-todo'])
  assert.equal(script.find(s => s.kind === 'bar' && s.input.id === 'demo-todo').input.kind, 'todo')
})

test('an agent is started before anything else is said about it, and a child after its parent', () => {
  const script = [...demoScript('en')].sort((a, b) => a.at - b.at)
  const started = new Map()
  for (const s of script) {
    if (s.kind === 'spawn') {
      if (s.parent) assert.ok(started.has(s.parent), `${s.id}'s parent`)
      started.set(s.id, s.at)
    } else if (s.kind !== 'bar') assert.ok((started.get(s.id) ?? Infinity) <= s.at, `${s.kind} ${s.id}`)
  }
  const ended = script.filter(s => s.kind === 'end').map(s => s.id)
  assert.equal(new Set(ended).size, ended.length, 'each ends once')
  assert.deepEqual([...started.keys()].sort(), [...ended].sort(), 'every agent ends')
  assert.ok(script.some(s => s.kind === 'spawn' && s.parent), 'one is a child')
  assert.ok(script.some(s => s.kind === 'spawn' && s.effort), 'one shows an effort')
})

test('Japanese and English scripts have the same shape and different words', () => {
  assert.deepEqual(shape('ja'), shape('en'))
  const ja = JSON.stringify(demoScript('ja'))
  const en = JSON.stringify(demoScript('en'))
  assert.notEqual(ja, en)
  assert.match(ja, /注文モジュール改修/)
  assert.match(en, /Orders module/)
  assert.doesNotMatch(en, /[ぁ-んァ-ン一-龥]/)
})

test('the script is data: every call gives equal copies', () => {
  assert.deepEqual(demoScript('ja'), demoScript('ja'))
  assert.notEqual(demoScript('ja'), demoScript('ja'))
})
