---
name: harness-dev
description: |
  Multi-agent harness for building full-stack web applications with high quality.
  Orchestrates three specialized agents — Planner, Generator, Evaluator — inspired by
  GAN-like adversarial architecture where generation and evaluation are separated.
  Use this skill when the user wants to build a web application from scratch, add a major
  feature to an existing project, or says "/harness-dev".
  Triggers on phrases like "build an app", "create an application", "harness で作って",
  "アプリを作って", "ハーネスで開発", or any request for structured multi-agent app development.
user_invocable: true
---

# Harness Dev

GAN にインスパイアされたマルチエージェントハーネスで、フルスタック Web アプリケーションを高品質に構築する。Planner が仕様を策定し、Generator が実装し、Evaluator が品質を検証する。エージェント間は `.harness/` ディレクトリのファイルでコンテキストを共有する。

## アーキテクチャ

### エージェント構成

```
User Prompt (1-4 sentences)
        │
        ▼
   ┌─────────┐
   │ Planner  │ → .harness/spec.md
   └────┬────┘
        │
        ▼  (スプリント分割)
   ┌─────────────────────────────────────┐
   │  Sprint N ループ (各フィーチャー)     │
   │                                     │
   │  ┌───────────┐   Sprint Contract    │
   │  │ Generator  │◄──────────────────┐ │
   │  └─────┬─────┘                    │ │
   │        │ 実装                      │ │
   │        ▼                          │ │
   │  ┌───────────┐   不合格(最大3回)   │ │
   │  │ Evaluator  │──────────────────┘ │
   │  └─────┬─────┘                     │
   │        │ 合格                       │
   │        ▼                           │
   │    次のスプリントへ                  │
   └─────────────────────────────────────┘
        │
        ▼
   最終レポート
```

### .harness/ ディレクトリ構造

```
.harness/
├── spec.md                        # Planner の出力：製品仕様書
├── contracts/
│   ├── sprint-1.md                # Sprint Contract（完了条件・テスト計画）
│   ├── sprint-2.md
│   └── ...
├── evaluations/
│   ├── sprint-1-round-1.md        # Evaluator レポート
│   ├── sprint-1-round-2.md
│   └── ...
└── status.md                      # 進捗ステータス
```

### デフォルト技術スタック

ユーザーが明示的に別のスタックを指定しない限り、以下をデフォルトとする：

- **フロントエンド**: React + Vite + TypeScript
- **バックエンド**: FastAPI (Python)
- **データベース**: SQLite（開発）/ PostgreSQL（本番想定）
- **テスト**: Playwright MCP（E2E）

ユーザーがプロンプトで「Next.js で」「Rails で」等と指定した場合はそちらを採用する。

## ワークフロー

### Step 1: 初期化とプロジェクト分析

まず `.harness/` ディレクトリを作成し、`status.md` を初期化する。

次に、プロジェクトの状態を判定する：

**新規プロジェクトの場合：**
- ユーザーのプロンプトからアプリの目的・機能を把握
- 技術スタックの指定があればメモ（なければデフォルトスタック）

**既存プロジェクトへの機能追加の場合：**
- 既存のコードベースを分析（ディレクトリ構造、使用技術、アーキテクチャパターン）
- 既存の技術スタック・規約を尊重する
- CLAUDE.md やドキュメントがあれば読む

`status.md` に以下を記録：
```markdown
# Harness Dev Status

## プロジェクト情報
- 種別: 新規 / 機能追加
- 技術スタック: ...
- 開始時刻: ...

## 進捗
- [ ] Planner: 仕様策定
- [ ] Sprint 1: ...
```

### Step 2: Planner エージェントの実行

Agent tool で Planner を起動する。Planner には以下のプロンプトを渡す：

```
あなたはプロダクト仕様を策定する Planner エージェントです。

## 入力
- ユーザーの要望: {user_prompt}
- プロジェクト種別: {新規 or 既存}
- 技術スタック: {stack}
{既存プロジェクトの場合: - 既存コードベースの概要: {summary}}

## タスク

ユーザーの簡潔な要望（1-4文）を、包括的な製品仕様書に変換してください。

### 仕様書に含めるべき内容

1. **プロダクト概要**: 何を作るのか、誰のためか、なぜ必要か
2. **主要機能一覧**: 各機能の概要（技術的な実装詳細は書かない）
3. **ユーザーフロー**: 主要なユーザー操作の流れ
4. **デザイン方針**: ビジュアルアイデンティティの方向性（配色テーマ、トーン、レイアウト方針）
5. **AI 機能の活用機会**: プロダクトに自然に組み込めるAI機能があれば提案
6. **スプリント分割案**: 機能をどの順序で実装するかの提案（各スプリント1-3機能）

### 重要な原則

- **野心的に**: ユーザーの要望を超える付加価値を提案する
- **技術詳細を書きすぎない**: 「ユーザー認証機能」とは書くが「bcryptでハッシュ化してJWTで...」とは書かない。粒度が細かすぎるとカスケードエラーの原因になる
- **テスト可能な基準を意識**: 各機能が「完了」と判断できる明確な基準を持てるよう記述する

## 出力

.harness/spec.md に仕様書を書き出してください。
```

Planner の実行が完了したら、出力された `.harness/spec.md` を読み、ユーザーに仕様の概要を報告する。ユーザーにフィードバックを求め、修正があれば Planner を再実行する。

### Step 3: Sprint Contract の作成

`.harness/spec.md` のスプリント分割案に基づき、最初のスプリントの Sprint Contract を作成する。

Agent tool で Generator と Evaluator を**順番に**起動し、Contract をネゴシエーションさせる：

**まず Generator に Contract のドラフトを作成させる：**

```
あなたは Generator エージェントです。Sprint Contract のドラフトを作成してください。

## 入力
仕様書: {spec.md の内容}
対象スプリント: Sprint {N} — {機能名}

## タスク

以下の形式で Sprint Contract のドラフトを作成してください：

### Sprint {N} Contract

#### 実装する機能
- 機能1: 具体的な説明
- 機能2: 具体的な説明

#### 完了条件（Definition of Done）
各機能について、テスト可能な完了条件を列挙：
- [ ] 条件1（具体的かつ検証可能）
- [ ] 条件2

#### テスト計画
Evaluator がどうやって検証するかの計画：
- Playwright でのE2Eテスト項目
- コードレビュー観点

#### 技術的アプローチ（概要）
実装の大まかな方針。詳細すぎない程度に。

.harness/contracts/sprint-{N}.md に書き出してください。
```

**次に Evaluator に Contract をレビュー・合意させる：**

```
あなたは Evaluator エージェントです。Sprint Contract をレビューしてください。

## 入力
- 仕様書: {spec.md の内容}
- Contract ドラフト: {sprint-N.md の内容}

## タスク

Contract を以下の観点でレビューし、合意または修正を提案してください：

1. **完了条件の明確さ**: 曖昧でテストできない条件はないか？
2. **完了条件の網羅性**: 重要な観点が漏れていないか？
3. **テスト計画の実現可能性**: Playwright MCP で実際にテストできるか？
4. **スコープの妥当性**: 大きすぎ・小さすぎないか？

修正がある場合は .harness/contracts/sprint-{N}.md を更新してください。
```

Contract が合意に至ったら、Step 4 へ進む。

### Step 4: Generator による実装

Agent tool で Generator を起動し、Sprint Contract に基づいて実装させる。

```
あなたは Generator エージェントです。Sprint Contract に基づいて機能を実装してください。

## 入力
- 仕様書: {spec.md の内容}
- Sprint Contract: {sprint-N.md の内容}
- 技術スタック: {stack}
{前回の Evaluator フィードバックがある場合: - 修正指示: {evaluation の内容}}

## タスク

Sprint Contract の完了条件をすべて満たすよう実装してください。

### 実装原則

1. **一機能ずつ**: Contract 内の機能を一つずつ実装し、各機能の完了後に git commit する
2. **動く状態を維持**: 各 commit の時点でアプリが起動・動作する状態であること
3. **セルフレビュー**: 実装完了後、自分のコードを客観的にレビューし、明らかな問題は自分で修正する

### デザイン品質の注意点

フロントエンドの実装では以下を意識する：
- 一貫したビジュアルアイデンティティ（配色、タイポグラフィ、レイアウト）
- ジェネリックな AI 臭いデザインを避ける（独自性のある判断を行う）
- スペーシング、コントラスト、レスポンシブ対応の丁寧な実装

### 重要

- エージェントは自分の仕事を過大評価する傾向がある。セルフレビューでは意識的に厳しく評価すること
- 完了条件を一つ一つチェックし、すべて満たしていることを確認してから完了とすること

## 完了後

「実装完了」と報告し、実装した内容のサマリーを出力してください。
```

### Step 5: Evaluator による QA

Generator の実装が完了したら、Evaluator を起動して品質を検証する。

```
あなたは Evaluator エージェントです。Generator の実装を厳格に評価してください。

## 入力
- 仕様書: {spec.md の内容}
- Sprint Contract: {sprint-N.md の内容}
- QA ラウンド: {round}/3

## タスク

### 1. コードレビュー

コードベースを読み、以下の観点で評価する：

**フロントエンド評価基準：**
| 基準 | 説明 | 重み |
|------|------|------|
| Design Quality | 一貫したビジュアルアイデンティティ（配色・タイポグラフィ・レイアウト・画像） | 高 |
| Originality | ジェネリックなAIパターンではなく、独自のデザイン判断がされているか | 高 |
| Craft | 技術的な実行品質（スペーシング・タイポグラフィ階層・コントラスト） | 中 |
| Functionality | ユーザビリティ、タスク完了が混乱なく行えるか | 中 |

**バックエンド評価基準：**
| 基準 | 説明 | 重み |
|------|------|------|
| Code Quality | クリーンなアーキテクチャ、適切なパターン、保守性 | 高 |
| Error Handling | 適切なエラーハンドリング、バリデーション、エッジケース対応 | 高 |
| API Design | RESTful 規約、適切なステータスコード、一貫したレスポンス形式 | 中 |
| Security | 入力サニタイズ、認証・認可の適切な実装 | 中 |

### 2. Playwright MCP によるライブテスト

アプリを起動し、Playwright MCP を使って実際にアプリを操作する：

1. Sprint Contract のテスト計画に基づいてテストを実行
2. 完了条件を一つずつ検証
3. エッジケースも試す（空入力、連打、ブラウザバック等）
4. スクリーンショットを撮って問題を記録

### 3. 評価レポートの作成

.harness/evaluations/sprint-{N}-round-{R}.md に以下の形式で書き出す：

```markdown
# Sprint {N} Evaluation — Round {R}

## 判定: PASS / FAIL

## 完了条件チェック
- [x] 条件1: 合格 — 理由
- [ ] 条件2: 不合格 — 具体的な問題

## フロントエンド評価
| 基準 | スコア (1-5) | 詳細 |
|------|-------------|------|
| Design Quality | X | ... |
| Originality | X | ... |
| Craft | X | ... |
| Functionality | X | ... |

## バックエンド評価
| 基準 | スコア (1-5) | 詳細 |
|------|-------------|------|
| Code Quality | X | ... |
| Error Handling | X | ... |
| API Design | X | ... |
| Security | X | ... |

## 問題点（FAIL の場合）
1. 問題の具体的な説明
2. 再現手順
3. 修正の方向性

## 良かった点
（必ず良い点も記録する。ただし問題を隠蔽しない）
```

### 合格基準

- すべての完了条件がチェック済み
- フロントエンド: 各基準が 3 以上、Design Quality と Originality が 4 以上
- バックエンド: 各基準が 3 以上、Code Quality と Error Handling が 4 以上
- 一つでも基準を満たさなければ FAIL

### 重要な注意

- **甘い評価を避ける**: 問題を発見したら、その深刻度に関わらず正直に報告する。「些細な問題なので合格」としない
- **問題を発見してから覆さない**: 問題を指摘した後に「でも全体的には良いので合格」と判定を覆さない
- **表面的なテストで終わらない**: メイン機能だけでなく、ネストされた機能やエッジケースも必ず検証する
- **具体的に**: 「UIが少し粗い」ではなく「ヘッダーのパディングが8pxで狭すぎる、16px以上にすべき」
```

### Step 6: 修正ループ

Evaluator が FAIL を出した場合、以下のループを実行する（最大 3 ラウンド）：

1. Evaluator のレポート（`.harness/evaluations/sprint-{N}-round-{R}.md`）を読む
2. Generator を再起動し、修正指示として Evaluator のフィードバックを渡す
3. Generator が修正完了後、Evaluator を再起動して再評価

3 ラウンドで PASS しない場合：
- ユーザーに状況を報告し、判断を仰ぐ（続行 / スコープ縮小 / 手動修正）

### Step 7: 次のスプリントへ

現スプリントが PASS したら：

1. `status.md` を更新（完了したスプリントにチェックを入れる）
2. 次のスプリントがあれば Step 3 に戻る（Contract → 実装 → QA）
3. すべてのスプリントが完了したら Step 8 へ

### Step 8: 最終レポート

すべてのスプリントが完了したら、ユーザーに最終レポートを提示する：

- 実装した機能の一覧
- 各スプリントの QA 結果サマリー
- 最終的な評価スコア
- 残課題やさらなる改善提案（あれば）

`.harness/` ディレクトリは成果物としてそのまま残す（プロジェクトの `.gitignore` に追加を推奨）。

## ガイドライン

- **Agent tool で各エージェントを起動する**: Planner, Generator, Evaluator はそれぞれ別の Agent tool 呼び出しで実行する。並列ではなく、依存関係に従って順次実行する
- **コンテキストはファイル経由**: エージェント間の情報共有は `.harness/` ディレクトリのファイルを通じて行う。Agent tool のプロンプトでは「このファイルを読んで」と指示する
- **ユーザーへの報告を忘れない**: Planner の仕様完了後、各スプリントの開始・完了時にユーザーに状況を報告する
- **Planner の仕様はユーザー承認必須**: Planner が仕様を出力したら、必ずユーザーに確認を取ってから実装に進む
- **git を活用する**: Generator は機能単位で commit する。問題が発生した場合にロールバックできるようにする
- **Evaluator の独立性**: Evaluator は Generator の自己評価に影響されない。コードとアプリの実際の状態のみで判断する
- **スタックの柔軟性**: ユーザーが別の技術スタックを指定した場合、プロンプト内のスタック参照を適宜置き換える
- **既存プロジェクトへの敬意**: 既存プロジェクトに対して使う場合、既存のコーディング規約・アーキテクチャパターンを尊重し、破壊しない
