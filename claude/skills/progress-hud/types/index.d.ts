export type StepStatus = 'pending' | 'active' | 'done' | 'error' | 'skipped'
export type HudStep = {
  title: string
  status: StepStatus
  doneAt?: number          // done / skipped になった時刻（所要時間と ETA に使う）
  taskId?: string          // X1: TaskCreate の id
}
export type HudStage = { name: string; steps: HudStep[] }
export type BarState = 'running' | 'needs_input' | 'error' | 'done'
export type BarSource = 'tool' | 'tasks' | 'plan' | 'agents' | 'demo'
export type Meter = {
  input: number; output: number; cacheRead: number; cacheWrite: number
  costUsd: number | null   // session.measure の累計。台帳がなければ null
}
export type AgentState = 'running' | 'waiting' | 'done' | 'error'
export type AgentRun = {
  id: string
  title: string
  state: AgentState
  tool: string             // 表示する語（ツール名、または i18n 済みの「起動中」「承認待ち」「完了」など）
  startedAt: number
  endedAt: number | null
  depth: 0 | 1
  model?: string
  effort?: string
  calls: number            // X4（記録は P0）
  errors: number
  streak: number
  output: number           // 出力トークン（turn.complete の usage）
}
export type Bar = {
  id: string
  rev: number              // 変更のたびに +1。描画キャッシュのキー
  title: string
  kind: 'plan' | 'todo'
  source: BarSource
  stages: HudStage[]
  state: BarState
  note: string | null
  startedAt: number
  endedAt: number | null
  updatedAt: number
  meterStart: Meter
  meterEnd: Meter | null
  agents: AgentRun[]
  agentsDoneAt: number | null
  mainErrors: number       // X4（記録は P0）
  mainStreak: number
  lastErrorTool: string | null
  collapsed: boolean       // P1
}
export type TimelineTone = 'info' | 'ok' | 'warn' | 'error'
export type TimelineEntry = { at: number; tone: TimelineTone; text: string; barId?: string; key?: string; count?: number }
export type HudView = { isOpen: boolean; density: 'full' | 'compact' }
export type HudEnv = {
  themeName: string | null   // P1: $.config.list() の theme 行の値
  hasTerminal: boolean       // session.start 時の $.session.surfaces() に terminal が含まれるか
}
export type SessionGauge = {
  startedAt: number | null
  contextPercent: number | null
  fiveHourPercent: number | null
}

declare module 'claude-code' {
  interface PluginState {
    'progress-hud': {
      bars: Shaped<Bar[]>              // atom の shape は 'bars-v1'。スキーマを変えたら v2 にする
      view: HudView
      meter: Meter
      gauge: SessionGauge
      agentHome: Record<string, string>  // agentId → barId（再読込でも残す）
      timeline: TimelineEntry[]          // P1
      env: HudEnv
      tick: number                       // ターミナルの時計用。terminal の描画だけが読む
    }
  }
}
