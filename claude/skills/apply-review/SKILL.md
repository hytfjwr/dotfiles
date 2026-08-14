---
name: apply-review
description: |
  Analyze and apply PR review feedback using GitHub CLI (gh). Fetches review threads
  (including resolved/outdated status) from a pull request, understands what reviewers
  are requesting, expresses agreement or disagreement with reasoning, applies code changes
  for agreed-upon feedback, and can optionally reply to threads and resolve them on GitHub.
  Use this skill when the user mentions PR reviews, review feedback, applying review comments,
  or says things like "apply review", "fix review comments", "address PR feedback",
  "handle review", "respond to review", "レビュー対応して", "レビューコメントを反映して",
  "レビュー指摘を直して", "/apply-review".
  Also trigger when the user references a specific PR that has review comments to address.
user_invocable: true
---

# Apply Review

PR のレビューフィードバックを GitHub CLI (gh) で取得・分析し、レビュワーの意図を理解した上で対応を行うスキル。

レビュー対応の価値は「指摘を機械的に全部直す」ことではなく、「各指摘の妥当性を判断し、正しいものだけを正しく直す」ことにある。レビュワー（人間・bot 問わず）の指摘は間違っていることもあるため、必ず自分の見解を持ってから対応する。

## Workflow

### Step 1: 対象 PR を特定する

ユーザーが PR 番号や URL を指定していない場合は、現在のブランチに関連する PR を探す。

```bash
# 現在のブランチの PR を取得
gh pr view --json number,title,url,headRefName,state

# PR 番号を指定して取得する場合
gh pr view <PR_NUMBER> --json number,title,url,headRefName,state
```

PR が見つからない場合は `gh pr list` で候補を提示し、ユーザーに確認する。PR が open でない場合はその旨を伝え、続行するか確認する。

### Step 2: レビューフィードバックを取得する

フィードバックは 3 種類あり、それぞれ取得方法が異なる。

**1. インラインのレビュースレッド**（GraphQL を使う）

REST API (`pulls/comments`) ではスレッドの resolved / outdated 状態が取れないため、必ず GraphQL の `reviewThreads` を使う。スレッド構造もネイティブに取得でき、`in_reply_to_id` からの手動再構築が不要になる。

```bash
gh api graphql --paginate \
  -f query='
query($owner: String!, $repo: String!, $pr: Int!, $endCursor: String) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $pr) {
      reviewThreads(first: 50, after: $endCursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          isResolved
          isOutdated
          path
          line
          comments(first: 30) {
            nodes {
              databaseId
              author { login }
              body
              createdAt
            }
          }
        }
      }
    }
  }
}' -F owner='{owner}' -F repo='{repo}' -F pr=<PR_NUMBER>
```

`--paginate` を付けないとスレッドが 50 件を超える PR で取りこぼしが発生する。

**2. レビュー全体のコメント**（approve / request changes 時の本文）と **3. conversation タブのコメント**

```bash
gh pr view <PR_NUMBER> --json reviews,comments \
  --jq '{reviews: [.reviews[] | {author: .author.login, state: .state, body: .body}], comments: [.comments[] | {author: .author.login, body: .body}]}'
```

フィードバックが 1 件もない場合は、その旨をユーザーに伝えて終了する。

### Step 3: フィードバックを分析する

取得したフィードバックを以下の観点で分析する：

1. **対応対象の絞り込み**:
   - `isResolved: true` のスレッドは対応済みとして除外する（ユーザーが明示的に指定した場合を除く）
   - `isOutdated: true` のスレッドは、指摘対象のコードがすでに変更されている。現在のコードを読んで指摘がまだ当てはまるか確認し、解消済みなら対応不要と判断する
2. **レビュワーの意図の理解**: 各スレッドについて、レビュワーが具体的に何を求めているのかを特定する。指摘箇所のファイルを実際に読み、指摘の妥当性を自分で検証する
3. **suggestion ブロックの識別**: コメント本文に ` ```suggestion ` ブロックが含まれる場合、それはレビュワーが提案する具体的な置き換えコード。賛成する場合は原則そのまま適用する（他の変更と競合する場合を除く）
4. **分類**: 各フィードバックを以下のカテゴリに分類する
   - コード修正の要求（バグ、ロジックの問題）
   - リファクタリングの提案（可読性、構造の改善）
   - スタイル・規約に関する指摘
   - 質問・確認事項
   - 設計方針に関する議論

bot レビュワー（Copilot、CodeRabbit 等）のコメントも人間と同じ基準で妥当性を検証する。bot の指摘は網羅的だが誤検知も多いため、鵜呑みにせず反対すべきものには反対する。

### Step 4: 各フィードバックに対する見解を述べる

各スレッドに対して、以下の形式で見解をユーザーに提示する：

```
### [ファイルパス:行番号] レビュワー: @username
> レビューコメントの内容（長い場合は要点を抜粋）

**判断: 賛成 / 部分的に賛成 / 反対 / 要回答（質問）**
**理由**: なぜその判断なのかを簡潔に説明

（賛成の場合）**対応方針**: どのように修正するかの概要
（反対の場合）**代替案**: 反対する場合の代替提案や議論ポイント
（要回答の場合）**回答案**: レビュワーへの回答の下書き
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

- 対象ファイルを必ず先に読んでから修正する
- suggestion ブロックがある指摘は、その内容をそのまま適用する（周辺コードとの整合性は確認する）
- レビューで指摘された箇所のみを修正し、関係のない変更を加えない
- 修正がプロジェクトのコーディング規約に従っていることを確認する
- 修正完了後、プロジェクトに lint やテストのコマンドがあれば実行し、修正が既存の機能を壊していないことを検証する

### Step 7: 対応内容をサマライズする

すべての修正が完了したら、以下の形式でサマリーを出力する：

```
## レビュー対応サマリー

### 対応済み
- [ファイルパス:行番号] 修正内容の簡潔な説明

### 未対応（反対）
- [ファイルパス:行番号] 反対理由の簡潔な説明

### 未対応（質問・議論）
- [ファイルパス:行番号] 対応が必要な議論ポイントと回答案
```

### Step 8: GitHub 上で返信・resolve する（ユーザーが明示的に依頼した場合のみ）

返信の投稿は外部に公開されるアクションのため、勝手に実行しない。ユーザーが「返信して」「resolve して」と依頼した場合、投稿する文面を提示して確認を得てから実行する。

```bash
# インラインコメントへの返信（COMMENT_ID は Step 2 の databaseId）
gh api repos/{owner}/{repo}/pulls/<PR_NUMBER>/comments/<COMMENT_ID>/replies -f body='返信内容'

# スレッドを resolve する（THREAD_ID は Step 2 の GraphQL で取得した id）
gh api graphql -f query='
mutation($threadId: ID!) {
  resolveReviewThread(input: {threadId: $threadId}) { thread { isResolved } }
}' -f threadId=<THREAD_ID>
```

対応した指摘への返信は「修正しました」だけでなく、どう修正したかを一言添えるとレビュワーが再確認しやすい。反対した指摘には修正せずに理由を返信し、resolve はレビュワーに委ねる。

## Important Guidelines

- レビューコメントを取得する前に、必ず対象の PR が存在することを確認する
- `gh` コマンドの認証が必要な場合はユーザーに案内する
- 大量の修正が必要な場合は、まずサマリーを提示してからユーザーの確認を得る
- コミット・プッシュは自動的に行わない。修正完了後、ユーザーがコミットするかどうかを判断する
- resolved 済みのコメントは対応不要として扱うが、ユーザーが指定した場合は対応する
