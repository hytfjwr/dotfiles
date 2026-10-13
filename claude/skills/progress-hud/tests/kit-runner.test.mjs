// D (DESIGN 11.4): the official kit's tests (kit/*.test.tsx), run through `claude plugin test` when that works here. They are
// .tsx so that `node --test` does not pick them up itself: they import from 'claude-code/testing', which only that command knows
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const mod = join(dirname(fileURLToPath(import.meta.url)), '..')

test('D claude plugin test: every test of tests/kit passes (skipped without the CLI, or with its rollout switch off)', t => {
  let out
  try {
    out = execFileSync('claude', ['plugin', 'test', mod], { encoding: 'utf8', timeout: 180_000, stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (err) {
    if (err?.code === 'ENOENT') return t.skip('the claude CLI is not installed')
    out = `${err?.stdout ?? ''}${err?.stderr ?? ''}`
    if (/turned off|rollout switch/i.test(out)) return t.skip('hooks modules are turned off in this process (the rollout switch)')
    assert.fail(`claude plugin test failed:\n${out}`)
  }
  if (/turned off|rollout switch/i.test(out)) return t.skip('hooks modules are turned off in this process (the rollout switch)')
  const pass = Number(/(\d+) pass/.exec(out)?.[1] ?? 0)
  assert.match(out, /\b0 fail/)
  assert.ok(pass >= 10, `${pass} kit tests passed:\n${out}`)
  assert.doesNotMatch(out, /\(fail\)/)
})
