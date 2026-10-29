---
name: pr-explainer-video
description: |
  Produce a narrated explainer video (mp4, Japanese voice-over, subtitles) for a pull request so
  reviewers grasp the change before reading the diff, and attach it to the PR body with `gh --attach`.
  Two kinds, mixable: animated diagrams built from HTML scenes (mechanisms, sequences, state changes,
  design decisions), and real screen recordings of the running app driven by a scripted flow
  (UI changes, visible performance gains, Before/After side by side). Handles storyboard, launching
  the app in the background, parallel scene production, TTS readings, self-review loops, and export.
  Use whenever the user wants a video for a PR or for reviewers, even if they don't say "explainer":
  "PRに解説動画を載せて", "レビュワー向けに動画で説明して", "リッチな解説動画を添えて",
  "動作している様子を録画してPRに貼って", "Before/Afterを動画で見せて", "改善を体感できる動画",
  "Draft PR作って、解説動画も", "/pr-explainer-video". Also use when re-rendering or replacing a
  video already attached to a PR.
  Do not use for static figures in a PR (use pr-diagram-explainer), data charts, or slide decks.
user_invocable: true
---

# PR 解説動画

レビュワーが diff を読む前に、変更の全体像を数分でつかめるようにする。
狙いはレビュワーの認知負荷を下げることで、動画は本文の説明を置き換えない。
本文は動画を見なくても読めるように書き、動画はその前に見る地図として置く。

## 0. 動画にするか、どの種類にするかを決める

動画は作るのも見るのも高くつく。
時間の流れや動きがあって、静止画では伝わりにくい変更に限って作る。
構造だけで伝わるなら `pr-diagram-explainer` の図を勧め、typo 修正や依存の更新のように構造の無い変更なら作らない。

|変更の性格|種類|中身|
|---|---|---|
|仕組み、処理の順序、状態の移り変わり、設計判断|図解アニメ|HTML で組んだシーンを 1 コマずつ撮る|
|表示の変更、操作の流れ、体感できる性能改善|実画面の録画|アプリを起動し、台本どおりに操作しながら録画する|
|改善の前後を見せたい|併用|録画した Before と After を左右に並べ、図解でつなぐ|

長さの目安は、図解アニメが 2〜4 分、録画が中心なら 30〜90 秒である。
ユーザーが長さを指定したら従う。
短く収めるときは、まずステップ（読み上げの文）の数を減らし、次に 1 文を短くする。
間の長さ（`video.json` の `lead`、`gap`、`tail`）を詰めるのは最後で、詰めすぎると字幕を読む時間が無くなる。
1 分以下の動画では、タイトルだけのシーンを作らず、最初のシーンの見出しで兼ねる。
「説明しすぎない」ことを優先し、本文やコードを読めば分かる細部は動画から外す。

## 1. 準備

```bash
<skill-dir>/scripts/setup.sh                 # Node パッケージ、AivisSpeech（Docker）、話者モデルを冪等に用意
<skill-dir>/scripts/new_work.sh <workdir>    # 雛形を複写し、node_modules を共有の場所へ symlink
```

- `<workdir>` は repo の外に置く（例: `~/Movies/<slug>-explainer/work`）。動画、素材、作業ファイルを repo にコミットしない。
- 必要なもの: Node、ffmpeg、Docker、Google Chrome（`CHROME_PATH` で上書き可）、python3。
- 動画ごとの設定は `<workdir>/video.json`（出力名、カットでつなぐ境目、アクセント色、除外シーン、動きの既定 `motion`）と `<workdir>/readings.json`（読みの置換）に書く。雛形の共通ファイル（`build.py`、`engine.js`、`style.css`、`scenes_base.py`、`tts.py`、`render.js`）は動画ごとに書き換えない。書き換えると全シーンのハッシュが変わって撮り直しになり、並列制作の前提も崩れる。

## 2. 正本を読んで絵コンテを書く

先に変更の正本を読む。設計書があれば全文、無ければ `gh pr diff <n>` か `git diff <base>...HEAD`、コミットメッセージ、関連 issue である。
そのうえで `<workdir>/STORYBOARD.md` を [references/storyboard-template.md](references/storyboard-template.md) の形で書く。

- 冒頭に、読み手、見終わった人が分かること、長さ、内容の正本のパスを書く。
- 用語の表と、数字と名前の表を作り、全シーンで同じものを使う。図のための造語をしない。repo に用語の規約があれば従う。
- 抽象的な記号（「A」「値1」）より、実在しそうな具体例（日付、件数、名前）を使う。
- 1 シーンは 1〜5 ステップで、1 ステップが読み上げの 1 文、字幕の 1 枚になる。

アニメーションに入る前に、絵コンテだけで自己レビューを回す。
見るのは、正本との事実の一致、言い過ぎ（「必ず」「すべて」）、シーン間の言い分の食い違い、視聴者の問いに順に答えているか、である。
指摘が出なくなるまで直してから次へ進む。
ユーザーが「構成を先に見せて」と言ったときは、ここで止めて見せる。

## 3. 実画面を録画する（録画を使うときだけ）

手順は [references/app-recording.md](references/app-recording.md)、録画スクリプトの API は [references/app-recording-api.md](references/app-recording-api.md) にある。要点は次のとおり。

- 起動方法は repo の README、`package.json`、`Makefile`、`docker-compose.yml` から探す（見つからなければ `run` スキルに頼るか、ユーザーに聞く）。サーバーはバックグラウンドで起動し、撮り終えたら止める。
- Before はベースブランチ、After は PR のブランチを、別の git worktree で同時に起動する。ポートを分け、データは同じ DB かシードにそろえる。シードが違うと、同じ画面の数字がシーン間で食い違う。
- 操作は `flow.mjs` の台本に書き、Before と After を同じ台本、同じ viewport、同じ CPU とネットワークの条件で撮る。条件をそろえない性能比較は、比較として成り立たない。
- 開発用のオーバーレイ（devtools のボタン、デバッグバー、cookie バナー）は `--hide` で隠す。
- 撮った mp4 は数コマを PNG に抜いて目で確かめ、`assets/clips/` に置く。シーンでは `clip()` と `VID()` で埋め込み、sidecar JSON の操作時刻に `AT()` でカーソルや囲みを重ねる。

## 4. シーンを作る

シーンは `parts/sNN.py` に 1 つずつ書く。API は [references/scene-api.md](references/scene-api.md)、見本は雛形の `parts/s00.py` にある。

```bash
python3 build.py --kana          # 読み上げの文と、エンジンが解釈したカナ
python3 build.py 3 --stills      # シーン 3 の各ステップの中ほどと終わりの静止画
python3 build.py 3 --times       # シーン 3 の各ステップの読み上げの開始・終了の時刻（録画や印の時刻合わせに使う）
python3 build.py 3 --jobs 3      # シーン 3 だけ撮る
python3 build.py                 # 全シーンを撮って 1 本にする（変更の無いシーンは撮り直さない）
node <skill-dir>/scripts/clipcheck.js <workdir> [N ...]   # 見切れと文字の重なりの検査
```

撮影は速度を優先して並列にしてある。各シーンを 3 秒（90 コマ）の区間に分けて全シーンの区間を Chrome で同時に撮り（既定 12 並列）、HTML や素材が変わっていないシーンは撮り直さない。
区間を細かくしたり並列数を 16 以上にしたりすると、Chrome の起動が律速になって遅くなる。
撮影が遅いときは並列数より先に、変更の無いシーンまで撮り直していないか（共通ファイルを触っていないか）を疑う。

画面の決まり:

- 動きは「寄る → 印 → 次へ」のリズムにし、1 ステップの見せ場は 1〜2 個にする。読み上げが指す物を、その語が読まれる頃に出す。
- 仕上がりの目標は、モーショングラフィックス（After Effects で作ったような）の水準である。カメラの寄り、線の描画、注目箇所以外のぼかしで視線を導く。
- ただし「リッチ」は情報が整理されていることであって、装飾が多いことではない。グラデーション、絵文字、イラスト、漫画風の装飾、片側だけの色の太線、意味の無い回転は使わない。影は雛形の字幕、カード、画面枠に付いている控えめなものだけにし、新たに足さない。色は中立色が基本で、意味（悪化 / 解消、Before / After）があるところにだけ足す。
- 文字は本文 28px 以上、補足 24px 以上、最小 20px にする。GitHub のプレーヤーは小さく表示されることが多い。
- 図は stage（1760x796）の 7〜8 割を使う大きさで組む。画面の半分が空いたまま小さな図を置くと、縮小表示で読めない。要素が少ないシーンは、図を大きくするか、寄り（`FOCUS` / `CAM`）で埋める。
- 動きの既定は `video.json` の `motion` で選ぶ。`plain` は落ち着いた出入り、`cinematic` はぼかしとバネのある出入りとカメラの押し込みである。ユーザーが「リッチに」と言ったら `cinematic` にし、線の描画（`DRAW`）、寄り（`CAM`）、注目箇所以外のぼかし（`FP`）を各シーンに 1 つ以上使う。
- UI の再現（チャット、ターミナル、通知）は、実物の文言とレイアウトに合わせる。再現であることは PR 本文に書く。

**分担して並列で作る**。シーンが 4 つを超えるなら、親が絵コンテ、`SCENE_CONTRACT.md`（雛形の穴埋め）、共通の素材を用意し、シーンを担当に分けて同時に作らせる。

- 担当は sonnet のサブエージェントで、最大 4 人まで並列にする。各担当は自分の `parts/sNN.py` だけを書き、共通ファイルを直したいときは親に頼む。
- 担当は番号付きの撮影を `--jobs 3` で回す。番号なしの `build.py`（全体の書き出し）は親だけが実行する。
- 担当の完了報告は、パス、秒数、気になる点の 3 つにする。親は `--stills` と `clipcheck.js` で受け入れを確かめる。

## 5. 読み上げを確かめる

声の既定は AivisSpeech の「にせ」である（`TTS_ENGINE=voicevox` で VOICEVOX に戻せる）。
書いたら必ず `--kana` で読みを確かめ、崩れた語は `readings.json` かシーンの `readings` で直すか、言い換える。
字幕は自然な表記のままにし、読みだけを置き換える。
よくある罠と確かめ方は [references/readings.md](references/readings.md) にある。

## 6. レビューして書き出す

全体を書き出したら、`<skill-dir>/scripts/make_review.sh <workdir> <N>` でレビュー一式（静止画、コンタクトシート、字幕、カナ、長さ、文字起こし）を作る。
そのあと、画面、内容、読みの 3 人のレビュアーを並列に起動する。
指示書は [references/review.md](references/review.md) にある。

- レビュアーのモデルは既定か sonnet / opus にする。Fable は使わない。
- 指摘は担当シーンごとにまとめ、sonnet の修正担当に並列で直させる。
- レビューは 2 周で打ち切って書き出す。ユーザーが周回数を指定したら従う。
- 最後に `clipcheck.js` が 0 件であること、`build.py` の映像と音声の長さの照合を通ることを確かめる。

## 7. PR に載せる

本文の書き方と添付の手順は [references/pr-body.md](references/pr-body.md) にある。要点は次のとおり。

- `## 解説動画` を本文の上部（概要の直後）に置き、長さ、音声の有無、中身の性格を 1 行で書く。中身の性格とは、「デモの画面は実装の文言で組んだ再現」や「実画面の録画（Before: main、After: このブランチ、CPU 4 倍スロットリング）」のような説明である。そのあとに動画の行を置く。
- 動画のあとに、図（`pr-diagram-explainer`）と文で同じ要点を書き、本文だけでも読めるようにする。
- 添付は `gh pr edit <n> --body-file body.md --attach ./explainer.mp4` で行う。動画に `#alt` を付けると全体が失敗する。
- PR の作成や本文の書き換えは、ユーザーが頼んだときだけ行う。頼まれていなければ、mp4、srt、`body.md` のパスと実行するコマンドを示して止める。

## 作り直すとき

内容を直したら、該当シーンだけを撮り直して全体を書き出し、PR の動画も差し替える。
本文の動画の行をプレースホルダ（`![解説動画](./explainer.mp4)`）に戻してから `--attach` すると、同じ位置に新しい URL が入る。
