# シーン API リファレンス

1 シーン = `parts/sNN.py` の 1 ファイル。HTML 部品は `scenes_base.py`、アニメーションは `engine.js` の関数を、`scene()` の `js` 引数（BUILD 関数の中身）に書く。

## 目次

1. [scene() の引数](#1-scene-の引数)
2. [時刻の決まり](#2-時刻の決まり)
3. [HTML 部品](#3-html-部品)
4. [engine の API](#4-engine-の-api)
5. [録画クリップ](#5-録画クリップ)
6. [video.json と動きの流儀](#6-videojson-と動きの流儀)
7. [既知の注意](#7-既知の注意)

## 1. scene() の引数

```python
scene(tag, title, html, steps, js, en="", hold=None, css="", readings=None)
```

|引数|中身|
|----|----|
|`tag`|右上の札。空なら出さない|
|`title`|左上の見出し。空なら帯ごと出さない|
|`en`|見出しの横の小さな英字|
|`html`|stage（1760x796、画面上の位置は (80, 124)）の中身。座標は stage の左上が (0, 0)|
|`steps`|読み上げの文の配列。1 文 = 1 ステップ = 1 枚の字幕|
|`js`|BUILD 関数の中身|
|`hold`|`{ステップ番号: 追加の秒}`。読み上げの後の間を延ばす|
|`css`|このシーンだけの CSS。セレクタは `#sNN` で始める|
|`readings`|`[(表記, 読み)]`。このシーンだけの読み。全体の読みは `readings.json`|

## 2. 時刻の決まり

- 時刻は**ステップ**で指定する。`step 0` はシーンの頭、`step n` は n 番目の文の読み始め。`d` はそこからの遅れ（秒）。`T(step, d)` はミリ秒を返す
- step には、録画クリップの時刻から求めた `AT('#id', 秒)`（§5）も渡せる。`d` はその時刻からの遅れ
- 同じ要素への `FOCUS` / `CUR` / `CAM` は**時刻の順**に書く。直前の状態を起点に動くため
- シーンの長さはコマ（1/30 秒）の整数倍に丸まる

```js
A(1, '#card', 'up', {d: .4});        // 1 番目の文の読み始めの 0.4 秒後に出す
A(AT('#clip', 2.5), '#ring', 'pop'); // クリップの 2.5 秒目に出す
```

## 3. HTML 部品

`from scenes_base import scene, shot, clip, hl, ring, spot, cursor, bubble, card, chip, img, harrow, varrow, term, t_*`

|関数|中身|
|----|----|
|`shot(id, x, y, w, h, frames, url=None, view=None, lw=None, inner="", cls="")`|スクリーンショットの枠。`frames` は `assets/` からの相対パス（配列なら SWAP / SEQ で切り替え）。`url` でブラウザ風の帯（高さ 40）。`view=[x,y,w,h]` は最初に見せる矩形。座標は論理 px（PNG が幅 2400 px 以上なら半分）。`inner` は `.cam` の中に重ねる HTML|
|`hl(id, x, y, w, h)`|蛍光ペン。`inner` に入れる。`A(.., 'growX')` で左から引く|
|`ring(id, x, y, w, h, pad=6)`|囲み。`inner` に入れる。`pop` か `fade` で出す|
|`spot(id, x, y, w, h)`|矩形の外を暗くする。`inner` に入れる。`fade` で出す|
|`cursor(id="cur")`|矢印のカーソル。html の最後に置く。`CUR` / `CLICK` で動かす|
|`bubble(id, x, y, inner, tail="bl", cls="", w=None)`|吹き出し。`tail`: `bl` `br` `tl` `tr` `l` `r` `none`。`cls`: `dark` `brand`|
|`card(id, x, y, w, inner, cls="", h=None)`|カード。`cls`: `brand` `soft` `red` `green` `blue` `amber` `gray`|
|`chip(id, x, y, text, cls="")`|小さな札。`cls`: `brand` `ghost` `red` `green` `blue` `amber` `gray` `dash`|
|`img(id, x, y, w, rel, cls="", style="")`|画像（`assets/` からの相対パス）。`logo(id, x, y, h, rel, aspect)` はロゴ用|
|`harrow(x, y, length, color, id_, cls, width)`|横向きの矢印。`(x, y)` は左端の中心|
|`varrow(x, y, length, color, id_, cls, width)`|下向きの矢印。`(x, y)` は上端の中心|
|`clip(...)`|録画クリップの枠（§5）|

CSS のクラス: `.h1` `.h2` `.t`（28 px）`.s`（24 px 灰）`.big`（数字）`.mono` `.key` `.code`（`.k` で強調）`.input` `.abs` `.box` `.lane` `.vline` `.dot` `.num` `.lt`。色は `--brand` `--ink` `--sub` `--line` `--mark` などの変数を使う。

### 端末の再現

|関数|中身|
|----|----|
|`term(id, x, y, w, h, body, title="terminal", prompt="", prompt_id=None, hint=..., inner="", toast="")`|端末の窓。あふれたら最新の行が見えるよう自動で流れる。入力欄の id は `{id}-in`|
|`t_welcome(cwd)` `t_user(id, text)` `t_say(id, html)`|起動の枠、入力の行（`>`）、応答の文（`STREAM` では `#id .tx` を指す）|
|`t_tool(id, name, args, state)` `t_res(id, html, cls)` `t_running(id)`|ツール呼び出し（`state`: `ok` `err` `run`）、結果（⎿。`\n` で複数行。`cls`: `err` `dim`）、実行中の行|
|`t_spin(id, word)` `t_diff(id, path, rows)` `t_toast(id, html)`|考え中の印、差分（`rows` は `[(" "か"-"か"+", 行番号, 本文)]`）、トースト|

## 4. engine の API

`sel` は CSS セレクタ（カンマ区切りで複数可）か要素。`o` は `{d, dur, ...}`。

|API|働き|
|---|----|
|`A(step, sel, kf, {d, dur, stagger, ease, fill, composite, iter})`|キーフレームで出し入れ。`dur` はミリ秒。複数に当たると `stagger` 秒ずつずらす。`kf` は名前か配列|
|`M(step, sel, [[x,y],...], o)`|translate で動かす|
|`FOCUS(step, '#shot', [x,y,w,h], {d, dur, ease})`|画像（クリップ）の論理 px の矩形が枠に収まるよう寄る。既定 1400 ms|
|`XY('#shot', ix, iy)`|画像（クリップ）の点が stage のどこに見えるか。直前の `FOCUS` の状態で計算する|
|`CUR(step, '#cur', [x,y] か [[x,y],...], o)`|カーソルを stage 座標で動かす。**最初の呼び出しは初期位置を決めるだけ**|
|`CLICK(step, '#cur', {d})`|押した波紋|
|`SWAP(step, '#shot', k, {d, fade})`|k 番目の画像に替える。既定はカット。`fade`（上限 300 ms）は枠の地を経由する|
|`SEQ(step, '#shot', [k,...], {d, every})`|コマ送り。`every` 秒ずつ（既定 0.25）|
|`TYPE(step, sel, '文字列', {d, cps, caret})`|1 字ずつ打つ。`cps` は 1 秒あたりの字数（既定 9）|
|`C(step, sel, from, to, {d, dur, dec, ease})`|数字のカウントアップ（3 桁区切り）。既定は終わりで減速し、`ease:'linear'` で等速（経過時間の表示に使う）|
|`SHOW(step, sel, {d, stagger})` / `HIDE(step, sel, {d})`|時刻が来るまで `display:none` / 時刻に消す。端末の行に使う|
|`STREAM(step, sel, {d, cps})`|書式を保ったまま文字を先頭から流す。既定 40 字/秒|
|`LINES(step, sel, {d, every})`|書式を保ったまま `\n` 単位で 1 行ずつ出す。`every` は秒（既定 0.06）|
|`DRAW(step, sel, {d, dur, stagger})`|SVG の `path` `line` などを描く。点線と塗りは淡く現れる|
|`CAM(step, [scale, x, y], {d, dur})`|舞台全体に寄る・引く。`x, y` は舞台の注目点（既定 880, 398）。`[1]` で戻す|
|`FP(step, '残す要素', {d, dur})` / `FPOFF(step, {d})`|残す要素以外の舞台の要素をぼかして沈める / 戻す。舞台の直下の要素が単位|
|`VID(step, '#clip', {d, from, to, rate})`|録画クリップを再生する（§5）|
|`AT('#clip', 秒)`|クリップ時刻に相当するシーン時刻を返す（§5）|

`ease` は名前（`'spring'` `'move'` `'ease'`）か CSS の easing 文字列（`'linear'` など）。

### A のキーフレーム名

|名前|動き|
|----|----|
|`up` `down` `left` `right`|その向きから滑って現れる|
|`pop`|拡大して現れる|
|`zoom`|少し寄って現れる|
|`fade` / `out`|現れる / 消える（`out` は `forwards`）|
|`wipe` / `wipeDown`|左から / 上から現れる|
|`growX` / `growY`|横 / 縦に伸びる（蛍光ペンなど）|
|`shake` / `pulse`|揺れる / 脈打つ|
|`blurIn`|ぼけた状態から寄って現れる|
|`mask`|上から切り抜きで現れる（見出し向き）|

配列も渡せる: `A(2, '#a', [{opacity: 1}, {opacity: .35}], {d: .5, fill: 'forwards'})`。

```js
FOCUS(1, '#sh', [100, 200, 600, 300]);                    // 寄る
CUR(1, '#cur', XY('#sh', 300, 260));                      // カーソルの初期位置
A(1, '#cur', 'fade', {d: .2});
CUR(2, '#cur', XY('#sh', 480, 320), {d: .3}); CLICK(2, '#cur', {d: 1.3});
```

## 5. 録画クリップ

`clip(id, x, y, w, h, src, view=None, cls="", url=None, inner="", lw=None)`

- `src` は作業ディレクトリからの相対パス（`assets/clips/<name>.mp4`）。H.264 の mp4（Chrome が読める形式）。`-g 30` 程度でキーフレームを短くしておく
- 枠は `shot` と同じ切り抜きなので、`FOCUS` / `XY` / `CUR` がそのまま効く。座標は**クリップのピクセル**（`lw` を渡さなければ論理幅 = クリップの幅）。`inner` は `.cam` の中なので、`ring` / `hl` / `spot` をクリップの座標で置ける
- `VID(step, '#id', {d, from=0, to=null, rate=1})`: `T(step, d)` からクリップの `from` 秒を再生し始め、`to` 秒で止めて最後のコマを保持する。開始前は `from` のコマ。`to` を省くとクリップの終わりまで。Before / After を並べるときは、同じ `step` と `d` の `VID` を 2 つ書く
- `AT('#id', 秒)`: そのクリップ時刻に相当するシーン時刻（`{ms}`）を返す。`A` `CUR` `CLICK` `FOCUS` などの第 1 引数にそのまま渡せる。**`VID` の後に書く**。同じ要素に `VID` を複数書いたときは最後のものを使う
- コマは再生ではなく、毎コマ `currentTime` を決めて撮る。並列撮影（`--jobs`）の継ぎ目でも同じコマになる
- クリップを差し替えると、そのシーンは自動で撮り直しになる（mp4 と JSON のサイズ・更新時刻がハッシュに入る）

### sidecar JSON

録画担当が `assets/clips/<name>.mp4` と同名の `.json` を出す。`box` はクリップのピクセル座標。

```json
{"fps":30,"width":1280,"height":720,"duration":5.0,"viewport":{"width":1280,"height":720,"dsf":1},
 "actions":[{"t":2.5,"type":"click","selector":"#btn","box":{"x":400,"y":300,"w":120,"h":60},"label":"go"}]}
```

`type` は `click` `type` `scroll` `goto` `wait` `mark`。Python のヘルパー:

|関数|中身|
|----|----|
|`clip_actions(name, type=None)`|`actions` を返す。`type` に `"click"` や `["click","type"]` を渡すと絞る|
|`box_center(action)`|`box` の中心 `(x, y)`|
|`clip_meta(src)`|`fps` `width` `height` `duration`（JSON が無ければ ffprobe）|

```python
hit = clip_actions("after", "click")[0]; b = hit["box"]
html = clip("a", 0, 80, 860, 484, "assets/clips/before.mp4") \
     + clip("b", 900, 80, 860, 484, "assets/clips/after.mp4", inner=ring("rb", b["x"], b["y"], b["w"], b["h"]))
js = f"""VID(1,'#a',{{d:.3}});VID(1,'#b',{{d:.3}});
A(AT('#b',{hit["t"]}),'#rb','pop');"""
```

見本は `parts/s01_clip_example.py.txt`。

## 6. video.json と動きの流儀

作業ディレクトリの `video.json`（`build.py` が読む。共通ファイルは書き換えない）。

|キー|既定|中身|
|----|----|----|
|`out`|`explainer.mp4`|出力の mp4（`--out` で上書き）|
|`hard_cuts`|`[]`|フェードせずカットでつなぐ境目 `[[前, 次], ...]`|
|`accent`|`#2f6fdf`|`--brand` 系の色を決める|
|`vars`|`{}`|CSS 変数の上書き（例 `{"--paper": "#fbfaf8"}`）|
|`motion`|`plain`|`plain`: 控えめ。`cinematic`: 出入りにぼかし、舞台が右から入り左へ抜け、全体がゆっくり寄る|
|`jobs` `exclude` `lead` `gap` `tail`|12 `[]` 0.7 0.6 0.9|撮影の並列数、動画から外すシーン番号、頭・文の間・終わりの秒|

## 7. 既知の注意

- SWAP / SEQ で画像を替えると、その画像に z-index が付き、`inner` の `hl` / `ring` / `spot` が下に隠れる。シーンの css で印に z-index を付ける（例 `#s07 #hl1{z-index:5}`）
- 一度 `A(...)` で出し入れした要素に、後からもう一度 `A(..., 'fade')` をかけるときは `{fill:'forwards'}` を付ける。既定の `both` だと、後のアニメーションの初期状態（opacity 0）が早くから効いて前の表示を消す
- `CUR` の初期位置の後に `A(.., 'fade')` で出し入れする。transform を使うキーフレームはカーソルに使わない
- 字幕が 2 行になる文は、文の切れ目に `<br>` を入れて改行の位置を決める（読み上げと SRT からはタグを除く）
- 英字の語の読みは `readings.json` か `scene(readings=...)` に足す。`tts.py` は直さない。確認は `python3 build.py N --kana`
- 撮影後は `node <スキル>/scripts/clipcheck.js . N` で見切れ・重なりを確かめる
