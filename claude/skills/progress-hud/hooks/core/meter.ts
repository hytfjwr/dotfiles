import type { Bar, Meter } from '../../types'
import { t } from '../view/i18n'
import type { Lang } from './config'
import { isNum } from './guards'

export const EMPTY_METER: Meter = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costUsd: null }

const num = (v: unknown) => (isNum(v) ? v : 0)

// adds the four token counts of a turn's usage (the API's field names); anything else leaves the meter as it was
export function addUsage(meter: Meter, usage: unknown): Meter {
  if (!usage || typeof usage !== 'object') return meter
  const u = usage as Record<string, unknown>
  return {
    ...meter,
    input: meter.input + num(u.input_tokens),
    output: meter.output + num(u.output_tokens),
    cacheRead: meter.cacheRead + num(u.cache_read_input_tokens),
    cacheWrite: meter.cacheWrite + num(u.cache_creation_input_tokens),
  }
}

// what happened between two readings (end minus start); costUsd is null when either has none
export function diff(end: Meter, start: Meter): Meter {
  const sub = (a: number, b: number) => Math.max(0, a - b)
  return {
    input: sub(end.input, start.input),
    output: sub(end.output, start.output),
    cacheRead: sub(end.cacheRead, start.cacheRead),
    cacheWrite: sub(end.cacheWrite, start.cacheWrite),
    costUsd: end.costUsd === null || start.costUsd === null ? null : sub(end.costUsd, start.costUsd),
  }
}

// 999, 1.2k, 48k, 1.2M
export function formatTokens(n: number): string {
  const v = Math.max(0, Math.round(n))
  if (v < 1000) return String(v)
  const short = (x: number, unit: string) => `${x < 10 ? x.toFixed(1).replace(/\.0$/, '') : Math.round(x)}${unit}`
  if (v < 999_500) return short(v / 1000, 'k')
  return short(v / 1_000_000, 'M')
}

// $0.31, <$0.01 under a cent, null when there is no figure
export function formatCost(usd: number | null): string | null {
  if (usd === null) return null
  return usd < 0.01 ? '<$0.01' : `$${usd.toFixed(2)}`
}

const clock = (ms: number) => {
  const sec = Math.max(0, Math.round(ms / 1000))
  const pad = (n: number) => String(n).padStart(2, '0')
  return sec < 3600 ? `${Math.floor(sec / 60)}:${pad(sec % 60)}` : `${Math.floor(sec / 3600)}:${pad(Math.floor((sec % 3600) / 60))}:${pad(sec % 60)}`
}

// the toast of a bar that finished: ✓ title done — 4:12 · $0.31 · out 48k.
// The figures are what happened while the bar was open; the cost and the tokens are left out when there is none
export function toastText(bar: Bar, meter: Meter, lang: Lang): string {
  const d = diff(bar.meterEnd ?? meter, bar.meterStart)
  const cost = formatCost(d.costUsd)
  const parts = [clock((bar.endedAt ?? bar.updatedAt) - bar.startedAt), ...(cost ? [cost] : []), ...(d.output > 0 ? [t(lang, 'tokens.out', { v: formatTokens(d.output) })] : [])]
  return t(lang, 'toast.done', { title: bar.title, metrics: parts.join(' · ') })
}
