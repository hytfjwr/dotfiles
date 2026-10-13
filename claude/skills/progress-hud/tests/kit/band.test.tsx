// DESIGN 11.4: the official kit (`claude plugin test`), on the band. It needs the engine's rollout switch on (where it is off,
// F9, `claude plugin test` runs nothing); the stub engine tests make the same checks in every case: scenarios*.test.mjs.
// The kit's $.tool.call drops agentId, so the strips are not tried here.
import { expect, mock, test } from 'claude-code/testing'
import { BAND, TOOL, answerBeneath } from './helpers'

const STAGES = [
  { name: 'Analyse', steps: [{ title: 'Read code' }, { title: 'Find bug' }] },
  { name: 'Fix', steps: [{ title: 'Patch' }] },
]

for (const surface of ['terminal', 'desktop'] as const) {
  test(`the band shows a bar and its close button closes it [${surface}]`, async ($, on) => {
    mock.clock(on)
    mock.store(on)
    answerBeneath(on)
    const made = await $.tool.call({ tool: TOOL, id: 'order', title: 'Order API', stages: STAGES } as never)
    expect((made as { result?: unknown }).result).toBe('order: 0/3, running, active "Read code"')

    const ui = await $.ui.mount({ plugin: 'progress-hud', surface, component: 'AbovePrompt', props: BAND })
    const drawn = JSON.stringify(await ui.drawn())
    expect(drawn).toContain('Order API')
    expect(drawn).toContain('hud-close-order')
    if (surface === 'terminal') {
      expect((await ui.find({ text: /0%/ }))?.text).toContain('0%')
      expect(drawn).not.toContain('Svg')
    } else {
      expect(String((await ui.find({ type: 'Svg' }))?.props.alt)).toBe('Order API: Analyse 1/2、0%')
      expect(drawn).not.toContain('Raster')
    }

    await $.tool.call({ tool: TOOL, id: 'order', next: true } as never)
    if (surface === 'terminal') expect((await ui.find({ text: /33%/ }))?.text).toContain('33%')
    await ui.press({ key: 'hud-close-order' })
    expect(await ui.find({ key: 'hud-close-order' })).toBeUndefined()
    await ui.unmount()
  })
}

test('a survey holds the band: nothing of ours is drawn', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  answerBeneath(on)
  await $.tool.call({ tool: TOOL, id: 'order', title: 'Order API', stages: STAGES } as never)
  const ui = await $.ui.mount({ plugin: 'progress-hud', surface: 'terminal', component: 'AbovePrompt', props: { ...BAND, hasSurvey: true } })
  expect(await ui.find({ key: 'hud-close-order' })).toBeUndefined()
  await ui.unmount()
})
