// C1, C2 and C3 (DESIGN 9.3, 11.3): the mod does no network, no external command and no writing of its own; what it keeps goes
// to $.store alone, under bars:<session> and prefs, and holds no input of a tool.
//   C1  claude plugin validate lists the $ calls of the module; each is on the allow list (allowlist.mjs, one list for all)
//   C2  a static scan of hooks/** for what is forbidden, checked itself against files that hold each forbidden thing
//   C3  what the stub engine saw of $.store, and what state and store hold after tools ran with secrets in their inputs
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { ALLOWED } from './allowlist.mjs'
import { S, boot, st } from './engine.mjs'
import { sources } from './sources.mjs'
import { TOKENS, codeLines, scanSource, touchesDollar } from './security-scan.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const mod = join(here, '..')
const hooks = join(mod, 'hooks')
// ---------- C1 ----------

function validate() {
  try {
    return { out: execFileSync('claude', ['plugin', 'validate', mod], { encoding: 'utf8', timeout: 120_000, stdio: ['ignore', 'pipe', 'pipe'] }) }
  } catch (err) {
    if (err?.code === 'ENOENT') return { missing: true }
    return { out: `${err?.stdout ?? ''}${err?.stderr ?? ''}`, failed: true }
  }
}

test('C1 claude plugin validate passes and every $ call it lists is on the allow list', t => {
  const r = validate()
  if (r.missing) return t.skip('the claude CLI is not installed')
  assert.ok(!r.failed, `validate failed:\n${r.out}`)
  assert.match(r.out, /Validation passed/)
  const line = r.out.split('\n').find(l => l.includes(' calls: '))
  assert.ok(line, 'validate lists the calls of the module')
  const calls = [...line.matchAll(/\$\.([a-z]+\.[A-Za-z]+)/g)].map(m => m[1])
  assert.ok(calls.length >= 15, `${calls.length} calls`)
  const outside = calls.filter(c => !ALLOWED.includes(c))
  assert.deepEqual(outside, [], `calls outside the allow list: ${outside.join(', ')}`)
  for (const need of ['tool.register', 'command.register', 'store.get', 'store.set', 'audio.play', 'ui.status', 'ui.toast', 'agent.list']) assert.ok(calls.includes(need), need)
  const hooksLine = r.out.split('\n').find(l => l.includes('register.tsx hooks: '))
  assert.ok(hooksLine && hooksLine.split(', ').length >= 20, 'all the hooks are seen')
  assert.match(r.out, /env writes: nothing/)
  assert.match(r.out, /env reads: LANG\b/)
})

test('C1 the validate check is not fooled by the (via ...) lists: names are read as $.noun.method', () => {
  const sample = '❯ ./register.tsx calls: $.clock.after, $.session.id (via restore, scheduleSave), $.store.set (via runHud, saveNow), $.ui.toast'
  assert.deepEqual([...sample.matchAll(/\$\.([a-z]+\.[A-Za-z]+)/g)].map(m => m[1]), ['clock.after', 'session.id', 'store.set', 'ui.toast'])
})

// ---------- C2 ----------

test('C2 hooks/** holds none of the forbidden tokens, and no $ is kept, spread or passed on whole', () => {
  const files = sources(hooks)
  assert.ok(files.length >= 15, `${files.length} files`)
  const found = files.flatMap(f => scanSource(readFileSync(f, 'utf8')).map(v => `${relative(mod, f)}:${v.line}: ${v.rule}: ${v.text}`))
  assert.deepEqual(found, [])
})

test('C2 only hooks/register.tsx touches $; every other module is pure', () => {
  const touching = sources(hooks).filter(f => touchesDollar(readFileSync(f, 'utf8'))).map(f => relative(hooks, f))
  assert.deepEqual(touching, ['register.tsx'])
})

test('C2 register.tsx declares atoms as literals and names no $ in a variable', () => {
  const code = codeLines(readFileSync(join(hooks, 'register.tsx'), 'utf8')).map(([, l]) => l).join('\n')
  for (const m of code.matchAll(/atom\(\s*(\{[^}]*\})/g)) assert.match(m[1], /^\{ plugin: 'progress-hud', key: '\w+' \}$/, m[1])
  assert.equal([...code.matchAll(/\batom\(/g)].length, [...code.matchAll(/\batom\(\s*\{[^}]*\} as const/g)].length, 'each atom has its reference as a literal')
})

// the scan itself: each forbidden thing, in a file of its own in the temp directory (never under hooks/), must be found
const FORBIDDEN = {
  '$.process': "await $.process.run(['ls'])",
  '$.http': "await $.http.fetch('https://example.com')",
  '$.fs.': "await $.fs.write('/tmp/x', 'y')",
  '$.mcp': "await $.mcp.call('x')",
  '$.model': "await $.model.complete({ prompt: 'x' })",
  '$.env.set': "await $.env.set('A', 'b')",
  '$.config.set': "await $.config.set('k', 'v')",
  '$.settings': "await $.settings.read()",
  '$.prompt.submit': "await $.prompt.submit({ text: 'x' })",
  'fetch(': "const r = await fetch('https://example.com')",
  'import(': "const m = await import('node:fs')",
  'XMLHttpRequest': 'const x = new XMLHttpRequest()',
  'WebSocket': "const s = new WebSocket('ws://x')",
  'eval(': "eval('1+1')",
  'new Function': "const f = new Function('return 1')",
  '$.session.send': "await $.session.send({ to: 'x' })",
  '$.agent.spawn': "await $.agent.spawn({ prompt: 'x' })",
  '$.tool.call': "await $.tool.call({ tool: 'Bash' })",
  '$.command.run': "await $.command.run({ command: 'x' })",
  '$.turn': '$.turn.abort()',
  '$.audio.speak': "await $.audio.speak('hi')",
  '$.ui.copy': "await $.ui.copy({ text: 'x' })",
  '$.telemetry': "await $.telemetry.log({})",
  'const x = $': 'const kept = $',
  'const { ui } = $': 'const { ui } = $',
  'const ui = $.ui': 'const ui = $.ui;',
  'spread $': 'f(...$)',
  'call outside the allow list': "await $.clock.sleep(5)",
  'a noun passed on': 'helper($.ui)',
}

function inTemp(files, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'hud-scan-'))
  try {
    for (const [name, text] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, name)), { recursive: true })
      writeFileSync(join(dir, name), text)
    }
    return fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
const scanFile = (dir, name) => scanSource(readFileSync(join(dir, name), 'utf8'))

test('C2 the scan finds every forbidden thing, in a file made to hold it', () => {
  const files = Object.fromEntries(Object.entries(FORBIDDEN).map(([k, v], i) => [`f${i}.ts`, `export async function f($) {\n  ${v}\n}\n`]))
  inTemp(files, dir => {
    Object.keys(FORBIDDEN).forEach((k, i) => assert.ok(scanFile(dir, `f${i}.ts`).length > 0, `not found: ${k}`))
  })
  assert.ok(TOKENS.length >= 15)
})

test('C2 the scan finds a token in a string, in a template literal and after code on the same line', () => {
  const cases = {
    'a string': "const s = '$.fs.write'",
    'a double-quoted string': 'const s = "fetch(url)"',
    'a template literal': 'const s = `ok ${1} $.process.run`',
    'after code': 'const a = 1 // then $.http.fetch',
    'after code, block': 'const a = 1 /* x */ ; $.model.complete()',
    'a template literal over many lines': 'const s = `\n$.fs.write\n`',
    'a line that begins with // inside a template literal': 'const s = `first\n// $.fs.write(secret)\nlast`',
    'a // line inside a template with an expression': 'const s = `a ${b} c\n// $.http.fetch\n`',
    'after a template literal that ended': 'const s = `x`; $.process.run()',
    'a block comment that begins after code': 'const a = 1; /* x\n y */ $.process.run()',
  }
  inTemp(Object.fromEntries(Object.entries(cases).map(([k, v], i) => [`c${i}.ts`, v])), dir => {
    Object.keys(cases).forEach((k, i) => assert.ok(scanFile(dir, `c${i}.ts`).length > 0, `not found: ${k}`))
  })
})

test('C2 the scan leaves comments alone, and only comments', () => {
  const quiet = {
    'a // line': '// $.fs.write is not allowed\nconst a = 1',
    'an indented // line': 'function f() {\n  // never fetch(url) or $.process.run\n  return 1\n}',
    'a block comment': '/* $.http.fetch and eval( */\nconst a = 1',
    'a block comment over lines': '/**\n * the old $.fs.write version\n * new Function(x)\n */\nconst a = 1',
    'a block comment ended and code after it': '/* $.fs.write */ const a = 1',
    'a legitimate resolve call': 'const { Box } = $.ui.resolve(e)',
    'the calls of the allow list': 'await $.store.set(k, v)\nawait $.clock.after(1, f)\n$.ui.toast(t)',
    'a variable that only starts with fetch': 'const fetchSize = 1\nfetchAll()',
    'money in a template': 'const s = `$${n.toFixed(2)}`',
    'passing $ to a local function': 'await guard($, "x", () => run($))',
  }
  inTemp(Object.fromEntries(Object.entries(quiet).map(([k, v], i) => [`q${i}.ts`, v])), dir => {
    Object.keys(quiet).forEach((k, i) => assert.deepEqual(scanFile(dir, `q${i}.ts`), [], `a false find: ${k}`))
  })
})

test('C2 the scan gives the line and the rule of what it found', () => {
  const found = scanSource("const a = 1\n// ok\nawait $.fs.write('x')\nconst b = 2\nconst c = fetch('u')\n")
  assert.deepEqual([...new Set(found.map(f => f.line))], [3, 5])
  assert.ok(found.some(f => f.line === 3 && f.rule === '$.fs.'))
  assert.ok(found.some(f => f.line === 5 && f.rule === 'fetch('))
})

test('C2 touchesDollar sees $. in code only', () => {
  assert.equal(touchesDollar('const a = $.ui.resolve(e)'), true)
  assert.equal(touchesDollar('// $.ui.resolve\nconst a = 1'), false)
  assert.equal(touchesDollar('const price = `$${n}`'), false)
})

test('C2 the allow list is the one the stub engine enforces', async () => {
  const E = await boot()
  for (const name of ALLOWED) {
    const [noun, method] = name.split('.')
    assert.equal(typeof E.$[noun][method], 'function', name)
  }
  assert.throws(() => E.$.process, /allow list/)
  assert.throws(() => E.$.ui.copy, /allow list/)
})

// ---------- C3 ----------

const SECRETS = ['SECRET_PATH', 'SECRET_OLD', 'SECRET_NEW', 'SECRET_CONTENT', 'SECRET_TOKEN', 'SECRET_TASK_DESC', 'SECRET_PROMPT', 'SECRET_QUESTION', 'SECRET_PROSE', 'SECRET_OUTPUT', 'SECRET_RESULT']

async function flow(E) {
  await E.turnStart()
  await E.tool('Edit', { file_path: '/home/me/SECRET_PATH/.env', old_string: 'SECRET_OLD', new_string: 'SECRET_NEW' }, () => ({ result: { filePath: 'SECRET_PATH' }, text: 'SECRET_OUTPUT' }))
  await E.tool('Write', { file_path: '/home/me/SECRET_PATH/x', content: 'SECRET_CONTENT' })
  await E.tool('MultiEdit', { file_path: 'SECRET_PATH', edits: [{ old_string: 'SECRET_OLD', new_string: 'SECRET_NEW' }] })
  await E.tool('Bash', { command: 'curl -H "Authorization: SECRET_TOKEN" https://x' }, () => ({ result: { stdout: 'SECRET_RESULT' }, text: 'SECRET_RESULT' }))
  await E.tool('Read', { file_path: 'SECRET_PATH' })
  await E.call({ id: 't', title: 'Public title', stages: [S('Stage', st('Public step', 'active'), 'Next')] })
  await E.taskCreate('Public subject', { id: '1' })
  await E.tool('TaskCreate', { subject: 'Public two', description: 'SECRET_TASK_DESC' }, () => ({ result: { task: { id: '2', subject: 'Public two' } }, text: '' }))
  await E.tool('AskUserQuestion', { questions: [{ question: 'SECRET_QUESTION' }] })
  await E.exitPlan({ result: { plan: '# Plan\n\nSECRET_PROSE paragraph that is not a step.\n\n## Part\n- Public item\n- Another item' }, text: 'ok' })
  await E.spawn('a1', 'Public agent', { prompt: 'SECRET_PROMPT do the thing' })
  await E.agentTool('a1', 'Bash')
  await E.stop('SECRET_OUTPUT is the answer?')
  await E.turnComplete({ agentId: 'a1', usage: { output_tokens: 5 } })
  await E.turnComplete({ usage: { output_tokens: 5 } })
  await E.command('hud', 'compact')
  await E.advance(5000)
  await E.sessionEnd('other')
}

test('C3 the store is touched under bars:<session> and prefs only', async () => {
  const E = await boot()
  await flow(E)
  assert.ok(E.storeOps.length > 5)
  for (const { op, key } of E.storeOps) assert.match(key, /^(bars:[\w-]+|prefs)$/, `${op} ${key}`)
  assert.deepEqual([...E.store.keys()].sort(), ['bars:session-1', 'prefs'])
  assert.ok(E.storeOps.some(o => o.op === 'set' && o.key === 'bars:session-1'))
  assert.ok(E.storeOps.some(o => o.op === 'set' && o.key === 'prefs'))
})

test('C3 neither the store nor the state holds an input or an output of a tool', async () => {
  const E = await boot()
  await flow(E)
  const stored = [...E.store.values()].join('\n')
  const state = E.stateDump()
  for (const secret of SECRETS) {
    assert.ok(!stored.includes(secret), `the store holds ${secret}`)
    assert.ok(!state.includes(secret), `the state holds ${secret}`)
  }
  // and what is kept is what the model named: titles, steps, the agent's description
  assert.match(stored, /Public title/)
  assert.match(stored, /Public item/)
  assert.match(state, /Public agent/)
})

test('C3 the debug log, the toasts and the status line do not hold them either', async () => {
  const E = await boot({ options: { statusLine: 'always' } })
  E.fail.storeSet = true
  await flow(E)
  const seen = JSON.stringify([E.logs, E.toasts, E.statuses])
  for (const secret of SECRETS) assert.ok(!seen.includes(secret), `shown: ${secret}`)
})

test('C3 a snapshot holds the numbers and titles of the bars and nothing else of the session', async () => {
  const E = await boot()
  await flow(E)
  const snap = JSON.parse(E.store.get('bars:session-1'))
  assert.deepEqual(Object.keys(snap).sort(), ['bars', 'cwd', 'repo', 'root', 'savedAt', 'sessionId', 'v'])
  for (const bar of snap.bars) {
    assert.deepEqual(Object.keys(bar).sort(), ['agents', 'agentsDoneAt', 'collapsed', 'endedAt', 'id', 'kind', 'lastErrorTool', 'mainErrors', 'mainStreak', 'meterEnd', 'meterStart', 'note', 'rev', 'source', 'stages', 'startedAt', 'state', 'title', 'updatedAt'])
    assert.deepEqual(bar.agents, [])
  }
})
