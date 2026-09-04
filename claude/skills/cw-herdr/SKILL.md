---
name: cw-herdr
description: herdr の新しいワークスペースで claude-worktree（cw）を起動し、別ブランチの git worktree で動く Claude Code に作業を任せる。「cwで召喚して」「別ワークスペースでClaudeを起こして」「worktreeで並行作業させて」「このタスクを別のClaudeに投げて」「herdrで新しいworkspaceを作って作業させて」など、いま会話している Claude とは別に並行して作業する Claude Code セッションを立てたい依頼では、cw や herdr という語が無くても必ず使う。「/cw-herdr」でも発動。git worktree を作るだけ、herdr の pane を分割するだけ、今のセッションで作業を続ける依頼には使わない。
---

# cw-herdr

いまの会話とは別の Claude Code を、herdr の新しいワークスペース上で、新しいブランチの git worktree に立ち上げるスキル。

claude-worktree（cw）v0.17.0 で herdr が `-pane` の公式バックエンドになり、`-json` で結果が返るようになった。
以前あったラッパー `~/.local/bin/cw-herdr` は廃止したので、このスキルが cw を直接叩く。
workspace の作成・pane へのコマンド投入・失敗時のロールバックはすべて cw 側が持っているので、`herdr workspace create` と `herdr pane run` で同じことを組み立て直さない。

あなたの仕事は、ブランチ名を決め、召喚先に渡すプロンプトを書き、cw を 1 回実行し、起動を確認して報告すること。

## 前提

- herdr のサーバーが動いている（`herdr status server` が `status: running`。あなた自身が herdr の中にいる必要はない）
- 現在の作業ディレクトリが対象の git リポジトリ内にある。worktree の中でもよい
- `bunx` / `git` / `jq` / `herdr` が使える

zsh の `cw` は `bunx @hytfjwr/claude-worktree` の alias で、非対話シェルでは展開されない。コマンドは必ず `bunx @hytfjwr/claude-worktree` と書く。

Bash の呼び出しごとにシェルが変わるので、シェル変数で値を持ち回れない。各ステップの出力を読み、次のコマンドには実際の値を直接書く。

## 手順

### 1. メインリポジトリと base を解決する

cw は cwd の `git rev-parse --show-toplevel` をリポジトリルートとみなす。worktree の中から実行すると worktree の中にさらに worktree を作ってしまうので、必ずメインリポジトリに `cd` して実行する。
また cw の `-base` 既定は「実行時の現在ブランチ」なので、意図しないブランチが base になるのを避けるため、base は常に明示的に渡す。

ブランチ名の候補（手順 2 の規則で決める）を `CANDIDATE` に入れて、まとめて解決する。

```bash
CANDIDATE=fix/stg-orders-dedupe   # ← 手順 2 で決めた名前に置き換える
ROOT="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"
BASE="$(git -C "$ROOT" symbolic-ref -q --short refs/remotes/origin/HEAD | sed 's|^origin/||')"
if [ -z "$BASE" ]; then
  if git -C "$ROOT" show-ref --verify --quiet refs/heads/main; then BASE=main; else BASE=master; fi
fi
taken() {
  git -C "$ROOT" show-ref --verify --quiet "refs/heads/$1" && return 0
  git -C "$ROOT" show-ref --verify --quiet "refs/remotes/origin/$1" && return 0
  [ -e "$(dirname "$ROOT")/$(basename "$ROOT")-worktrees/${1//\//-}" ]
}
BRANCH="$CANDIDATE"; i=2
while taken "$BRANCH"; do BRANCH="$CANDIDATE-$i"; i=$((i + 1)); done
printf 'root=%s\nbase=%s\nbranch=%s\nworktree=%s\n' "$ROOT" "$BASE" "$BRANCH" \
  "$(dirname "$ROOT")/$(basename "$ROOT")-worktrees/${BRANCH//\//-}"
```

衝突回避を自分でやるのは、`-json` が非対話だから。既存のブランチや worktree に当たると、cw は「消して作り直すか」を聞く代わりに usage エラー（exit 2）で落ちる。
ユーザーが base を指定していれば、解決結果ではなくそれを使う。

### 2. ブランチ名を決める

ユーザーが指定していればそれを使う。無ければタスク内容から自分で決め、確認は取らない。
形式は `<type>/<slug>`。

- type: `feat` / `fix` / `refactor` / `chore` / `docs` / `test` のいずれか
- slug: 英小文字・数字・ハイフンのみ、3〜5 語。日本語のタスクは英語に訳す
- 例: 「stg_orders の重複行を除く」→ `fix/stg-orders-dedupe`

### 3. 召喚先へのプロンプトを書く

召喚先の Claude はこの会話の文脈を一切持たない。あなたが「この修正」「さっきの話」と書いても通じない。
以下を自己完結した文章にして、ファイル（scratchpad ディレクトリ、無ければ `mktemp`）に書く。

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

cw は起動時にこのファイルを読んで中身をコマンドに埋め込むので、cw が返ったあとは消してよい（cw は消さない）。

cw が末尾に足すもの: 「If anything is unclear, always confirm with the user before proceeding.」の一文と、`-pr` / `-draft` / `-merge` を付けたときの後処理手順。
既定では `-d`（`--dangerously-skip-permissions`）で起動するので、破壊的操作を避けたい範囲は「注意」に明示する。

### 4. cw を実行する

```bash
set -o pipefail
cd <ROOT> && CLAUDE_WORKTREE_BACKEND=herdr bunx @hytfjwr/claude-worktree <BRANCH> \
  -plan <PLAN_FILE> -base <BASE> -pane -json -d | tail -n 1
```

`CLAUDE_WORKTREE_BACKEND=herdr` は必須。cw の自動検出が herdr を選ぶのは herdr の pane の中（`HERDR_ENV=1`）だけで、Claude Code の Bash から実行すると `WEZTERM_PANE` / `TMUX` が見えて WezTerm や tmux が選ばれてしまう。

`-json` は stdout に 1 行だけ JSON を出す。bunx の出力が混ざることがあるので `tail -n 1` を通す。人間向けの出力は抑制され、警告は stderr に出る。

```json
{"dryRun":false,"repoRoot":"…","branch":"fix/…","baseBranch":"main","worktreePath":"…","mode":"pane","backend":"herdr","paneId":"w1B:p1","workspaceId":"w1B","claudeCommand":"claude …"}
```

ユーザーの言い方と対応するオプション:

| ユーザーの言い方 | オプション |
|---|---|
| 「PR まで作って」 | `-pr` |
| 「Draft PR で」 | `-draft` |
| 「マージまでやって」 | `-merge` |
| 「最新を取ってから」「origin の main から」 | `-pull` |
| 「develop から切って」「base は X」 | `-base X`（手順 1 の解決結果を上書き） |
| 「権限確認ありで」 | `-d` を外す |
| 「モデルは sonnet で」 | `-model sonnet` |
| 「そっちに切り替えて」「すぐ見たい」 | 起動後に `herdr workspace focus <workspace_id>` |

指定が無いときの既定: `-d` 付き、base は手順 1 で解決した値、フォーカスは移さない（herdr バックエンドは常にいまの workspace にフォーカスを残す。cw に focus オプションは無い）。

気をつけること:

- 召喚先の Claude は plan mode で起動する（cw の既定）。まずプランを出して承認を待つので、最後まで自走させたいならリポジトリの `.claude-worktree.json` に `"permissionMode": "auto-edit"` か `"full-auto"` を置く必要がある、とユーザーに伝える
- `-merge` のマージ先は `-base` の値ではなく「cw 実行時の現在ブランチ」。メインリポジトリでデフォルトブランチ以外を checkout しているときは、base と別のブランチにマージされる
- `-d` を外すと召喚先で Claude Code の信頼確認が出て、ユーザーがその pane で答えるまで進まない
- `-merge` `-draft` `-pr` は排他
- 何が起きるか先に確かめたいときだけ `-dry-run -json`（`-pane` は不要。herdr に触らず、同じ形の JSON を `dryRun: true` で返す）

### 5. Claude が起動したか確認する

cw は pane にコマンドを送った時点で返る。Claude の起動失敗までは見てくれないので確認する。

```bash
PANE=<paneId>
for _ in $(seq 1 30); do
  if herdr agent list | jq -e --arg p "$PANE" \
    '.result.agents[] | select(.pane_id == $p and .agent == "claude")' >/dev/null; then
    echo detected; break
  fi
  sleep 2
done
```

見つからないまま抜けたら、pane の出力を拾ってユーザーに見せる。

```bash
herdr pane read <paneId> --source recent-unwrapped --lines 60
```

このとき workspace と worktree は残っている。閉じるかどうかはユーザーに聞く。自分の判断で閉じたり消したりしない。

### 6. 結果を報告する

workspace の番号とラベルは cw の JSON に入っていないので herdr から取る。

```bash
herdr workspace get <workspaceId> | jq -r '.result.workspace | "#\(.number) \(.label)"'
```

```
herdr の workspace #<number>「<label>」で Claude を起動しました。
- ブランチ: <branch>（base: <baseBranch>）
- worktree: <worktreePath>
- 依頼内容: <1 行要約>
移動するには herdr のサイドバーから選ぶか `herdr workspace focus <workspace_id>` を実行してください。
```

召喚先の完了は待たない。ユーザーが結果を知りたければ、後で `herdr agent list` や `herdr agent read <pane_id>` で見られると伝える。`cw list` でも worktree ごとに `Running … [working]` のように状態が出る。

## 失敗したとき

cw の exit code で切り分ける。原因は stderr に出る。

| exit | 意味 | 対処 |
|---|---|---|
| 2 | usage エラー。オプションの組み合わせ不正、`-json` なのに確認が必要な状態（既存 worktree／既存ブランチ）、`maxWorktrees` 到達 | 手順 1 の衝突チェックをやり直す。既存 worktree を消すかどうかは勝手に決めずユーザーに聞く |
| 3 | git エラー。base が無い、リポジトリ外、detached HEAD | メッセージに従って base や cwd を直す |
| 4 | 依存エラー。herdr の CLI が無い、herdr サーバーが動いていない | `herdr status server` を確認し、起動をユーザーに頼む |
| 5 | postCreate フックの失敗 | フックのエラーをそのまま伝える |
| 6 | slot（ポート 8881-8889）が埋まっている | 不要な worktree の `cw clean` をユーザーに提案する |
| 1 | それ以外 | メッセージをそのまま伝える |

cw が途中で失敗したときは、cw 自身が worktree と herdr の workspace をロールバックする。あなたの後片付けはプロンプトのファイルを消すだけ。
起動確認（手順 5）で見つからないケースは cw 自体は成功しているので、workspace は残る。

## やらないこと

- 召喚先 Claude の完了待ちや結果回収
- 複数タスクの同時召喚（頼まれたら 1 つずつ順に実行する）
- `herdr workspace create` / `herdr pane run` を組み合わせて cw の代わりを自作すること
- 作成した workspace や worktree を自分の判断で閉じる・消すこと
