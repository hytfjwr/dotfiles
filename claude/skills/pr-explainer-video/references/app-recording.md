# 実画面の録画の手順

表示の変更や体感できる性能改善は、図より実物の動きのほうが一度で伝わる。
録画は `scripts/record_app.js` で行い、操作の台本（flow）どおりに headless Chrome を動かしながら撮る。
CLI、flow の API、sidecar JSON の形式は [app-recording-api.md](app-recording-api.md) を読む。

## 1. 何を撮るかを決める

絵コンテの段階で、録画で見せるシーンと、そこで見せる 1 つの事実を決める。

- 表示の変更：変わった画面へ実際の操作でたどり着き、変わった箇所に寄って印を付ける。
- 操作の流れ：入力、クリック、結果の表示までを 1 本で撮る。
- 性能改善：同じ操作の Before と After を左右に並べて同時に再生し、終わる時刻の差を見せる。差の秒数は sidecar の `mark` の時刻から計算して画面に出す。

撮る操作は 10〜30 秒に収める。
長い待ち時間をそのまま流すと、見る側の時間を奪う。
性能比較の待ち時間は、そのまま見せること自体が主張なので切らない。
Before が 10 秒を超えるなら、待っている間に変更の説明を読み上げて時間を使う（`--times` で読みの時刻を、`AT()` で録画の時刻を合わせる）。
それでも長さの指定に収まらないときは、差が 2〜5 秒で見える軽い操作に台本を替えるか、指定を超えることをユーザーに伝える。
経過時間は `C(..., {ease:'linear'})` で Before と After の上に並べて出し、終わった側で止める。

## 2. アプリを起動する

1. 起動方法を repo から探す。見る場所は README、`package.json` の scripts、`Makefile`、`docker-compose.yml`、`.env.example` である。見つからなければ `run` スキルに頼るか、ユーザーに聞く。
2. Before と After を別の git worktree に用意する。

   ```bash
   git worktree add <tmp>/before <base-branch>
   git worktree add <tmp>/after <pr-branch>   # 今の作業ツリーが PR のブランチなら、それを使ってよい
   ```

3. それぞれのサーバーを、Bash のバックグラウンド実行で別のポートに起動する。起動したら、curl で応答が返るまで待つ。
4. データをそろえる。両方を同じ DB に向けるか、同じシードを入れる。シードが違うと、同じ画面の数字がシーン間で食い違う。ログインが必要なら、テスト用のアカウントで Cookie を作って `--cookies` で渡す。本番や共有環境の資格情報は使わない。
5. 撮り終えたらサーバーを止め、一時的な worktree を消す。ユーザーの既存の worktree やプロセスは止めない。

DB のマイグレーションやシードの投入のように、共有の状態を書き換える操作は、ローカルの使い捨ての DB に対してだけ行う。
共有の DB に書き込む必要があるときは、先にユーザーに確かめる。

## 3. 撮る

```bash
node <skill-dir>/scripts/record_app.js --url http://localhost:3001/ --flow flow.mjs \
  --out assets/clips/before.mp4 --viewport 1600x900 --cpu-throttle 4 --no-cache --hide '<devtools のボタンなど>'
node <skill-dir>/scripts/record_app.js --url http://localhost:3002/ --flow flow.mjs \
  --out assets/clips/after.mp4  --viewport 1600x900 --cpu-throttle 4 --no-cache --hide '<同上>'
```

- Before と After は、同じ flow、viewport、dsf、CPU とネットワークの条件、キャッシュの状態で撮る。条件の値は sidecar の `conditions` に残るので、PR 本文にも書く。
- 開発マシンが速すぎて差が見えないときは、`--cpu-throttle` で両方を同じだけ遅くする。片方だけを遅くしない。
- 計測値を主張に使うときは、同じ条件で 3 回撮って `mark` の時刻のばらつきを確かめる。動画に載せるのは中央値の回にする。
- ダークモードや狭い幅での表示が変更点なら、`--color-scheme` や `--viewport` を変えて別のクリップとして撮る。

## 4. 確かめる

- `ffprobe` で、長さが sidecar の `duration` と一致し、30fps であることを確かめる。
- `peek.py --t <秒>` で数コマを PNG に抜き、目で見る。見るのは、開発用のオーバーレイが映っていないか、読み込み中の空白で止まっていないか、個人情報や秘密情報（実在の顧客名、トークン、メールアドレス）が映っていないか、である。
- 映ってはいけないものが映ったら、シードやマスクを直して撮り直す。動画は PR に添付すると公開範囲が repo と同じになる。

## 5. シーンに組み込む

- `clip()` で枠を置き、`VID()` で再生の開始時刻と区間を決める。録画のコマは再生ではなく、1 コマずつ時刻を合わせて撮られる。
- sidecar の `actions` の時刻に `AT()` でカーソル、クリックの波紋、囲みを重ねる。録画にはマウスカーソルが映らないので、操作の位置はオーバーレイで示す。
- Before と After を並べるときは、両方の `VID()` を同じ時刻に始め、上に「Before（<base>）」「After（このブランチ）」の札を付ける。終わった側はそこで止めて最後のコマを残し、差の秒数を出す。
- 待ち時間が長い録画は、`rate` で早送りせず、図解のシーンとの間を `hard_cuts` で詰める。早送りは性能の主張を損なう。
