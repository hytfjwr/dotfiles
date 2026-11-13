---
name: herdr-rename
description: いま作業している herdr の workspace の名前（ラベル）を、会話中の作業内容に合わせて付け替える。「workspace名を変えて」「ワークスペース名を作業内容にして」「herdrの名前を今の作業に合わせて」「サイドバーの名前を直して」「/herdr-rename」のように、herdr の workspace 名の変更をユーザーが明示的に頼んだときだけ使う。頼まれていないのに作業の区切りで自分から呼ばない。新しい workspace で Claude を起動する依頼（cw-herdr）、pane やタブの名前の変更、ターミナルのタイトル変更には使わない。
---

# herdr-rename

会話の中身から作業を要約したラベルを決め、このセッションが動いている herdr の workspace を `herdr workspace rename` で付け替える。
ラベル案の確認は取らない。決めたら即 rename して、結果だけ報告する。気に入らなければユーザーがもう一度頼む。

## 1. 対象の workspace を特定する

ユーザーが番号やラベルで別の workspace を指定したとき（「3番を〜に」）は、`herdr workspace list` から該当する `workspace_id` を拾ってそれを使う。
指定が無ければ、このセッション自身の workspace を次の順で探す。

```bash
if [ "${HERDR_ENV:-}" = 1 ] && [ -n "${HERDR_WORKSPACE_ID:-}" ]; then
  echo "$HERDR_WORKSPACE_ID"
else
  herdr agent list | jq -r --arg s "${CLAUDE_CODE_SESSION_ID:-}" \
    '.result.agents[] | select($s != "" and .agent_session.value == $s) | .workspace_id'
fi
```

- herdr の pane の中なら `HERDR_WORKSPACE_ID` がそのまま使える
- 環境変数が無いとき（サブシェルや別ターミナル経由など）は、herdr が認識している Claude のセッション ID と `CLAUDE_CODE_SESSION_ID` を突き合わせる
- `herdr pane current` を `--current` なしで使わない。UI でフォーカスされている pane が返るので、ユーザーが別の workspace を見ていると誤った workspace を改名してしまう

どちらでも見つからなければ rename せず、「この Claude が herdr の中で動いていないため対象が分からない。番号かラベルで指定してほしい」と伝えて終わる。
推測でフォーカス中の workspace を選ばない。

## 2. ラベルを決める

会話全体から「この workspace で何をしているか」を 1 つ決める。最初の依頼ではなく、いま主に取り組んでいる作業を採る。

書式は `<チケットID> <日本語要約>`。

- チケットID: 会話・ブランチ名・PR に Jira / Linear のキー（`ABC-123` など）があればそれ。無ければ GitHub の PR / Issue 番号（`#42`）。どれも無ければ省いて要約だけにする
- 日本語要約: 作業内容の名詞句。「〜の修正」「〜の設計」「〜の調査」のように何をしているかで終える
- 全体で 20 文字程度まで。コード上の識別子（テーブル名・関数名）はそのまま使ってよい
- リポジトリ名は入れない（同じリポジトリの workspace が並ぶと区別の役に立たない）

ブランチ名が手がかりになるときは `git branch --show-current` で確かめてよいが、ブランチ名の直訳ではなくユーザーが読んで分かる言い方にする。

例:

| 作業 | ラベル |
|---|---|
| ABC-123 でログイン処理を別モジュールに切り出している | `ABC-123 ログイン処理の切出し` |
| PR #42 の通知まわりの設計を相談している | `#42 通知設計` |
| チケットなしで lint の指摘を直している | `lint 指摘の修正` |
| AeroSpace の QuickTime のフローティング設定を直している | `QuickTime浮動化の修正` |

## 3. rename する

```bash
herdr workspace rename <workspace_id> '<ラベル>'
```

ラベルにシングルクォートが含まれる場合はエスケープする。
失敗したら stderr をそのままユーザーに見せる。`herdr status server` が running でなければ、herdr サーバーが動いていないと伝える。

## 4. 報告する

結果を herdr から取り直して 1 行で伝える。

```bash
herdr workspace get <workspace_id> | jq -r '.result.workspace | "#\(.number) \(.label)"'
```

```
workspace #<number> を「<旧ラベル>」→「<新ラベル>」に変更しました。
```

旧ラベルは rename 前の `herdr workspace list`（または `get`）の値を使う。

## やらないこと

- 頼まれていないのに自分から rename すること
- 対象が特定できないときにフォーカス中の workspace を推測で選ぶこと
- pane 名（`herdr pane rename`）やタブ名の変更
