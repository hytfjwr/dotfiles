---
name: delegate-research
description: |
  Delegate research and investigation work to a low-cost Sonnet agent (researcher)
  while the expensive parent model does the thinking: decomposing the question,
  verifying evidence, and synthesizing the answer. Use this skill BY DEFAULT for
  any investigation that involves reading many files or sources and whose questions
  can be pinned down up front — codebase investigations ("how does X work", "where
  is Y handled"), impact analysis before a change, tracing data/control flow,
  library or API documentation research, and comparative research — even when the
  user never mentions delegation, Sonnet, or cost. Also triggers explicitly on
  "調査して", "調べて", "researcherに任せて", "安いモデルで調査",
  "delegate this research", "/delegate-research". Do not use it for single-fact
  lookups answerable with one grep, interactive debugging where each finding
  changes the next question, or pure design judgment (the skill body explains how
  to judge borderline cases).
user_invocable: true
---

# Delegate Research

調査作業をコストの低い Sonnet エージェント（`researcher`）に委譲し、親モデル（あなた）は問いの設計・検証・統合に専念するワークフロー。

**役割分担の原則**: 「何を知る必要があるか」を決める仕事（問いの分解、調査指示書の作成、報告の検証、結果の統合と判断）は高コストなあなたの仕事。「答えを探し回る」仕事（大量のファイルを開く、grep の試行錯誤、ドキュメントの読み込み）は researcher の仕事。委譲の成否は問いの具体性で決まる。曖昧な問い（「認証まわりを調べて」）は曖昧な報告しか生まない。

## ワークフロー

```
ユーザーの調査依頼
      │
      ▼
 Step 1: 問いの分解と調査指示書作成（あなた）
      │
      ▼
 Step 2: researcher 起動（Sonnet・並列可）
      │
      ▼
 Step 3: 報告の検証（あなた）
      │
   穴・矛盾あり ──► Step 4: 追加調査の指示（最大3回）──┐
      │                  ▲                          │
   十分                └──────────────────────────┘
      ▼
 統合してユーザーに報告
```

## Step 1: 問いの分解と調査指示書の作成

ユーザーの依頼を「researcher が答えを探せる具体的な問い」に分解する。良い問いには2つの条件がある: 期待する答えの形が指定されている（一覧 / yes-no と根拠 / フロー説明 / 比較表）こと、探索の起点がある（ディレクトリ、キーワード、URL）こと。

指示書を書く前に1-2分の下見（エントリポイントや用語の確認程度）をすると問いの精度が上がる。ただし下見で調査自体を始めない — ファイルを深く読む作業こそ委譲する対象。

```markdown
# 調査指示書: {調査名}

## 調査の目的
この調査結果が何の判断に使われるか（1-3行。researcher が回答の粒度を決める基準になる）

## 質問
1. {具体的な質問}（期待する答えの形: 一覧 / フロー説明 / yes-no と根拠 など）
2. ...

## 調査範囲
- 起点: {ディレクトリ、ファイル、キーワード、URL}
- 対象外: {見なくてよい範囲}

## 制約
- read-only（ファイル変更・状態変更コマンドは禁止）
- {リポジトリ固有の注意（CLAUDE.md の要点など）}
```

問いが互いに独立している場合は、指示書を分割して複数の researcher を同一メッセージで並列起動する。調査は read-only なのでファイル競合の心配がなく、implementer より積極的に並列化してよい。ただし1つの researcher に質問を詰め込みすぎない（目安: 1エージェントあたり3-5問）。

## Step 2: researcher の起動

Agent tool で `subagent_type: "researcher"` を指定し、指示書全文をプロンプトとして渡す。`researcher` タイプが利用できない環境では、`subagent_type: "general-purpose"` + `model: "sonnet"` で代替し、プロンプト冒頭に行動契約を明記する:「すべての回答に根拠（file:line / URL / コマンド出力）を付ける。事実と推測を区別して明記する。見つからない場合は探し方とともに『見つからなかった』と報告する。read-only 厳守」。

エージェントには名前を付ける（例: `name: "research-auth"`）。追加調査のとき SendMessage で同じエージェントに送ると、調査済みのコンテキストを保持したまま深掘りさせられるため。

プロンプトには作業ディレクトリも添える。researcher はあなたの会話コンテキストを一切持たない — ユーザーとのやりとりで得た前提・制約・専門用語は、指示書に書かない限り存在しないのと同じ。

## Step 3: 報告の検証

researcher の報告を鵜呑みにしない。低コストモデルの調査で最も危険なのは「もっともらしいが間違っている報告」で、それを見抜くのがこのステップの目的。

1. **根拠の抜き取り検証**: 次の判断を左右する重要な主張について、引用された file:line を自分で開き、主張どおりの内容か確認する。全件でなくてよいが、間違っていたとき最も高くつく主張は必ず確認する
2. **カバレッジの確認**: 「見つからなかった」という報告は、探し方（検索パターン・見た場所）が妥当かを見る。探し方が浅ければ追加調査へ
3. **矛盾チェック**: 並列起動した researcher 間で報告が食い違っていないか
4. **推測の格上げ禁止**: 「推測」とマークされた回答を事実としてユーザーに流さない。判断に必要な推測は追加調査で事実に変える

## Step 4: 追加調査ループ

穴・矛盾を見つけたら、**自分で調べたくなる衝動を抑えて**追加の調査指示を書き、SendMessage で同じ researcher に送る（1-2ファイル開けば済む確認は例外的に自分でやってよい）。SendMessage や名前付きエージェントが使えない環境では、新しい researcher を起動し、前回の調査結果の要点＋追加質問を渡す（新しいエージェントは前回のやりとりを知らない）。

```markdown
# 追加調査指示（{N}回目）

## 前回の報告で不足していた点
1. {質問} — 何が足りないか / どこが疑わしいか

## 追加の質問
具体的に（期待する答えの形も）

## 探索のヒント
前回の探し方で漏れていそうな場所・パターン
```

**3回のループで問いに答えきれない場合**は無限往復を避け、ユーザーに状況を報告して判断を仰ぐ（自分で引き取って調べる / 問いを立て直す / スコープを縮小する）。

## 統合と報告

検証を通った事実を統合し、**ユーザーの元の問いに答える形で**報告する。researcher の報告の転送ではなく、あなたの言葉で構成し直す。ただし根拠（file:line、URL）は保持する。事実と推測の区別も保持し、調査で答えが出なかった部分は正直にそう書く — 「分からなかったこと」はそれ自体が調査の成果。

## ガイドライン

- **委譲すべきでないタスクを見分ける**: 1回の grep や1ファイルで答えが出る単発の事実確認（指示書を書くコストが調査コストを上回る）、発見のたびに次の問いが変わる対話的なデバッグ、判断そのものが問われている相談（情報収集は委譲できるが、判断はあなたの仕事）は委譲しない。委譲が効くのは「問いは明確で、読む量が多い」調査
- **delegate-impl との連携**: 実装前の影響調査・既存パターン調査を delegate-research で行い、その結果を delegate-impl の実装指示書の材料にする連鎖が典型的な使い方
- **浅い報告は問いの失敗**: researcher の報告が浅い・ずれている場合、まず指示書の問いの曖昧さを疑う。追加調査では質問を具体化する
- **Web 調査も委譲できる**: ライブラリのドキュメント調査や比較調査は、起点となる URL や検索キーワードを指示書に書いて委譲する。バージョン依存の情報は「対象バージョンを確認して回答に含める」ことを質問に含める
