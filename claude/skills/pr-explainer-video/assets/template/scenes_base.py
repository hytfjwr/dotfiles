# -*- coding: utf-8 -*-
# シーンの定義と、HTML 部品を作る関数。使い方は SCENE_CONTRACT.md
import json, pathlib, struct, subprocess

ROOT = pathlib.Path(__file__).parent
ASSETS = ROOT / "assets"
SCENES = {}      # シーン番号 → dict。番号はファイル名（parts/sNN.py）の NN
CURRENT = None   # scenes.py が import の直前に入れる


def scene(tag, title, html, steps, js, en="", hold=None, css="", readings=None):
    """tag: 右上の札（例「案 A」、空なら出さない） title: 左上の見出し en: 見出しの横の小さな英字
    html: stage（1760x796）の中身 steps: 字幕＝読み上げの文の配列 js: BUILD 関数の中身
    hold: {ステップ番号: 追加の間（秒）} css: このシーンだけの CSS（#sNN で始める） readings: [(表記, 読み)]"""
    SCENES[CURRENT] = dict(tag=tag, title=title, en=en, html=html, steps=steps, js=js, hold=hold or {}, css=css, readings=readings or [])


def asset(rel):
    p = ASSETS / rel
    if not p.exists():
        raise FileNotFoundError(p)
    return "file://" + str(p)


def png_size(rel):
    with open(ASSETS / rel, "rb") as f:
        head = f.read(24)
    return struct.unpack(">II", head[16:24])


def _id(id_):
    return f' id="{id_}"' if id_ else ""


def shot(id_, x, y, w, h, frames, url=None, view=None, lw=None, inner="", cls=""):
    """スクリーンショットの枠。frames: assets/ からの相対パス（文字列か配列。SWAP/SEQ で切り替える）
    url: 渡すとブラウザ風の上の帯を付けて、その文字を出す view: 最初に見せる矩形 [x, y, w, h]（論理 px。既定は幅に合わせて上端）
    lw: 論理幅（既定は画像の幅。2400 px 以上なら 2x で撮ったとみなして半分）。inner: .cam の中に重ねる HTML（hl/ring/spot など）"""
    frames = [frames] if isinstance(frames, str) else frames
    iw, ih = png_size(frames[0])
    lw = lw or (iw // 2 if iw >= 2400 else iw)
    lh = round(ih * lw / iw)
    imgs = "".join(f'<img class="fr" src="{asset(f)}"{"" if k == 0 else " style=opacity:0"}>' for k, f in enumerate(frames))
    bar = f'<div class="bar"><i></i><i></i><i></i><span>{url}</span></div>' if url is not None else ""
    top = 40 if url is not None else 0
    dv = f" data-view='{json.dumps(view)}'" if view else ""
    return (f'<div{_id(id_)} class="shot {cls}" style="left:{x}px;top:{y}px;width:{w}px;height:{h}px" data-lw="{lw}"{dv}>{bar}'
            f'<div class="vp" style="top:{top}px"><div class="cam" style="width:{lw}px;height:{lh}px">{imgs}{inner}</div></div></div>')


def hl(id_, x, y, w, h, cls=""):
    """蛍光ペン（.cam の中、論理 px）。A(step,'#id','growX') で左から引く"""
    return f'<div{_id(id_)} class="hl {cls}" style="left:{x}px;top:{y}px;width:{w}px;height:{h}px"></div>'


def ring(id_, x, y, w, h, pad=6, cls=""):
    """囲み（.cam の中、論理 px）。A(step,'#id','pop') など"""
    return f'<div{_id(id_)} class="ring {cls}" style="left:{x - pad}px;top:{y - pad}px;width:{w + 2 * pad}px;height:{h + 2 * pad}px"></div>'


def spot(id_, x, y, w, h, pad=8):
    """スポットライト：矩形の外を暗くする（.cam の中、論理 px）。A(step,'#id','fade')"""
    return f'<div{_id(id_)} class="spot" style="left:{x - pad}px;top:{y - pad}px;width:{w + 2 * pad}px;height:{h + 2 * pad}px"></div>'


def cursor(id_="cur"):
    """矢印のカーソル。stage の直下に置き、CUR / CLICK で動かす。出し入れは A(step,'#cur','fade') / 'out' だけを使う"""
    return (f'<div{_id(id_)} class="cursor"><div class="rip"></div><svg width="34" height="44" viewBox="0 0 34 44">'
            '<path d="M3 2 L3 34 L11 26 L17 40 L23 37 L17 24 L29 24 Z" fill="#fff" stroke="#1c2230" stroke-width="2.6" stroke-linejoin="round"/></svg></div>')


def bubble(id_, x, y, inner, tail="bl", cls="", w=None):
    ws = f"width:{w}px;" if w else ""
    return f'<div{_id(id_)} class="bubble {tail} {cls}" style="left:{x}px;top:{y}px;{ws}">{inner}</div>'


def card(id_, x, y, w, inner, cls="", h=None):
    hs = f"height:{h}px;" if h else ""
    return f'<div{_id(id_)} class="card {cls}" style="left:{x}px;top:{y}px;width:{w}px;{hs}">{inner}</div>'


def chip(id_, x, y, text, cls=""):
    return f'<div{_id(id_)} class="chip {cls}" style="left:{x}px;top:{y}px">{text}</div>'


def img(id_, x, y, w, rel, cls="", style=""):
    return f'<img{_id(id_)} class="abs {cls}" src="{asset(rel)}" style="left:{x}px;top:{y}px;width:{w}px;{style}">'


def logo(id_, x, y, h=42, rel="logo/logo.svg", aspect=4.0):
    """ロゴ画像（assets/ からの相対パス rel。SVG なら縦横比 aspect = 幅 / 高さ を渡す）"""
    return img(id_, x, y, round(h * aspect), rel)


# ---- 録画クリップ ----
# 録画担当は assets/clips/<name>.mp4 と、同名の sidecar JSON assets/clips/<name>.json を出す
#   {"fps":30,"width":W,"height":H,"duration":秒,"viewport":{"width":..,"height":..,"dsf":..},
#    "actions":[{"t":秒,"type":"click|type|scroll|goto|wait|mark","selector":"..","box":{"x":..,"y":..,"w":..,"h":..},"label":".."}]}
# box はクリップのピクセル座標。clip() の枠の論理 px は既定でクリップの幅（px）なので、box をそのまま XY / ring / hl に使える
_CLIP_META = {}


def _clip_file(src):
    p = pathlib.Path(src)
    if p.is_absolute():
        return p
    return ROOT / src if src.startswith("assets/") else ASSETS / src


def clip_meta(src):
    """クリップの fps / width / height / duration。sidecar JSON があればそれ、無ければ ffprobe"""
    f = _clip_file(src)
    if f in _CLIP_META:
        return _CLIP_META[f]
    if not f.exists():
        raise FileNotFoundError(f)
    m = {}
    side = f.with_suffix(".json")
    if side.exists():
        j = json.loads(side.read_text())
        m = {k: j[k] for k in ("fps", "width", "height", "duration") if k in j}
    if len(m) < 4:
        out = subprocess.check_output(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                                       "stream=width,height,r_frame_rate:format=duration", "-of", "json", str(f)])
        j = json.loads(out)
        a, b = j["streams"][0]["r_frame_rate"].split("/")
        m = {**dict(fps=float(a) / float(b), width=j["streams"][0]["width"], height=j["streams"][0]["height"],
                    duration=float(j["format"]["duration"])), **m}
    _CLIP_META[f] = m
    return m


def clip_actions(name, type=None):
    """assets/clips/<name>.json の actions を返す（無ければ空）。type に "click" や ["click", "type"] を渡すと絞る"""
    f = ASSETS / "clips" / f"{name}.json"
    if not f.exists():
        return []
    acts = json.loads(f.read_text()).get("actions", [])
    if type is not None:
        ts = [type] if isinstance(type, str) else list(type)
        acts = [a for a in acts if a.get("type") in ts]
    return acts


def box_center(a):
    """action（か box）の中心 (x, y)。クリップのピクセル座標。XY('#id', *box_center(a)) で stage の座標になる"""
    b = a.get("box", a)
    return (b["x"] + b["w"] / 2, b["y"] + b["h"] / 2)


def clip(id_, x, y, w, h, src, view=None, cls="", url=None, inner="", lw=None):
    """録画クリップの枠（shot と同じ切り抜き。FOCUS / XY / CUR がそのまま効く）。src: 作業ディレクトリからの相対パス（assets/clips/<name>.mp4）
    view: 最初に見せる矩形 [x, y, w, h]（クリップのピクセル座標）。url: ブラウザ風の帯。inner: .cam の中に重ねる HTML（ring / hl / spot）
    lw: 論理幅（既定はクリップの幅 px）。再生は engine.js の VID(step, '#id', {d, from, to, rate}) で決める"""
    m = clip_meta(src)
    lw = lw or m["width"]
    lh = round(m["height"] * lw / m["width"])
    vid = (f'<video class="fr" muted playsinline preload="auto" src="{"file://" + str(_clip_file(src))}" '
           f'data-fps="{m["fps"]}" data-dur="{m["duration"]}"></video>')
    bar = f'<div class="bar"><i></i><i></i><i></i><span>{url}</span></div>' if url is not None else ""
    top = 40 if url is not None else 0
    dv = f" data-view='{json.dumps(view)}'" if view else ""
    return (f'<div{_id(id_)} class="shot clip {cls}" style="left:{x}px;top:{y}px;width:{w}px;height:{h}px" data-lw="{lw}"{dv}>{bar}'
            f'<div class="vp" style="top:{top}px"><div class="cam" style="width:{lw}px;height:{lh}px">{vid}{inner}</div></div></div>')


def harrow(x, y, length, color="#b8bec9", id_="", cls="", width=5):
    """横向きの矢印。(x, y) は左端の中心"""
    h = 30
    return (f'<svg{_id(id_)} class="abs {cls}" style="left:{x}px;top:{y - h // 2}px" width="{length}" height="{h}" viewBox="0 0 {length} {h}">'
            f'<line x1="0" y1="15" x2="{length - 8}" y2="15" stroke="{color}" stroke-width="{width}" stroke-linecap="round"/>'
            f'<path d="M{length - 22} 4 L{length - 4} 15 L{length - 22} 26" fill="none" stroke="{color}" stroke-width="{width}" stroke-linecap="round" stroke-linejoin="round"/></svg>')


def varrow(x, y, length, color="#b8bec9", id_="", cls="", width=5):
    """下向きの矢印。(x, y) は上端の中心"""
    w = 30
    return (f'<svg{_id(id_)} class="abs {cls}" style="left:{x - w // 2}px;top:{y}px" width="{w}" height="{length}" viewBox="0 0 {w} {length}">'
            f'<line x1="15" y1="0" x2="15" y2="{length - 8}" stroke="{color}" stroke-width="{width}" stroke-linecap="round"/>'
            f'<path d="M4 {length - 22} L15 {length - 4} L26 {length - 22}" fill="none" stroke="{color}" stroke-width="{width}" stroke-linecap="round" stroke-linejoin="round"/></svg>')


# ---- 端末の画面（Claude Code CLI の再現） ----
# term() の中身は、下の t_* で作る行を並べる。行は SHOW で時刻に出し、新しい行が下に足されると古い行は上へ押し出される
def term(id_, x, y, w, h, body, title="terminal", prompt="", prompt_id=None, hint="? for shortcuts", inner="", toast=""):
    """端末の窓。body: 行の HTML（t_* の連結）。prompt: 入力欄に最初から出す文字。prompt_id: 入力欄の id（TYPE で打つ）
    toast: t_toast() の HTML。入力欄の下に右寄せで出る（本物の Claude Code と同じ位置）。inner: 窓の上に重ねる要素（.tw の中に絶対配置）"""
    pid = prompt_id or f"{id_}-in"
    return (f'<div{_id(id_)} class="tw" style="left:{x}px;top:{y}px;width:{w}px;height:{h}px">'
            f'<div class="tbar"><i></i><i></i><i></i><span>{title}</span></div>'
            f'<div class="tbody"><div class="tscroll">{body}</div>'
            f'<div class="tprompt"><span class="pc">&gt;</span><span id="{pid}" class="pin">{prompt}</span></div>'
            f'<div class="thint">{hint}</div><div class="ttoasts">{toast}</div></div>{inner}</div>')


def t_welcome(cwd="~/project"):
    return ('<div class="tl twel"><div><span class="o">✻</span> Welcome to <b>Claude Code</b>!</div>'
            '<div class="dim">  /help for help, /status for your current setup</div>'
            f'<div class="dim">  cwd: {cwd}</div></div>')


def t_user(id_, text):
    """利用者の入力（> の行）"""
    return f'<div{_id(id_)} class="tl tuser"><span class="pc">&gt;</span> {text}</div>'


def t_say(id_, html):
    """Claude の応答の文（白い ⏺）"""
    return f'<div{_id(id_)} class="tl tsay"><span class="dot">⏺</span><span class="tx">{html}</span></div>'


def t_tool(id_, name, args="", state="ok"):
    """ツール呼び出しの行。state: ok（緑の ⏺）/ err（赤）/ run（灰）。args が空なら括弧を付けない（引数の無い MCP ツールなど）"""
    a = f"({args})" if args else ""
    return f'<div{_id(id_)} class="tl ttool {state}"><span class="dot">⏺</span><span class="tx"><b>{name}</b>{a}</span></div>'


def t_res(id_, html, cls=""):
    """ツールの結果（⎿ の行）。cls: err（赤）/ dim"""
    return f'<div{_id(id_)} class="tl tres {cls}"><span class="el">⎿</span><span class="tx">{html}</span></div>'


def t_running(id_):
    """実行中のツールの下に出す「⎿  Running…」の行。結果の行が出る時刻に HIDE で消す"""
    return t_res(id_, "Running…", cls="dim")


def t_spin(id_, word="Thinking…"):
    """考え中の印。経過秒（.sec）は engine.js が SHOW の時刻から数えて入れる"""
    return f'<div{_id(id_)} class="tl tspin"><span class="spin">✻</span> <span class="o">{word}</span> <span class="dim">(<span class="sec"></span>esc to interrupt)</span></div>'


def t_diff(id_, path, rows):
    """編集の差分。rows: [(" " | "-" | "+", 行番号, 本文)]"""
    body = "".join(f'<div class="dr {"dm" if s == "-" else "dp" if s == "+" else ""}"><span class="ln">{n}</span><span class="sg">{s}</span>{t}</div>' for s, n, t in rows)
    return f'<div{_id(id_)} class="tl tdiff"><div class="dh">{path}</div>{body}</div>'


def t_toast(id_, html):
    """mod のトースト。term(toast=...) に入れると、入力欄の下に右寄せで出る"""
    return f'<div{_id(id_)} class="ttoast">{html}</div>'
