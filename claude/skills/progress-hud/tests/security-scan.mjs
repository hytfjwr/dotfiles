// the static scan of C2 (DESIGN 9.3, 11.3): finds in a hooks module what a mod may not do. Read by security.test.mjs, which
// also runs it on files made to hold each forbidden thing, to show it finds them.
//
// Comments are left out, and only comments: a line that begins with //, a /* */ block (also across lines). A string, a template
// literal (also one that runs over many lines, and one with a line that begins with //) and a comment after code on the same line
// are scanned, so a token cannot hide in them.
import { ALLOWED } from './allowlist.mjs'

// DESIGN 9.3: the tokens that fail the scan, and the forbidden calls of the second list there
export const TOKENS = [
  ['$.process', /\$\.process\b/],
  ['$.http', /\$\.http\b/],
  ['$.fs.', /\$\.fs\b/],
  ['$.mcp', /\$\.mcp\b/],
  ['$.model', /\$\.model\b/],
  ['$.env.set', /\$\.env\.set\b/],
  ['$.config.set', /\$\.config\.set\b/],
  ['$.settings', /\$\.settings\b/],
  ['$.prompt.*', /\$\.prompt\./],
  ['fetch(', /\bfetch\s*\(/],
  ['import(', /\bimport\s*\(/],
  ['XMLHttpRequest', /XMLHttpRequest/],
  ['WebSocket', /WebSocket/],
  ['eval(', /\beval\s*\(/],
  ['new Function', /\bnew\s+Function\b/],
  ['$.session.send|append|compact|authorize|messages', /\$\.session\.(send|append|compact|authorize|messages)\b/],
  ['$.agent.spawn|register', /\$\.agent\.(spawn|register)\b/],
  ['$.tool.call|check|list', /\$\.tool\.(call|check|list)\b/],
  ['$.command.run|list', /\$\.command\.(run|list)\b/],
  ['$.turn', /\$\.turn\b/],
  ['$.audio.speak', /\$\.audio\.speak\b/],
  ['$.ui.copy|ask|blit|notice|invalidate', /\$\.ui\.(copy|ask|blit|notice|invalidate)\b/],
  ['$.telemetry', /\$\.telemetry\b/],
  // $ itself, or one of its nouns, kept in a name, a pattern or a spread: `= $`, `{ ui } = $`, `= $.ui`, `...$`
  ['$ assigned', /=\s*\$\s*(?:[;,)\]}]|$)/],
  ['$ noun assigned', /=\s*\$\.\w+\s*(?:[;,)\]}]|$)/],
  ['$ spread', /\.\.\.\s*\$(?![\w.])/],
]

const CALL = /\$\.([a-z]+)\.([A-Za-z]+)/g
const NOUN = /\$\.([a-z]+)(?![\w.])/g

// the code of a source as [lineNumber, text]: comments out, everything else kept
export function codeLines(source) {
  const out = []
  let inBlock = false
  let stack = [{ kind: 'code', braces: 0 }] // a template literal, and the code of its ${ } inside it, can run over many lines
  source.split('\n').forEach((raw, i) => {
    let line = raw
    if (inBlock) {
      const end = line.indexOf('*/')
      if (end < 0) return
      inBlock = false
      line = ' '.repeat(end + 2) + line.slice(end + 2)
    }
    const top = stack[stack.length - 1]
    if (stack.length === 1 && top?.kind === 'code') {
      const t = line.trimStart()
      if (t.startsWith('//')) return
      if (t.startsWith('/*')) {
        const end = t.indexOf('*/', 2)
        if (end < 0) {
          inBlock = true
          return
        }
        line = ' '.repeat(line.length - t.length + end + 2) + t.slice(end + 2)
      }
    }
    // where the line leaves the stack of contexts
    for (let k = 0; k < line.length; k++) {
      const c = line[k]
      const ctx = stack[stack.length - 1]
      if (!ctx) break
      if (ctx.kind === 'tpl') {
        if (c === '\\') k++
        else if (c === '`') stack.pop()
        else if (c === '$' && line[k + 1] === '{') {
          stack.push({ kind: 'code', braces: 0 })
          k++
        }
      } else if (c === '`') stack.push({ kind: 'tpl', braces: 0 })
      else if (c === "'" || c === '"') {
        for (k++; k < line.length && line[k] !== c; k++) if (line[k] === '\\') k++
      } else if (c === '/' && line[k + 1] === '/') break
      else if (c === '/' && line[k + 1] === '*') {
        const end = line.indexOf('*/', k + 2)
        if (end < 0) {
          inBlock = true
          break
        }
        k = end + 1
      } else if (ctx.kind === 'code' && stack.length > 1) {
        if (c === '{') ctx.braces++
        else if (c === '}') {
          if (ctx.braces === 0) stack.pop()
          else ctx.braces--
        }
      }
    }
    out.push([i + 1, line])
  })
  return out
}

// what in a source is not allowed: [{ line, rule, text }]
export function scanSource(source) {
  const found = []
  for (const [line, text] of codeLines(source)) {
    for (const [rule, re] of TOKENS) if (re.test(text)) found.push({ line, rule, text: text.trim() })
    for (const m of text.matchAll(CALL)) if (!ALLOWED.includes(`${m[1]}.${m[2]}`)) found.push({ line, rule: `$.${m[1]}.${m[2]} is not on the allow list`, text: text.trim() })
    for (const m of text.matchAll(NOUN)) found.push({ line, rule: `$.${m[1]} alone (a noun of $ passed or kept)`, text: text.trim() })
  }
  return found
}

// the $ member accesses of the code of a source (for "only register.tsx touches $")
export const touchesDollar = source => codeLines(source).some(([, text]) => /\$\.[a-z]/.test(text))
