#!/usr/bin/env bash
# レビュー用の一式を <workdir>/review<N>/ に集める。
# usage: make_review.sh <workdir> <N>
#   stills/（各シーン終わりの静止画）、sheets/（seg/vNN.mp4 を 2 秒ごと 480px・4x4 に並べたコンタクトシート）、
#   srt、kana.txt（build.py --kana）、durations.txt（各シーンの長さ）。
#   whisper-cli があれば、最終 mp4 の文字起こし whisper.txt も作る。モデルは WHISPER_MODEL、無ければ setup.sh が入れた ggml-small。
set -uo pipefail

if [ $# -ne 2 ]; then sed -n '2,7p' "$0" | sed 's/^# \{0,1\}//'; exit 2; fi
WORK="$(cd "$1" && pwd)" || exit 2
R="$WORK/review$2"
cd "$WORK" || exit 2

# video.json の out（作業ディレクトリからの相対）から最終 mp4 と srt を決める
OUT="explainer.mp4"
if [ -f video.json ]; then
  OUT="$(python3 -c 'import json;print(json.load(open("video.json")).get("out","explainer.mp4"))' 2>/dev/null || echo explainer.mp4)"
fi
MP4="$WORK/$OUT"; SRT="${MP4%.*}.srt"

rm -rf "$R"; mkdir -p "$R/stills" "$R/sheets"

if [ -f build.py ]; then
  python3 build.py --stills > /dev/null || echo "注意: build.py --stills が失敗した"
else
  echo "注意: build.py が無い。stills と kana は飛ばす"
fi
for f in stills/s[0-9][0-9]*_end.png; do [ -f "$f" ] && cp "$f" "$R/stills/"; done

for f in seg/v[0-9][0-9].mp4; do
  [ -f "$f" ] || continue
  n="$(basename "$f" .mp4)"; n="${n#v}"
  ffmpeg -v error -y -i "$f" -vf "fps=1/2,scale=480:-1,tile=4x4:padding=4:color=white" -frames:v 1 "$R/sheets/s$n.png"
done

[ -f "$SRT" ] && cp "$SRT" "$R/" || echo "注意: $SRT が無い"
[ -f build.py ] && python3 build.py --kana > "$R/kana.txt"

for f in seg/v[0-9][0-9].mp4; do
  [ -f "$f" ] || continue
  printf '%s %s\n' "$(basename "$f")" "$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f")"
done > "$R/durations.txt"

WHISPER_MODEL="${WHISPER_MODEL:-${PR_EXPLAINER_VIDEO_HOME:-${XDG_CACHE_HOME:-$HOME/.cache}/pr-explainer-video}/models/ggml-small.bin}"
if [ -f "$MP4" ] && command -v whisper-cli >/dev/null 2>&1 && [ -n "${WHISPER_MODEL:-}" ] && [ -f "${WHISPER_MODEL:-}" ]; then
  TMP="$(mktemp -d)"
  ffmpeg -v error -y -i "$MP4" -ar 16000 -ac 1 -c:a pcm_s16le "$TMP/a.wav" \
    && whisper-cli -m "$WHISPER_MODEL" -l ja -nt -np -otxt -of "$R/whisper" -f "$TMP/a.wav" > /dev/null 2>&1 \
    && echo "whisper.txt を作った" || echo "注意: 文字起こしに失敗した"
  rm -rf "$TMP"
else
  echo "whisper は飛ばす（whisper-cli、WHISPER_MODEL、最終 mp4 のどれかが無い）"
fi

echo "レビュー一式: $R"; ls "$R"
