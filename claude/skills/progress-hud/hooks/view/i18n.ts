import type { Lang } from '../core/config'

// the words of the band and the commands (DESIGN appendix A); {x} marks a value filled in by t()
const ja = {
  'state.running': '実行中',
  'state.needs_input': '入力待ち',
  'state.error': 'エラー',
  'state.done': '完了',
  'state.idle': '待機中',
  'bar.tasks': 'タスク',
  'bar.plan': 'プラン',
  'bar.agents': 'エージェント',
  'agent.starting': '起動中',
  'agent.approval': '承認待ち',
  'agent.done': '完了',
  'agent.failed': '失敗',
  'agent.stopped': '中断',
  'agent.lost': '不明',
  more: '他 {n} 件（完了 {d}）',
  eta: '残り約{t}',
  'eta.lt1m': '残り1分未満',
  'dur.min': '{m}分',
  'dur.hm': '{h}時間{m}分',
  streak: '{tool} が{n}回連続で失敗',
  'tokens.out': '出力 {v}',
  period: '期間中',
  'toast.done': '✓ {title} 完了 — {metrics}',
  'toast.empty': 'HUD は有効です。複数ステップの作業でバーが出ます',
  'cmd.shown': 'HUD を表示しました',
  'cmd.hidden': 'HUD を隠しました',
  'cmd.compact': 'HUD をコンパクト表示にしました',
  'cmd.full': 'HUD を通常表示にしました',
  'cmd.usage': '使い方: /hud [show|hide|compact|full]',
  'cmd.none': '表示中のバーはありません。/hud-demo でサンプルを表示できます。',
  'cmd.cleared': 'HUD のバーを消しました',
  'cmd.demo': 'サンプルを再生します（約12秒）',
  'cmd.sounds': '音: 決定・エラー・完了（音量 {v}）',
  'cmd.muted': 'ミュート中です（/config の progress-hud.sound）',
  'cmd.desc.hud': 'HUD の表示を切り替える',
  'cmd.desc.clear': 'HUD のバーを消す',
  'cmd.desc.demo': 'サンプルの進捗バーを再生する',
  'cmd.desc.sounds': '決定・エラー・完了の音を鳴らす',
  'alt.bar': '{title}: {stage} {i}/{n}、{pct}%{eta}',
  'alt.done': '{title}: 完了、{n} ステップ、{dur}',
  'alt.hover': '{title}: ホバーで時刻を表示',
  'alt.divider': '区切り線',
  'alt.agent': 'エージェント {title}: {state}、{tool}',
} as const

export type Key = keyof typeof ja

const en: Record<Key, string> = {
  'state.running': 'running',
  'state.needs_input': 'needs input',
  'state.error': 'error',
  'state.done': 'done',
  'state.idle': 'idle',
  'bar.tasks': 'Tasks',
  'bar.plan': 'Plan',
  'bar.agents': 'Agents',
  'agent.starting': 'Starting',
  'agent.approval': 'Needs approval',
  'agent.done': 'Done',
  'agent.failed': 'Failed',
  'agent.stopped': 'Stopped',
  'agent.lost': 'Lost',
  more: '{n} more · {d} done',
  eta: '~{t} left',
  'eta.lt1m': '<1m left',
  'dur.min': '{m}m',
  'dur.hm': '{h}h{m}m',
  streak: '{tool} failed {n}× in a row',
  'tokens.out': 'out {v}',
  period: 'during this bar',
  'toast.done': '✓ {title} done — {metrics}',
  'toast.empty': 'HUD is on. A bar appears when Claude starts multi-step work',
  'cmd.shown': 'HUD shown',
  'cmd.hidden': 'HUD hidden',
  'cmd.compact': 'HUD set to compact',
  'cmd.full': 'HUD set to full',
  'cmd.usage': 'Usage: /hud [show|hide|compact|full]',
  'cmd.none': 'No bars yet. /hud-demo shows a sample.',
  'cmd.cleared': 'HUD bars removed',
  'cmd.demo': 'Playing a sample (about 12 s)',
  'cmd.sounds': 'Sounds: decision, error, done (volume {v})',
  'cmd.muted': 'Muted (progress-hud.sound in /config)',
  'cmd.desc.hud': 'Show or hide the HUD',
  'cmd.desc.clear': 'Remove the HUD bars',
  'cmd.desc.demo': 'Play a sample progress bar',
  'cmd.desc.sounds': 'Play the decision, error and done sounds',
  'alt.bar': '{title}: {stage} step {i} of {n}, {pct}%{eta}',
  'alt.done': '{title}: done, {n} steps in {dur}',
  'alt.hover': '{title}: hover for times',
  'alt.divider': 'divider',
  'alt.agent': 'agent {title}: {state}, {tool}',
}

export const TEXT: Record<Lang, Record<Key, string>> = { ja, en }

export const t = (lang: Lang, key: Key, vars: Record<string, string | number> = {}): string =>
  TEXT[lang][key].replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m))

// 3:12, 1:02:03; the same in every language
export function fmtClock(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000))
  const pad = (n: number) => String(n).padStart(2, '0')
  return sec < 3600 ? `${Math.floor(sec / 60)}:${pad(sec % 60)}` : `${Math.floor(sec / 3600)}:${pad(Math.floor((sec % 3600) / 60))}:${pad(sec % 60)}`
}

// the share of steps finished as a whole percent, 0 to 100
export const pctOf = (pos: number, total: number): number => (total <= 0 ? 0 : Math.min(100, Math.max(0, Math.round((pos / total) * 100))))

// '  0%' to '100%', four cells so the column holds still
export const fmtPct = (pct: number): string => `${String(pct).padStart(3, ' ')}%`
