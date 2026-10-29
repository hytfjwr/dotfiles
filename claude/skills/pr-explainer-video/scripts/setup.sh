#!/usr/bin/env bash
# pr-explainer-video の環境準備（冪等）。
#   1. node / ffmpeg / ffprobe / docker / Chrome の有無を確認する
#   2. $PR_EXPLAINER_VIDEO_HOME に npm 依存を入れる
#   3. 音声合成エンジン（既定 AivisSpeech、--voicevox で VOICEVOX）を Docker で起動する
# usage: setup.sh [--voicevox] [--no-tts]
set -uo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOME_DIR="${PR_EXPLAINER_VIDEO_HOME:-${XDG_CACHE_HOME:-$HOME/.cache}/pr-explainer-video}"

AIVIS_IMAGE="ghcr.io/aivis-project/aivisspeech-engine:cpu-latest"
AIVIS_NAME="aivisspeech"
AIVIS_URL="http://127.0.0.1:10101"
AIVIS_DATA="$HOME/.local/share/AivisSpeech-Engine"
AIVIS_STYLE_ID=1937616896                              # 話者「にせ」ノーマル
AIVIS_MODEL_UUID="6d11c6c2-f4a4-4435-887e-23dd60f8b8dd" # AivisHub 上の「にせ」（公開情報）
VOICEVOX_NAME="voicevox"
VOICEVOX_URL="http://127.0.0.1:50021"

USE_VOICEVOX=0; NO_TTS=0
for a in "$@"; do
  case "$a" in
    --voicevox) USE_VOICEVOX=1 ;;
    --no-tts) NO_TTS=1 ;;
    -h|--help) sed -n '2,6p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "不明な引数: $a" >&2; exit 2 ;;
  esac
done

MISSING=()
say() { printf '%s\n' "$*"; }
have() { command -v "$1" >/dev/null 2>&1; }

# ---------- 1. 道具の確認 ----------
say "== 道具の確認"
for c in node npm ffmpeg ffprobe docker curl python3; do
  if have "$c"; then say "  ok   $c"; else say "  無い $c"; MISSING+=("$c"); fi
done
CHROME=""
for c in "${CHROME_PATH:-}" "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" "/Applications/Chromium.app/Contents/MacOS/Chromium"; do
  [ -n "$c" ] && [ -x "$c" ] && { CHROME="$c"; break; }
done
if [ -z "$CHROME" ]; then
  for c in google-chrome chromium chromium-browser chrome; do have "$c" && { CHROME="$(command -v "$c")"; break; }; done
fi
if [ -n "$CHROME" ]; then say "  ok   Chrome ($CHROME)"; else say "  無い Chrome（CHROME_PATH で指定できる）"; MISSING+=("Chrome"); fi
have whisper-cli && say "  ok   whisper-cli（任意。make_review.sh の文字起こし用）" || say "  なし whisper-cli（任意。無くても動く）"
python3 -c 'import PIL' 2>/dev/null && say "  ok   python3 Pillow（peek.py 用）" || say "  なし Pillow（peek.py 用。pip install pillow）"
if [ ${#MISSING[@]} -gt 0 ]; then
  say "足りないもの: ${MISSING[*]}"
  say "macOS なら例: brew install node ffmpeg && brew install --cask docker google-chrome"
fi

# ---------- 2. npm 依存 ----------
say "== npm 依存 ($HOME_DIR)"
if have npm; then
  mkdir -p "$HOME_DIR"
  if cmp -s "$SKILL_DIR/package.json" "$HOME_DIR/package.json" && [ -d "$HOME_DIR/node_modules/puppeteer-core" ] && [ -d "$HOME_DIR/node_modules/@fontsource/noto-sans-jp" ]; then
    say "  導入済み。飛ばす"
  else
    cp "$SKILL_DIR/package.json" "$HOME_DIR/package.json"
    if (cd "$HOME_DIR" && npm install --no-audit --no-fund --loglevel=error); then say "  npm install 完了"; else say "  npm install に失敗"; rm -f "$HOME_DIR/package.json"; MISSING+=("npm-deps"); fi
  fi
else
  say "  npm が無いので飛ばす"
fi

say "== 文字起こしのモデル（whisper.cpp、make_review.sh 用）"
WHISPER_DEFAULT="$HOME_DIR/models/ggml-small.bin"
if ! have whisper-cli; then
  say "  whisper-cli が無いので飛ばす（brew install whisper-cpp で入る）"
elif [ -s "$WHISPER_DEFAULT" ]; then
  say "  導入済み ($WHISPER_DEFAULT)"
else
  mkdir -p "$HOME_DIR/models"
  if curl -fL --retry 2 -o "$WHISPER_DEFAULT.part" "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin" && mv "$WHISPER_DEFAULT.part" "$WHISPER_DEFAULT"; then
    say "  ggml-small を取得 ($WHISPER_DEFAULT)"
  else
    rm -f "$WHISPER_DEFAULT.part"; say "  取得に失敗（任意。WHISPER_MODEL で別のモデルを指定できる）"
  fi
fi

[ "$NO_TTS" = 1 ] && { say "== 音声合成エンジンは --no-tts で飛ばす"; [ ${#MISSING[@]} -eq 0 ] && exit 0 || exit 1; }

# ---------- 3. 音声合成エンジン ----------
alive() { curl -fsS -m 2 "$1/version" >/dev/null 2>&1; }
wait_alive() { # $1=url
  local i; for i in $(seq 1 90); do alive "$1" && return 0; sleep 2; done; return 1
}
start_container() { # $1=name $2=url, 残りは docker run の引数
  local name="$1" url="$2"; shift 2
  if alive "$url"; then say "  $name は起動済み ($url)"; return 0; fi
  if ! have docker; then say "  docker が無いので $name を起動できない"; return 1; fi
  if ! docker info >/dev/null 2>&1; then say "  Docker が起動していない。起動してからもう一度実行する"; return 1; fi
  if docker ps -a --format '{{.Names}}' | grep -qx "$name"; then
    say "  停止中の $name を start する"; docker start "$name" >/dev/null
  else
    say "  $name を docker run する"; docker run -d --name "$name" "$@" >/dev/null || return 1
  fi
  say "  起動待ち（最大 3 分）"
  wait_alive "$url" && say "  $name 起動 ($url)" || { say "  $name が応答しない: docker logs $name"; return 1; }
}

if [ "$USE_VOICEVOX" = 1 ]; then
  say "== VOICEVOX"
  case "$(uname -m)" in arm64|aarch64) VV_TAG="cpu-arm64-latest" ;; *) VV_TAG="cpu-latest" ;; esac
  start_container "$VOICEVOX_NAME" "$VOICEVOX_URL" -p 127.0.0.1:50021:50021 "voicevox/voicevox_engine:$VV_TAG" \
    || MISSING+=("voicevox")
else
  say "== AivisSpeech Engine"
  mkdir -p "$AIVIS_DATA"
  start_container "$AIVIS_NAME" "$AIVIS_URL" -p 127.0.0.1:10101:10101 \
    -v "$AIVIS_DATA:/home/user/.local/share/AivisSpeech-Engine-Dev" "$AIVIS_IMAGE" || MISSING+=("aivisspeech")
  if alive "$AIVIS_URL"; then
    if curl -fsS -m 10 "$AIVIS_URL/speakers" | grep -q "\"id\":$AIVIS_STYLE_ID"; then
      say "  話者 $AIVIS_STYLE_ID は導入済み。何もしない"
    else
      say "  話者 $AIVIS_STYLE_ID が無い。AivisHub からモデル $AIVIS_MODEL_UUID を取得して入れる"
      TMP="$(mktemp -d)"
      if curl -fL --retry 2 -o "$TMP/model.aivmx" "https://api.aivis-project.com/v1/aivm-models/$AIVIS_MODEL_UUID/download?model_type=AIVMX" \
         && [ "$(wc -c < "$TMP/model.aivmx")" -gt 1000000 ] \
         && curl -fsS -X POST -F "file=@$TMP/model.aivmx" "$AIVIS_URL/aivm_models/install" >/dev/null; then
        curl -fsS -m 10 "$AIVIS_URL/speakers" | grep -q "\"id\":$AIVIS_STYLE_ID" \
          && say "  モデルを導入した" || { say "  導入したが話者 $AIVIS_STYLE_ID が見えない。/speakers を確認する"; MISSING+=("aivis-model"); }
      else
        say "  モデルの取得か導入に失敗。手順:"
        say "    1. https://hub.aivis-project.com/aivm-models/$AIVIS_MODEL_UUID から AIVMX を取得する"
        say "    2. curl -X POST -F 'file=@<ダウンロードしたファイル>' $AIVIS_URL/aivm_models/install"
        MISSING+=("aivis-model")
      fi
      rm -rf "$TMP"
    fi
  fi
fi

say "== 結果"
if [ ${#MISSING[@]} -eq 0 ]; then say "  準備完了"; exit 0; else say "  未解決: ${MISSING[*]}"; exit 1; fi
