// Derived from zycck/claude-mods plugins/plan-progress/hooks/register.tsx (commit 549ecee), MIT License, (c) 2026 Kirill Serditov. Modified for progress-hud. See THIRD_PARTY_NOTICES.md.
import type { AgentRun, Bar, BarState, Meter } from '../../types'
import { isLive, modelName, stripBudget, visibleAgents } from '../core/agents'
import { diff, formatCost, formatTokens } from '../core/meter'
import { stepTimes, where } from '../core/model'
import { pctOf, t } from './i18n'
import { GLYPH, sessionLine } from './layout'
import type { BandModel, Seg } from './layout'
import { DEFAULT_PALETTE } from './theme'
import type { Palette } from './theme'
import { pxWidth } from './width'

// ---- what the desktop band is made of (DESIGN 5.8): a layout of rows, then the drawings that go with it ----
export type DesktopRow = { id: string; glyph: Seg; title: string; pct: Seg; alt: string }
export type DesktopLayout = { total: number; trackW: number; rows: DesktopRow[]; metrics: Seg | null; divider: string; dividerAlt: string }
export type StripSvg = { key: string; source: string; alt: string; width: number; height: number }
export type BarSvgs = { base: string; hover: string; alt: string; hoverAlt: string; width: number; height: number; strips: StripSvg[] }
export type DesktopSvgs = Record<string, BarSvgs>

// a drawing may not be longer than this (SvgProps.source); a longer one is drawn with less in it
export const MAX_SOURCE = 131_072
const TRACK_H = 22
const NARROW = 360
const STRIP_H = 16
const STRIP_GAP = 2
const GUTTER = 36 // the icon and the agent's number, left of a strip
const MORPH = '.2s'
const FONT = "'Anthropic Sans',ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif"
const ICON_PATH: Partial<Record<BarState, string>> = {
  needs_input: 'M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01',
  error: 'M18 6 6 18M6 6l12 12',
  done: 'M20 6 9 17l-5-5',
}
// Lucide "bot", drawn at 12 px in the gutter before each strip
const BOT = '<rect width="16" height="12" x="4" y="8" rx="2"/><path d="M12 8V4H8M2 14h2M20 14h2M15 13v2M9 13v2"/>'

// ---- a small LRU: the drawings of a bar are kept for as long as the bar does not change, the oldest ones go first ----
export class Lru<V> {
  private items = new Map<string, V>()
  constructor(readonly capacity: number) {}
  get(key: string): V | undefined {
    const hit = this.items.get(key)
    if (hit !== undefined) {
      this.items.delete(key)
      this.items.set(key, hit)
    }
    return hit
  }
  set(key: string, value: V) {
    this.items.delete(key)
    this.items.set(key, value)
    while (this.items.size > this.capacity) this.items.delete(this.items.keys().next().value as string)
  }
  get size() {
    return this.items.size
  }
  keys() {
    return [...this.items.keys()]
  }
  clear() {
    this.items.clear()
  }
}

// ${id}:${rev}:${W}:${palette} (the start time tells two bars of one id apart: a bar closed and made again starts its revs over)
type Track = { base: string; overlay: string }
const tracks = new Lru<Track>(64)
const rows = new Lru<{ html: string }>(64)
// the head each bar was last drawn at, the status each strip last showed, and the source each frame last had
const heads = new Lru<number>(256)
const lastStrip = new Lru<{ tool: string; color: string }>(256)
const lastSource = new Lru<{ template: string; source: string }>(256)

export const svgCaches = { tracks, rows }
export function resetSvgState() {
  for (const c of [tracks, rows, heads, lastStrip, lastSource]) c.clear()
}

// ---- small helpers ----
const hex = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))
const mix = (a: number[], b: number[], m: number) => a.map((v, i) => Math.round(v + ((b[i] ?? 0) - v) * m))
const rgb = (c: number[]) => `rgb(${c.join(',')})`
const hash = (a: number, b: number, k: number) => {
  const x = Math.sin(a * 127.1 + b * 311.7 + k * 74.7) * 43758.5453
  return x - Math.floor(x)
}
const colorOf = (c: string, fallback: string) => (/^#[0-9a-fA-F]{6}$/.test(c) ? c : fallback)

// text from the model goes into markup: control characters out, & < > " ' escaped, and { too, so no text can pass for a {{T:..}} placeholder
const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '{': '&#123;' }
export const esc = (s: string) => s.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').replace(/[&<>"'{]/g, c => ESC[c] ?? c)

// 59s, 4m12s, 1h5m
export function elapsedText(ms: number): string {
  const sec = Math.max(0, Math.round(ms / 1000))
  if (sec < 60) return `${sec}s`
  return sec < 3600 ? `${Math.floor(sec / 60)}m${sec % 60}s` : `${Math.floor(sec / 3600)}h${Math.floor((sec % 3600) / 60)}m`
}

// the 2 px dots of one look go into one path: a fraction of the markup of a rect each, and one node instead of thousands
function addDot(dots: Map<string, string>, cls: string, x: number, y: number) {
  dots.set(cls, `${dots.get(cls) ?? ''}M${x} ${y}h2v2h-2z`)
}

// the track draws in a sandboxed frame (for hover); its page must stay see-through in either theme
const SEE_THROUGH = '<style>:root,html,body{background:transparent!important;color-scheme:light dark;margin:0;overflow:hidden}svg{display:block}</style>'

// a clock that counts in the frame by itself, so the drawing never has to be redrawn each second (a redraw reloads the
// frame and everything in it blinks): each digit is a reel of its figures behind a one-line window, stepped by a CSS
// animation whose negative delay is the time already run. Plain SVG, since the host's frame drops foreignObject.
// {{T:start}} becomes those seconds only when a drawing's markup really changes (liveSource)
const CLOCK_W = 48 // "59m 59s"
const LINE = 16
const CLOCK_CSS = `.ckt{font-variant-numeric:tabular-nums}
.rs1{animation:r10 10s steps(10) var(--d) infinite}.rs10{animation:r6 60s steps(6) var(--d) infinite}
.cc{animation:cc 600s linear var(--d) both}@keyframes cc{0%,9.99%{transform:translateX(-13.5px)}10%,99.99%{transform:translateX(-3.25px)}100%{transform:none}}
.rm1{animation:r10 600s steps(10) var(--d) infinite}.rm10{animation:r10 6000s steps(10) var(--d) infinite}.rmm{animation:hm 60s steps(1,end) var(--d) both}
@keyframes r10{to{transform:translateY(-${LINE * 10}px)}}@keyframes r6{to{transform:translateY(-${LINE * 6}px)}}@keyframes hm{from{opacity:0}to{opacity:1}}
@media (prefers-reduced-motion:reduce){.rs1,.rs10,.rm1,.rm10,.rmm,.cc{animation:none}}`

// x is the clock's left edge, top the window's top; the minutes part stays hidden for the first minute
function liveClock(x: number, top: number, start: number, cls: string, textCls: string, isCentered = false): string {
  const base = top + 12
  const reel = (cx: number, figures: string[], reelCls: string) =>
    `<g class="${reelCls}"><text class="${textCls} ckt" text-anchor="middle">${figures
      .map((f, i) => `<tspan x="${cx.toFixed(1)}" y="${base + i * LINE}">${f}</tspan>`)
      .join('')}</text></g>`
  const digits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']
  const id = `ck${start}x${Math.round(x)}y${Math.round(top)}`
  return (
    `<style>.${id}{--d:-{{T:${start}}}s}</style><g class="${cls} ${id}"><clipPath id="${id}"><rect x="${(x - 2).toFixed(1)}" y="${top}" width="${CLOCK_W + 4}" height="${LINE}"/></clipPath>` +
    `<g clip-path="url(#${id})"${isCentered ? ' class="cc"' : ''}><g class="rmm">${reel(x + 3.5, ['', ...digits.slice(1)], 'rm10')}${reel(x + 10.5, digits, 'rm1')}` +
    `<text x="${(x + 14).toFixed(1)}" y="${base}" class="${textCls}">m</text></g>` +
    `${reel(x + 31, digits.slice(0, 6), 'rs10')}${reel(x + 38, digits, 'rs1')}<text x="${(x + 41.5).toFixed(1)}" y="${base}" class="${textCls}">s</text></g></g>`
  )
}

// {{T:start}} as the seconds that have run since `start`, at `now`
const fillClock = (template: string, now: number) => template.replace(/\{\{T:(\d+)\}\}/g, (_, start: string) => Math.max(0, (now - Number(start)) / 1000).toFixed(1))

// a frame reloads whenever its markup changes; markup that differs only in when it was drawn keeps the source already
// shown, so its clocks run on instead of the frame blinking
export function liveSource(id: string, template: string, now: number): string {
  const last = lastSource.get(id)
  if (last?.template === template) return last.source
  const source = fillClock(template, now)
  lastSource.set(id, { template, source })
  return source
}

// the hover layer is rebuilt on every redraw anyway, so its clock is set from now each time
export const hoverSource = (overlay: string, now: number) => fillClock(overlay, now)

// ---- the track ----

type DrawCtx = { palette: Palette; lang: BandModel['lang']; meter: Meter }
type Detail = 'full' | 'light' | 'minimal' // light: no pixels; minimal: no pixels, marks or tips

// a bar is drawn twice: the track itself as a plain picture, which the desktop keeps steady whatever else redraws, and a
// see-through layer on top for the hover parts (checkpoint times, the pill's clock). That layer needs an interactive frame,
// and the desktop rebuilds such frames on every redraw of the band; empty until hovered, the rebuild is invisible
export function trackSvg(bar: Bar, W: number, ctx: DrawCtx): Track {
  const key = `${bar.id}:${bar.startedAt}:${bar.rev}:${W}:${ctx.palette.name}:${ctx.lang}`
  const hit = tracks.get(key)
  if (hit) return hit
  // the fill is exactly the finished share: a fresh bar starts empty. It glides from where the bar was last drawn
  const w = where(bar)
  const fx = (bar.state === 'done' ? 1 : Math.min(1, w.pos / Math.max(1, w.total))) * W
  const from = heads.get(bar.id) ?? fx
  let track = drawTrack(bar, W, ctx, 'full', fx, from)
  for (const detail of ['light', 'minimal'] as const) {
    if (track.base.length <= MAX_SOURCE && track.overlay.length <= MAX_SOURCE) break
    track = drawTrack(bar, W, ctx, detail, fx, from)
  }
  heads.set(bar.id, fx)
  tracks.set(key, track)
  return track
}

function drawTrack(bar: Bar, W: number, ctx: DrawCtx, detail: Detail, fx: number, from: number): Track {
  const { palette, lang } = ctx
  const H = TRACK_H
  const w = where(bar)
  const done = bar.state === 'done'
  const total = Math.max(1, w.total)

  const color = colorOf(palette.bar[bar.state], DEFAULT_PALETTE.bar.running)
  const acc = hex(color)
  const light = mix(acc, [255, 255, 255], 0.32)
  const grey = [132, 130, 138]
  const ease = 'calcMode="spline" keyTimes="0;1" keySplines=".2 .8 .2 1"'
  const glide = Math.abs(from - fx) > 0.5

  // pixels: 3px grid, 7 rows, denser towards the head, twinkling and warming from grey to the state colour
  const buckets = [0, 1, 2, 3, 4].map(b => {
    const m = b / 4
    const dense = 0.22 + 0.78 * Math.pow(m, 1.5)
    return { color: rgb(mix(grey, light, m)), opacity: (0.35 + 0.65 * dense).toFixed(2) }
  })
  const dots = new Map<string, string>()
  for (let col = 0; detail === 'full' && col * 3 < fx; col++) {
    const x = col * 3
    const u = Math.min(1, (x + 1.5) / fx)
    const dense = 0.22 + 0.78 * Math.pow(u, 1.5)
    const bucket = Math.min(4, Math.floor(Math.min(1, Math.pow(u, 0.9) * 1.1) * 4.99))
    for (let r = 0; r < 7; r++) {
      if (hash(col, r, 1) > dense + 0.1) continue
      addDot(dots, `b${bucket} t${Math.floor(hash(col, r, 2) * 4)}`, x, 1 + r * 3)
    }
  }
  const px = [...dots].map(([cls, d]) => `<path class="${cls}" d="${d}"/>`).join('')

  const took = stepTimes(bar)
  const tipRules: string[] = []
  let marks = ''
  let hits = ''
  let tips = ''
  let k = 0
  bar.stages.forEach((s, i) => {
    s.steps.forEach((_, j) => {
      if (k > 0 && detail !== 'minimal') {
        const x = (k / total) * W
        const isStage = j === 0
        // a stage boundary is a short capsule, a step a dot; bright once passed
        const passed = x < fx - 1
        const fill = passed ? rgb(mix(light, [255, 255, 255], 0.45)) : palette.muted
        const opacity = passed ? (isStage ? 0.95 : 0.8) : isStage ? 0.75 : 0.6
        marks += isStage
          ? `<rect x="${(x - 1.5).toFixed(1)}" y="${(H - 10) / 2}" width="3" height="10" rx="1.5" fill="${fill}" opacity="${opacity}"/>`
          : `<circle cx="${x.toFixed(1)}" cy="${H / 2}" r="1.4" fill="${fill}" opacity="${opacity}"/>`
        const before = bar.stages[isStage ? i - 1 : i]
        const ended = isStage ? before?.steps[before.steps.length - 1] : s.steps[j - 1]
        const label = isStage ? (before?.name ?? '') : (ended?.title ?? '')
        const ms = isStage ? took.stages[i - 1] : ended ? took.steps.get(ended) : undefined
        const text = ms === undefined ? label : `${label} · ${elapsedText(ms)}`
        const tw = pxWidth(text, 6.2) + 16
        const tx = Math.max(0, Math.min(W - tw, x - tw / 2))
        hits += `<rect class="h${k}" x="${(x - 5).toFixed(1)}" width="10" height="${H}" fill="#000" fill-opacity="0"/>`
        tips += `<g class="tp p${k}"><rect x="${tx.toFixed(1)}" y="2" width="${tw.toFixed(1)}" height="${H - 4}" rx="${(H - 4) / 2}" fill="${palette.tip}" fill-opacity=".94"/><text x="${(tx + 8).toFixed(1)}" y="${H / 2 + 3.8}" class="tt">${esc(text)}</text></g>`
        tipRules.push(`.h${k}:hover~.p${k}`)
      }
      k++
    })
  })

  // knob: a pill with the stage, or a round dot with the stage number when narrow
  const isNarrow = W < NARROW
  const icon = ICON_PATH[bar.state]
  const single = bar.stages.length === 1
  const number = single ? w.step : w.stage + 1
  const stroke = (at: number, d: string, sw: number) => `<path d="${d}" transform="translate(${at.toFixed(1)} 5) scale(.5)" fill="none" stroke="${palette.ink}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`
  let knob = ''
  let timePill = ''
  let kw = H
  if (isNarrow) {
    knob = `<circle cx="0" cy="${H / 2}" r="${H / 2}" fill="${color}"/>${
      done ? `<path d="${ICON_PATH.done}" transform="translate(-6 5) scale(.5)" fill="none" stroke="${palette.ink}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>` : `<text x="0" y="${H / 2 + 4.2}" text-anchor="middle" class="kt">${number}</text>`
    }`
  } else {
    // a finished bar's pill says how long it took; hovering it adds the cost and the tokens of that time
    const took1 = elapsedText((bar.endedAt ?? bar.updatedAt) - bar.startedAt)
    const d = diff(bar.meterEnd ?? ctx.meter, bar.meterStart)
    const cost = formatCost(d.costUsd)
    const summary = [took1, ...(cost ? [cost] : []), ...(d.output > 0 ? [t(lang, 'tokens.out', { v: formatTokens(d.output) })] : [])].join(' · ')
    const name = done ? took1 : single ? (bar.stages[0]?.name ?? t(lang, 'bar.tasks')) : (bar.stages[w.stage]?.name ?? '')
    const iconW = icon ? 16 : 0
    const maxW = Math.max(80, W * 0.55)
    let shown = name
    while (shown.length > 3 && 20 + iconW + pxWidth(shown) + 6 + 6 > maxW) shown = shown.slice(0, -1)
    if (shown !== name) shown = shown.trimEnd() + '…'
    // a pill is wide enough for what its hover shows (the clock, or the summary), so the swap does not change its size
    const textW = Math.max(pxWidth(shown), done ? pxWidth(summary) : CLOCK_W)
    kw = Math.round(20 + iconW + textW)
    const left = -(iconW + textW) / 2
    const mid = left + iconW + textW / 2
    // the pill without its words: the hover layer lays a copy of it over the words, so it is drawn once and used twice
    const face = `<rect x="${-kw / 2}" y="0" width="${kw}" height="${H}" rx="${H / 2}" fill="${color}"/>${icon ? stroke(left, icon, 3.6) : ''}`
    knob = `${face}<text x="${mid.toFixed(1)}" y="${H / 2 + 4.2}" text-anchor="middle" class="kt">${esc(shown)}</text>`
    if (detail !== 'minimal') {
      const hover = done ? `<text x="${mid.toFixed(1)}" y="${H / 2 + 4.2}" text-anchor="middle" class="kt">${esc(summary)}</text>` : liveClock(mid - CLOCK_W / 2, 3, bar.startedAt, 'kc0', 'kt', true)
      timePill = `<g class="kb"><rect x="${-kw / 2}" y="0" width="${kw}" height="${H}" fill="#000" fill-opacity="0"/><g class="kv">${face}${hover}</g></g>`
    }
  }
  const clampX = (x: number) => Math.max(kw / 2, Math.min(W - kw / 2, x))
  const kx = clampX(fx)
  const kFrom = clampX(from)

  const style = `<style>
.b0{fill:${buckets[0]?.color};fill-opacity:${buckets[0]?.opacity}}.b1{fill:${buckets[1]?.color};fill-opacity:${buckets[1]?.opacity}}
.b2{fill:${buckets[2]?.color};fill-opacity:${buckets[2]?.opacity}}.b3{fill:${buckets[3]?.color};fill-opacity:${buckets[3]?.opacity}}
.b4{fill:${buckets[4]?.color};fill-opacity:${buckets[4]?.opacity}}
.t0,.t1,.t2,.t3{animation:tw 2.2s ease-in-out infinite}
.t1{animation-duration:2.8s;animation-delay:-.7s}.t2{animation-duration:1.9s;animation-delay:-1.3s}.t3{animation-duration:3.3s;animation-delay:-.4s}
@keyframes tw{0%,100%{opacity:1}50%{opacity:.45}}
.kt{font:500 12px ${FONT};fill:${palette.ink}}
@media (prefers-reduced-motion:reduce){.t0,.t1,.t2,.t3{animation:none}}
</style>`
  const hoverStyle = `<style>
.tp{opacity:0;transition:opacity .12s;pointer-events:none}${tipRules.length ? `${tipRules.join(',')}{opacity:1}` : ''}
.tt{font:400 11px ${FONT};fill:${palette.text}}
.kt{font:500 12px ${FONT};fill:${palette.ink}}
.kv{opacity:0;filter:blur(3px);transition:opacity .2s,filter .2s}.kb:hover .kv{opacity:1;filter:none}
.kb,rect[class^="h"]{cursor:pointer}
${CLOCK_CSS}
@media (prefers-reduced-motion:reduce){.kv{transition:none}}
</style>`
  const glideFill = glide ? `<animate attributeName="width" from="${from.toFixed(1)}" to="${fx.toFixed(1)}" dur=".45s" ${ease} fill="freeze"/>` : ''
  const glideKnob = glide ? `<animateTransform attributeName="transform" type="translate" from="${kFrom.toFixed(1)} 0" to="${kx.toFixed(1)} 0" dur=".45s" ${ease} fill="freeze"/>` : ''

  const open = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`
  const base = `${open}${style}
<defs><clipPath id="pill"><rect width="${W}" height="${H}" rx="${H / 2}"/></clipPath><clipPath id="fill"><rect width="${fx.toFixed(1)}" height="${H}">${glideFill}</rect></clipPath>
<linearGradient id="base" x1="0" x2="${fx.toFixed(1)}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${rgb(acc)}" stop-opacity=".05"/><stop offset="1" stop-color="${rgb(acc)}" stop-opacity=".33"/></linearGradient></defs>
<g clip-path="url(#pill)"><rect width="${W}" height="${H}" fill="${palette.neutral}" fill-opacity=".16"/>
<g clip-path="url(#fill)"><rect width="${fx.toFixed(1)}" height="${H}" fill="url(#base)"/>${px}</g>${marks}</g>
<g transform="translate(${kx.toFixed(1)} 0)">${glideKnob}${knob}</g></svg>`
  // the hover layer: checkpoint areas under the pill's copy, so the pill wins where they meet; tips on top
  const overlay = `${open}${SEE_THROUGH}${hoverStyle}${hits}<g transform="translate(${kx.toFixed(1)} 0)">${timePill}</g>${tips}</svg>`

  return { base, overlay }
}

// ---- the strips ----

type StripRow = { key: string; html: string; height: number }

// the desktop drops an Svg whose alt is empty, so every drawing says what it shows
export function stripAlt(bar: Bar, key: string, lang: BandModel['lang']): string {
  const a = bar.agents.find(x => x.id === key)
  if (!a) return t(lang, 'more', { n: bar.agents.length, d: bar.agents.filter(x => x.state === 'done').length })
  const state = a.state === 'running' ? t(lang, 'state.running') : a.state === 'waiting' ? t(lang, 'agent.approval') : a.state === 'done' ? t(lang, 'agent.done') : t(lang, 'agent.failed')
  return t(lang, 'alt.agent', { title: a.title, state, tool: isLive(a) ? a.tool : '—' })
}

// each strip is its own drawing, so a change to one agent redraws that strip alone, never the bar or the others
function stripRows(bar: Bar, v: { shown: AgentRun[]; hidden: AgentRun[] }, W: number, ctx: DrawCtx): StripRow[] {
  const { palette, lang } = ctx
  const isNarrow = W < NARROW
  const SW = W - GUTTER
  const out: StripRow[] = []
  const gutter = (y: number, label: string, color: string) =>
    `<g transform="translate(1 ${y + 2}) scale(.5)" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${BOT}</g>` +
    `<text x="16" y="${y + 11.5}" class="sn sg" style="fill:${color}">${esc(label)}</text>`
  v.shown.forEach((a, i) => {
    // the first strip keeps a little room from the track above it
    const y = i === 0 ? 5 : STRIP_GAP
    const n = bar.agents.indexOf(a)
    const rowKey = [bar.id, a.id, n, W, y, a.depth, a.title, a.state, a.tool, a.model, a.effort, a.endedAt, a.calls, a.errors, palette.name, lang].join(':')
    const cached = rows.get(rowKey)
    if (cached) {
      out.push({ key: a.id, html: cached.html, height: y + STRIP_H })
      return
    }
    const c = colorOf(palette.agent[a.state], DEFAULT_PALETTE.bar.running)
    const indent = a.depth > 0 ? 10 : 0
    const word = a.state === 'running' || a.state === 'waiting' ? a.tool : ''
    const dots = new Map<string, string>()
    if (a.state === 'running') {
      for (let col = 0; col * 3 < SW; col++) {
        for (let r = 0; r < 4; r++) {
          if (hash(col + i * 41, r, 5) > 0.2) continue
          addDot(dots, `t${Math.floor(hash(col, r, 6) * 4)}`, GUTTER + col * 3, Math.round((y + 2.5 + r * 3.2) * 10) / 10)
        }
      }
    }
    const px = [...dots].map(([cls, d]) => `<path class="${cls}" fill="${c}" fill-opacity=".32" d="${d}"/>`).join('')
    const nameRoom = isNarrow ? SW - 24 - indent : SW * 0.5
    const spec = a.model ? modelName(a.model, a.effort) : a.effort ?? ''
    const full = (a.depth > 0 ? '↳ ' : '') + a.title + (spec ? ` (${spec})` : '')
    let name = full
    while (name.length > 4 && pxWidth(name, 6.2) > nameRoom) name = name.slice(0, -1)
    if (name !== full) name = name.trimEnd() + '…'
    const nameX = GUTTER + 19 + indent
    const toolX = nameX + pxWidth(name, 6.2) + 8
    const time =
      a.endedAt === null
        ? liveClock(W - 9 - CLOCK_W, y, a.startedAt, 'sc', 'sn st')
        : `<text x="${W - 9}" y="${y + 11.5}" text-anchor="end" class="sn st">${elapsedText(a.endedAt - a.startedAt)}</text>`
    // a status change: the old word blurs out while the new one blurs in, and the tint flows to the new colour
    const was = lastStrip.get(a.id)
    lastStrip.set(a.id, { tool: word, color: c })
    const isWordChanged = was !== undefined && was.tool !== word
    const flow = (attr: string) => (was && was.color !== c ? `<animate attributeName="${attr}" from="${was.color}" to="${c}" dur="${MORPH}" fill="freeze"/>` : '')
    const tool = isNarrow
      ? ''
      : (isWordChanged && was.tool ? `<text x="${toolX}" y="${y + 11.5}" class="sn mo" style="fill:${was.color}">${esc(was.tool)}</text>` : '') +
        (word ? `<text x="${toolX}" y="${y + 11.5}" class="sn${isWordChanged ? ' mi' : ''}" style="fill:${c}">${esc(word)}</text>` : '') +
        time
    const html =
      gutter(y, String(n + 1), palette.muted) +
      `<rect x="${GUTTER}" y="${y}" width="${SW}" height="${STRIP_H}" rx="${STRIP_H / 2}" fill="${c}" fill-opacity=".15">${flow('fill')}</rect>${px}` +
      `<circle cx="${GUTTER + 10 + indent}" cy="${y + STRIP_H / 2}" r="3" fill="${c}"${a.state === 'running' ? ' class="sd"' : ''}>${flow('fill')}</circle>` +
      `<text x="${nameX}" y="${y + 11.5}" class="sn">${nameMarkup(name)}</text>` +
      tool
    rows.set(rowKey, { html })
    out.push({ key: a.id, html, height: y + STRIP_H })
  })
  if (v.hidden.length > 0) {
    const y = v.shown.length === 0 ? 5 : STRIP_GAP
    const doneCount = v.hidden.filter(a => a.state === 'done').length
    out.push({
      key: '+',
      height: y + STRIP_H,
      html:
        gutter(y, `+${v.hidden.length}`, palette.faint) +
        `<rect x="${GUTTER}" y="${y}" width="${SW}" height="${STRIP_H}" rx="${STRIP_H / 2}" fill="${palette.neutral}" fill-opacity=".14"/>` +
        `<text x="${GUTTER + 10}" y="${y + 11.5}" class="sn st">${esc(t(lang, 'more', { n: v.hidden.length, d: doneCount }))}</text>`,
    })
  }
  return out
}

// the agent's name, its model and effort in a dimmer parenthesis
const nameMarkup = (name: string) => {
  const at = name.indexOf(' (')
  return at > 0 ? `${esc(name.slice(0, at))}<tspan class="st">${esc(name.slice(at))}</tspan>` : esc(name)
}

const stripStyle = (palette: Palette) => `<style>.sn{font:400 11.5px ${FONT};fill:${palette.text}}.st{fill-opacity:.65}.sg{font-weight:500;font-variant-numeric:tabular-nums}
.sd{animation:sp 1.1s ease-in-out infinite}@keyframes sp{50%{opacity:.3}}
.mi{animation:mi ${MORPH} ease-out both}@keyframes mi{from{opacity:0;filter:blur(3px)}}
.mo{animation:mo ${MORPH} ease-in both}@keyframes mo{to{opacity:0;filter:blur(3px)}}
.t0,.t1,.t2,.t3{animation:tw 2.2s ease-in-out infinite}.t1{animation-duration:2.8s;animation-delay:-.7s}.t2{animation-duration:1.9s;animation-delay:-1.3s}.t3{animation-duration:3.3s;animation-delay:-.4s}
@keyframes tw{0%,100%{opacity:1}50%{opacity:.45}}
${CLOCK_CSS}
@media (prefers-reduced-motion:reduce){.sd,.mi,.mo,.t0,.t1,.t2,.t3{animation:none}.mo{opacity:0}}</style>`

// ---- the band ----

// the alt of a bar's track: where it is, in words, since the picture alone says nothing to a reader that cannot see it
export function barAlt(bar: Bar, lang: BandModel['lang']): string {
  const w = where(bar)
  if (bar.state === 'done') return t(lang, 'alt.done', { title: bar.title, n: w.total, dur: elapsedText((bar.endedAt ?? bar.updatedAt) - bar.startedAt) })
  const stage = bar.stages[w.stage]?.name ?? ''
  const base = t(lang, 'alt.bar', { title: bar.title, stage, i: w.step, n: w.stageSize, pct: pctOf(w.pos, w.total), eta: '' })
  return bar.note ? `${base} — ${bar.note}` : base
}

// DESIGN 5.8: every bar as wide as the others and pinned to the right, so rows line up whatever their titles; the slack goes
// after the title. The desktop reports about 8 CSS px a column; the glyph, the gaps, the percentage and the close button take ~126 px
export function layoutDesktop(model: BandModel, columns: number): DesktopLayout {
  const { bars, lang, palette } = model
  const total = Math.max(320, (columns || 100) * 8)
  const titleWidth = Math.min(Math.round(total * 0.3), Math.max(0, ...bars.map(b => Math.round(pxWidth(b.title, 6.4)))))
  const trackW = Math.max(120, Math.min(1400, total - titleWidth - 140))
  const line = sessionLine(model.gauge, model.meter, model.now)
  return {
    total,
    trackW,
    rows: bars.map(b => {
      const w = where(b)
      const pct = b.state === 'done' ? 100 : pctOf(w.pos, w.total)
      return {
        id: b.id,
        glyph: { text: GLYPH[b.state], color: palette.bar[b.state] },
        title: b.title,
        // a figure space is as wide as a digit, so "  0%" and "100%" take the same room
        pct: { text: `${String(pct).padStart(3, ' ')}%`, dim: true },
        alt: barAlt(b, lang),
      }
    }),
    metrics: (model.sessionMetrics === 'desktop' || model.sessionMetrics === 'all') && line ? { text: line, dim: true } : null,
    // a hairline between bars, so each bar and its strips read as one group
    divider: `<svg xmlns="http://www.w3.org/2000/svg" width="${total}" height="1"><rect width="${total}" height="1" fill="${palette.neutral}" fill-opacity=".22"/></svg>`,
    dividerAlt: t(lang, 'alt.divider'),
  }
}

// the drawings of every bar at the layout's width: the track, its hover layer and one drawing a strip
export function drawDesktop(model: BandModel, layout: DesktopLayout): DesktopSvgs {
  const { now, lang, palette, meter } = model
  const ctx = { palette, lang, meter }
  const W = layout.trackW
  const out: DesktopSvgs = {}
  for (const bar of model.bars) {
    const track = trackSvg(bar, W, ctx)
    const v = model.density === 'compact' ? null : visibleAgents(bar, now, stripBudget(model.bars.length))
    const strips = v
      ? stripRows(bar, v, W, ctx).map(r => ({
          key: `strip-${bar.id}-${r.key}`,
          source: liveSource(`${bar.id}/${r.key}`, `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${r.height}">${stripStyle(palette)}${r.html}</svg>`, now),
          alt: stripAlt(bar, r.key, lang),
          width: W,
          height: r.height,
        }))
      : []
    out[bar.id] = {
      base: track.base,
      hover: hoverSource(track.overlay, now),
      alt: barAlt(bar, lang),
      hoverAlt: t(lang, 'alt.hover', { title: bar.title }),
      width: W,
      height: TRACK_H,
      strips,
    }
  }
  return out
}
