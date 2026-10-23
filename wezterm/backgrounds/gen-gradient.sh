#!/usr/bin/env bash
# WezTerm 背景用のループするグラデーションアニメーションを生成する。
#   1. 1 周期ぶんのフレームを静止画（frames/NNNN.png）にレンダリング
#   2. その静止画を無限ループの APNG（gradient.png）にまとめる
# 明るさの違う 3 つのモノクロの光の玉が周期 PERIOD 秒の軌道をまわるので、
# 最終フレームから先頭へ継ぎ目なくつながる。
# WezTerm は全フレームを展開してメモリに載せるため、解像度は低めにして描画時の拡大に任せる。
set -euo pipefail

cd "$(dirname "$0")"

OUT="gradient.png"
FRAME_DIR="frames"
WIDTH=384
HEIGHT=240
FPS=8
PERIOD=24
# 光の玉の強さ。端末の背景なので暗めに抑える
GAIN=0.32

# 1 周期を a = 2π t / PERIOD とし、玉の座標は a の三角関数だけで表す
A="(2*PI*T/${PERIOD})"
SIGMA2="(2*pow(0.30*W,2))"

blob() {
	local cx="$1" cy="$2"
	echo "exp(-(pow(X-W*(${cx}),2)+pow(Y-H*(${cy}),2))/${SIGMA2})"
}

B1=$(blob "0.5+0.38*cos(${A})" "0.5+0.42*sin(${A})")
B2=$(blob "0.5+0.40*cos(2*${A}+2.1)" "0.5+0.38*sin(${A}+1.0)")
B3=$(blob "0.5+0.36*sin(${A}+4.2)" "0.5+0.40*cos(2*${A})")

# ほぼ黒のベースに、明るさの違う 3 つの玉を足す。モノクロなので R/G/B に同じ式を使う
L="clip(8+${GAIN}*(170*${B1}+120*${B2}+80*${B3}),0,255)"

FRAMES=$((FPS * PERIOD))

rm -rf "${FRAME_DIR}"
mkdir -p "${FRAME_DIR}"

ffmpeg -hide_banner -loglevel error -y \
	-f lavfi -i "color=c=black:s=${WIDTH}x${HEIGHT}:r=${FPS},format=gbrp" \
	-vf "geq=r='${L}':g='${L}':b='${L}',format=rgb24" \
	-frames:v "${FRAMES}" -start_number 0 "${FRAME_DIR}/%04d.png"

ffmpeg -hide_banner -loglevel error -y \
	-framerate "${FPS}" -i "${FRAME_DIR}/%04d.png" \
	-plays 0 -f apng "${OUT}"

echo "rendered: $(pwd)/${FRAME_DIR}/ (${FRAMES} frames)"
echo "looped:   $(pwd)/${OUT}"
