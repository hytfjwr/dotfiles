---
name: cw-herdr
description: herdr の新しいワークスペースで claude-worktree（cw）を起動し、別ブランチの git worktree で動く Claude Code に作業を任せる。「cwで召喚して」「別ワークスペースでClaudeを起こして」「worktreeで並行作業させて」「このタスクを別のClaudeに投げて」「herdrで新しいworkspaceを作って作業させて」など、いま会話している Claude とは別に並行して作業する Claude Code セッションを立てたい依頼では、cw や herdr という語が無くても必ず使う。「/cw-herdr」でも発動。git worktree を作るだけ、herdr の pane を分割するだけ、今のセッションで作業を続ける依頼には使わない。
---

# cw-herdr

いまの会話とは別の Claude Code を、herdr の新しいワークスペース上で、新しいブランチの git worktree に立ち上げるスキル。
役割分担は次のとおり。

- このスキル（あなた）: ブランチ名を決め、召喚先に渡すプロンプトを書き、`cw-herdr` を呼び、結果を報告する
- `cw-herdr` スクリプト（`~/.local/bin/cw-herdr`）: herdr の workspace 作成、cw の投入、Claude 起動確認、JSON での結果返却

herdr と cw の操作をスクリプトに閉じ込めているのは、ID の取り回しや待機処理を毎回組み立てると失敗しやすいから。あなたは `herdr` や `bunx` を直接叩かない。

## 前提

- herdr のサーバーが動いている（あなた自身が herdr の中で動いている必要はない）
- 現在の作業ディレクトリが対象の git リポジトリ内にある。worktree の中でもよい（スクリプトがメインリポジトリを解決する）
- `cw-herdr` が PATH にある（dotfiles の `local_bin/cw-herdr`）

## 手順

### 1. ブランチ名を決める

ユーザーが指定していればそれを使う。無ければタスク内容から自分で決め、確認は取らない。
形式は `<type>/<slug>`。

- type: `feat` / `fix` / `refactor` / `chore` / `docs` / `test` のいずれか
- slug: 英小文字・数字・ハイフンのみ、3〜5 語。日本語のタスクは英語に訳す
- 例: 「stg_orders の重複行を除く」→ `fix/stg-orders-dedupe`

既存ブランチや worktree と衝突したらスクリプトが `-2`, `-3` を付けて回避するので、衝突チェックは不要。

### 2. 召喚先へのプロンプトを書く

召喚先の Claude はこの会話の文脈を一切持たない。あなたが「この修正」「さっきの話」と書いても通じない。
以下を自己完結した文章にする。

```
## 目的
何を達成するか 1〜3 行

## 背景
関連ファイルのパス、既知の原因、参考になる既存コード、ユーザーが言った制約

## 完了条件
検証可能な形で列挙（テストが通る、コマンドの出力がこうなる、など）

## 注意
触ってはいけない範囲、守るべき規約
```

cw は末尾に「不明点はユーザーに確認せよ」という一文を自動で足す。また既定では `-d`（権限確認なし）で起動するので、破壊的操作を避けたい範囲は「注意」に明示する。

### 3. スクリプトを実行する

プロンプトは複数行になるので、heredoc で第 2 引数に渡す。

```bash
cw-herdr <branch> "$(cat <<'EOF'
## 目的
...
EOF
)" [options]
```

ユーザーの言い方と対応するオプション:

| ユーザーの言い方 | オプション |
|---|---|
| 「PR まで作って」 | `--pr` |
| 「Draft PR で」 | `--draft` |
| 「マージまでやって」 | `--merge` |
| 「最新を取ってから」「origin の main から」 | `--pull` |
| 「develop から切って」「base は X」 | `--base X` |
| 「権限確認ありで」「plan mode で」 | `--no-danger` |
| 「モデルは sonnet で」 | `--model sonnet` |
| 「そっちに切り替えて」「すぐ見たい」 | `--focus` |

指定が無いときの既定: base はメインリポジトリのデフォルトブランチ、`-d` 付き、フォーカスは移さない。

実行前に何が起きるか確かめたいときだけ `--dry-run` を付ける。herdr に触らず、解決したブランチ名・base・worktree パス・cw コマンドを JSON で返す。

### 4. 結果を報告する

スクリプトは成功時に標準出力へ 1 行の JSON を返す。それを読んで次の形で報告する。

```
herdr の workspace #<workspace_number>「<label>」で Claude を起動しました。
- ブランチ: <branch>（base: <base>）
- worktree: <worktree_path>
- 依頼内容: <1 行要約>
移動するには herdr のサイドバーから選ぶか `herdr workspace focus <workspace_id>` を実行してください。
```

召喚先の完了は待たない。ユーザーが結果を知りたければ、後で `herdr agent list` や `herdr agent read <pane_id>` で見られると伝える。

## 失敗したとき

スクリプトの exit code で切り分ける。標準エラーに原因が出る。

| exit | 意味 | 対処 |
|---|---|---|
| 2 | 引数エラー | オプションの組み合わせを直す（`--merge` `--draft` `--pr` は排他） |
| 3 | herdr サーバー未稼働 | ユーザーに herdr を起動してもらう |
| 4 | cw を投入したが Claude の起動を確認できなかった | 標準エラーに pane の出力が出る。それをユーザーに見せる。workspace は残っているので、閉じるかは聞く |
| 5 | git の前提エラー（リポジトリ外、base が無い、ブランチ名不正） | メッセージに従って base や cwd を直す |
| 1 | 依存コマンド無し、herdr API 失敗 | メッセージをそのまま伝える |

作成した workspace や worktree をあなたの判断で閉じたり消したりしない。

## やらないこと

- 召喚先 Claude の完了待ちや結果回収
- 複数タスクの同時召喚（頼まれたら 1 つずつ順に実行する）
- `herdr` や `bunx @hytfjwr/claude-worktree` の直接操作
