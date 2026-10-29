# 実アプリの操作録画 API（scripts/record_app.js）

起動済みの Web アプリを headless Chrome で開き、台本（flow）を自動で実行しながら録画する。
出力は、動画エンジンに埋め込める mp4 と、操作の時刻・位置を記録した sidecar JSON である。
表示の変更や体感速度の改善を、Before / After で同じ台本・同じ条件で撮って比べる用途を主に想定する。

## 前提

- `scripts/setup.sh` を実行済みであること（puppeteer-core が `$PR_EXPLAINER_VIDEO_HOME/node_modules` に入る。
  既定は `${XDG_CACHE_HOME:-$HOME/.cache}/pr-explainer-video`）。
- ffmpeg と Chrome がある。Chrome の場所は `CHROME_PATH`、無ければ macOS 標準のパス、`google-chrome`、`chromium` の順に探す。
- 撮る対象のアプリは別途起動しておく（スクリプトは URL を開くだけ）。

## CLI

```bash
node scripts/record_app.js --url http://localhost:3000/ --flow flow.mjs --out assets/clips/after.mp4 \
  [--viewport 1600x900] [--dsf 1] [--fps 30] [--cpu-throttle 4] [--network fast3g|slow3g|none] [--no-cache] \
  [--hide 'css selector, ...'] [--color-scheme light|dark] [--cookies cookies.json] \
  [--pause 400] [--timeout 10000] [--tail 500] [--headful]
```

|オプション|既定|意味|
|----------|----|----|
|`--viewport`|`1600x900`|CSS px。mp4 の画素数は viewport × dsf|
|`--dsf`|`1`|deviceScaleFactor。2 にすると 2 倍の画素数で撮る（`--force-device-scale-factor` も付けて起動する）|
|`--cpu-throttle`|`1`|CPU を N 倍遅くする（`Emulation.setCPUThrottlingRate`）|
|`--network`|`none`|`fast3g`（下り 1.6 Mbps、遅延 562 ms）、`slow3g`（下り 500 kbps、遅延 2000 ms）|
|`--no-cache`|なし|HTTP キャッシュを無効にする|
|`--hide`|なし|撮影中だけ `display:none` にする要素。全ページに効く|
|`--pause`|`400`|click / type / hover / scroll の前に置く間（ミリ秒）|
|`--timeout`|`10000`|セレクタ待ちの上限（ミリ秒）|
|`--tail`|`500`|flow の終了後に最後の画面を保持する時間（ミリ秒）|

失敗したとき（セレクタが見つからない等）は、その時点のスクリーンショットを `<out>.error.png` に保存し、非 0 で終わる。
スクロールバーは常に隠す。マウスカーソルは録画に映らない（動画エンジン側で sidecar の座標から描く）。

## flow の API

```js
// flow.mjs
export default async function (page, h) {
  await h.waitFor('#list li');
  await h.click('#search');
  await h.type('#search', 'ナット', { cps: 8 });
  await h.mark('絞り込み完了');
  await h.scroll('li:last-child');
}
```

`page` は puppeteer の Page。`h` の操作は、実行した時刻と対象要素の box を sidecar に記録する。

|操作|動作|
|----|----|
|`h.goto(url)`|ページを開く。最初の `--url` の読み込みは、スクリプトが自動で `goto` として記録する|
|`h.click(selector, {pause, label})`|要素が見えるまでスクロール、マウスを中心へ動かして押す|
|`h.type(selector, text, {cps, pause})`|フォーカスして 1 字ずつ入力する。`cps` は毎秒の文字数（既定 10）。クリックはしない|
|`h.scroll(selectorOrY, {duration, pause})`|数値なら scrollY へ、セレクタなら画面の中央へ、なめらかに動かす（既定 700 ms）|
|`h.hover(selector)`|マウスを要素の中心へ動かす|
|`h.waitFor(selector, {timeout, visible})`|要素が現れるまで待つ。現れた時刻を `wait` として記録する|
|`h.wait(ms)`|待つ|
|`h.mark(label)`|任意の時刻印。「一覧の表示完了」のように、動画上の見せ場に付ける|
|`h.now()`|録画開始からの秒|

`click` / `hover` / `scroll` / `type` は、操作の前に `--pause` の間を置く。個別に変えるには `{pause: 0}` のように渡す。

## sidecar JSON

mp4 と同名で拡張子が `.json` のファイル（`after.mp4` なら `after.json`）。動画エンジンと共有する契約なので、キー名は変えない。

```json
{
  "fps": 30, "width": 1600, "height": 900, "duration": 6.4,
  "viewport": {"width": 1600, "height": 900, "dsf": 1},
  "conditions": {"cpu_throttle": 2, "network": "none"},
  "actions": [
    {"t": 1.4, "type": "click", "selector": "#q", "box": {"x": 350, "y": 86, "w": 900, "h": 51}},
    {"t": 3.2, "type": "mark", "label": "絞り込み完了"}
  ]
}
```

- `t` は録画開始（時刻 0）からの秒。`duration` は mp4 の長さで、`(コマ数) / fps` に等しい。
- `type` は `click | type | scroll | goto | hover | wait | mark`。
- `box` は mp4 のピクセル座標（CSS px × dsf。スクロール後に見えている位置）。対象が無い操作では省略する。
- `label` は `mark` の文字列、`type` で入力した文字列、`goto` の URL、`wait` の長さなど。
- `type` は入力を始めた時刻、`click` は押した時刻、`scroll` はスクロールを始めた時刻を指す。

## 録画の仕組み

CDP の `Page.startScreencast`（jpeg、quality 90）で届くコマを、時刻つきで保持する。
画面が変わったときしかコマが届かないので、終了時に各コマを次のコマの時刻まで保持して、固定 fps の mp4 にする。
H.264、yuv420p、`-g 30`（後で 1 コマずつシークできる）、音声なし。時刻 0 より前は最初のコマで埋める。

## Before / After の条件をそろえる

性能や体感速度を比べるときは、次を両方で同じにする。

- 同じ flow ファイル、同じ `--viewport` / `--dsf` / `--fps`。
- 同じ `--cpu-throttle`（開発機は速いので、2〜4 にすると差が見えやすい）と `--network`。
- `--no-cache` を付けるかどうか。初回表示の比較なら付ける。
- データ（件数、ログイン中のユーザー）、`--hide` の対象、`--color-scheme`。
- 計測の起点は `h.mark` で打つ。「入力の完了から一覧の表示完了まで」のような差は、2 つの JSON の `mark` の時刻の差で比べる。
- sidecar の `conditions` に条件が残るので、動画に「CPU 4 倍遅延」のように注記するときの根拠にする。

## よくある失敗

- 変化の無い間は screencast がコマを出さない。コマが少ないのは正常で、保持して補う。
  長く止まる区間は動画が静止画になるので、見せたい動きの前後に `h.wait` で間を置く。
- ログインが必要なアプリは、`--cookies cookies.json`（puppeteer の cookie 配列、または `{"cookies":[...]}`）を渡す。
  `domain` と `url` を省略した cookie は `--url` に付ける。cookie の値は repo にコミットしない。
- 開発用のオーバーレイ、devtools ボタン、cookie バナーは `--hide` で隠す。ラベルや値の入れ替えは flow の `page.evaluate` で行う。
- アニメーションや遅延読み込みの完了前に撮ると、画面が揺れる。`h.waitFor` で目的の要素を待ってから操作する。
- `--dsf 2` は mp4 の画素数が 4 倍になり、エンコードが遅く、ファイルも大きい。細かい文字を拡大して見せるときだけ使う。
- 起動直後に大きさの違うコマが混じることがあり、その場合は警告を出して捨てる（直前のコマが保持される）。
