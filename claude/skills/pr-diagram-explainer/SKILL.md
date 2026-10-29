---
name: pr-diagram-explainer
description: |
  Create rich explanatory figures for a pull request body so reviewers can grasp the change
  (processing flow, layer/reference rules, before/after reach, step-by-step checks and their
  outcomes, rollout order, data shape) at a glance before reading the diff. Figures are built
  as HTML/CSS with bundled parts, verified with headless Chrome, rendered to 2x PNG, and
  attached to the PR with `gh --attach`. Use whenever the user wants figures, diagrams, SVG or
  "rich" explanatory images in a PR description: "PRに解説図を載せて", "解説SVGを作って",
  "PR本文にリッチな解説画像を添えて", "レビュワー向けに図を描いて", "図で説明して(PRに貼る)",
  "Draft PR作って、解説SVGも", "/pr-diagram-explainer". Also use when updating figures already
  attached to a PR.
  Do not use for diagrams committed to the repo (d2 lineage, mermaid in docs), data charts
  (use dataviz), explainer videos, or standalone HTML pages / Artifacts.
user_invocable: true
---

# PR 解説図

レビュワーが diff を読む前に変更の全体像をつかめるよう、PR 本文に解説の図を載せる。
狙いはレビュワーの認知負荷を下げることである。

図の主役は形と色である。
箱、帯、矢印、×、状態のラベル、太字の結論で構造を見せ、文字は名前と結論に絞る。
文で補うのは、図の下のキャプションか、箱の中の小さな灰色の補足だけにする。
文字が均一に並んだ図は、どこから読むかを読み手に考えさせ、かえって負荷を上げる。
逆に文字を削りすぎて実例や結論まで消すと、何の図か分からなくなる。
名前の下に実例の識別子を添え、結論は色付きで大きく置く。

図は HTML と CSS で組み、headless Chrome で 2 倍の PNG にして添付する。
CSS ならカード、角丸の状態ラベル、文の折り返しを素直に組め、PNG ならレビュワーの環境のフォントに左右されない。
作業用ディレクトリ（スクラッチパッドの `pr-assets/` など）に置き、repo にはコミットしない。

## 1. 何を図にするかを決める

先に変更の正本を読む。設計書があればその全文、なければ PR の diff（`gh pr diff <n>` か `git diff main...HEAD`）とコミットメッセージ、関連する issue である。

そのうえで、レビュワーが diff を開いたときに最初に抱く問いを書き出し、図で答えると速いものを 1〜3 個選ぶ。
よく効く型と、そのまま写して使える例は次のとおりで、組み方の詳細は [references/style.md](references/style.md) にある。

|レビュワーの問い|図の型|例|
|---|---|---|
|何が何を参照してよいのか、どこが違反か|層と参照の向き|`assets/examples/layers.html`|
|この変更で何が止まり、何が通るのか|変更前と変更後|`assets/examples/before-after.html`|
|どの順に何を検査し、それぞれどうなるのか|段と結果の分岐|`assets/examples/steps.html`|
|データや処理はどこからどこへ流れるのか|流れの列（①〜④）|style.md|
|状況ごとに、変更前と変更後で判定がどう変わるのか|判定の表|style.md|
|複数の PR や手作業を、どの順に入れるのか|反映順序|style.md|
|grain は何か、結合や集約で行がどう変わるのか|データの形|style.md|

選ばないもの:

- Markdown の表や 3 行の文で伝わること（設定値の一覧など）。表のほうが検索でき、差分も追える。
- 変更していない既存の仕組みの説明だけの図。
- typo 修正、依存の更新など、構造の無い変更。このときは図を作らず、その旨をユーザーに伝える。
- 件数や時間の分布。これは棒グラフにする（dataviz スキル）。

1 枚に 1 つの問いだけを載せる。見出しはその答えを短く言い切る（「バケットに届くのは取り込みのユーザーだけになる」）。

## 2. 見せ方を決める

描き始める前に、その図の主張を 1 文で書き、それを形と色で見せる方法を選ぶ。

|伝えたいこと|見せ方（部品）|
|---|---|
|参照する、流れる、呼ぶ|矢印（`wires`）。許すものは実線|
|違反、拒否|赤の破線の矢印に丸い ×（`"kind": "ng", "dash": true, "cross": true`）。番号を振り、図の下の `.key` で説明する|
|届かなくなった、取り上げた|箱を灰色（`.node.muted`）にし、短い破線と ×（`"stub": true`）|
|層、主体、repo の区別|カテゴリ色の帯（`.lane`）やカード（`.card.c-blue` など）。凡例は帯の名前か `.legend`|
|この PR で変わる所|`.node.changed` か `.badge`（「この PR」）|
|判定の結果|`.verdict`（失敗 / 成功を太く大きく）、`.pill`、`.icon.ok` / `.icon.ng`、`.result`|
|変更前と変更後|同じ配置を左右に並べ、`.tag.c-red`「変更前」と `.tag.c-green`「変更後」を付ける|
|件数|`.big`（大きな数字）|
|段の順序|①〜④ の見出しと `→`|
|無い、対象外、取り消し|灰色、`.strike`|

文字の扱い:

- 箱には名前と実例の識別子（`.sub.mono`）だけを書く。実例があると抽象的な名前の意味が一度で分かる。
- 識別子は途中で折らない。収まらないなら列や箱を減らすか、誤解の無い短い名前にし、完全な名前は本文に書く。
- 結論は色付きの太字で大きく、根拠は `.detail`（15px、灰色）で 1〜2 行。強弱の差で読む順を作る。
- 文（句点のある文）を書いてよいのは `.detail`、`.note`、`.caption`、`.subtitle` だけ。
- 1 枚の文字量は 450 字まで（半角は 0.5 字）。過去に「文字が多くて仰々しい」と言われた図は 600〜1000 字で、強弱が無かった。
- 長い説明、理由、例外は PR 本文に書く。

## 3. 内容を正本に合わせる

図は主張であり、誤りがあればレビュワーを誤った理解に導く。

- 用語、識別子（ファイル名、関数名、テーブル名、ロール名）、数値は設計書かコードからそのまま取る。図のために造語しない。repo に用語の規約があれば従う。
- 文の書き方は repo の文章規範があれば従う。日本語の並列に中黒（・）は使わず、読点か ` / ` で区切る。
- 描き終えたら、図の各ラベルと矢印を正本と 1 つずつ突き合わせる。

## 4. 組む

```bash
# 型の近い例から始める（--like を外すと空の雛形）。base.css と wires.js も同じ所に置かれる
python3 <skill-dir>/scripts/figtool.py new <work-dir>/access.html --like before-after
```

例の中身を、この PR の内容に書き換える。例の配置や部品の組み合わせは過去にわかりやすいと評価された型なので、崩さずに使う。
部品は `base.css` のクラスで組み、矢印は `<script type="application/json" id="wires">` に書く。書き方は `wires.js` の冒頭にある。

守ること（理由は style.md）:

- 図の幅は 1000px（`.fig`）。GitHub は幅およそ 880px で表示するので、文字は 15px 以上にする。
- 外部の資源（Web フォント、CDN、画像の URL）を読まない。
- グラデーション、影、片側だけの色の太線、絵文字、イラスト、漫画風の装飾は使わない。
- 色はカテゴリ（層、主体、repo）と意味（赤 = 悪化 / 拒否、緑 = 改善 / 通る）に使い分け、1 枚の中で同じ色に 2 つの役割を持たせない。
- 要素を詰めるより、要素を減らす。

## 5. 検査して目で確かめる

```bash
python3 <skill-dir>/scripts/figtool.py check  fig-a.html fig-b.html
python3 <skill-dir>/scripts/figtool.py render fig-a.html fig-b.html
```

- `check` は、文字の大きさ、はみ出し、文字の重なり、矢印や × が文字や関係の無い箱にかぶる箇所、文の置き場所、文字量、中黒、絵文字、禁じた装飾、外部の資源を検出する。ERROR が 0 件になるまで直す。文字量の ERROR は、文字を小さくしたり詰めたりせず、説明を本文へ移して形で見せて直す。WARN は PNG を見て判断する。
- `render` は添付用の `fig-a.png`（2 倍）と、GitHub の表示幅で見た `fig-a.gh.png` を書く。`.gh.png` を Read で見る。これがレビュワーの実際の見え方である。
- `.gh.png` で確かめること（スクリプトでは分からない）:
  - 5 秒眺めて、見出しの主張が形と色から分かるか。文を読まないと分からないなら見せ方を変える。
  - 結論が補足より先に目に入るか（強弱）。
  - 矢印が正しい箱を指し、交差や遠回りが無いか。
  - 同じ意味に同じ色と形を使っているか、余白が偏っていないか。

直したら `check` と `render` をやり直し、PNG をもう一度見る。

## 6. PR 本文に載せる

本文の Markdown（例: `body.md`）では、図が説明する節の見出しの直後に PNG を置き、そのあとに本文の説明を続ける。

```markdown
## 何が届かなくなるか

![バケットに届くのは取り込みのユーザーだけになる](./access.png)

loader の … （図を見た前提で、図に無い理由や制約を書く）
```

既存の PR の本文に図がすでにあるときは、それを残して足す。
同じ問いに答える図を差し替えたいときは、差し替える理由を添えてユーザーに確かめる。

alt には図の見出しを書く。
添付は `gh` v2.99 以降の `--attach` を使う（`gh --version` で確かめる）。
画像のあるディレクトリで実行し、`--attach` に渡すパスを本文の参照と揃える。`#` の後ろは alt になる。

```bash
# 新規の PR
gh -R <owner>/<repo> pr create --draft --base main --head <branch> --title "<title>" \
  --body-file body.md --attach './fig-a.png#<alt>' --attach './fig-b.png#<alt>'

# 既存の PR の本文を差し替える、または図を描き直したとき
gh -R <owner>/<repo> pr edit <n> --body-file body.md --attach './fig-a.png#<alt>'
```

- git repo の外で実行すると `failed to run git` で失敗するので `-R` を付ける。
- 添付後は必ず本文を確かめる。`./fig-a.png` がその場で `https://github.com/user-attachments/assets/...` に置き換わることもあれば、URL が本文の末尾に追記されて `./fig-a.png` が壊れたリンクのまま残ることもある。

```bash
gh -R <owner>/<repo> pr view <n> --json body -q .body | rg -n 'user-attachments|\]\(\./'
```

末尾に追記されていたら、URL を本文中の参照の位置へ移して末尾の行を消し、`--attach` なしの `gh pr edit --body-file` で直す。
`Could not resolve to a Repository` が出たら、`gh auth status` で使っているアカウントを確かめて切り替える。

PR の作成、本文の書き換えはユーザーが頼んだときだけ行う。頼まれていなければ、HTML、PNG、`body.md` のパスと、実行するコマンドを示して止める。

## 作図を任せるとき

親がオーケストレーターに徹しているときは、作図をサブエージェントに任せてよい。
指示書は [references/brief-template.md](references/brief-template.md) の形で書く。
サブエージェントの「重なりは無い」という自己申告を鵜呑みにせず、最後に親が `check` を流し、`.gh.png` を自分で見てから添付する。

見せ方の方向が決まらないとき（ユーザーが「候補を見せて」と言ったときなど）は、2〜3 案を並べた Artifact を作って選んでもらってから清書する。
