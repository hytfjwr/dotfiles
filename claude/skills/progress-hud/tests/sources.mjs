// the TypeScript sources of a folder, all levels down, as paths (declaration files left out): what build.mjs transpiles and what
// the static scan of security.test.mjs reads
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

export const sources = dir =>
  readdirSync(dir, { withFileTypes: true }).flatMap(d => {
    const p = join(dir, d.name)
    if (d.isDirectory()) return sources(p)
    return /\.tsx?$/.test(d.name) && !d.name.endsWith('.d.ts') ? [p] : []
  })
