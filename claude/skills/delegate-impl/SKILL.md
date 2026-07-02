---
name: delegate-impl
description: |
  Delegate implementation work to a low-cost Sonnet agent (implementer) while the
  expensive parent model does the thinking: design, detailed instruction writing,
  and independent verification of the deliverable. Use this skill BY DEFAULT for any
  coding task whose design can be pinned down before writing code — implementing a
  feature, adding a command/option/module, multi-file changes, writing tests, or
  mechanical refactors across many files — even when the user never mentions
  delegation, Sonnet, or cost. Also triggers explicitly on "Sonnetに実装させて",
  "委譲して", "安いモデルで実装", "implementerに任せて", "delegate this implementation",
  "/delegate-impl". Do not use it for exploratory debugging, design discussions,
  questions, code review, or trivial 1-2 line edits (the skill body explains how
  to judge borderline cases).
user_invocable: true
---

# Delegate Impl

実装作業をコストの低い Sonnet エージェント（`implementer`）に委譲し、親モデル（あなた）は設計・指示・検証に専念するワークフロー。

**役割分担の原則**: 考える仕事（コードリーディング、設計判断、指示書作成、成果物検証）は高コストなあなたの仕事。手を動かす仕事（指示をコードに変換する作業）は implementer の仕事。この分業が成立するかは指示書の品質だけで決まる。implementer は設計判断をしない前提なので、指示書に判断の余地を残すとそこで止まるか、質の低い成果物になる。

## ワークフロー

```
ユーザーの実装依頼
      │
      ▼
 Step 1: 設計と指示書作成（あなた）
      │
      ▼
 Step 2: implementer 起動（Sonnet）
      │
      ▼
 Step 3: 成果物の検証（あなた）
      │
   問題あり ──► Step 4: 差分指示で再委譲（最大3回）──┐
      │              ▲                            │
   合格            └────────────────────────────┘
      ▼
 完了報告
```

## Step 1: 設計と指示書の作成

委譲する前に、あなた自身が実装できるレベルまでタスクを理解する。関連コードを読み、設計判断（どのファイルをどう変えるか、どのパターンに従うか、エッジケースをどう扱うか）をすべて済ませる。ここを省くと、判断の穴が implementer への丸投げになり、委譲の意味がなくなる。

理解が済んだら、以下のテンプレートで指示書を作成する。分量の目安: implementer が一切コードベースの設計判断をせずに済む詳細度。ファイルパス・関数名・型は実在するものを正確に書く（指示書の前提が実コードとずれていると implementer は停止する）。

```markdown
# 実装指示書: {タスク名}

## 目的
何のための変更か（1-3行。implementer が細部の判断に迷ったとき立ち返る基準になる）

## 変更内容
ファイルごとに具体的に：
### {path/to/file.ts}
- どの関数・箇所に、何を、どう変更するか
- 新しいコードの構造（複雑な場合はシグネチャやコードスケッチを示す）
- 従うべき既存パターン（例:「エラーは errors.ts の GitError を使う」）

## やらないこと
範囲外を明示（例:「他ファイルのリファクタリングはしない」「テストの追加は不要」）。
implementer はここに書かれていない拡大解釈をしない前提で動く。

## 検証方法
implementer 自身に実行させるコマンド（例: pnpm run typecheck, pnpm test src/core/git.test.ts）

## 完了条件
検証可能なチェックリスト形式で
```

タスクが独立した複数部分に分かれ、かつ互いのファイルが重ならない場合は、指示書を分割して複数の implementer を同一メッセージで並列起動してよい。ファイルが重なる場合は直列にする。

## Step 2: implementer の起動

Agent tool で `subagent_type: "implementer"` を指定し、指示書全文をプロンプトとして渡す。`implementer` タイプが利用できない環境では、`subagent_type: "general-purpose"` + `model: "sonnet"` で代替し、プロンプト冒頭に「指示書にあることだけを実装する。曖昧な点は推測せず質問として報告して止まる。範囲外の変更（リファクタリング・ついでの改善）はしない」という行動契約を明記する。エージェントに名前を付けておく（例: `name: "impl-auth"`）。再指示のときに SendMessage で同じエージェントに送ると、前回の作業コンテキストを保持したまま修正させられるため。

プロンプトの冒頭に作業ディレクトリと、リポジトリ固有の注意（CLAUDE.md の要点、使うべきツールやコマンド）を添える。implementer はあなたの会話コンテキストを一切持たないことを忘れない — 指示書に書かれていない情報は存在しないのと同じ。

## Step 3: 成果物の検証

implementer の完了報告を鵜呑みにしない。エージェントは自分の仕事を過大評価する傾向があり、報告と実態のずれを見つけるのがこのステップの目的。あなた自身で以下を行う：

1. **diff を読む**: `git diff` で実際の変更を確認し、指示書の項目と1対1で突き合わせる
2. **範囲外変更のチェック**: 指示していない変更が混じっていないか
3. **検証コマンドの再実行**: implementer の報告を信用せず、typecheck・テストを自分で実行する
4. **完了条件のチェック**: 指示書の完了条件を一つずつ検証する

すべて合格なら完了。ユーザーに、実装内容・検証結果・委譲の往復回数を報告する。

## Step 4: 修正ループ

問題を見つけたら、**自分で直したくなる衝動を抑えて**差分指示を書く（自分で直すと委譲のコスト削減が消える。ただし1-2行の自明な修正は例外的に自分で直してよい）。

差分指示には以下を含め、SendMessage で同じ implementer に送る。名前付きエージェントや SendMessage が使えない環境（サブエージェント内から実行している場合など）では、新しい implementer を起動し、差分指示に前回の指示書の要点＋現在のコード状態を含めて渡す（新しいエージェントは前回のやりとりを知らない）：

```markdown
# 修正指示（{N}回目）

## 検証で見つかった問題
1. {ファイル:行} — 何が指示とどう違うか、期待される状態
2. ...

## 修正方法
問題ごとに具体的な修正内容

## 再検証
実行するコマンド
```

修正完了後、Step 3 の検証を繰り返す。**3回のループで合格しない場合**は無限往復を避け、ユーザーに状況を報告して判断を仰ぐ（自分で引き取って修正する / 指示書を書き直して仕切り直す / スコープを縮小する）。

## ガイドライン

- **委譲すべきでないタスクを見分ける**: 探索的なデバッグ、設計そのものが不明な調査タスク、1-2ファイルの数行変更（指示書を書くコストが実装コストを上回る）は委譲せず自分でやる。委譲が効くのは「設計は明確で、手数が多い」実装作業
- **指示書の失敗はあなたの失敗**: implementer が質問で止まったり期待とずれた成果物を出した場合、まず指示書の曖昧さを疑う。再指示の際は該当箇所を具体化する
- **implementer の「提案」の扱い**: 完了報告に範囲外の改善提案が含まれていたら、採用するかはあなたが判断し、採用するなら次の指示書に含める。implementer に判断させない
- **検証の独立性**: implementer の自己申告（「テスト通りました」）を検証の代わりにしない。必ず自分でコマンドを実行する
- **commit はユーザーの指示があるときだけ**: implementer には commit させず、最終検証を通った状態であなたが（ユーザーの意向に従って）行う
