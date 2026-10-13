import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { AgentRun, Bar, BarState, HudEnv, HudView, Meter, SessionGauge, TimelineEntry } from '../types'
import { AGENTS_TITLE, FOLD_MS, TOOL_WORDS, addRun, editRun, endRun, isLive, keepHomes, newRun, reconcile } from './core/agents'
import { AGENTS_ID, PLAN_ID, TASKS_ID, activeBar, barIdOf, isDemoBar, isOpenBar, placeBar, reservedRefusal, touch } from './core/bars'
import type { Ctx } from './core/bars'
import { DEFAULTS, parseOptions, resolveLanguage } from './core/config'
import type { HudConfig, Lang } from './core/config'
import { EMPTY_METER, addUsage, toastText } from './core/meter'
import { isFinished, isRefusal, newBar, normalize, slug, str, where } from './core/model'
import type { Raw, Refusal } from './core/model'
import { parsePlan } from './core/planmd'
import { BARS_PREFIX, PREFS_KEY, fitSize, fromPrefs, fromSnapshot, pruneKeys, toSnapshot } from './core/persist'
import { onTaskCreate, onTaskUpdate, onTodoWrite } from './core/tasks'
import { demoScript } from './demo/script'
import type { DemoStep } from './demo/script'
import { wavBase64 } from './sound/synth'
import type { Sound } from './sound/synth'
import { t } from './view/i18n'
import { FRAME_MS, FLASH_MS } from './view/anim'
import { layoutBand, statusText } from './view/layout'
import { resolvePalette } from './view/theme'
import { renderDesktopBand } from './view/desktop'
import { drawDesktop, layoutDesktop } from './view/svg'
import { renderTerminalBand } from './view/terminal'
import { GATE_DENY, INTERNAL_ERROR, PLAN_CONTEXT, RULES, RULES_ID, TOOL_SPEC, denyText, openBarsLine, reminderText, resultText, stopBlockText } from './core/rules'

// the same name as rules.ts's TOOL, spelled out here so the matcher is readable from the source (a test keeps the two equal)
const OWN_TOOL = 'mcp__progress-hud__progress'
const bars = atom({ plugin: 'progress-hud', key: 'bars' } as const, [] as Bar[], { shape: 'bars-v1' })
const view = atom({ plugin: 'progress-hud', key: 'view' } as const, { isOpen: false, density: 'full' } as HudView)
const meter = atom({ plugin: 'progress-hud', key: 'meter' } as const, EMPTY_METER)
const EMPTY_GAUGE: SessionGauge = { startedAt: null, contextPercent: null, fiveHourPercent: null }
const gauge = atom({ plugin: 'progress-hud', key: 'gauge' } as const, EMPTY_GAUGE)
const agentHome = atom({ plugin: 'progress-hud', key: 'agentHome' } as const, {} as Record<string, string>)
const timeline = atom({ plugin: 'progress-hud', key: 'timeline' } as const, [] as TimelineEntry[])
const env = atom({ plugin: 'progress-hud', key: 'env' } as const, { themeName: null, hasTerminal: false } as HudEnv)
const tick = atom({ plugin: 'progress-hud', key: 'tick' } as const, 0)

// edits are the work the nudges count. Shell calls are never refused or counted: the host marks only plain reads (ls)
// read-only, so a compound read (cd x && git log) would look like work
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
const WORK_BEFORE_BAR = 3 // the 4th edit without a bar is refused once (strict)
const CALLS_BEFORE_NUDGE = 6 // edits without a bar update before a reminder
// the stacks of the band and of the footer button; an empty result beneath is not made a child (V11), so each is drawn with or without it
const COLUMN = { flexDirection: 'column' } as const
const SPACED_COLUMN = { flexDirection: 'column', gap: 1 } as const
const MODE_ROW = { flexDirection: 'row', alignItems: 'center', gap: 1 } as const
const SAVE_DEBOUNCE_MS = 2000
const SAVE_MIN_BUDGET_MS = 300

// options are fixed for this activation: a change reloads the module and register runs again
let cfg: HudConfig = DEFAULTS

// per-turn bookkeeping; module variables are fine here, a reload just starts a fresh count
const newTurn = () => ({
  edits: 0, // edits that ran this turn
  sinceUpdate: 0, // edits since the bar was last updated
  touched: false, // a bar was written through the tool this turn
  gateUsed: false,
  reminded: false,
  stopBlocked: false,
})
let turn = newTurn()
let turnRunning = false

// ---------- sound ----------
// every sound the mod wants is recorded in __chimes (the tests read it); it is played unless muted, broken or too soon after another.
// Playing is never awaited and never throws into a hook: a failed play is logged once and the mod is silent from then on
export const __chimes: string[] = []
const MAX_CHIMES = 500
type Chime = Sound
const SAME_SOUND_MS = 1500
const ANY_SOUND_MS = 400
let soundBroken = false
let lastSound = -Infinity
const lastOfKind = new Map<Chime, number>()
let playing: Promise<void> = Promise.resolve()

function chime($: EngineInterface, kind: Chime, isForced = false) {
  __chimes.push(kind)
  if (__chimes.length > MAX_CHIMES) __chimes.shift()
  if (!cfg.sound || soundBroken) return
  // one at a time, so the checks below see the sound before this one
  playing = playing.then(async () => void (await guard($, 'sound', () => play($, kind, isForced))))
}

async function play($: EngineInterface, kind: Chime, isForced: boolean) {
  const now = await $.clock.now()
  if (!isForced && (now - lastSound < ANY_SOUND_MS || now - (lastOfKind.get(kind) ?? -Infinity) < SAME_SOUND_MS)) return
  lastSound = now
  lastOfKind.set(kind, now)
  try {
    await $.audio.play({ base64: wavBase64(kind), mime: 'audio/wav' }, { gain: cfg.volume / 100 })
  } catch (err) {
    soundBroken = true
    report($, 'sound', err)
  }
}

function chimeFor($: EngineInterface, prev: BarState | undefined, next: BarState) {
  if (next === prev) return
  if (next === 'needs_input') chime($, 'decision')
  if (next === 'error') chime($, 'error')
  if (next === 'done') chime($, 'done')
}

// the language of the words the mod writes (toasts, strips); auto reads LANG once
let langCache: Lang | null = null
async function getLang($: EngineInterface): Promise<Lang> {
  if (langCache) return langCache
  // LANG that cannot be read means English for now, and the read is tried again next time
  let envLang: string | undefined
  let isRead = true
  if (cfg.language === 'auto') {
    try {
      envLang = await $.env.get('LANG')
    } catch (err) {
      isRead = false
      report($, 'lang', err)
    }
  }
  const lang = resolveLanguage(cfg.language, envLang)
  if (isRead) langCache = lang
  return lang
}
async function ctxOf($: EngineInterface): Promise<Ctx> {
  const [now, m, lang] = await Promise.all([$.clock.now(), read($, meter), getLang($)])
  return { now, meter: m, lang }
}

// tool_use_id -> agentId for the calls of agents that have a strip, to find who waits on a permission
const toolUses = new Map<string, string>()
const APPROVAL_DELAY_MS = 600 // the mode often settles an ask in a blink; only a call still held after a moment waits on the person
const TOAST_MS = 6000

const reported = new Set<string>()
function report($: EngineInterface, where: string, err: unknown) {
  if (reported.has(where)) return
  reported.add(where)
  // the log is the last resort: when it fails too there is nowhere left to say so
  try {
    $.ui.log(`progress-hud: ${where}: ${String((err as Error)?.message ?? err).slice(0, 200)}`, { to: 'debug' })
  } catch {
    // nothing more to do
  }
}
async function guard<T>($: EngineInterface, where: string, fn: () => T | Promise<T>): Promise<T | undefined> {
  try {
    return await fn()
  } catch (err) {
    report($, where, err)
    return undefined
  }
}

// reads first and writes only when the view would change (the state library reads atoms named in the source, so this is not generic)
async function updateView($: EngineInterface, compute: (prev: HudView) => HudView) {
  const prev = await read($, view)
  const next = compute(prev)
  if (prev.isOpen === next.isOpen && prev.density === next.density) return
  await update($, view, compute)
  await guard($, 'status', () => syncStatus($))
  await animate($)
}

// ---------- bars ----------

type Written = { prev?: Bar; made: Bar | Refusal | null; stored?: Bar }

// a state change sounds, and a bar that finished (not a demo one) shows its toast with what it took
async function notify($: EngineInterface, before: BarState | undefined, bar: Bar) {
  chimeFor($, before, bar.state)
  if (bar.state !== 'done' || before === 'done' || !cfg.toastOnDone || isDemoBar(bar.id)) return
  await guard($, 'toast', async () => $.ui.toast(toastText(bar, await read($, meter), await getLang($)), { timeoutMs: TOAST_MS }))
}

// builds one bar from the latest stored one inside update(), so back-to-back calls never work from a stale copy;
// build may refuse (the list stays as it was), return the bar it was given (nothing to write) or null (the bar goes away)
async function writeBar($: EngineInterface, id: string, build: (prev: Bar | null) => Bar | Refusal | null): Promise<Written> {
  const out: Written = { made: null }
  await update($, bars, list => {
    out.prev = list.find(b => b.id === id)
    out.stored = undefined
    out.made = build(out.prev ?? null)
    if (out.made === null) return out.prev ? list.filter(b => b.id !== id) : list
    if (isRefusal(out.made) || out.made === out.prev) return list
    const next = placeBar(list, out.made, cfg.maxBars)
    out.stored = next.find(b => b.id === id)
    return next
  })
  const made = out.made
  const removed = made === null && out.prev !== undefined
  const wrote = made !== null && !isRefusal(made) && made !== out.prev
  if (wrote) {
    await notify($, out.prev?.state, out.stored ?? made)
    if (!out.prev) await updateView($, v => ({ ...v, isOpen: true }))
  }
  if (wrote || removed) await changed($)
  return out
}

// the progress tool's write: the bar, or the refusal
async function putBar($: EngineInterface, id: string, build: (prev: Bar | null) => Bar | Refusal): Promise<{ bar: Bar } | { refusal: Refusal }> {
  const out = await writeBar($, id, build)
  if (out.made === null || isRefusal(out.made)) return { refusal: out.made ?? { refusal: 'limit' } }
  return { bar: out.stored ?? out.made }
}

// changes the bars `pick` selects, bumping their rev; resolves with each one before and after
async function patchBars($: EngineInterface, pick: (b: Bar) => boolean, change: (b: Bar) => Partial<Bar>): Promise<{ before: Bar; after: Bar }[]> {
  if (!(await read($, bars)).some(pick)) return []
  const now = await $.clock.now()
  const out: { changed: { before: Bar; after: Bar }[] } = { changed: [] }
  await update($, bars, list => {
    out.changed = []
    return list.map(b => {
      if (!pick(b)) return b
      const after = touch({ ...b, ...change(b) }, now)
      out.changed.push({ before: b, after })
      return after
    })
  })
  if (out.changed.length > 0) await changed($)
  for (const { before, after } of out.changed) await notify($, before.state, after)
  return out.changed
}

const isComplete = (b: Bar) => b.state === 'running' && b.stages.length > 0 && b.stages.every(s => s.steps.every(st => isFinished(st.status)))

function labelOf(b: Bar): string {
  const w = where(b)
  return b.stages.length > 1 ? `${b.stages[w.stage]?.name ?? ''} ${w.step}/${w.stageSize}`.trim() : `${w.pos}/${w.total}`
}

function resetTurn() {
  turn = newTurn()
}

// a bar was updated, through the progress tool or by a task call that worked: the nudges start counting again
function markUpdated() {
  turn.touched = true
  turn.sinceUpdate = 0
}

// ---------- the status line, the clock tick, closing bars ----------

// a bar write is saved, and what the status line shows follows the bars
async function changed($: EngineInterface) {
  scheduleSave($)
  await guard($, 'status', () => syncStatus($))
  await animate($)
}

// DESIGN 5.7.6: the bar in one line while the band is hidden (or always); the same line is not sent twice, none clears it.
// null: nothing sent yet, so the first sync always writes
let lastStatus: string | undefined | null = null
async function syncStatus($: EngineInterface) {
  const [list, v, lang] = await Promise.all([read($, bars), read($, view), getLang($)])
  const text = statusText(list, v.isOpen, cfg.statusLine, lang)
  if (text === lastStatus) return
  lastStatus = text
  $.ui.status(text)
}

// DESIGN 5.7.7: a 1 Hz tick redraws the terminal's clocks, only while something runs; and once when finished strips are due to fold.
// While the band animates (X9) the tick is the frame clock: one tick every FRAME_MS, and the 1 Hz work waits for the animation to end.
// The timer runs at the frame rate all the time but looks at module variables alone, so a quiet session does the 1 Hz work as before
let ticker: { cancel: () => void } | null = null
const folded = new Set<string>()
const FRAMES_PER_SECOND = 1000 / FRAME_MS
let frames = 0 // timer rings since the ticker started
let animating = false // the band has something moving: every ring is a frame
let stopAtFrame: number | null = null // when only a glow is left, the ring it ends at; null while something keeps moving

function startTicker($: EngineInterface) {
  ticker?.cancel()
  frames = 0
  ticker = $.clock.every(FRAME_MS, () => {
    frames += 1
    if (animating) {
      // the last frame of a glow is drawn, then the band rests
      if (stopAtFrame !== null && frames >= stopAtFrame) {
        animating = false
        stopAtFrame = null
      }
      return guard($, 'tick', () => update($, tick, n => n + 1))
    }
    return frames % FRAMES_PER_SECOND === 0 ? guard($, 'tick', () => onSecond($)) : undefined
  })
}

// what moves in the terminal's band: a running bar that is not idle (a turn runs or an agent does) with its spinner and shimmer, a
// running agent, a bar that finished less than FLASH_MS ago. Asked again whenever the bars, the turn or the view change
async function refreshAnimating($: EngineInterface) {
  if (!cfg.animation) {
    animating = false
    stopAtFrame = null
    return
  }
  const [list, v, e, now] = await Promise.all([read($, bars), read($, view), read($, env), $.clock.now()])
  if (!e.hasTerminal || !v.isOpen || list.length === 0) {
    animating = false
    stopAtFrame = null
    return
  }
  const live = list.some(b => b.agents.some(isLive))
  const isMoving = list.some(b => (b.state === 'running' && (turnRunning || live)) || b.agents.some(a => a.state === 'running'))
  const glow = Math.max(0, ...list.filter(b => b.state === 'done' && b.endedAt !== null).map(b => (b.endedAt ?? 0) + FLASH_MS - now))
  animating = isMoving || glow > 0
  stopAtFrame = isMoving || glow <= 0 ? null : frames + Math.ceil(glow / FRAME_MS)
}
const animate = ($: EngineInterface) => guard($, 'anim', () => refreshAnimating($))

async function onSecond($: EngineInterface) {
  if (!(await read($, env)).hasTerminal) return
  const list = await read($, bars)
  const now = await $.clock.now()
  const isActive = list.some(b => b.agents.some(isLive)) || (turnRunning && list.some(b => b.state === 'running'))
  const due = list.filter(b => b.agentsDoneAt !== null && now - b.agentsDoneAt > FOLD_MS && !folded.has(`${b.id}:${b.agentsDoneAt}`))
  if (!isActive && due.length === 0) return
  for (const b of due) folded.add(`${b.id}:${b.agentsDoneAt}`)
  await update($, tick, n => n + 1)
}

// removes the bars `pick` selects, with the homes of their agents
async function dropBars($: EngineInterface, pick: (b: Bar) => boolean) {
  const gone = new Set((await read($, bars)).filter(pick).map(b => b.id))
  if (gone.size === 0) return
  await update($, bars, list => list.filter(b => !gone.has(b.id)))
  await update($, agentHome, h => keepHomes(h, (_, home) => !gone.has(home)))
  await changed($)
}

// ---------- commands ----------

// a command answers for itself: the text its work gave, or the internal-error line when the work failed
const reply = async ($: EngineInterface, where: string, fn: () => string | Promise<string>) => ({ text: (await guard($, where, fn)) ?? INTERNAL_ERROR })

// each registration is tried on its own: a name the engine refuses (a clash with a built-in) is logged and skipped
async function registerCommands($: EngineInterface) {
  const lang = await getLang($)
  const specs = [
    { name: 'hud', description: t(lang, 'cmd.desc.hud'), argumentHint: '[show|hide|compact|full]', immediate: true as const },
    { name: 'hud-clear', description: t(lang, 'cmd.desc.clear'), argumentHint: '[id]', immediate: true as const },
    { name: 'hud-demo', description: t(lang, 'cmd.desc.demo') },
    { name: 'hud-sounds', description: t(lang, 'cmd.desc.sounds') },
  ]
  for (const spec of specs) await guard($, `start:command:${spec.name}`, () => $.command.register(spec))
}

async function runHud($: EngineInterface, args: string): Promise<string> {
  const lang = await getLang($)
  const a = args.trim().toLowerCase()
  if (a === 'compact' || a === 'full') {
    await updateView($, v => ({ ...v, density: a }))
    await guard($, 'prefs', () => $.store.set(PREFS_KEY, { density: a }))
    return t(lang, a === 'compact' ? 'cmd.compact' : 'cmd.full')
  }
  if (a !== '' && a !== 'show' && a !== 'hide') return t(lang, 'cmd.usage')
  if ((await read($, bars)).length === 0) return t(lang, 'cmd.none')
  const isOpen = a === '' ? !(await read($, view)).isOpen : a === 'show'
  await updateView($, v => ({ ...v, isOpen }))
  return t(lang, isOpen ? 'cmd.shown' : 'cmd.hidden')
}

async function runClear($: EngineInterface, args: string): Promise<string> {
  const lang = await getLang($)
  const id = args.trim()
  const list = await read($, bars)
  const target = id === '' ? undefined : list.find(b => b.id === id || b.id === slug(id))
  if (list.length === 0 || (id !== '' && !target)) return t(lang, 'cmd.none')
  cancelDemo()
  await dropBars($, b => !target || b.id === target.id)
  return t(lang, 'cmd.cleared')
}

// the three sounds, 0.9 s apart; muted means none, and the command says so
function runSounds($: EngineInterface, lang: Lang): string {
  if (!cfg.sound) return t(lang, 'cmd.muted')
  chime($, 'decision', true)
  $.clock.after(900, () => chime($, 'error', true))
  $.clock.after(1800, () => chime($, 'done', true))
  return t(lang, 'cmd.sounds', { v: cfg.volume })
}

// ---------- the demo ----------
// the script of demo/script.ts played on the clock: bars and strips with demo ids, set directly (no agentHome, no toast, no file);
// sounds follow the mute setting like any other

let demoTimers: { cancel: () => void }[] = []
function cancelDemo() {
  for (const timer of demoTimers) timer.cancel()
  demoTimers = []
}

async function runDemo($: EngineInterface, lang: Lang) {
  cancelDemo()
  await dropBars($, b => isDemoBar(b.id))
  for (const step of demoScript(lang)) demoTimers.push($.clock.after(step.at, () => guard($, 'demo', () => demoStep($, step))))
}

async function demoStep($: EngineInterface, step: DemoStep) {
  const ctx = await ctxOf($)
  if (step.kind === 'bar') {
    const id = barIdOf(step.input)
    await writeBar($, id, prev => normalize(step.input, prev, ctx.now, id, ctx.meter, 'demo'))
  } else if (step.kind === 'spawn') {
    const run = { ...newRun(step.id, step.title, step.model, step.parent ? 1 : 0, ctx), ...(step.effort ? { effort: step.effort } : {}) }
    await update($, bars, list => list.map(b => (b.id === step.bar ? touch(addRun(b, run, step.parent, ctx), ctx.now) : b)))
    await guard($, 'status', () => syncStatus($))
  } else {
    const home = (await read($, bars)).find(b => b.agents.some(a => a.id === step.id))?.id
    if (step.kind === 'tool') await editAgent($, step.id, a => ({ ...a, state: 'running', tool: step.tool, calls: a.calls + 1 }), home)
    else {
      await editAgent($, step.id, a => endRun(a, ctx, step.ok ? 'answer' : 'error', step.output ?? 0), home)
      if (!step.ok && home !== AGENTS_ID) chime($, 'error')
    }
  }
}

// ---------- meter ----------

// the session's running totals: every turn's usage (main loop and agents) and the cost the engine reports
async function addMeter($: EngineInterface, usage: unknown) {
  const prev = await read($, meter)
  if (addUsage(prev, usage) === prev) return
  await update($, meter, m => addUsage(m, usage))
}

async function setCost($: EngineInterface, costUsd: number | null) {
  if ((await read($, meter)).costUsd === costUsd) return
  await update($, meter, m => ({ ...m, costUsd }))
}

async function setGauge($: EngineInterface, change: Partial<SessionGauge>) {
  if (Object.keys(change).length === 0) return
  const prev = await read($, gauge)
  if (Object.entries(change).every(([k, v]) => prev[k as keyof SessionGauge] === v)) return
  await update($, gauge, g => ({ ...g, ...change }))
}

// ---------- agents: drawn from engine events alone, no model calls ----------
// each subagent lives on a bar as one strip: the bar of its parent agent, else the latest open bar (tool, plan or tasks),
// else the mod's own agents bar. agentHome (state, so a reload keeps it) says which bar each running agent is on

// changes one agent's strip inside the latest list; what its bar now is sounds, and a finished bar shows its toast
async function editAgent($: EngineInterface, agentId: string, change: (a: AgentRun, ctx: Ctx) => AgentRun, inBar?: string) {
  const home = inBar ?? (await read($, agentHome))[agentId]
  if (!home) return
  const ctx = await ctxOf($)
  const cur = (await read($, bars)).find(b => b.id === home)
  if (!cur || editRun(cur, agentId, a => change(a, ctx), ctx) === cur) return
  const out: { before?: Bar; after?: Bar } = {}
  await update($, bars, list =>
    list.map(b => {
      if (b.id !== home) return b
      const next = editRun(b, agentId, a => change(a, ctx), ctx)
      if (next === b) return b
      out.before = b
      out.after = touch(next, ctx.now)
      return out.after
    }),
  )
  if (out.before && out.after) {
    await notify($, out.before.state, out.after)
    // an agent that starts or stops running starts or stops the animation
    const moving = (b: Bar) => `${b.agents.filter(isLive).length}/${b.agents.filter(a => a.state === 'running').length}`
    if (moving(out.before) !== moving(out.after)) await animate($)
  }
}

async function onSpawn($: EngineInterface, e: { description: string; subagentType: string; parentAgentId?: string }, started: { agentId: string; model: string }) {
  const ctx = await ctxOf($)
  const homes = await read($, agentHome)
  const list = await read($, bars)
  const parentHome = e.parentAgentId ? homes[e.parentAgentId] : undefined
  const parentBar = parentHome ? list.find(b => b.id === parentHome) : undefined
  const open = [...list].reverse().find(b => isOpenBar(b) && (b.source === 'tool' || b.source === 'plan' || b.source === 'tasks'))
  const home = parentBar?.id ?? open?.id ?? AGENTS_ID
  const run = newRun(started.agentId, str(e.description || e.subagentType, 60), started.model, parentBar ? 1 : 0, ctx)
  const out: { isNew?: boolean } = {}
  await update($, bars, all => {
    const at = all.find(b => b.id === home)
    out.isNew = !at
    if (at) return all.map(b => (b.id === home ? touch(addRun(b, run, e.parentAgentId, ctx), ctx.now) : b))
    const auto = { ...newBar(AGENTS_ID, 'agents', ctx.now, ctx.meter), title: AGENTS_TITLE[ctx.lang], kind: 'todo' as const }
    return placeBar(all, addRun(auto, run, undefined, ctx), cfg.maxBars)
  })
  await update($, agentHome, h => ({ ...h, [started.agentId]: home }))
  if (out.isNew) await updateView($, v => ({ ...v, isOpen: true }))
  await animate($)
}

// an agent's call: before it, the strip names the tool; after it, the call is counted
async function agentPre($: EngineInterface, agentId: string, tool: string, useId: string | undefined): Promise<boolean> {
  if (!(await read($, agentHome))[agentId]) return false
  if (useId) toolUses.set(useId, agentId)
  await editAgent($, agentId, a => (a.state === 'running' && a.tool === tool ? a : { ...a, state: 'running', tool }))
  return true
}

async function agentPost($: EngineInterface, agentId: string, tool: string, useId: string | undefined, ran: { deny?: unknown; isError?: unknown }) {
  if (useId) toolUses.delete(useId)
  const isDenied = ran.deny !== undefined
  const isFailed = ran.isError === true
  await editAgent($, agentId, a => {
    const wasWaiting = a.state === 'waiting'
    if (isDenied && !wasWaiting) return a
    return {
      ...a,
      ...(wasWaiting ? { state: 'running' as const, tool } : {}),
      ...(isDenied ? {} : { calls: a.calls + 1, errors: a.errors + (isFailed ? 1 : 0), streak: isFailed ? a.streak + 1 : 0 }),
    }
  })
}

// the first request of an agent's loop says what it runs on: the resolved model and its effort
async function noteStep($: EngineInterface, agentId: string, model: string, effort: unknown) {
  const eff = effort === undefined ? undefined : String(effort)
  await editAgent($, agentId, a => {
    if (a.model === model && a.effort === eff) return a
    const { effort: _was, ...rest } = a
    return { ...rest, model, ...(eff === undefined ? {} : { effort: eff }) }
  })
}

// an agent's turn is over: done, or an error when it was interrupted or failed
async function agentDone($: EngineInterface, e: { agentId: string; reason: string; usage?: { output_tokens?: number } }) {
  const home = (await read($, agentHome))[e.agentId]
  if (!home) return
  await editAgent($, e.agentId, (a, ctx) => endRun(a, ctx, e.reason, typeof e.usage?.output_tokens === 'number' ? e.usage.output_tokens : 0))
  for (const [useId, agentId] of toolUses) if (agentId === e.agentId) toolUses.delete(useId)
  // a failed agent on a task bar sounds here; on the agents bar the bar's own state sounds
  if (e.reason !== 'answer' && home !== AGENTS_ID) chime($, 'error')
  await update($, agentHome, h => keepHomes(h, id => id !== e.agentId))
}

// after a reload: what $.agent.list() says about the strips that were running, and agentHome without the ones that are not
async function reconcileAgents($: EngineInterface) {
  if (!(await read($, bars)).some(b => b.agents.some(isLive))) return
  const listed = await $.agent.list()
  const ctx = await ctxOf($)
  await update($, bars, list => list.map(b => (b.agents.some(isLive) ? reconcile(b, listed, ctx) : b)))
  const live = new Set((await read($, bars)).flatMap(b => b.agents.filter(isLive).map(a => a.id)))
  await update($, agentHome, h => keepHomes(h, id => live.has(id)))
}

// ---------- X1: the built-in task tools mirrored on the bar "tasks" ----------

async function mirrorTasks($: EngineInterface, tool: string, input: unknown, result: unknown) {
  const ctx = await ctxOf($)
  const build = (prev: Bar | null) =>
    tool === 'TaskCreate' ? onTaskCreate(prev, input, result, ctx) : tool === 'TaskUpdate' ? onTaskUpdate(prev, input, result, ctx) : tool === 'TodoWrite' ? onTodoWrite(prev, input, ctx) : prev
  const cur = (await read($, bars)).find(b => b.id === TASKS_ID) ?? null
  if (build(cur) === cur) return
  await writeBar($, TASKS_ID, build)
}

// ---------- persistence ----------

let saveTimer: { cancel: () => void } | null = null

// debounced: one pending save at a time
function scheduleSave($: EngineInterface) {
  if (saveTimer) return
  try {
    saveTimer = $.clock.after(SAVE_DEBOUNCE_MS, () => {
      saveTimer = null
      return guard($, 'save', async () => saveNow($, await $.session.id()))
    })
  } catch (err) {
    report($, 'save:schedule', err)
  }
}

// the newest write of a session goes last in the store's key order, so the oldest sessions are the ones dropped
async function saveNow($: EngineInterface, sessionId: string) {
  const list = await read($, bars)
  const key = BARS_PREFIX + sessionId
  if (list.length === 0) {
    await $.store.delete(key)
    return
  }
  const [repo, cwd, root, now] = await Promise.all([$.session.repo(), $.session.cwd(), $.session.root(), $.clock.now()])
  const snap = fitSize(toSnapshot(list, { sessionId, cwd, root, repo: repo?.name ?? null }, now))
  await $.store.delete(key)
  if (snap.bars.length === 0) return // only the agents bar, which is not stored
  await $.store.set(key, snap)
  await Promise.all(pruneKeys(await $.store.keys()).map(old => $.store.delete(old)))
}

// a session reopened later (an app restart, a resume) finds its bars where it left them; agents are not stored
async function restore($: EngineInterface) {
  if ((await read($, bars)).length > 0) return
  const saved = fromSnapshot(await $.store.get(BARS_PREFIX + (await $.session.id())))
  if (!saved || saved.length === 0) return
  await update($, bars, () => saved)
  await updateView($, v => ({ ...v, isOpen: true }))
}

async function loadPrefs($: EngineInterface) {
  const prefs = fromPrefs(await $.store.get(PREFS_KEY))
  if (prefs) await updateView($, v => ({ ...v, density: prefs.density }))
}

// ---------- hooks ----------

export const register: Register = (on, options) => {
  cfg = parseOptions(options)
  langCache = null

  on('session.start', async ($, e, next) => {
    await guard($, 'start:tool', () => $.tool.register(TOOL_SPEC))
    await guard($, 'start:restore', () => restore($))
    await guard($, 'start:prefs', () => loadPrefs($))
    await guard($, 'start:agents', () => reconcileAgents($))
    await guard($, 'start:gauge', async () => setGauge($, (await read($, gauge)).startedAt === null ? { startedAt: await $.clock.now() } : {}))
    await guard($, 'start:surfaces', async () => {
      const hasTerminal = (await $.session.surfaces()).includes('terminal')
      if ((await read($, env)).hasTerminal !== hasTerminal) await update($, env, v => ({ ...v, hasTerminal }))
    })
    await guard($, 'start:commands', () => registerCommands($))
    await guard($, 'start:ticker', () => startTicker($))
    await animate($)
    lastStatus = null
    await guard($, 'start:status', () => syncStatus($))
    return next(e)
  }).catch(($, e, next) => next(e))

  // the rules sit in the cached system prompt, once per session
  on('prompt.compose', async ($, e, next) => {
    const r = await next(e)
    return { sections: [...r.sections, { id: RULES_ID, text: RULES, scope: 'session' as const }] }
  }).catch(($, e, next) => next(e))

  // the person answering clears any "needs input" without a model call; open bars add one short line for the model
  on('prompt.submit', async ($, e, next) => {
    if (e.origin.kind !== 'composer') return next(e)
    const line = await guard($, 'submit', async () => {
      await patchBars($, b => b.state === 'needs_input', () => ({ state: 'running', note: null }))
      const open = (await read($, bars)).filter(isOpenBar)
      return open.length === 0 ? undefined : openBarsLine(open.map(b => ({ id: b.id, label: labelOf(b) })))
    })
    return line === undefined ? next(e) : next({ ...e, context: [...(e.context ?? []), line] })
  }).catch(($, e, next) => next(e))

  on('turn.start', async ($, e, next) => {
    resetTurn()
    turnRunning = true
    await animate($)
    return next(e)
  }).catch(($, e, next) => next(e))

  // every turn adds its usage to the session's meter; an agent's turn ends its strip; the main loop's settles bars whose steps are all finished
  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    await guard($, 'complete:meter', () => addMeter($, e.usage))
    if (e.agentId !== undefined) {
      const agentId = e.agentId
      await guard($, 'complete:agent', () => agentDone($, { agentId, reason: e.reason, usage: e.usage }))
      return r
    }
    turnRunning = false
    await guard($, 'complete', async () => {
      const m = await read($, meter)
      const now = await $.clock.now()
      await patchBars($, isComplete, () => ({ state: 'done', endedAt: now, meterEnd: m }))
    })
    await animate($)
    return r
  }).catch(($, e, next) => next(e))

  // the band above the prompt: the bars, their strips and the notes, with whatever sits beneath us drawn under it.
  // The terminal redraws on the clock tick; the desktop never reads it, its clocks run inside the drawings (V6)
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const below = await next(e)
    try {
      // only the terminal's drawing reads the tick: it is the clock of its clocks and, with animation on, the frame number
      const frame = e.surface === 'terminal' ? await read($, tick) : null
      const [list, v] = await Promise.all([read($, bars), read($, view)])
      if (list.length === 0 || !v.isOpen) return below
      // the figures of the whole session are read only for a line that shows them: the terminal's for "all", the desktop's unless "off"
      const needsGauge = cfg.sessionMetrics === 'all' || (e.surface === 'desktop' && cfg.sessionMetrics !== 'off')
      const [now, m, g, lang, theme] = await Promise.all([
        $.clock.now(),
        e.surface === 'desktop' || needsGauge ? read($, meter) : EMPTY_METER,
        needsGauge ? read($, gauge) : EMPTY_GAUGE,
        getLang($),
        read($, env),
      ])
      const model = {
        bars: list, now, meter: m, gauge: g, isWorking: e.props.isWorking, lang, palette: resolvePalette(cfg, theme), density: v.density, sessionMetrics: cfg.sessionMetrics,
        frame: cfg.animation ? frame : null,
      }
      const close = (id: string) => dropBars($, b => b.id === id)
      if (e.surface === 'terminal') {
        const { Box, Text, Button } = $.ui.resolve(e)
        const rows = renderTerminalBand({ Box, Text, Button }, layoutBand(model, { columns: e.props.bodyColumns, maxRows: e.props.maxRows }), { close })
        // an empty result beneath is not made a child (V11)
        return below ? (
          <Box {...COLUMN}>
            {rows}
            {below}
          </Box>
        ) : (
          <Box {...COLUMN}>{rows}</Box>
        )
      }
      if (e.surface === 'desktop') {
        const table = $.ui.resolve(e)
        const { Box } = table
        const layout = layoutDesktop(model, e.props.bodyColumns)
        const rows = renderDesktopBand(table, layout, drawDesktop(model, layout), { close })
        return below ? (
          <Box {...SPACED_COLUMN}>
            {rows}
            {below}
          </Box>
        ) : (
          <Box {...SPACED_COLUMN}>{rows}</Box>
        )
      }
      return below
    } catch (err) {
      report($, 'band', err)
      return below
    }
  }).catch(($, e, next) => next(e))

  // the HUD button in the footer, beside the labels other plugins add: a press shows or hides the band
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const below = await next(e)
    try {
      const list = await read($, bars)
      const v = await read($, view)
      const lang = await getLang($)
      const { Box, Button } = $.ui.resolve(e)
      const press = () =>
        guard($, 'toggle', async () => {
          if ((await read($, bars)).length === 0) $.ui.toast(t(lang, 'toast.empty'))
          else await updateView($, x => ({ ...x, isOpen: !x.isOpen }))
        })
      const button = <Button key="hud-toggle" plain dimColor={list.length === 0 || !v.isOpen} label={list.length >= 2 ? `HUD ${list.length}` : 'HUD'} onPress={press} />
      return below ? (
        <Box {...MODE_ROW}>
          {button}
          {below}
        </Box>
      ) : (
        <Box {...MODE_ROW}>{button}</Box>
      )
    } catch (err) {
      report($, 'mode', err)
      return below
    }
  }).catch(($, e, next) => next(e))

  // the commands answer for themselves (no next), so a failure answers with the internal-error line
  on('command.run', { command: 'hud' }, ($, e) => reply($, 'cmd:hud', () => runHud($, e.args))).catch(() => ({ text: INTERNAL_ERROR }))
  on('command.run', { command: 'hud-clear' }, ($, e) => reply($, 'cmd:clear', () => runClear($, e.args))).catch(() => ({ text: INTERNAL_ERROR }))
  on('command.run', { command: 'hud-sounds' }, $ => reply($, 'cmd:sounds', async () => runSounds($, await getLang($)))).catch(() => ({ text: INTERNAL_ERROR }))
  on('command.run', { command: 'hud-demo' }, $ =>
    reply($, 'cmd:demo', async () => {
      const lang = await getLang($)
      await runDemo($, lang)
      return t(lang, 'cmd.demo')
    }),
  ).catch(() => ({ text: INTERNAL_ERROR }))

  // the progress tool: create, update and finish bars
  on('tool.call', { tool: OWN_TOOL }, async ($, e) => {
    try {
      const input = e as unknown as Raw
      const reserved = reservedRefusal(input)
      if (reserved) return { deny: denyText(reserved) }
      const id = barIdOf(input)
      const now = await $.clock.now()
      const m = await read($, meter)
      const put = await putBar($, id, prev => normalize(input, prev, now, id, m))
      if ('refusal' in put) return { deny: denyText(put.refusal) }
      markUpdated()
      return { result: resultText(put.bar) }
    } catch (err) {
      report($, 'tool', err)
      return { result: INTERNAL_ERROR }
    }
  }).catch(() => ({ result: INTERNAL_ERROR }))

  // a question to the user pauses the latest running bar until the answer comes back
  on('tool.call', { tool: 'AskUserQuestion' }, async ($, e, next) => {
    const paused = await guard($, 'ask:pre', async () => {
      // the bar going to needs_input sounds by itself; a question with no bar to pause still sounds
      const live = activeBar(await read($, bars))
      if (live) await patchBars($, b => b.id === live.id, () => ({ state: 'needs_input' }))
      else chime($, 'decision')
      return live?.id
    })
    const ran = await next(e)
    if (paused !== undefined) await guard($, 'ask:post', () => patchBars($, b => b.id === paused && b.state === 'needs_input', () => ({ state: 'running' })))
    return ran
  }).catch(($, e, next) => next(e))

  // an approved plan lands on the bar "plan"; a revised one updates it and keeps what was finished
  on('tool.call', { tool: 'ExitPlanMode' }, async ($, e, next) => {
    chime($, 'decision')
    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError === true) return ran
    const isOn = await guard($, 'plan', async () => {
      const text = (ran.result as { plan?: unknown } | null | undefined)?.plan
      const parsed = typeof text === 'string' ? parsePlan(text) : null
      if (!parsed) return false
      const now = await $.clock.now()
      const m = await read($, meter)
      const put = await putBar($, PLAN_ID, prev => normalize({ id: PLAN_ID, ...parsed }, prev, now, PLAN_ID, m, 'plan'))
      return !('refusal' in put)
    })
    // the model learns which bar holds its plan, so it moves that one rather than opening its own
    return isOn ? { ...ran, context: [...(ran.context ?? []), PLAN_CONTEXT] } : ran
  }).catch(($, e, next) => next(e))

  // the main loop's edits: strict refuses the 4th one once when no bar exists, soft and strict remind when the bar goes stale
  on('tool.call', async ($, e, next) => {
    // an agent's call only names its current tool on its strip and is counted there: no gate, no reminders
    if (e.agentId !== undefined) {
      const agentId = e.agentId
      const isTracked = await guard($, 'agent:pre', () => agentPre($, agentId, e.tool, e.tool_use_id))
      const ran = await next(e)
      if (isTracked) await guard($, 'agent:post', () => agentPost($, agentId, e.tool, e.tool_use_id, ran))
      return ran
    }
    if (!EDIT_TOOLS.has(e.tool)) return next(e)
    const gate = await guard($, 'call:pre', async () => {
      if (cfg.nudge !== 'strict' || turn.touched || turn.gateUsed || turn.edits < WORK_BEFORE_BAR) return undefined
      if ((await read($, bars)).some(isOpenBar)) return undefined
      turn.gateUsed = true
      return { deny: GATE_DENY }
    })
    if (gate) return gate
    const ran = await next(e)
    if (ran.deny !== undefined) return ran
    const reminder = await guard($, 'call:post', async () => {
      turn.edits += 1
      turn.sinceUpdate += 1
      if (cfg.nudge === 'off' || turn.reminded || turn.sinceUpdate < CALLS_BEFORE_NUDGE) return undefined
      const open = (await read($, bars)).filter(isOpenBar)
      if (open.length === 0) return undefined
      turn.reminded = true
      return reminderText(open.map(b => b.id))
    })
    return reminder === undefined ? ran : { ...ran, context: [...(ran.context ?? []), reminder] }
  }).catch(($, e, next) => next(e))

  // X1: the built-in task tools are the bar "tasks"; a call that worked also counts as an update for the nudges
  on('tool.call', { tool: ['TaskCreate', 'TaskUpdate', 'TodoWrite'] }, async ($, e, next) => {
    const ran = await next(e)
    if (e.agentId !== undefined || ran.deny !== undefined || ran.isError === true) return ran
    markUpdated()
    await guard($, 'mirror', () => mirrorTasks($, e.tool, e, ran.result))
    return ran
  }).catch(($, e, next) => next(e))

  // a subagent starts: a strip on the bar it belongs to
  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)
    const agentId = started.agentId
    if (agentId) await guard($, 'spawn', () => onSpawn($, e, { agentId, model: started.model ?? '' }))
    return started
  }).catch(($, e, next) => next(e))

  // an agent waiting on a permission prompt turns its strip to waiting until the call goes on
  on('tool.check', async ($, e, next) => {
    const verdict = await next(e)
    const useId = e.tool_use_id
    const agentId = useId ? toolUses.get(useId) : undefined
    if (useId && agentId && verdict.decision === 'ask') {
      await guard($, 'check', () =>
        $.clock.after(APPROVAL_DELAY_MS, () => {
          if (toolUses.get(useId) !== agentId) return
          return guard($, 'check:wait', () => editAgent($, agentId, (a, ctx) => (a.state === 'running' ? { ...a, state: 'waiting', tool: TOOL_WORDS[ctx.lang].approval } : a)))
        }),
      )
    }
    return verdict
  }).catch(($, e, next) => next(e))

  // the first request of an agent's loop: its model and effort. The write is not awaited, so the request is not held back;
  // the index is checked again in case the matcher does not narrow it
  on('turn.step', { index: 0 }, async function* ($, e, next) {
    const agentId = e.agentId
    if (agentId !== undefined && e.index === 0) void guard($, 'step', () => noteStep($, agentId, e.model, e.effort))
    return yield* next(e)
  }).catch(async function* ($, e, next) {
    return yield* next(e)
  })

  // what the session has cost, and how full its windows are
  on('session.measure', async ($, e, next) => {
    await guard($, 'measure', async () => {
      await Promise.all([
        e.changed.includes('cost') ? setCost($, e.cost?.usd ?? null) : undefined,
        setGauge($, {
          ...(e.changed.includes('context') ? { contextPercent: e.context.percent ?? null } : {}),
          ...(e.changed.includes('rateLimits') ? { fiveHourPercent: e.rateLimits.find(r => r.kind === 'five_hour')?.percentUsed ?? null } : {}),
        }),
      ])
    })
    return next(e)
  }).catch(($, e, next) => next(e))

  // an open bar at the end of a turn: a question to the user marks it waiting on its own;
  // strict sends a turn that did work and left the bar unexplained back once
  on('classic.Stop', async ($, e, next) => {
    const result = await next(e)
    if (e.stop_hook_active || result.block || (e.background_tasks?.length ?? 0) > 0) return result
    const block = await guard($, 'stop', async () => {
      const open = (await read($, bars)).filter(isOpenBar)
      const last = open[open.length - 1]
      if (!last) return undefined
      if (/[?？]\s*$/.test(e.last_assistant_message ?? '')) {
        await patchBars($, b => b.id === last.id, () => ({ state: 'needs_input' }))
        return undefined
      }
      if (cfg.nudge !== 'strict' || turn.edits === 0 || turn.sinceUpdate === 0 || turn.stopBlocked) return undefined
      turn.stopBlocked = true
      return stopBlockText(open.map(b => b.id))
    })
    return block === undefined ? result : { ...result, block }
  }).catch(($, e, next) => next(e))

  // the session ends: save at once while there is time; /clear starts a new conversation, so the state is emptied
  on('session.end', async ($, e, next) => {
    const isSaved = await guard($, 'end:save', async () => {
      if (next.budget.remainingMs <= SAVE_MIN_BUDGET_MS) return false
      await saveNow($, e.sessionId)
      return true
    })
    // what is saved now needs no save of its own a moment later; after /clear no save may run, since it would find the state empty
    if (isSaved || e.reason === 'clear') {
      await guard($, 'end:timer', () => saveTimer?.cancel())
      saveTimer = null
    }
    if (e.reason === 'clear') {
      await guard($, 'end:clear', async () => {
        await update($, bars, () => [])
        await update($, agentHome, () => ({}))
        await update($, timeline, () => [])
      })
      await animate($)
    }
    return next(e)
  }).catch(($, e, next) => next(e))
}
