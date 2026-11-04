# claude-statusline

Claude Code 用のカスタムステータスライン。Rust 製。

![statusline](https://github.com/user-attachments/assets/f7aac4ac-e11c-4749-9493-226c432e31c4)

## 表示内容

| 行 | 項目 | 説明 |
|----|------|------|
| 1 | 󰚩 モデル名 | 使用中のモデル（太字・系統別の色。Opus=紫 / Sonnet=青 / Fable=琥珀 / Haiku=緑） |
| 1 |  fast mode | `/fast` が有効なときだけ表示 |
| 1 |  effort | エフォートレベル（low / medium / high / xhigh / max。低=寒色→高=暖色） |
| 1 |  thinking | 拡張思考。無効時は暗く表示 |
| 1 |  ブランチ | ブランチ名 + 変更行数（+/-） |
| 1 | $ コスト | セッションの累積コスト（0 のときは非表示） |
| 2 |  ctx | コンテキストウィンドウ使用率 |
| 2 |  5h | 5時間レートリミット使用率（リセットまでの残り時間付き。[データ元](#使用率のデータ元)） |
| 2 |  7d | 7日間レートリミット使用率（リセットまでの残り時間付き。[データ元](#使用率のデータ元)） |
| 2 |  モデル別枠 | Fable など per-model の週次枠（[データ元](#使用率のデータ元)） |

ゲージは 10 セル幅のサブブロック精度バー（`▏▎▍▌▋▊▉█`）で、端のセルが 1/8 単位で
埋まるため 80 段階の分解能がある。

## アニメーション

コマンドの再実行は **1 秒が下限**（`statusLine.refreshInterval` は
`Math.max(1, n)` で丸められ、1 未満は zod に弾かれて周期更新自体が止まる）。
そこで 2 系統を組み合わせている。

**1 Hz：位置の進行**（現在時刻から導いたフレーム番号に依存）

- **シマー**: 塗りつぶし部分を 3 セル幅のハイライトが左から右へ走る。
  1 フレームで 2 セル進むので、更新が 1 Hz でも動きとして読める。
  ゲージごとに位相をずらしてある
- **危険域の明滅**: 85% 以上で ％ の色が 1 秒ごとに明滅する（blink 非対応端末向けのフォールバック）

**サブ秒：端末側の blink**（SGR 5 / 6。WezTerm はイージング付きフェードを `animation_fps` で描く）

- **マーチング**: バーの 1 つ飛ばしのセルに blink を付け、その偶奇をフレームごとに反転させる。
  300ms で明暗が入れ替わりつつ 1 秒ごとにパターンが march する
- **アラート**: 85% 以上でゲージのアイコンが slow blink（300ms）、95% 以上で rapid blink（150ms）

blink はバーの**セル背景を塗った上に前景ブロックを重ねて**掛けている。
前景だけをフェードさせるので、セルが消えてバーが空に見えることがない。
％ の数値には blink を掛けていない（読めなくなるのが一番困る値なので）。

速度は `wezterm/appearance.lua` の `text_blink_rate` / `text_blink_rate_rapid`
（300ms / 150ms）と `text_blink_ease_in` / `text_blink_ease_out` で調整する。
blink をハード ON/OFF で実装する端末（VSCode の xterm.js など）では、
なめらかなフェードではなくパチパチした見た目になる。

`refreshInterval` を外すと位置の進行が止まる（Claude Code のイベント発生時のみ再描画。
ただし blink 側は端末が描き続ける）。

## 使用率のデータ元

5h / 7d / モデル別枠は、どれも claude.ai の usage エンドポイント
（`GET https://api.anthropic.com/api/oauth/usage`）のスナップショットから出す。
`limits[]` の `kind` で窓を決める。

| `kind` | 窓 |
|--------|----|
| `session` | 5h |
| `weekly_all` | 7d |
| `weekly_scoped` | モデル別枠。ラベルはサーバ提供の `scope.model.display_name`（`Fable` など）をそのまま使う |

`percent` を使用率に、`resets_at` をリセット時刻に使う。
リセット後まだ誰も使っていない窓は `percent: 0`、`resets_at: null` で返ってくるので、0% を残り時間なしで出す。

ステータスライン入力の `rate_limits` は、そのセッションが最後に API を呼んだ時点の値でしかない。
放置しているセッションは何時間も前の値を出し続けるので、5h / 7d もスナップショットを優先する。
入力の `rate_limits` を使うのは、24時間以内のスナップショットが無いときだけ。
モデル別枠はそもそも入力に含まれない（入力にあるのは `five_hour` / `seven_day` / `spend_limit` だけ）。

Claude Code も同じ結果を `~/.claude.json` の `cachedUsageUtilization` にキャッシュするが、
更新されるのは `/usage` を開いたときなどに限られ、実測で数時間古い。そこで自前のスナップショットを持つ：

- 描画時は `~/.claude/statusline-usage.json` を読むだけ（同期処理はファイル読み込みのみ）
- 1分以上古ければ `--refresh-usage` を **detached な子プロセス**として起動する
- 子プロセスは Keychain の `Claude Code-credentials` から access token を取り
  （期限切れなら何もしない。plain file の `~/.claude/.credentials.json` はフォールバック）、
  `curl` で usage エンドポイントを叩いて write-then-rename で保存する
- 起動前に `~/.claude/statusline-usage.attempt` を touch するので、
  失敗しても次の試行までは 1 分空く（毎フレーム再試行しない）。
  マーカーは全セッション共通なので、エンドポイントを叩くのは全セッション合わせて 1 分に 1 回まで
- `~/.claude.json` には書き込まない。自前スナップショットが 3 分以上古いときだけ
  Claude Code 側のキャッシュも読み、新しい方を採用する

鮮度で表示を変える：

| スナップショットの古さ | 表示 |
|------------------------|------|
| 3分以内 | 通常表示 |
| 3分〜24時間 | 灰色に落として末尾に `*` |
| 24時間以上 | モデル別枠は非表示。5h / 7d は入力の `rate_limits` で出す |

## ビルド

```bash
cargo build --release
```

リポジトリルートからは `make statusline`。`~/.local/bin/claude-statusline` は
`target/release/claude-statusline` へのシンボリックリンクなので、再ビルドすれば即反映される。

## 設定

`claude/settings.json` の `statusLine` でバイナリを指定：

```json
{
  "statusLine": {
    "type": "command",
    "command": "~/.local/bin/claude-statusline",
    "padding": 0,
    "refreshInterval": 1
  }
}
```

## 副作用

レートリミットを他ツール向けに書き出している（既存キーの形は変更しないこと）：

- `/tmp/claude_rate_limits.json` — WezTerm tabline（`wezterm/claude_usage.lua`）
- `~/.claude/rate_limits.json` — macOS ステータスバーの claude-code プラグイン（`statusbar/config.yml`）

情報源はステータスライン入力の `rate_limits` ではなく、usage エンドポイントのスナップショット。
書き出すのは `--refresh-usage` の子プロセスだけで、取得したスナップショットを保存した直後に、
そのレスポンスから両ファイルを write-then-rename で書く。したがって更新は約 1 分ごとで、描画のたびには書かない。
取得に失敗したときは何も書かず、前回のファイルが残る。
OAuth のトークンが無い環境（API キー利用など）ではスナップショットが取れないので、どちらのファイルも書き出されない。

`/tmp/claude_rate_limits.json` は入力の `rate_limits` と同じ形で、`resets_at` は epoch 秒。
取れなかった窓は `null` になる。
`claude_usage.lua` は最初に出てくる `resets_at` を 5h の値としてパターンで読むので、
`five_hour` を先に出す順序を崩さず、キーも足さないこと。

```json
{"five_hour":{"used_percentage":2.0,"resets_at":1791034200.0},"seven_day":{"used_percentage":88.0,"resets_at":1791021600.0}}
```

`~/.claude/rate_limits.json` の `resets_at` は秒単位の ISO 8601（UTC、`Z`）。

```json
{
  "rate_limits": {
    "five_hour": { "used_percentage": 2.0, "resets_at": "2026-10-03T13:30:00Z" },
    "seven_day": { "used_percentage": 88.0, "resets_at": "2026-10-03T10:00:00Z" },
    "model_scoped": [
      { "display_name": "Fable", "used_percentage": 17.0, "resets_at": "2026-10-03T10:00:00Z" }
    ],
    "fetched_at": "2026-10-03T08:40:27Z"
  }
}
```

- `fetched_at` はスナップショットの取得時刻。読み手はこれでデータの古さを判定する
- 取れなかった窓は `null` を書かず、キーごと省く。`model_scoped` も枠が 1 つも無ければ省く
- リセット後まだ誰も使っていない窓は `used_percentage: 0` で、`resets_at` だけを省く。
  `model_scoped` の各エントリも、`resets_at` が取れないときはそのキーだけ落とす

自前で管理しているファイル：

- `~/.claude/statusline-usage.json` — usage エンドポイントのスナップショット
- `~/.claude/statusline-usage.attempt` — 更新試行のバックオフ用マーカー（中身は空）
