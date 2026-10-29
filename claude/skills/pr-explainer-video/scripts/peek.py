#!/usr/bin/env python3
"""素材画像・クリップのコマに 50 px の方眼と目盛りを重ね、座標を読むための確認画像を作る。

座標は論理 px（CSS px。録画の dsf で割った値）。mp4 を渡したら --t 秒のコマを ffmpeg で抜いて重ねる。

usage: peek.py <画像または mp4> [x y w h] [--t 秒] [--dsf N] [-o 出力.png]
  例: peek.py assets/clips/after.mp4 --t 2.5
      peek.py assets/shot.png 1000 100 440 700
dsf は <name>.json（mp4 と同名で拡張子違い）の viewport.dsf があればそれ、無ければ画像の幅が 2400 以上なら 2 とみなす。--dsf で上書きできる。
"""
import argparse
import json
import pathlib
import subprocess
import sys
import tempfile

from PIL import Image, ImageDraw, ImageFont

ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
ap.add_argument("src", help="画像または mp4（相対パスは cwd、無ければ cwd/assets 以下から探す）")
ap.add_argument("box", nargs="*", type=float, help="切り出す範囲 x y w h（論理 px）。省略で全体")
ap.add_argument("--t", type=float, default=0.0, help="mp4 から抜く時刻（秒）")
ap.add_argument("--dsf", type=float, help="論理 px への換算倍率")
ap.add_argument("-o", "--out", help="出力 png")
a = ap.parse_args()
if a.box and len(a.box) != 4:
    ap.error("範囲は x y w h の 4 つで指定する")

src = pathlib.Path(a.src)
if not src.exists() and (pathlib.Path("assets") / a.src).exists():
    src = pathlib.Path("assets") / a.src
if not src.exists():
    sys.exit(f"見つからない: {a.src}")

dsf = a.dsf
if src.suffix.lower() in (".mp4", ".mov", ".webm"):
    side = src.with_suffix(".json")
    if dsf is None and side.exists():
        dsf = float(json.loads(side.read_text()).get("viewport", {}).get("dsf", 1))
    tmp = pathlib.Path(tempfile.mkdtemp()) / "frame.png"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(a.t), "-i", str(src), "-frames:v", "1", str(tmp)], check=True)
    im = Image.open(tmp).convert("RGB")
    tag = f"{src.stem}_t{a.t:g}"
else:
    im = Image.open(src).convert("RGB")
    tag = src.stem
k = dsf if dsf is not None else (2 if im.width >= 2400 else 1)
lw, lh = im.width / k, im.height / k
x, y, w, h = a.box or (0, 0, lw, lh)
im = im.crop((int(x * k), int(y * k), int((x + w) * k), int((y + h) * k)))
z = min(1600 / im.width, 1600 / im.height, 2.0)  # 読みやすい大きさに
im = im.resize((int(im.width * z), int(im.height * z)))
d = ImageDraw.Draw(im, "RGBA")
font = ImageFont.load_default()
for fp in ("/System/Library/Fonts/Menlo.ttc", "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"):
    try:
        font = ImageFont.truetype(fp, 14)
        break
    except OSError:
        pass
s = z * k
for gx in range(int(x // 50 * 50), int(x + w) + 1, 50):
    px = (gx - x) * s
    d.line([(px, 0), (px, im.height)], fill=(255, 0, 80, 110 if gx % 100 == 0 else 45))
    if gx % 100 == 0:
        d.text((px + 2, 2), str(gx), fill=(220, 0, 60), font=font)
for gy in range(int(y // 50 * 50), int(y + h) + 1, 50):
    py = (gy - y) * s
    d.line([(0, py), (im.width, py)], fill=(0, 90, 255, 110 if gy % 100 == 0 else 45))
    if gy % 100 == 0:
        d.text((2, py + 2), str(gy), fill=(0, 60, 220), font=font)
out = pathlib.Path(a.out) if a.out else (pathlib.Path("stills") if pathlib.Path("stills").is_dir() else pathlib.Path(".")) / f"peek_{tag}.png"
out.parent.mkdir(parents=True, exist_ok=True)
im.save(out)
print(f"{out}  (論理サイズ {lw:.0f}x{lh:.0f}, dsf {k:g})")
