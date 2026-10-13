import type { AgentState, BarState, HudEnv } from '../../types'
import type { HudConfig } from '../core/config'

// colours as the Text element's color prop takes them; light elements (empty cells, clocks, counts) use dimColor and no colour
export type Palette = {
  name: string
  bar: Record<BarState, string>
  agent: Record<AgentState, string>
  // the desktop's drawings: text on a coloured pill, text on a dark strip, the grey of marks, of the "+N" label, of tip backgrounds, of empty tracks
  ink: string
  text: string
  muted: string
  faint: string
  tip: string
  neutral: string
}

// DESIGN appendix B, default: one lightness for every state (OKLCH L .55), so no state shouts louder than another
const BAR: Record<BarState, string> = { running: '#7858CA', needs_input: '#AD6400', error: '#C5353E', done: '#18883A' }

export const DEFAULT_PALETTE: Palette = {
  name: 'default',
  bar: BAR,
  agent: { running: BAR.running, waiting: BAR.needs_input, done: BAR.done, error: BAR.error },
  ink: '#FFFFFF',
  text: '#F0EEFC',
  muted: '#A8A69E',
  faint: '#8A8984',
  tip: '#1F1E1D',
  neutral: '#808080',
}

// P0 has the default palette only: the theme setting and the terminal's theme come with P1
export function resolvePalette(_config: Pick<HudConfig, 'language'> | HudConfig, _env: HudEnv): Palette {
  return DEFAULT_PALETTE
}
