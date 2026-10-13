// Derived from zycck/claude-mods plugins/plan-progress/tests/compile.cjs (commit 549ecee), MIT License, (c) 2026 Kirill Serditov. Modified for progress-hud. See THIRD_PARTY_NOTICES.md.
// transpiles hooks/**/*.ts(x) into tests/.build/**/*.mjs: relative imports get .mjs, 'claude-code' becomes tests/stub.mjs
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sources } from './sources.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const hooks = join(here, '..', 'hooks')
const out = join(here, '.build')
const require = createRequire(import.meta.url)

// TypeScript is not a dependency of the mod: a local or global package, the path in TYPESCRIPT,
// or the copy a mise-managed node keeps under its own install directory
function loadTypescript() {
  const tried = []
  const attempt = id => {
    try {
      return require(id)
    } catch {
      tried.push(id)
    }
  }
  if (process.env.TYPESCRIPT) return attempt(process.env.TYPESCRIPT) ?? fail(tried)
  const found = attempt('typescript')
  if (found) return found
  const nodes = join(process.env.MISE_DATA_DIR ?? join(homedir(), '.local', 'share', 'mise'), 'installs', 'node')
  const installs = existsSync(nodes) ? readdirSync(nodes).sort().reverse() : []
  for (const v of installs) {
    const dir = join(nodes, v, 'lib', 'node_modules', 'typescript')
    if (existsSync(dir)) return attempt(dir) ?? fail(tried)
  }
  return fail(tried)
}
function fail(tried) {
  console.error(`build: cannot load typescript (tried ${tried.join(', ')}); set TYPESCRIPT to its path`)
  process.exit(1)
}
const ts = loadTypescript()

rmSync(out, { recursive: true, force: true })
let count = 0
for (const src of sources(hooks)) {
  const dest = join(out, relative(hooks, src).replace(/\.tsx?$/, '.mjs'))
  const stub = relative(dirname(dest), join(here, 'stub.mjs'))
  const js = ts
    .transpileModule(readFileSync(src, 'utf8'), {
      fileName: src,
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, jsxFactory: 'h' },
    })
    .outputText.replace(/(\bfrom\s+|\bimport\s+)(['"])([^'"]+)\2/g, (m, kw, q, spec) => {
      if (spec === 'claude-code') return `${kw}${q}${stub.startsWith('.') ? stub : './' + stub}${q}`
      return spec.startsWith('.') && !/\.[cm]?js$/.test(spec) ? `${kw}${q}${spec}.mjs${q}` : m
    })
  mkdirSync(dirname(dest), { recursive: true })
  writeFileSync(dest, js)
  count++
}
console.log(`built ${count} files into ${relative(process.cwd(), out) || '.'}`)
