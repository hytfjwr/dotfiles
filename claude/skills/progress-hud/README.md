# progress-hud

Claude Code のプロンプト直上に、Claude が進めている作業の進捗バーと、その下で動くサブエージェントのストリップを出す mod です。`zycck/claude-mods` の `plan-progress`（MIT）を土台に作り直しています（`THIRD_PARTY_NOTICES.md`）。

## 機能（P0）

- **バー**: ステージ / ステップ、4 状態（実行中・入力待ち・エラー・完了）、割合、経過時間。ターン外は「待機中」と淡色で出す。
- **自動ミラー**: Claude 組み込みの `TaskCreate` / `TaskUpdate` / `TodoWrite` をそのままバー `tasks` に映す（追加のトークンなし）。
- **`progress` ツール**: ステージを持つ作業向け（`mcp__progress-hud__progress`）。使い方はモデル向けの `skills/progress-hud/SKILL.md`。
- **Plan mode**: 承認した計画をバー `plan` に取り込む。
- **エージェントのストリップ**: 起動中・承認待ち・完了・失敗、モデルと effort、使っているツール、経過時間。
- **タスク単位のメトリクス**: 経過時間・出力トークン・コストの差分と、完了トースト。
- **表示**: ターミナルは 1/8 ブロックのバーと日本語幅の計算、狭幅と compact、ステータス行への縮約。デスクトップは SVG のトラック（ホバーで時刻、CSS 時計）。
- **ターミナルのアニメーション**: 実行中のバーのタイトルを光の帯が流れ（シマー）、状態記号がブライユ点字のスピナーになり、塗りの先頭がきらめき、完了すると 600 ms だけ白く光って落ち着く。約 8 fps（125 ms ごと）で、動いているものがあるときだけ動く。`animation=false` で止まり、従来どおり 1 秒ごとの再描画になる。desktop は CSS アニメなので対象外。
- **サウンド**: コード内で合成したチャイム 3 種（決定・エラー・完了）。音量・ミュート・連打抑止つき。
- **保存**: バーはセッションごとに `$.store` へ保存し、再開で復元（30 セッションまで、`/clear` 対応）。

## コマンド

| コマンド | 動作 |
|---|---|
| `/hud [show\|hide\|compact\|full]` | 表示の切り替え。`compact` / `full` は保存される |
| `/hud-clear [id]` | 全バー、または指定したバーを消す |
| `/hud-demo` | 約 12 秒のサンプル（ファイルは書かない） |
| `/hud-sounds` | 3 種のサウンドを順に鳴らす |

フッターの **HUD** ボタンでも帯を出し入れできます。

## 設定（`/config` の userConfig）

| キー | 既定 | 意味 |
|---|---|---|
| `sound` | true | チャイムの有効 / 無効 |
| `volume` | 60 | 0〜100 |
| `language` | ja | `ja` / `en` / `auto`（`LANG` に従う） |
| `nudge` | soft | モデルへの促し: `off` / `soft`（リマインドのみ）/ `strict`（編集ゲートと Stop の差し戻し） |
| `sessionMetrics` | desktop | セッション全体の行（経過・コスト・ctx・5h）: `off` / `desktop` / `all` |
| `maxBars` | 3 | 同時に出すバー数（1〜5） |
| `toastOnDone` | true | 完了トースト |
| `statusLine` | auto | 帯を隠したときのステータス行への縮約: `auto` / `always` / `off` |
| `animation` | true | ターミナルのアニメーション（シマー・スピナー・きらめき・完了の光）。false で止まる |

## 対象ビルドと注意

- 対象は Claude Code 2.1.288（function hooks / mods、early access）。API はビルド更新で変わりうるので、更新後は `claude plugin validate` とテストを回してください（`tests/README.md`）。
- **plan-progress と併用すると表示が二重になります。** 名前は衝突しないので動きますが、本 mod が動いたら plan-progress は無効化を推奨します。
- 置き場所は `~/.claude/skills/progress-hud/`（フォルダに `.claude-plugin/plugin.json` があれば自動でロードされ、保存で再読込）。

## 実機で未確認の事項

自動テストと `claude plugin test`（公式キット、実エンジン）は通っていますが、対話セッションでの見た目と動作は確かめていません。

- V1: 対話セッションで `progress-hud@skills-dir` がロードされること
- V3: Text の `color` に生の hex（`#7858CA` など）が通ること（キットの木の検証は通過、見た目は未確認）
- V4: `$.audio.play` の base64 WAV が鳴ること
- V5: `$.ui.status` がデスクトップでも出ること
- V6: ターミナルの tick でデスクトップが再描画されないこと、デスクトップでちらつかないこと
- V15: `●` `█` `░` `┊` `⚙` と、スピナーの点字（`⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏`）の表示幅（端末の ambiguous 幅の設定次第）
- V16: デスクトップの 1 カラムあたりの px（本 mod は 8 を仮定）
- V21: アニメーションのちらつきと CPU 使用率（WezTerm と Ghostty）

## セキュリティ方針

ネットワーク通信、外部コマンドの実行、任意パスへの書き込みをしません（`$.process` `$.http` `$.fs` などを使わない）。永続化は `$.store`（エンジンが管理するプラグイン専用の JSON）だけで、キーは `bars:<sessionId>` と `prefs`、保存するのはモデルが付けたタイトルと数値だけです（ツールの入力は保存しない）。

エンジン側で起きる書き込みは次のとおりです。`$.store` は `~/.claude/plugins/store/` 配下（推定）。`/config` で設定を変えると、エンジンが `~/.claude/settings.json` の `pluginConfigs` に書きます。`$.audio.play` はエンジンが macOS で `afplay` を使って再生します（mod が外部コマンドを起動するわけではありません）。`$.audio.speak`（`say`）は使いません。

この方針は自動で検査しています: `claude plugin validate` の `calls:` の許可リスト照合、`hooks/**` の静的スキャン、`$.store` のキーと保存値の検査（`tests/security.test.mjs`）。
