// what the test files share: the zero meter, a three-step bar, a plan, a bar with its defaults, and the harness of the pure
// functions the progress tool drives (hud). The step helpers S and st come from the engine, where the scenarios use them
import { barIdOf, placeBar, reservedRefusal } from './.build/core/bars.mjs'
import { EMPTY_METER } from './.build/core/meter.mjs'
import { isRefusal, newBar, normalize, where } from './.build/core/model.mjs'
import { parsePlan } from './.build/core/planmd.mjs'
import { denyText, resultText } from './.build/core/rules.mjs'
import { S, st } from './engine.mjs'
import { DEFAULT_PALETTE } from './.build/view/theme.mjs'

export { S, st }
export const ZERO = EMPTY_METER

// what a render hands back when it has nothing of its own to add: a stand-in for what is beneath
export const BELOW = { type: 'Text', props: {}, children: ['from below'] }
export const PLAN = '# Fix login\n\n## Analyse\n- Read code\n- Find bug\n## Fix\n- Patch\n- Test'

// two stages, three steps, the first one in progress
export const three = () => [S('One', st('A', 'active'), 'B'), S('Two', 'C')]
export const create = (E, id = 't', stages = three(), title = 'Task') => E.call({ id, title, stages })
export const res = r => r.deny ?? r.result

// a bar as the scenarios seed state with it: running, two steps, made at 1000
export const bar = (id, over = {}) => ({ ...newBar(id, 'tool', 1000, ZERO), title: id, stages: [{ name: 'One', steps: [{ title: 'A', status: 'active' }, { title: 'B', status: 'pending' }] }], ...over })

// what the tool hook does with one call, against a list of bars it keeps
export function hud({ maxBars = 3, meter = ZERO } = {}) {
  let bars = []
  let now = 1_000_000
  const api = {
    tick: ms => (now += ms),
    now: () => now,
    bars: () => bars,
    bar: id => bars.find(b => b.id === id),
    steps: id => (api.bar(id)?.stages ?? []).flatMap(s => s.steps.map(x => `${x.title}:${x.status}`)).join(' '),
    pct: id => Math.round((where(api.bar(id)).pos / where(api.bar(id)).total) * 100),
    call(input) {
      const reserved = reservedRefusal(input)
      if (reserved) return { deny: denyText(reserved) }
      const id = barIdOf(input)
      const made = normalize(input, api.bar(id) ?? null, now, id, meter)
      if (isRefusal(made)) return { deny: denyText(made) }
      bars = placeBar(bars, made, maxBars)
      return { result: resultText(api.bar(id)) }
    },
    create: (id = 't', stages = three(), title = 'Task') => api.call({ id, title, stages }),
    // what ExitPlanMode will do with the plan text: parse it, then create or update the bar "plan"
    exitPlan(markdown) {
      const parsed = parsePlan(markdown)
      if (!parsed) return null
      const made = normalize({ id: 'plan', ...parsed }, api.bar('plan') ?? null, now, 'plan', meter, 'plan')
      if (isRefusal(made)) throw new Error('an approved plan was refused')
      bars = placeBar(bars, made, maxBars)
      return api.bar('plan')
    },
  }
  return api
}

// what a pure reducer is handed besides its input: the time, the meter, the language
export const ctx = (now = 1000, over = {}) => ({ now, meter: ZERO, lang: 'ja', ...over })

// a BandModel as layoutBand and the drawings take it: one running turn, the default palette, no figures of the session yet
export const bandModel = (bars, over = {}) => ({
  bars, now: 100_000, meter: ZERO, gauge: { startedAt: null, contextPercent: null, fiveHourPercent: null }, isWorking: true, lang: 'ja',
  palette: DEFAULT_PALETTE, density: 'full', sessionMetrics: 'desktop', ...over,
})
