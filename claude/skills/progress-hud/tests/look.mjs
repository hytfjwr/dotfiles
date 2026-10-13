// Derived from zycck/claude-mods plugins/plan-progress/tests/look.mjs (commit 549ecee), MIT License, (c) 2026 Kirill Serditov. Modified for progress-hud. See THIRD_PARTY_NOTICES.md.
// renders the bars as the desktop draws them: the track as an image, its hover layer in a sandboxed frame, the strips as images.
// Run after `node build.mjs`; open look.html in a browser (the hover parts work there)
import fs from 'node:fs'
import { S, boot, findAll, st } from './engine.mjs'

const E = await boot({ surfaces: ['desktop'] })
await E.turnComplete({ usage: { output_tokens: 200 } })
await E.measure({ cost: 1 })
await E.call({ id: 'order', title: '注文API改修', stages: [S('調査', st('ルート確認', 'active'), '依存洗い出し'), S('実装', 'エンドポイント', 'バリデーション'), S('検証', 'テスト')] })
await E.spawn('g1', 'ルート調査')
await E.spawn('g2', 'サービス一覧', { model: 'claude-sonnet-5-5' })
await E.spawn('g3', 'import 解析', { parentAgentId: 'g1' })
await E.step('g2', { model: 'claude-sonnet-5-5', effort: 'medium' })
await E.settle()
await E.advance(56_000)
await E.agentTool('g1', 'Grep')
await E.turnComplete({ agentId: 'g2', usage: { output_tokens: 1200 } })
await E.call({ id: 'order', next: true })
await E.call({ id: 'release', title: 'Release notes', stages: [S('Collect', 'Commits', 'Pull requests'), S('Draft', 'Write', 'Review')] })
await E.call({ id: 'release', state: 'needs_input', note: 'Publish it?' })
await E.call({ id: 'quick', title: 'Quick fix', stages: [S('Fix', st('Patch', 'active'), 'Test')] })
await E.advance(252_000)
await E.turnComplete({ usage: { output_tokens: 48_000 } })
await E.measure({ cost: 1.31 })
await E.call({ id: 'quick', state: 'done' })
await E.advance(60_000)

const esc = h => h.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
const img = (s, w, h) => `<img alt="${esc(s.alt)}" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(s.source)}" width="${w}" height="${h}" style="display:block">`
const draw = async columns => {
  const tree = await E.band({ surface: 'desktop', props: { bodyColumns: columns } })
  return findAll(tree, n => n.type === 'Box' && String(n.props.key).startsWith('bar-'))
    .map(row => {
      const [track, hover, ...strips] = findAll(row, n => n.type === 'Svg').map(n => n.props)
      const title = findAll(row, n => n.type === 'Text').map(n => n.children.join('')).slice(0, 2).join(' ')
      return (
        `<div style="position:relative;margin:8px 0;width:${track.width}px"><div style="font:12px sans-serif;color:#aaa">${title}</div>` +
        `<div style="position:relative">${img(track, track.width, track.height)}${strips.map(s => img(s, s.width, s.height)).join('')}` +
        `<iframe sandbox="" srcdoc="${esc(hover.source)}" width="${hover.width}" height="${hover.height}" style="border:0;position:absolute;top:0;left:0"></iframe></div></div>`
      )
    })
    .join('')
}
const html = `<h4 style="color:#aaa;font:13px sans-serif">120 columns</h4>${await draw(120)}<h4 style="color:#aaa;font:13px sans-serif">40 columns (narrow)</h4>${await draw(40)}`
fs.writeFileSync(new URL('./look.html', import.meta.url), `<!doctype html><html style="color-scheme:dark"><head><meta charset="utf-8"></head><body style="background:#1f1e1d;padding:10px;zoom:1.3">${html}</body></html>`)
console.log(`wrote look.html (${html.length} characters)`)
