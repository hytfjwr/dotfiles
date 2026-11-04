---
name: delegate-research
description: |
  Load this skill BEFORE you start reading files for any investigation whose answer
  is spread across many files or sources (roughly 5+ files or 500+ lines): codebase-wide
  inventories ("list every X", "全部洗い出して", "一覧にして"), "where is Y handled /
  どこで〜しているか", impact analysis before a change ("影響範囲を調べて"), tracing data or
  control flow across modules, and library/API documentation or comparative web research.
  The skill hands the reading to a low-cost Sonnet agent (researcher) while you decompose
  the question, verify evidence, and synthesize — this cuts the expensive model's cost by
  more than half on large investigations, so use it even when the user never mentions
  delegation, Sonnet, or cost. Also triggers explicitly on "researcherに任せて",
  "安いモデルで調査", "調査を委譲して", "delegate this research", "/delegate-research".
  Skip it when the answer sits in one or two files you can read directly, for interactive
  debugging where each finding changes the next question, or for pure design judgment.
user_invocable: true
---

# Delegate Research

問いの設計・検証・統合は親（あなた）、ファイルや資料を読み回る作業は `researcher`（Sonnet）が受け持つ。

## コストの考え方

親のコストは次の 3 つでほぼ決まる。

- 親のコンテキストに入るトークン（ファイル、検索結果、報告）
- 親が書くトークン
- 親のターン数

委譲で安くなるのは、researcher が読む量が「指示書＋報告＋検証で親が読む量」を大きく上回るときだけ。主な資料が 1-2 ファイルなら、検証で結局読み直すことになるので、最初から自分で読む。

## Step 1: 問いを分解して指示書を書く

下見はディレクトリ構成の確認程度にとどめる（`ls`、`fd`）。`rg` の結果を大量にコンテキストへ入れない。中身を読む作業は researcher に任せる。

良い問いには、期待する答えの形（一覧の列、yes/no と根拠、フロー）と探索の起点がある。網羅系の問いでは「無効になっている定義・条件付きの定義・重複」も問いに含める。漏れや誤りはそこに出やすい。

```markdown
作業ディレクトリ: {絶対パス}

# {調査名}
## 目的
この結果を何の判断に使うか（1-2 行）
## 質問
1. {質問}（答えの形: 例「表: キー | モード | 動作 | file:line」）
## 範囲
- 起点: {ディレクトリ、キーワード、URL}
- 対象外: {見なくてよいもの}
## 報告の形
- 各主張に file:line（Web なら URL）。コードの引用は必要な 1-2 行まで
- 一覧を求める質問では全件を表にする（件数だけで済ませない）。件数を書くときは、数えた方法（rg -c など）を添える
- 推測は「推測:」と明記する
```

独立した問いは指示書を分け、researcher を同じメッセージで並列に起動する。1 エージェントあたり 3-5 問が目安。

## Step 2: 起動する

Agent tool に `subagent_type: "researcher"` と `name`（例: `research-keymaps`）を付け、指示書を渡す。報告を待って検証するので `run_in_background: true` は付けない（並列に起動するときも同じメッセージに並べて foreground で待つ）。`researcher` が無い環境では `subagent_type: "general-purpose"` と `model: "sonnet"` を使い、指示書の冒頭に次を書く:「read-only。各主張に file:line か URL を付ける。事実と推測を分ける。見つからなければ探し方とともにそう報告する。報告は簡潔に」。

researcher はあなたの会話を知らない。ユーザーから聞いた前提は指示書に書く。

## Step 3: 検証する

もっともらしい誤りを拾うのが目的。読む量は絞る。

1. 結論を左右する主張を 3-5 件選び、1 回の Bash でまとめて確かめる（`sed -n '10,20p' file; rg -n 'pattern' file` を `;` でつなぐ）。ファイルを全文読み直さない
2. 件数や一覧の網羅性は、`rg -c` などで機械的に数え直して照合する
3. 「見つからなかった」報告は、探し方が妥当かを見る
4. 「推測」は事実に格上げしない。判断に必要なら追加調査で確かめる

穴や誤りがあれば、SendMessage で同じ researcher に追加の質問を送る（何が足りないか、どこを探すか）。1-2 箇所の確認で済むなら自分で確かめる。3 往復で埋まらなければ、ユーザーに状況を伝えて判断を仰ぐ。

## Step 4: 統合して報告する

ユーザーの元の問いに答える形で、自分の言葉で組み立て直す。根拠（file:line、URL）と、事実・推測の区別は残す。「全部洗い出して」「一覧にして」と頼まれたら、全件を file:line 付きで載せる。件数やファイル単位の要約、「主なもの」に縮めない。検証を通った researcher の表はそのまま使ってよい。要約に書く件数は、表の行数と一致しているか確かめてから書く。分からなかったことは、分からなかったと書く。

delegate-impl の前段（影響範囲や既存パターンの調査）として使い、その結果を実装指示書の材料にするのが典型的な連携。
