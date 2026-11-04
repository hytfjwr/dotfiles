---
name: delegate-impl
description: |
  Load this skill BEFORE you start writing code for a task whose design can be pinned
  down up front and whose implementation volume is large — a feature touching 3+ files,
  roughly 100+ lines of code and tests, writing a test suite, or mechanical edits
  repeated across many files. The skill hands the typing to a low-cost Sonnet agent
  (implementer) while you design, write a decision-level instruction sheet, and verify
  the result; use it even when the user never mentions delegation, Sonnet, or cost.
  Also triggers explicitly on "Sonnetに実装させて", "委譲して", "安いモデルで実装",
  "implementerに任せて", "delegate this implementation", "/delegate-impl". Skip it for
  exploratory debugging, design discussions, questions, code review, or small edits you
  could finish in a few tool calls.
user_invocable: true
---

# Delegate Impl

設計と検証は親（あなた）、コードを書く作業は `implementer`（Sonnet）が受け持つ。

## コストの考え方

親のコストは次の 3 つでほぼ決まる。

- 親のコンテキストに入るトークン（ファイル、diff、エージェントの報告）
- 親が書くトークン（指示書、コード）
- 親のターン数（ターンごとにコンテキスト全体を読み直す）

委譲で安くなるのは、「Sonnet が読み書きする量」が「指示書＋検証で親が読み書きする量」を大きく上回るときだけ。指示書にコードを書くと、親が実装したのと同じコストになる。

委譲しない: 数ファイル・数十行で終わる変更、原因が分からないバグ修正、設計が決まっていない作業。自分で実装する。

## Step 1: 設計して指示書を書く

設計に必要な分だけ読む。変更するファイルの構成と、触る関数・型のシグネチャまでで十分なことが多い。implementer は自分でファイルを読めるので、全文を読み込む必要はない。

指示書には**判断**を書く。implementer が自分で決められる細部（具体的なコード、テストの書き方、import の整理）は書かない。

```markdown
作業ディレクトリ: {絶対パス}
（CLAUDE.md / AGENTS.md があれば最初に読むこと）

# {タスク名}
## 目的
1-2 行
## 設計
- 変更するファイルと、それぞれの責務
- 新しい関数・オプション・データ形式のシグネチャ（名前・引数・戻り値・保存形式）
- 従う既存パターンは場所で示す（例:「エラーは src/errors.js の CliError」）。コードは貼らない
- 振る舞いの判断: 境界値、エラー時の挙動、互換性（古いデータ等）
## テストすべきケース
- 1 行 1 ケース（入力 → 期待結果）。境界とエラー系を必ず含める
## やらないこと
- 範囲外を明示
## 検証
- implementer が実行するコマンド
```

コードを書いてよいのは、文章で書くと誤解されやすい箇所（複雑なアルゴリズム、正確な出力フォーマット）だけ。

独立した部分が複数あり、触るファイルが重ならないなら、指示書を分けて implementer を同じメッセージで並列に起動する。

## Step 2: 起動する

Agent tool に `subagent_type: "implementer"` と `name`（例: `impl-tags`）を付け、指示書を渡す。完了を待って検証するので `run_in_background: true` は付けない。`implementer` が無い環境では `subagent_type: "general-purpose"` と `model: "sonnet"` を使い、指示書の冒頭に次を書く:「指示書の範囲だけを実装する。設計に関わる曖昧さは推測せず質問して止まる。細部は周辺コードに合わせる。範囲外の変更はしない。報告は短く」。

implementer はあなたの会話を知らない。ユーザーから聞いた前提は指示書に書く。

## Step 3: 検証する

報告を信用せず、自分で確かめる。ただし読む量は絞る。

1. 1 回の Bash でまとめて見る: `git status --short && git diff --stat && {テストコマンド} 2>&1 | tail -20`
2. プロダクションコードの diff（`git diff -- src/` など）を読み、設計どおりか、範囲外の変更がないかを確かめる。テストコードは、指示したケースがあるかをテスト名で確かめれば足りる
3. 指示書の境界ケースのうち、壊れると影響が大きいものはテストの有無を確かめる。テストが無ければ自分でコマンドを実行して確かめる

## Step 4: 直す

- 数行で直せる問題は自分で直す。差し戻すと、報告と diff をもう一度読むコストがかかる
- それより大きい問題は、SendMessage で同じ implementer に修正指示を送る。書くのは問題（file:line、期待される状態）と修正方針だけ。SendMessage が使えなければ新しい implementer を起動し、元の指示書の要点も渡す
- 3 回直しても通らなければ、止めてユーザーに相談する

## 完了報告

ユーザーには、実装内容、検証結果（自分で実行したコマンドと結果）、自分で直した箇所を短く伝える。commit はユーザーに頼まれたときだけ、検証が済んでから自分で行う。
