# progress-hud のテスト

## 実行方法

```bash
cd tests
node build.mjs && node --test     # すべての自動テスト（Node のみ。CLI は不要）
node --test unit/                 # 純粋関数だけ
node look.mjs                     # デスクトップの見た目を look.html に書き出す（build.mjs のあとに）
claude plugin validate ..         # mod の検証。hooks: と calls: の行を読む
claude plugin test ..             # 公式キット（kit/*.test.tsx）。使えるときだけ
```

- `build.mjs` が `hooks/**/*.ts(x)` を TypeScript の `transpileModule` で `tests/.build/**/*.mjs` に変換します（相対 import に `.mjs`、`'claude-code'` は `stub.mjs` に置き換え）。`typescript` は mod の依存ではありません。ローカルかグローバルの `typescript`、環境変数 `TYPESCRIPT`（パス）、mise の node 配下のコピー、の順に探します。見つからなければ止まります。
- **型検査**: tsconfig は mod の外に置きます（dotfiles に置く場合は mod 直下の `tsconfig.json`。`.gitignore` 対象）。`include` に `claude-code.d.ts` の絶対パス（plugin-authoring スキルの `types/`）と `hooks`、`types`、`tests` を書き、`tsc -p tsconfig.json` を実行します。エンジンが `.claude-plugin/types/` を置いたあとは `tsc -p <mod>` でも構いません。

  ```json
  {
    "compilerOptions": { "target": "es2023", "lib": ["es2023"], "types": [], "module": "esnext", "moduleResolution": "bundler",
      "strict": true, "noUncheckedIndexedAccess": true, "noEmit": true, "skipLibCheck": true,
      "jsx": "react", "jsxFactory": "h", "jsxFragmentFactory": "Fragment" },
    "include": ["<plugin-authoring>/types/claude-code.d.ts", "hooks", "types", "tests"]
  }
  ```
- 公式キットのテストは `*.test.tsx` です。`claude plugin test` は `*.test.ts` と `*.test.tsx` を実行しますが、`node --test` は `.tsx` を拾わないので、Node の実行にキットの import（`claude-code/testing`）が混ざりません。キットはエンジンの rollout switch が on のときだけ動きます（off だと何も実行されない。F9）。`kit-runner.test.mjs` が使えるときだけ実行し、使えなければ skip します。キットの型は tsc を通っています（型キャストで通してはいません。`$.tool.call` の入力だけ、キットの型が MCP ツールの引数を知らないため `as never` を使っています）。

## テスト層

| 層 | 内容 | ファイル |
|---|---|---|
| A | 純粋関数のユニット（A1 model、A2 planmd、A3 rules / config / persist、A4 tasks、A5 agents、A6 meter、A7 width、A8 i18n、A9 layout、A10 svg、A11 synth、X9 anim） | `unit/*.test.mjs` |
| B | stub engine によるイベント列のシナリオ（B1〜B5 ツール・Plan・入力待ち・nudge・永続化、B6 エージェント、B7 メトリクス、B8 ミラー、B9 ターミナル、B10 デスクトップ、B11 コマンドとデモとサウンド、X9 アニメーションのフレーム時計） | `scenarios*.test.mjs` |
| B12 | 障害注入: `$` の各部を 1 つずつ・すべて同時に失敗させ、全フックの戻り値・`next` の回数・例外を検査 | `faults.test.mjs` |
| C | セキュリティ: C1 validate の `calls:` と許可リストの照合、C2 `hooks/**` の静的スキャン（検出器の自己検証つき）、C3 `$.store` のキーと保存値 | `security.test.mjs`、`security-scan.mjs`、`allowlist.mjs` |
| D | 公式キット（実エンジン）。使えるときだけ | `kit/*.test.tsx`、`kit-runner.test.mjs` |
| E | 実機チェックリスト（下の表。手動） | — |

共有物: `fixtures.mjs`（ゼロ meter、3 ステップのバー、計画文、`hud()` ハーネス、BandModel）、`sources.mjs`（`hooks/**` の列挙。`build.mjs` と C2 が使う）、`kit/helpers.tsx`（キットのテストの共通部）。

`engine.mjs` が拡張 stub engine です。`$` は許可リスト（`allowlist.mjs`、DESIGN 9.3）にある名詞だけを持ち、それ以外を呼ぶと例外で落ちます。描いた木は `surface-validator.mjs` で surface の要素表と props を検査します。`engine.mjs` の `fail` スイッチで `$` の各部を失敗させられます。

## 実機チェックリスト（層 E、DESIGN 11.5）

結果欄は手で記入します（○ / × と日付、気づいたこと）。

| # | 確認すること | 結果 |
|---|---|---|
| 1 | ターミナル（WezTerm、Ghostty）で幅を 60 / 100 / 160 に変え、日本語タイトルで列がそろい、はみ出さないこと | |
| 2 | 並列エージェント 3 体で、ストリップの時計が進み、承認待ちで黄色になり、完了 5 秒後に畳まれること | |
| 3 | TaskCreate を使う依頼で `tasks` バーが出て、progress ツールを使わずに進捗が動くこと | |
| 4 | Plan mode で計画を承認すると `plan` バーになること | |
| 5 | 完了トーストに時間、コスト、出力トークンが出ること | |
| 6 | ターン外では「待機中」表示になること | |
| 7 | `/hud hide` で帯が消え、ステータス行に縮約表示が出ること | |
| 8 | デスクトップアプリで、ホバーで時刻とメトリクスが出て、ちらつきがないこと | |
| 9 | 3 種のサウンドが鳴り、`sound=false` で鳴らないこと | |
| 10 | 作業中に mod を保存して再読込しても、ストリップが孤立しないこと | |
| 11 | `/clear` でバーが消え、`claude --resume` で復元されること | |
| 12 | plan-progress と併用しても、エラーにならず両方の帯が表示されること（確認後、無効化を推奨） | |
| 13 | `claude --debug` のログに本 mod の失敗行（`progress-hud: ...`）が出ていないこと | |
| 14 | ターミナルで、シマー（タイトルを流れる光）・スピナー・塗りの先頭のきらめき・完了時の白い光が動くこと。`animation=false` で止まること。WezTerm と Ghostty でちらつかず、動いている間も CPU 使用率が高くならないこと（待機中は動かないこと） | |
