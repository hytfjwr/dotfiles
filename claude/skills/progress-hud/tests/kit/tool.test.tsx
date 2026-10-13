// the official kit on the tool, the commands and the rules: what the real engine's chain gives (the stub engine's tests make the
// same checks over more cases). Needs the engine's rollout switch on; where it is off `claude plugin test` does not run any kit file
import { expect, mock, test } from 'claude-code/testing'
import { ONE_STAGE as STAGES, TOOL } from './helpers'

test('the progress tool creates, moves and refuses as its description says', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  expect(await $.tool.call({ tool: TOOL, id: 't', title: 'T', stages: STAGES } as never)).toEqual({ result: 't: 0/2, running, active "A"' })
  expect(await $.tool.call({ tool: TOOL, id: 't', next: true } as never)).toEqual({ result: 't: 1/2, running, active "B"' })
  expect(await $.tool.call({ tool: TOOL, id: 't', done: ['Nope'] } as never)).toEqual({ deny: 'progress-hud: "t" has no step "Nope". Its steps: A, B' })
  expect(await $.tool.call({ tool: TOOL, id: 'ghost', next: true } as never)).toEqual({ deny: 'progress-hud: no bar "ghost" yet; create it with title and stages.' })
  expect(await $.tool.call({ tool: TOOL, id: 'tasks', next: true } as never)).toEqual({ deny: 'progress-hud: "tasks" mirrors TaskCreate/TaskUpdate; update those tasks instead.' })
  expect(await $.tool.call({ tool: TOOL, id: 't', state: 'done' } as never)).toEqual({ result: 't: 2/2, done' })
})

test('the commands answer in the language of the settings', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  expect(await $.command.run({ command: 'hud', args: '' } as never)).toEqual({ text: '表示中のバーはありません。/hud-demo でサンプルを表示できます。' })
  await $.tool.call({ tool: TOOL, id: 't', title: 'T', stages: STAGES } as never)
  expect(await $.command.run({ command: 'hud', args: 'hide' } as never)).toEqual({ text: 'HUD を隠しました' })
  expect(await $.command.run({ command: 'hud', args: 'show' } as never)).toEqual({ text: 'HUD を表示しました' })
  expect(await $.command.run({ command: 'hud', args: 'bogus' } as never)).toEqual({ text: '使い方: /hud [show|hide|compact|full]' })
  expect(await $.command.run({ command: 'hud-clear', args: '' } as never)).toEqual({ text: 'HUD のバーを消しました' })
})

test('the rules are added last to the system prompt, once, as a session section', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'intro', scope: 'shared' as const }] }))
  const composed = await $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: ['terminal'], tools: [], outputStyle: null, traits: [] } as never)
  const ids = composed.sections.map(s => `${s.id}:${s.scope}`)
  expect(ids).toEqual(['intro:shared', 'progress-hud:rules:session'])
})
