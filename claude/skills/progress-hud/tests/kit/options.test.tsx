// DESIGN 11.4: the official kit, on the userConfig values. Needs the engine's rollout switch on (F9); the stub engine tests
// of parseOptions and of the words (unit/rules-config, scenarios-view) make the same checks.
import { expect, mock, test } from 'claude-code/testing'
import { BAND, ONE_STAGE as STAGES, TOOL, answerBeneath } from './helpers'

test('the band speaks Japanese by default', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  answerBeneath(on)
  await $.tool.call({ tool: TOOL, id: 't', title: 'T', stages: STAGES, state: 'needs_input', note: 'ok?' } as never)
  const ui = await $.ui.mount({ plugin: 'progress-hud', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  expect(JSON.stringify(await ui.drawn())).toContain('入力待ち')
  await ui.unmount()
})

test('language en: the band speaks English', { options: { language: 'en' } }, async ($, on) => {
  mock.clock(on)
  mock.store(on)
  answerBeneath(on)
  await $.tool.call({ tool: TOOL, id: 't', title: 'T', stages: STAGES, state: 'needs_input', note: 'ok?' } as never)
  const ui = await $.ui.mount({ plugin: 'progress-hud', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('needs input')
  expect(drawn).not.toContain('入力待ち')
  await ui.unmount()
})

test('language auto follows LANG', { options: { language: 'auto' } }, async ($, on) => {
  mock.clock(on)
  mock.store(on)
  answerBeneath(on)
  mock.env(on, { LANG: 'en_US.UTF-8' })
  await $.tool.call({ tool: TOOL, id: 't', title: 'T', stages: STAGES, state: 'needs_input', note: 'ok?' } as never)
  const ui = await $.ui.mount({ plugin: 'progress-hud', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  expect(JSON.stringify(await ui.drawn())).toContain('needs input')
  await ui.unmount()
})

test('maxBars: past the number the oldest finished bar is dropped', { options: { maxBars: 2 } }, async ($, on) => {
  mock.clock(on)
  mock.store(on)
  answerBeneath(on)
  for (const id of ['a', 'b']) await $.tool.call({ tool: TOOL, id, title: id, stages: STAGES } as never)
  await $.tool.call({ tool: TOOL, id: 'a', state: 'done' } as never)
  await $.tool.call({ tool: TOOL, id: 'c', title: 'c', stages: STAGES } as never)
  const ui = await $.ui.mount({ plugin: 'progress-hud', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  const keys = (await ui.findAll({ type: 'Button' })).map(b => b.key)
  expect(keys).toEqual(['hud-close-b', 'hud-close-c'])
  await ui.unmount()
})
