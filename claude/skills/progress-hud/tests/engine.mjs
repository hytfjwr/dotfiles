// Derived from zycck/claude-mods plugins/plan-progress/tests/engine.mjs (commit 549ecee), MIT License, (c) 2026 Kirill Serditov. Modified for progress-hud. See THIRD_PARTY_NOTICES.md.
// a stand-in engine around the real, transpiled register.tsx: hooks run as written, only $ is faked.
//  - $ holds only the nouns of the allow list (DESIGN 9.3); any other call throws, so a test fails on it
//  - events run through every matching hook in registration order, with next, .catch and the "kept" rule of the real chain
//  - state, store and clock are real enough to test persistence and debounce: versions with ifVersion, a JSON store in
//    insertion order, a mock clock moved by advance()
//  - failures can be injected into $.state.set, $.store.set and $.audio.play
import { EMPTY_METER } from './.build/core/meter.mjs'
import { TOOL } from './.build/core/rules.mjs'
import { ALLOWED } from './allowlist.mjs'
import { resetSvgState } from './.build/view/svg.mjs'
import { TABLE, validateTree } from './surface-validator.mjs'

globalThis.h = (type, props, ...children) => ({ type, props: props ?? {}, children })

export { TOOL }

export { ALLOWED }

// every one of these makes the named part of $ fail, to show that no hook of the mod lets it show: state.get, state.set, every
// $.store call, $.store.set alone, $.audio.play, the clock ($.clock.now rejects; after and every throw), the timers alone (after and
// every throw), $.agent.list, $.tool.register, $.command.register, $.ui.toast, $.ui.status, $.ui.log, $.ui.resolve, $.session.*, $.env.get.
// audioHang is not a failure but a play that never returns, so it is left out of the list of names
export const FAULT_DEFAULTS = {
  stateGet: false, stateSet: false, store: false, storeSet: false, audioPlay: false, audioHang: false, clock: false, timers: false, agentList: false,
  toolRegister: false, commandRegister: false, toast: false, status: false, log: false, resolve: false, session: false, env: false,
}
export const FAULT_NAMES = Object.keys(FAULT_DEFAULTS).filter(k => k !== 'audioHang')

// what core answers when a call works, and when it fails
const ok = () => ({ result: {}, text: '' })
const failed = () => ({ isError: true, result: 'failed', text: 'failed' })

const STORE_LIMIT = 4 * 1024 * 1024

// a value matches a matcher: nested objects match key by key, an array matches any of its members
export function matches(matcher, value) {
  if (matcher === null || matcher === undefined) return true
  return Object.entries(matcher).every(([k, want]) => {
    const got = value?.[k]
    if (Array.isArray(want)) return want.includes(got)
    if (want && typeof want === 'object') return matches(want, got ?? {})
    return got === want
  })
}

// options.store: a Map shared between boots stands for the plugin's store outliving a restart
export async function boot({ file = './.build/register.mjs', store = new Map(), options = {}, env = {}, session = {}, agents = [], surfaces = ['terminal'], refuseCommands = [], now = 1_000_000, start = true } = {}) {
  // a fresh module instance per boot, so its module-level variables start empty; the drawings' caches live in a module that
  // is shared by every boot, so they are emptied by hand
  resetSvgState()
  const mod = await import(new URL(file, import.meta.url).href + '?n=' + Math.random())
  const hooks = []
  const on = (event, a, b) => {
    const entry = { event, matcher: b ? a : null, fn: b ?? a, catchFn: null, index: hooks.length }
    hooks.push(entry)
    return {
      catch(fn) {
        if (entry.catchFn) throw new Error('a second .catch on one registration')
        entry.catchFn = fn
      },
    }
  }

  const fail = { ...FAULT_DEFAULTS }
  const storeOps = []
  let playAttempts = 0
  const reads = [] // the state keys read, in order: a read while drawing is a subscription
  const calls = []
  const toasts = []
  const statuses = []
  const logs = []
  const sounds = []
  const registeredTools = []
  const registeredCommands = []
  const agentList = agents
  const sess = { id: 'session-1', cwd: '/work/app', root: '/work/app', repoName: 'acme/app', ...session }

  // state: a value and a version per key
  const cells = new Map()
  const key = ref => `${ref.plugin}:${ref.key}`
  // the clock: timers fire in order when advance() moves time past them
  let clock = now
  const timers = []
  const timer = (ms, fn, every) => {
    const t = { at: clock + ms, fn, every: every ? ms : 0, cancelled: false }
    timers.push(t)
    return { cancel: () => void (t.cancelled = true) }
  }

  const track = (name, fn) => (...args) => {
    calls.push(name)
    return fn(...args)
  }
  const strict = (path, target) =>
    new Proxy(target, {
      get(t, k) {
        if (typeof k === 'symbol' || k === 'then') return undefined
        if (!(k in t)) throw new Error(`stub engine: $.${path}${k} is not in the allow list (DESIGN 9.3)`)
        return t[k]
      },
    })
  const noun = (name, methods) => strict(`${name}.`, Object.fromEntries(Object.entries(methods).map(([m, fn]) => [m, track(`${name}.${m}`, fn)])))
  const $ = strict('', {
    tool: noun('tool', {
      register: async spec => {
        if (fail.toolRegister) throw new Error('injected: $.tool.register failed')
        registeredTools.push(spec)
      },
    }),
    command: noun('command', {
      register: async spec => {
        if (fail.commandRegister) throw new Error('injected: $.command.register failed')
        if (refuseCommands.includes(spec.name)) throw new Error(`injected: /${spec.name} is a built-in`)
        registeredCommands.push(spec)
      },
    }),
    ui: noun('ui', {
      // the element table of the surface the event is drawn on: names stand for the constructors, and h() keeps them as the type
      resolve: e => {
        if (fail.resolve) throw new Error('injected: $.ui.resolve failed')
        return Object.fromEntries((TABLE[e?.surface ?? 'terminal'] ?? []).map(n => [n, n]))
      },
      toast: (text, o) => {
        if (fail.toast) throw new Error('injected: $.ui.toast failed')
        toasts.push({ text, ...o })
      },
      status: text => {
        if (fail.status) throw new Error('injected: $.ui.status failed')
        statuses.push(text)
      },
      log: (text, o) => {
        if (fail.log) throw new Error('injected: $.ui.log failed')
        logs.push({ text, ...o })
      },
      open: async () => ({}),
      close: async () => ({}),
    }),
    state: noun('state', {
      get: async ref => {
        if (fail.stateGet) throw new Error('injected: $.state.get failed')
        reads.push(key(ref))
        const c = cells.get(key(ref))
        return c ? { value: structuredClone(c.value), version: c.version } : { value: undefined, version: 0 }
      },
      set: async (ref, value, o) => {
        if (fail.stateSet) throw new Error('injected: $.state.set failed')
        if (value === undefined) throw new Error('$.state.set: never undefined')
        const c = cells.get(key(ref)) ?? { value: undefined, version: 0 }
        if (o?.ifVersion !== undefined && o.ifVersion !== c.version) return { isSet: false, version: c.version }
        cells.set(key(ref), { value: structuredClone(value), version: c.version + 1 })
        return { isSet: true, version: c.version + 1 }
      },
    }),
    store: noun('store', {
      get: async k => {
        if (fail.store) throw new Error('injected: $.store.get failed')
        storeOps.push({ op: 'get', key: k })
        return store.has(k) ? JSON.parse(store.get(k)) : undefined
      },
      set: async (k, v) => {
        if (fail.storeSet || fail.store) throw new Error('injected: $.store.set failed')
        storeOps.push({ op: 'set', key: k })
        const text = JSON.stringify(v)
        const total = [...store].reduce((n, [key2, val]) => n + (key2 === k ? 0 : val.length), 0) + text.length
        if (total > STORE_LIMIT) throw new Error('$.store.set: over 4 MiB')
        store.set(k, text)
      },
      delete: async k => {
        if (fail.store) throw new Error('injected: $.store.delete failed')
        storeOps.push({ op: 'delete', key: k })
        store.delete(k)
      },
      keys: async () => {
        if (fail.store) throw new Error('injected: $.store.keys failed')
        return [...store.keys()]
      },
    }),
    clock: noun('clock', {
      now: async () => {
        if (fail.clock) throw new Error('injected: $.clock.now failed')
        return clock
      },
      after: (ms, fn) => {
        if (fail.clock || fail.timers) throw new Error('injected: $.clock.after failed')
        return timer(ms, fn, false)
      },
      every: (ms, fn) => {
        if (fail.clock || fail.timers) throw new Error('injected: $.clock.every failed')
        return timer(ms, fn, true)
      },
    }),
    audio: noun('audio', {
      play: async (src, o) => {
        playAttempts++
        if (fail.audioHang) return new Promise(() => {})
        if (fail.audioPlay) throw new Error('injected: $.audio.play failed')
        sounds.push({ src, ...o, at: clock })
      },
    }),
    session: noun('session', {
      id: async () => (fail.session ? Promise.reject(new Error('injected: $.session.id failed')) : sess.id),
      cwd: async () => (fail.session ? Promise.reject(new Error('injected: $.session.cwd failed')) : sess.cwd),
      root: async () => (fail.session ? Promise.reject(new Error('injected: $.session.root failed')) : sess.root),
      repo: async () => {
        if (fail.session) throw new Error('injected: $.session.repo failed')
        return sess.repoName === null ? null : { root: sess.root, remote: null, internal: false, name: sess.repoName }
      },
      usage: async () => ({}),
      surfaces: async () => {
        if (fail.session) throw new Error('injected: $.session.surfaces failed')
        return [...surfaces]
      },
    }),
    agent: noun('agent', {
      list: async () => {
        if (fail.agentList) throw new Error('injected: $.agent.list failed')
        return structuredClone(agentList)
      },
    }),
    config: noun('config', { list: async () => [] }),
    env: noun('env', {
      get: async name => {
        if (fail.env) throw new Error('injected: $.env.get failed')
        return env[name]
      },
    }),
  })

  // a band that is still unless a test asks for the animation: the scenarios of the other groups read plain glyphs and a tick a second
  mod.register(on, { animation: false, ...options })

  // events: every matching hook in registration order; what a hook throws is its .catch's to answer, else it is skipped
  // and what its own next settled to stands. stats counts next calls per hook and core runs per dispatch
  const stats = []
  async function dispatch(event, ev, core, { remainingMs = Infinity } = {}) {
    const chain = hooks.filter(x => x.event === event && matches(x.matcher, ev))
    const stat = { event, hooks: chain.map(x => ({ index: x.index, nexts: 0, threw: null })), coreRuns: 0 }
    stats.push(stat)
    const budget = { ms: 1000, remainingMs }
    const runCore = ev2 => {
      stat.coreRuns++
      return Promise.resolve(core(ev2))
    }
    const run = (i, ev2) => (i < chain.length ? callHook(i, ev2) : runCore(ev2))
    async function callHook(i, ev2) {
      const entry = chain[i]
      let settled
      const down = e3 => (settled ??= run(i + 1, e3))
      const next = Object.assign(
        e3 => {
          stat.hooks[i].nexts++
          settled = run(i + 1, e3)
          return settled
        },
        { budget },
      )
      try {
        return await entry.fn($, ev2, next)
      } catch (err) {
        stat.hooks[i].threw = err
        if (entry.catchFn) {
          const caught = Object.assign(e3 => down(e3), { budget, called: settled !== undefined })
          const r = await entry.catchFn($, ev2, caught)
          if (r !== undefined) return r
        }
        return settled !== undefined ? settled : run(i + 1, ev2)
      }
    }
    return run(0, ev)
  }

  // events that stream (turn.step): hooks are async generators, next(e) is the stream beneath; the result is what the top one returns
  async function dispatchStream(event, ev, core) {
    const chain = hooks.filter(x => x.event === event && matches(x.matcher, ev))
    const stat = { event, hooks: chain.map(x => ({ index: x.index, nexts: 0, threw: null })), coreRuns: 0 }
    stats.push(stat)
    const budget = { ms: 1000, remainingMs: Infinity }
    const drain = async gen => {
      for (;;) {
        const x = await gen.next()
        if (x.done) return x.value
      }
    }
    const run = (i, ev2) =>
      i < chain.length
        ? (async function* () {
            const entry = chain[i]
            const next = Object.assign(
              e3 => {
                stat.hooks[i].nexts++
                return run(i + 1, e3)
              },
              { budget },
            )
            try {
              return yield* entry.fn($, ev2, next)
            } catch (err) {
              stat.hooks[i].threw = err
              if (!entry.catchFn) return yield* run(i + 1, ev2)
              return yield* entry.catchFn($, ev2, Object.assign(e3 => run(i + 1, e3), { budget }))
            }
          })()
        : (async function* () {
            stat.coreRuns++
            return core(ev2)
          })()
    return drain(run(0, ev))
  }

  let use = 0
  let taskSeq = 0
  const uid = () => 'u' + ++use
  const E = {
    $, mod, fail, storeOps, agents: agentList, calls, toasts, statuses, logs, sounds, hooks, stats, store,
    registeredTools, registeredCommands,
    get toolSpec() {
      return registeredTools[0] ?? null
    },
    chimes: () => [...mod.__chimes],
    dispatch,
    now: () => clock,
    // moves the mock clock, firing the timers it passes in order
    async advance(ms) {
      const target = clock + ms
      for (;;) {
        const due = timers.filter(t => !t.cancelled && t.at <= target).sort((a, b) => a.at - b.at)[0]
        if (!due) break
        clock = due.at
        if (due.every) due.at += due.every
        else timers.splice(timers.indexOf(due), 1)
        await due.fn()
      }
      clock = target
    },
    pendingTimers: () => timers.filter(t => !t.cancelled && !t.every).length,
    setSession: s => Object.assign(sess, s),
    // events
    sessionStart: () => dispatch('session.start', {}, () => ({})),
    sessionEnd: (reason = 'other', remainingMs = 1500) => dispatch('session.end', { reason, sessionId: sess.id, resume: { id: sess.id } }, () => ({ sessionId: sess.id }), { remainingMs }),
    compose: () => dispatch('prompt.compose', { model: 'm', promptModel: 'm', surfaces: ['terminal'], tools: [], outputStyle: null, traits: [] }, () => ({ sections: [{ id: 'intro', text: 'intro', scope: 'shared' }] })),
    submit: (text = 'hi', { origin = { kind: 'composer' }, context } = {}) => dispatch('prompt.submit', { text, origin, wait: false, ...(context ? { context } : {}) }, ev => ({ text: ev.text, context: ev.context })),
    turnStart: () => dispatch('turn.start', {}, () => ({ turnId: 't' })),
    turnComplete: ({ agentId, reason = 'answer', usage } = {}) => dispatch('turn.complete', { reason, ...(agentId ? { agentId } : {}), ...(usage ? { usage } : {}) }, () => ({ text: 'done' })),
    stop: (msg = 'Done.', extra = {}, coreResult = {}) => dispatch('classic.Stop', { stop_hook_active: false, last_assistant_message: msg, background_tasks: [], ...extra }, () => coreResult),
    // the progress tool; core answers only if no hook did
    call: input => dispatch('tool.call', { tool: TOOL, tool_use_id: uid(), ...input }, () => ({ result: 'core reached' })),
    // any tool call of the main loop (or of an agent) answered by core as given
    tool: (tool, input = {}, core = ok, agentId, useId = uid()) => dispatch('tool.call', { tool, tool_use_id: useId, ...(agentId ? { agentId } : {}), ...input }, core),
    // Edit and its kin: isError or deny switch what core answers
    work: (tool = 'Edit', { isError = false, deny = false, agentId } = {}) =>
      E.tool(tool, { file_path: '/x' }, () => (deny ? { deny: 'blocked' } : isError ? failed() : ok()), agentId),
    // AskUserQuestion: during() runs inside core, so a test can see the state while the question is open
    askUser: (during = () => {}) => E.tool('AskUserQuestion', { questions: [] }, async () => (await during(), { result: { answers: {} }, text: '' })),
    exitPlan: response => E.tool('ExitPlanMode', {}, () => response),
    // agents
    setAgents: list => void agentList.splice(0, agentList.length, ...list),
    spawn: (agentId, description = 'Scan tests', { parentAgentId, subagentType = 'general-purpose', model = 'claude-haiku-4-5-20251001', prompt = 'p' } = {}) =>
      dispatch('agent.spawn', { tool_use_id: uid(), prompt, description, subagentType, background: false, ...(parentAgentId ? { parentAgentId } : {}) }, () => (agentId ? { model, agentId } : { model })),
    agentTool: (agentId, tool = 'Grep', { isError = false, deny = false, useId = uid(), check } = {}) =>
      E.tool(tool, {}, async () => (check ? (await check(useId), isError ? failed() : ok()) : deny ? { deny: 'blocked' } : isError ? failed() : ok()), agentId, useId),
    check: (tool, useId, decision = 'ask') => dispatch('tool.check', { tool, input: {}, tool_use_id: useId }, () => ({ decision })),
    step: (agentId, { model = 'claude-haiku-4-5-20251001', effort, index = 0 } = {}) =>
      dispatchStream('turn.step', { turnId: 't', index, model, ...(effort === undefined ? {} : { effort }), messageCount: 1, ...(agentId ? { agentId } : {}) }, () => ({ turnId: 't', index })),
    measure: ({ cost, percent, five, changed = ['cost', 'context', 'rateLimits'] } = {}) =>
      dispatch('session.measure', { context: { window: 200000, ...(percent === undefined ? {} : { percent }) }, rateLimits: five === undefined ? [] : [{ kind: 'five_hour', percentUsed: five }], ...(cost === undefined ? {} : { cost: { usd: cost } }), changed }, () => ({ changed })),
    // the built-in task tools, answered by core as the engine does
    taskCreate: (subject, { id, activeForm, isError = false } = {}) => {
      const taskId = id ?? String(++taskSeq)
      return E.tool('TaskCreate', { subject, description: 'd', ...(activeForm ? { activeForm } : {}) }, () => (isError ? failed() : { result: { task: { id: taskId, subject } }, text: '' }))
    },
    taskUpdate: (taskId, patch = {}, { isError = false, success = true } = {}) =>
      E.tool('TaskUpdate', { taskId, ...patch }, () => (isError ? failed() : { result: { success, taskId, updatedFields: Object.keys(patch) }, text: '' })),
    todoWrite: (todos, { isError = false } = {}) => E.tool('TodoWrite', { todos }, () => (isError ? failed() : { result: { oldTodos: [], newTodos: todos }, text: '' })),
    // drawing: a component on a surface, the tree checked against that surface's element table and props
    render(component, { surface = 'terminal', props = {}, check = true, below = null } = {}) {
      const base = {
        AbovePrompt: { hasSurvey: false, isWorking: true, maxRows: 12, bodyColumns: 100, scroll: { offset: 0, bodyRows: 11 }, view: {} },
        SessionMode: { modes: [] },
      }[component]
      return dispatch('ui.render', { component, surface, requestId: 'r1', props: { ...base, ...props } }, () => below).then(tree => {
        const problems = check && tree ? validateTree(tree, surface) : []
        if (problems.length) throw new Error(`${component} on ${surface}: ${problems.join('; ')}`)
        return tree
      })
    },
    band: (o = {}) => E.render('AbovePrompt', o),
    mode: (o = {}) => E.render('SessionMode', o),
    // presses the Button with this key in a drawn tree, as the engine does
    press: async (tree, key) => {
      const button = findAll(tree, n => n.type === 'Button' && n.props.key === key)[0]
      if (!button) throw new Error(`no Button "${key}" in the tree`)
      await button.props.onPress()
    },
    command: (command, args = '') => dispatch('command.run', { command, args, origin: { kind: 'composer' }, presentation: {} }, () => ({ text: 'core reached' })),
    // lets work the mod started and did not wait for (a sound, a write after step 0) finish
    settle: () => new Promise(resolve => setTimeout(resolve, 0)),
    // state reads
    value: (plugin, k, initial) => (cells.get(`${plugin}:${k}`)?.value ?? initial),
    // puts a value straight into state, as if an earlier part of the session had written it (no hook, no failure injection)
    seed: (plugin, k, value) => void cells.set(`${plugin}:${k}`, { value: structuredClone(value), version: (cells.get(`${plugin}:${k}`)?.version ?? 0) + 1 }),
    seedBars: list => E.seed('progress-hud', 'bars', list),
    bars: () => E.value('progress-hud', 'bars', []),
    bar: id => E.bars().find(b => b.id === id),
    steps: id => (E.bar(id)?.stages ?? []).flatMap(s => s.steps.map(x => `${x.title}:${x.status}`)).join(' '),
    view: () => E.value('progress-hud', 'view', { isOpen: false, density: 'full' }),
    meter: () => E.value('progress-hud', 'meter', EMPTY_METER),
    gauge: () => E.value('progress-hud', 'gauge', { startedAt: null, contextPercent: null, fiveHourPercent: null }),
    homes: () => E.value('progress-hud', 'agentHome', {}),
    tick: () => E.value('progress-hud', 'tick', 0),
    stateWrites: () => calls.filter(c => c === 'state.set').length,
    // every value in state, as text: for a search for what must not be there
    stateDump: () => JSON.stringify([...cells].map(([k, c]) => [k, c.value])),
    // switches faults on or off: a list of names of E.fail, or 'all'
    setFaults(names, on = true) {
      for (const k of names === 'all' ? FAULT_NAMES : names) {
        if (!FAULT_NAMES.includes(k)) throw new Error(`no fault "${k}"`)
        fail[k] = on
      }
    },
    playAttempts: () => playAttempts,
    reads,
  }
  if (start) await E.sessionStart()
  return E
}

// ---- reading a drawn tree ----
export function findAll(node, pred, out = []) {
  if (Array.isArray(node)) node.forEach(n => findAll(n, pred, out))
  else if (node && typeof node === 'object') {
    if (pred(node)) out.push(node)
    findAll(node.children, pred, out)
  }
  return out
}

// the text of a node as the terminal shows it, roughly: a Text is its strings, a row of a Box one cell apart, a column one line each
export function plain(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(plain).join('')
  if (node.type === 'Text') return plain(node.children)
  if (node.type === 'Button') return node.props.label ?? ''
  const kids = (node.children ?? []).flat(Infinity).filter(c => c !== null && c !== undefined && c !== false)
  return kids.map(plain).join(node.props?.flexDirection === 'column' ? '\n' : ' '.repeat(node.props?.gap ?? 0))
}

export const S = (name, ...steps) => ({ name, steps: steps.map(s => (typeof s === 'string' ? { title: s, status: 'pending' } : s)) })
export const st = (title, status) => ({ title, status })
