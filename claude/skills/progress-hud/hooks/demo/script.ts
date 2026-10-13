import type { Lang } from '../core/config'

// the /hud-demo script as data (DESIGN 5.12.1): two bars (a plan and a flat list), ten agents, a question, a failure, a plan that
// changes on the way, and both bars done, in about 12 seconds. Bars and agents carry demo ids; nothing here touches files or $.
// `bar` steps are inputs of the progress tool; the others are what the engine would report about an agent.
export type DemoStep =
  | { at: number; kind: 'bar'; input: Record<string, unknown> }
  | { at: number; kind: 'spawn'; bar: string; id: string; title: string; model: string; effort?: string; parent?: string }
  | { at: number; kind: 'tool'; id: string; tool: string }
  | { at: number; kind: 'end'; id: string; ok: boolean; output?: number }

export const DEMO_MS = 12_000
export const DEMO_PLAN = 'demo-plan'
export const DEMO_TODO = 'demo-todo'

const TEXT = {
  ja: {
    plan: '注文モジュール改修',
    todo: 'リリースノート',
    stages: [
      ['調査', ['ルート確認', '依存洗い出し', '変更点の整理']],
      ['実装', ['スキーマ', 'マイグレーション', 'エンドポイント', 'バリデーション']],
      ['検証', ['テスト', 'ビルド']],
    ],
    added: 'ログ出力',
    steps: ['変更の収集', '下書き', '確認', '公開'],
    ask: '公開してよいですか？',
    failed: '2件失敗',
    agents: ['ルート調査', 'サービス一覧', '依存関係の調査', 'import 解析', 'スキーマ確認', 'テスト実行', '変更の収集', 'コミット分類', '下書き作成', 'リンク確認'],
  },
  en: {
    plan: 'Orders module',
    todo: 'Release notes',
    stages: [
      ['Analysis', ['Read routes', 'Find dependencies', 'List changes']],
      ['Build', ['Table schema', 'Migration', 'Endpoints', 'Validation']],
      ['Verify', ['Tests', 'Build']],
    ],
    added: 'Logging',
    steps: ['Collect changes', 'Draft', 'Review', 'Publish'],
    ask: 'Publish it?',
    failed: '2 failed',
    agents: ['Route scan', 'Service list', 'Dependency scan', 'Import graph', 'Schema check', 'Run tests', 'Collect changes', 'Group commits', 'Draft notes', 'Check links'],
  },
} as const

const HAIKU = 'claude-haiku-4-5-20251001'
const SONNET = 'claude-sonnet-5-5'

export function demoScript(lang: Lang): DemoStep[] {
  const x = TEXT[lang]
  const stages = x.stages.map(([name, steps]) => ({ name, steps: steps.map(title => ({ title })) }))
  const [s1, s2, s3] = stages
  const a = (n: number) => `demo-a${n}`
  const title = (n: number) => x.agents[n - 1] ?? `agent ${n}`
  const spawn = (at: number, n: number, bar: string, model = HAIKU, effort?: string, parent?: number): DemoStep => ({
    at, kind: 'spawn', bar, id: a(n), title: title(n), model, ...(effort ? { effort } : {}), ...(parent ? { parent: a(parent) } : {}),
  })
  const tool = (at: number, n: number, name: string): DemoStep => ({ at, kind: 'tool', id: a(n), tool: name })
  const end = (at: number, n: number, ok = true, output = 800): DemoStep => ({ at, kind: 'end', id: a(n), ok, output })
  const plan = (at: number, input: Record<string, unknown>): DemoStep => ({ at, kind: 'bar', input: { id: DEMO_PLAN, ...input } })
  const todo = (at: number, input: Record<string, unknown>): DemoStep => ({ at, kind: 'bar', input: { id: DEMO_TODO, ...input } })

  return [
    plan(0, { title: x.plan, stages }),
    todo(0, { title: x.todo, kind: 'todo', stages: [{ name: x.todo, steps: x.steps.map(t => ({ title: t })) }] }),
    spawn(400, 1, DEMO_PLAN),
    spawn(600, 2, DEMO_PLAN, SONNET, 'medium'),
    spawn(800, 7, DEMO_TODO),
    spawn(1000, 8, DEMO_TODO),
    tool(1200, 1, 'Grep'),
    tool(1300, 2, 'Read'),
    spawn(1500, 3, DEMO_PLAN),
    tool(1700, 7, 'Bash'),
    spawn(2000, 4, DEMO_PLAN, HAIKU, undefined, 3),
    tool(2200, 3, 'Glob'),
    plan(2500, { next: true }),
    end(2600, 1),
    tool(2800, 4, 'Grep'),
    spawn(3000, 5, DEMO_PLAN),
    spawn(3200, 9, DEMO_TODO, SONNET, 'low'),
    todo(3500, { next: true }),
    end(3600, 7),
    tool(3800, 8, 'Read'),
    plan(4200, { done: [s1?.steps[1]?.title ?? ''], active: s2?.steps[0]?.title }),
    end(4300, 2),
    spawn(4600, 6, DEMO_PLAN),
    spawn(4800, 10, DEMO_TODO),
    tool(5000, 5, 'Read'),
    todo(5300, { state: 'needs_input', note: x.ask }),
    end(5700, 8),
    end(6000, 4, false),
    tool(6200, 6, 'Bash'),
    todo(6600, { next: true }),
    plan(7200, { failed: s2?.steps[1]?.title, note: x.failed }),
    plan(8000, { stages: [s1, { name: s2?.name ?? '', steps: [...(s2?.steps ?? []), { title: x.added }] }, s3] }),
    end(8300, 3),
    end(8600, 5),
    end(8800, 9),
    tool(9000, 6, 'Edit'),
    plan(9300, { next: true }),
    end(9600, 6),
    end(9800, 10),
    todo(10200, { next: true }),
    plan(11000, { state: 'done' }),
    todo(11500, { state: 'done' }),
  ]
}
