---
name: apply-review
description: |
  Analyze and apply PR review feedback using GitHub CLI (gh). Fetches review comments from a pull request,
  understands what reviewers are requesting, expresses agreement or disagreement with reasoning,
  and applies necessary code changes for agreed-upon feedback.
  Use this skill when the user mentions PR reviews, review feedback, applying review comments,
  or says things like "apply review", "fix review comments", "address PR feedback",
  "handle review", "respond to review", "/apply-review".
  Also trigger when the user references a specific PR that has review comments to address.
user_invocable: true
---

# Apply Review

PR のレビューフィードバックを GitHub CLI (gh) で取得・分析し、レビュワーの意図を理解した上で対応を行うスキル。

## Workflow

### Step 1: 対象 PR を特定する

ユーザーが PR 番号や URL を指定していない場合は、現在のブランチに関連する PR を探す。

```bash
# 現在のブランチの PR を取得
gh pr view --json number,title,url,headRefName,state

# PR 番号を指定して取得する場合
gh pr view <PR_NUMBER> --json number,title,url,headRefName,state
```

PR が見つからない場合はユーザーに確認する。

### Step 2: レビューコメントを取得する

PR に対するレビューコメントをすべて取得する。

```bash
# レビューコメントを取得（インラインコメント）
gh api repos/{owner}/{repo}/pulls/<PR_NUMBER>/comments --jq '.[] | {id: .id, path: .path, line: .line, body: .body, user: .user.login, created_at: .created_at, in_reply_to_id: .in_reply_to_id}'

# PR レビュー（全体コメント・approve/request changes）を取得
gh api repos/{owner}/{repo}/pulls/<PR_NUMBER>/reviews --jq '.[] | {id: .id, body: .body, state: .state, user: .user.login}'
```

コメントがない場合は、その旨をユーザーに伝えて終了する。

### Step 3: レビューフィードバックを分析する

取得したコメントを以下の観点で分析する：

1. **スレッドの整理**: `in_reply_to_id` を使ってコメントのスレッドをグループ化し、議論の文脈を把握する
2. **レビュワーの意図の理解**: 各コメント（またはスレッド）について、レビュワーが具体的に何を求めているのかを特定する
3. **分類**: 各フィードバックを以下のカテゴリに分類する
   - コード修正の要求（バグ、ロジックの問題）
   - リファクタリングの提案（可読性、構造の改善）
   - スタイル・規約に関する指摘
   - 質問・確認事項
   - 設計方針に関する議論

### Step 4: 各フィードバックに対する見解を述べる

各コメントに対して、以下の形式で見解をユーザーに提示する：

```
### [ファイルパス:行番号] レビュワー: @username
> レビューコメントの内容

**判断: 賛成 / 反対**
**理由**: なぜ賛成または反対なのかを簡潔に説明

（賛成の場合）**対応方針**: どのように修正するかの概要
（反対の場合）**代替案**: 反対する場合の代替提案や議論ポイント
```

判断の基準：
- コードの正しさ、保守性、可読性の向上につながるか
- プロジェクトの規約や慣例に沿っているか
- 過剰な修正や不必要な複雑さを導入しないか

反対する場合でも、レビュワーの視点を尊重し、建設的な対話を促す表現を心がける。

### Step 5: ユーザーの確認を得る

見解の一覧を提示した後、ユーザーに確認を求める：
- 全体として問題なければそのまま修正を進める
- 個別に判断を変更したい場合はユーザーの指示に従う

ユーザーが確認なしで進めてよいと事前に指示している場合は、このステップをスキップして賛成のフィードバックをすべて適用する。

### Step 6: コード修正を適用する

賛成と判断した（またはユーザーが同意した）フィードバックについて、必要最小限のコード修正を行う。

修正時の注意事項：
- 対象ファイルを必ず先に読んでから修正する
- レビューで指摘された箇所のみを修正し、関係のない変更を加えない
- 修正がプロジェクトのコーディング規約に従っていることを確認する
- 修正によって既存の機能が壊れないよう注意する

### Step 7: 対応内容をサマライズする

すべての修正が完了したら、以下の形式でサマリーを出力する：

```
## レビュー対応サマリー

### 対応済み
- [ファイルパス:行番号] 修正内容の簡潔な説明

### 未対応（反対）
- [ファイルパス:行番号] 反対理由の簡潔な説明

### 未対応（質問・議論）
- [ファイルパス:行番号] 対応が必要な議論ポイント
```

## Important Guidelines

- レビューコメントを取得する前に、必ず対象の PR が存在し、open 状態であることを確認する
- `gh` コマンドの認証が必要な場合はユーザーに案内する
- 大量の修正が必要な場合は、まずサマリーを提示してからユーザーの確認を得る
- コミットは自動的に行わない。修正完了後、ユーザーがコミットするかどうかを判断する
- resolved 済みのコメントは対応不要として扱うが、ユーザーが指定した場合は対応する
