import { isNum } from './guards'

export type HudConfig = {
  sound: boolean
  volume: number // 0-100
  language: 'ja' | 'en' | 'auto'
  nudge: 'off' | 'soft' | 'strict'
  sessionMetrics: 'off' | 'desktop' | 'all'
  maxBars: number // 1-5
  toastOnDone: boolean
  statusLine: 'auto' | 'always' | 'off'
  animation: boolean // the terminal's animations (X9)
}

export const DEFAULTS: HudConfig = {
  sound: true,
  volume: 60,
  language: 'ja',
  nudge: 'soft',
  sessionMetrics: 'desktop',
  maxBars: 3,
  toastOnDone: true,
  statusLine: 'auto',
  animation: true,
}

const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback)
const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => allowed.find(a => a === v) ?? fallback
const num = (v: unknown) => (isNum(v) ? v : undefined)

// the options register() receives, as a typed config; anything invalid falls back to its default.
// volume is rounded into 0-100; a bar count outside 1-5 is invalid, not rounded
export function parseOptions(options: unknown): HudConfig {
  const o = (options && typeof options === 'object' ? options : {}) as Record<string, unknown>
  const volume = num(o.volume)
  const maxBars = num(o.maxBars)
  const bars = maxBars === undefined ? undefined : Math.round(maxBars)

  return {
    sound: bool(o.sound, DEFAULTS.sound),
    volume: volume === undefined ? DEFAULTS.volume : Math.min(100, Math.max(0, Math.round(volume))),
    language: pick(o.language, ['ja', 'en', 'auto'], DEFAULTS.language),
    nudge: pick(o.nudge, ['off', 'soft', 'strict'], DEFAULTS.nudge),
    sessionMetrics: pick(o.sessionMetrics, ['off', 'desktop', 'all'], DEFAULTS.sessionMetrics),
    maxBars: bars !== undefined && bars >= 1 && bars <= 5 ? bars : DEFAULTS.maxBars,
    toastOnDone: bool(o.toastOnDone, DEFAULTS.toastOnDone),
    statusLine: pick(o.statusLine, ['auto', 'always', 'off'], DEFAULTS.statusLine),
    animation: bool(o.animation, DEFAULTS.animation),
  }
}

export type Lang = 'ja' | 'en'

// auto follows LANG: ja when it starts with "ja", otherwise en
export const resolveLanguage = (language: HudConfig['language'], envLang: string | undefined): Lang =>
  language === 'auto' ? (envLang?.toLowerCase().startsWith('ja') ? 'ja' : 'en') : language
