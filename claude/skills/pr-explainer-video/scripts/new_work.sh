#!/usr/bin/env bash
# 解説動画の作業ディレクトリを作る。
# usage: new_work.sh <workdir>
#   assets/template/ の中身を複写（既存ファイルは上書きしない）、node_modules を共有の依存への symlink にし、
#   assets/clips/ と parts/ を作る。video.json が無ければ {"out":"explainer.mp4"} を作る。
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOME_DIR="${PR_EXPLAINER_VIDEO_HOME:-${XDG_CACHE_HOME:-$HOME/.cache}/pr-explainer-video}"
TEMPLATE="$SKILL_DIR/assets/template"

if [ $# -ne 1 ] || [ "$1" = "-h" ] || [ "$1" = "--help" ]; then sed -n '2,5p' "$0" | sed 's/^# \{0,1\}//'; exit 2; fi
WORK="$1"
mkdir -p "$WORK"
WORK="$(cd "$WORK" && pwd)"

if [ -d "$TEMPLATE" ]; then
  # -n: 既存ファイルは上書きしない。末尾 /. で隠しファイルも含める
  cp -Rn "$TEMPLATE"/. "$WORK"/ 2>/dev/null || true
  echo "template を複写した: $TEMPLATE -> $WORK"
else
  echo "注意: $TEMPLATE が無い。template の複写は飛ばす"
fi

mkdir -p "$WORK/assets/clips" "$WORK/parts"

if [ -L "$WORK/node_modules" ] || [ ! -e "$WORK/node_modules" ]; then
  ln -sfn "$HOME_DIR/node_modules" "$WORK/node_modules"
  echo "node_modules -> $HOME_DIR/node_modules"
  [ -d "$HOME_DIR/node_modules" ] || echo "注意: $HOME_DIR/node_modules がまだ無い。scripts/setup.sh を実行する"
else
  echo "注意: $WORK/node_modules が既にあるので、そのままにする"
fi

if [ ! -e "$WORK/video.json" ]; then
  printf '{"out":"explainer.mp4"}\n' > "$WORK/video.json"
  echo "video.json を作った"
fi
echo "作業ディレクトリ: $WORK"
