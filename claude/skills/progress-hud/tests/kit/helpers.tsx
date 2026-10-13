// what the kit's test files share: the tool's name, the props of the band, and the answer the test gives beneath the plugins
import type { On } from 'claude-code'

export const TOOL = 'mcp__progress-hud__progress'

// one stage of two steps: enough for a bar that moves
export const ONE_STAGE = [{ name: 'One', steps: [{ title: 'A' }, { title: 'B' }] }]

// the props of the band above the prompt, as the engine hands them over
export const BAND = {
  hasSurvey: false,
  isWorking: true,
  maxRows: 12,
  bodyColumns: 100,
  scroll: { offset: 0, bodyRows: 11 },
  view: {},
}

// nothing beneath the plugins answers ui.render in the kit, so the test does: an empty Box, the engine's own part of the band
export const answerBeneath = (on: On) =>
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
