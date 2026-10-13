import type { AgentRun, Bar, BarState, Meter, SessionGauge } from '../../types'
import { isLive, modelName, stripBudget, visibleAgents } from '../core/agents'
import { AGENTS_ID } from '../core/bars'
import type { HudConfig, Lang } from '../core/config'
import { formatCost } from '../core/meter'
import { isFinished, where } from '../core/model'
import { WHITE, flashColor, flashLevel, isFlashing, isHex, mixHex, shimmerSegs, sparkleColor, sparkleLevel, spinnerGlyph } from './anim'
import { fmtClock, fmtPct, pctOf, t } from './i18n'
import type { Palette } from './theme'
import { cells, padEndCells, padStartCells, truncateCells } from './width'

// ---- the layout, as plain data (DESIGN 7.3). A Seg is a run of text in one style; the view turns rows into elements ----
export type Seg = { text: string; color?: string; dim?: boolean; bold?: boolean; bg?: string }
// title is a run of text, or runs of its own colours while the title shimmers
export type RowA = { barId: string; glyph: Seg; title: Seg | Seg[]; track: Seg[] | null; pct: Seg; extras: Seg[]; collapse: boolean; close: boolean }
export type SubRow = { kind: 'note' | 'stuck' | 'agent' | 'more' | 'metrics'; indent: number; segs: Seg[]; key?: string }
export type BandLayout = { rows: Array<RowA | SubRow>; density: 'full' | 'compact'; truncated: boolean }

// what the band is drawn from; every value is read by the caller, so layout stays pure
export type BandModel = {
  bars: readonly Bar[]
  now: number
  meter: Meter
  gauge: SessionGauge
  isWorking: boolean // AbovePrompt.isWorking: a model turn is running
  lang: Lang
  palette: Palette
  density: 'full' | 'compact'
  sessionMetrics: HudConfig['sessionMetrics']
  frame?: number | null // the animation's frame (X9); null or left out: a still band, as before
}
export type BandOpts = { columns: number; maxRows: number }

// what a band's close button calls, on the terminal and the desktop alike
export type BandHandlers = { close: (barId: string) => void | Promise<void> }

export const isRowA = (row: RowA | SubRow): row is RowA => 'barId' in row
export const titleSegs = (row: RowA): readonly Seg[] => (Array.isArray(row.title) ? row.title : [row.title])

export const GLYPH: Record<BarState, string> = { running: '●', needs_input: '?', error: '!', done: '✓' }
const AGENT_DOT: Record<AgentRun['state'], string> = { running: '●', waiting: '?', done: '✓', error: '✗' }
const FILL = '█'
const PARTS = '▏▎▍▌▋▊▉'
const MIN_TRACK = 8
const MAX_TRACK = 48
const STAGE_MIN = 6
const STAGE_MAX = 16
const TOOL_MAX = 16
const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi)
const seg = (text: string, style: Omit<Seg, 'text'> = {}): Seg => ({ text, ...style })

// the stage column: stage name and position, or the state word while the bar waits or failed, or the step in progress for a flat list
function stageText(bar: Bar, lang: Lang, isIdleBar: boolean, max = STAGE_MAX): string {
  if (isIdleBar) return truncateCells(t(lang, 'state.idle'), max)
  if (bar.state === 'done') return truncateCells(t(lang, 'state.done'), max)
  const w = where(bar)
  const pos = `${w.step}/${w.stageSize}`
  const name = bar.state === 'needs_input' || bar.state === 'error' ? t(lang, `state.${bar.state}`) : bar.stages[w.stage]?.name ?? ''
  if (bar.state === 'running' && (bar.kind === 'todo' || bar.stages.length === 1)) {
    const step = bar.stages.flatMap(s => s.steps).find(s => s.status === 'active') ?? bar.stages.flatMap(s => s.steps).find(s => !isFinished(s.status))
    return truncateCells(step?.title ?? name, max)
  }
  return `${truncateCells(name, Math.max(1, max - cells(pos) - 1))} ${pos}`.trim()
}

// the clock column: running bars count up, finished ones show the time they took
const clockOf = (bar: Bar, now: number) => fmtClock((bar.state === 'done' && bar.endedAt !== null ? bar.endedAt : now) - bar.startedAt)

// DESIGN 5.7.4: eighths of a cell for the fill, ┊ at the stage boundaries inside the empty part
function trackSegs(bar: Bar, cellsN: number, isIdleBar: boolean, palette: Palette, frame: number | null, now: number): Seg[] {
  const color = palette.bar[bar.state]
  if (bar.state === 'done') return [seg(FILL.repeat(cellsN), { color: frame !== null && isHex(color) && isFlashing(now, bar.endedAt) ? flashColor(color, flashLevel(now, bar.endedAt)) : color })]
  const w = where(bar)
  const units = Math.round((w.total === 0 ? 0 : w.pos / w.total) * cellsN * 8)
  const full = Math.floor(units / 8)
  const part = units % 8
  const used = full + (part > 0 ? 1 : 0)
  const marks = new Set<number>()
  let steps = 0
  for (const s of bar.stages.slice(0, -1)) {
    steps += s.steps.length
    const at = Math.round((steps / Math.max(1, w.total)) * cellsN) - 1
    if (at >= used && at < cellsN) marks.add(at)
  }
  const empty = Array.from({ length: cellsN - used }, (_, i) => (marks.has(used + i) ? '┊' : '░')).join('')
  const style = isIdleBar ? { dim: true } : { color }
  // while the bar runs the tip of the fill twinkles: the partial block, or the last full one when there is none
  const sparkling = frame !== null && bar.state === 'running' && !isIdleBar && isHex(color)
  const tip = sparkling ? { color: sparkleColor(color, sparkleLevel(bar.id, frame)) } : style
  const lead = part === 0 && sparkling && full > 0 ? 1 : 0
  return [seg(FILL.repeat(full - lead), style), seg(FILL.repeat(lead), tip), seg(PARTS[part - 1] ?? '', tip), seg(empty, { dim: true })].filter(s => s.text !== '')
}

// the optional columns, left to right; when the track is short the first one goes first
type Col = 'stage' | 'badge' | 'clock'
const COLUMNS: Col[] = ['stage', 'badge', 'clock']

function build(model: BandModel, opts: BandOpts, budget: number, density: 'full' | 'compact'): Array<RowA | SubRow> {
  const { bars, now, lang, palette } = model
  const frame = model.frame ?? null
  const W = opts.columns
  // a bar no one is working on: running, no turn in progress, and no agent running anywhere
  const quiet = !model.isWorking && !bars.some(b => b.agents.some(isLive))
  const idle = new Map(bars.map(b => [b.id, b.state === 'running' && quiet]))

  // widths shared by every bar, so the right-hand columns line up
  const titleCells = clamp(Math.max(0, ...bars.map(b => cells(b.title))), 6, Math.min(28, Math.floor(W * 0.3)))
  const stages = bars.map(b => stageText(b, lang, idle.get(b.id) ?? false))
  const stageCells = clamp(Math.max(0, ...stages.map(cells)), STAGE_MIN, STAGE_MAX)
  const clocks = bars.map(b => clockOf(b, now))
  const clockCells = Math.max(...clocks.map(cells), 4)
  const live = bars.map(b => b.agents.filter(isLive).length)
  const badgeCells = density === 'compact' && live.some(n => n > 0) ? 1 + Math.max(...live.map(n => String(n).length)) : 0

  const widthOf: Record<Col, number> = { stage: stageCells, badge: badgeCells, clock: clockCells }
  let cols = COLUMNS.filter(c => widthOf[c] > 0)
  // glyph, title, spacer, [track], pct, the columns, close: one cell between neighbours
  const baseOf = () => 1 + titleCells + 4 + 1 + cols.reduce((n, c) => n + widthOf[c], 0) + (5 + cols.length - 1)
  const trackOf = () => W - baseOf() - 1
  while (trackOf() < MIN_TRACK && cols.length > 0) cols = cols.slice(1)
  const trackCells = trackOf() < MIN_TRACK ? 0 : Math.min(trackOf(), MAX_TRACK)

  const rows: Array<RowA | SubRow> = []
  bars.forEach((bar, i) => {
    const isIdleBar = idle.get(bar.id) ?? false
    const color = palette.bar[bar.state]
    const w = where(bar)
    const extras: Seg[] = []
    if (cols.includes('stage')) extras.push(seg(padEndCells(stages[i] ?? '', stageCells), isIdleBar ? { dim: true } : { color }))
    if (cols.includes('badge')) extras.push(seg(padEndCells(live[i] ? `⚙${live[i]}` : '', badgeCells), { dim: true }))
    if (cols.includes('clock')) extras.push(seg(padStartCells(clocks[i] ?? '', clockCells), { dim: true }))
    // the animations (X9): a running bar that is not idle spins and its title shimmers; a bar that has just finished glows
    const animated = frame !== null && isHex(color)
    const isRunning = animated && bar.state === 'running' && !isIdleBar
    const isGlowing = animated && bar.state === 'done' && isFlashing(now, bar.endedAt)
    const glyph = isIdleBar ? seg('○', { dim: true }) : isRunning ? seg(spinnerGlyph(frame), { color }) : isGlowing ? seg(GLYPH.done, { color: flashColor(color, flashLevel(now, bar.endedAt)) }) : seg(GLYPH[bar.state], { color })
    const shown = truncateCells(bar.title, titleCells)
    rows.push({
      barId: bar.id,
      glyph,
      title: isRunning ? shimmerSegs(shown, frame, color, mixHex(color, WHITE, 0.7), { period: titleCells + 8 }) : seg(shown),
      track: trackCells > 0 ? trackSegs(bar, trackCells, isIdleBar, palette, frame, now) : null,
      pct: seg(fmtPct(pctOf(w.pos, w.total)), { dim: true }),
      extras,
      collapse: false,
      close: true,
    })
    if (density === 'compact') return
    if ((bar.state === 'needs_input' || bar.state === 'error') && bar.note) {
      rows.push({ kind: 'note', indent: 2, key: `note-${bar.id}`, segs: [seg(`└ ${truncateCells(bar.note, W - 4)}`, { color })] })
    }
    rows.push(...agentRows(bar, model, W, budget))
  })
  const metrics = metricsRow(model)
  if (metrics) rows.push(metrics)
  return rows
}

// DESIGN 5.7.3: one row per visible strip, then the "+N" row for the folded ones
function agentRows(bar: Bar, model: BandModel, W: number, budget: number): SubRow[] {
  const v = budget > 0 ? visibleAgents(bar, model.now, budget) : null
  if (!v) return []
  const { lang, palette, now } = model
  const edge = W - 2 // the right edge of the strips: under the close button
  const clocks = v.shown.map(a => fmtClock((isLive(a) || a.endedAt === null ? now : a.endedAt) - a.startedAt))
  const clockCells = Math.max(0, ...clocks.map(cells))
  const tools = v.shown.map(a => (isLive(a) ? truncateCells(a.tool, TOOL_MAX) : ''))
  const toolCells = Math.max(0, ...tools.map(cells))
  const hasMore = v.hidden.length > 0
  const rows: SubRow[] = v.shown.map((a, i) => {
    const indent = 2 + a.depth * 2
    const tree = !hasMore && i === v.shown.length - 1 ? '└' : '├'
    const right = toolCells > 0 ? toolCells + 1 + clockCells : clockCells
    const fixed = indent + 4 // tree, dot and their spaces
    const room = Math.max(1, Math.min(Math.floor(W * 0.45), edge - fixed - right - 1))
    const full = a.model ? `${a.title} (${modelName(a.model, a.effort)})` : a.title
    const name = truncateCells(full, room)
    const head = a.model && name.startsWith(`${a.title} (`) ? [seg(a.title), seg(name.slice(a.title.length), { dim: true })] : [seg(name)]
    const used = fixed + cells(name) + right
    const gap = Math.max(1, edge - used)
    const segs: Seg[] = [seg(`${tree} `, { dim: true }), seg(model.frame != null && a.state === 'running' ? spinnerGlyph(model.frame) : AGENT_DOT[a.state], { color: palette.agent[a.state] }), seg(' '), ...head, seg(' '.repeat(gap))]
    if (toolCells > 0) segs.push(seg(padEndCells(tools[i] ?? '', toolCells), { dim: true }), seg(' '))
    segs.push(seg(padStartCells(clocks[i] ?? '', clockCells), { dim: true }))
    return { kind: 'agent', indent, key: `agent-${bar.id}-${a.id}`, segs }
  })
  if (hasMore) {
    const done = v.hidden.filter(a => a.state === 'done').length
    rows.push({ kind: 'more', indent: 2, key: `more-${bar.id}`, segs: [seg(`└ ${t(lang, 'more', { n: v.hidden.length, d: done })}`, { dim: true })] })
  }
  return rows
}

// DESIGN 5.6: the whole session in one line (elapsed, cost, context, 5-hour window); items with no figure are left out
export function sessionLine(gauge: SessionGauge, meter: Meter, now: number): string | null {
  const cost = formatCost(meter.costUsd)
  const items = [
    ...(gauge.startedAt === null ? [] : [fmtClock(now - gauge.startedAt)]),
    ...(cost ? [cost] : []),
    ...(gauge.contextPercent === null ? [] : [`ctx ${Math.round(gauge.contextPercent)}%`]),
    ...(gauge.fiveHourPercent === null ? [] : [`5h ${Math.round(gauge.fiveHourPercent)}%`]),
  ]
  return items.length === 0 ? null : `◷ ${items.join(' · ')}`
}

// on the terminal that line shows only for sessionMetrics "all", since the status line already has it
function metricsRow(model: BandModel): SubRow | null {
  if (model.sessionMetrics !== 'all') return null
  const line = sessionLine(model.gauge, model.meter, model.now)
  return line === null ? null : { kind: 'metrics', indent: 2, key: 'metrics', segs: [seg(line, { dim: true })] }
}

// the band as rows within opts.maxRows: first fewer strips per bar (down to the "+N" row alone), then compact (one row a bar), then cut off
export function layoutBand(model: BandModel, opts: BandOpts): BandLayout {
  const W = Math.max(20, Math.floor(opts.columns))
  const o = { ...opts, columns: W }
  let budget = stripBudget(model.bars.length)
  let density = model.density
  let rows = build(model, o, budget, density)
  if (density === 'full') {
    while (rows.length > o.maxRows && budget > 1) rows = build(model, o, --budget, density)
    if (rows.length > o.maxRows) {
      density = 'compact'
      rows = build(model, o, budget, density)
    }
  }
  const truncated = rows.length > o.maxRows
  return { rows: truncated ? rows.slice(0, Math.max(0, o.maxRows)) : rows, density, truncated }
}

// ---- text forms, for the tests and the status line ----

const segText = (segs: readonly Seg[]) => segs.map(s => s.text).join('')

// the cells a Row A takes where it is drawn: its parts one cell apart, the spacer at no width
export function rowCells(row: RowA | SubRow): number {
  if (!isRowA(row)) return row.indent + cells(segText(row.segs))
  const parts = [cells(row.glyph.text), cells(segText(titleSegs(row))), 0, ...(row.track ? [cells(segText(row.track))] : []), cells(row.pct.text), ...row.extras.map(s => cells(s.text)), ...(row.close ? [1] : [])]
  return parts.reduce((n, p) => n + p, 0) + parts.length - 1
}

// the rows as the terminal shows them at this width: the spacer of a Row A takes what is left
export function bandText(layout: BandLayout, columns: number): string[] {
  return layout.rows.map(row => {
    if (!isRowA(row)) return ' '.repeat(row.indent) + segText(row.segs)
    const right = [...(row.track ? [segText(row.track)] : []), row.pct.text, ...row.extras.map(s => s.text), ...(row.close ? ['✕'] : [])].join(' ')
    const left = `${row.glyph.text} ${segText(titleSegs(row))}`
    return `${left}${' '.repeat(Math.max(1, columns - cells(left) - cells(right)))}${right}`
  })
}

// DESIGN 5.7.6: HUD ▸ <title> <pct>% <position> (+N) for the latest bar that is not done; undefined when nothing should be shown
export function statusText(bars: readonly Bar[], isOpen: boolean, mode: HudConfig['statusLine'], lang: Lang): string | undefined {
  if (mode === 'off' || bars.length === 0 || (mode === 'auto' && isOpen)) return undefined
  const latest = [...bars].reverse()
  const main = latest.find(b => b.id !== AGENTS_ID && b.state !== 'done') ?? latest.find(b => b.id !== AGENTS_ID) ?? latest[0]
  if (!main) return undefined
  const w = where(main)
  const others = bars.length - 1
  return `HUD ▸ ${main.title} ${pctOf(w.pos, w.total)}% ${stageText(main, lang, false, 24)}${others > 0 ? ` (+${others})` : ''}`
}
