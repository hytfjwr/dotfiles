#!/bin/bash

# マウスホバーイベントのみ処理
# ワークスペースの表示更新はaerospace_update.shが一括で担当
[ "$SENDER" != "mouse.entered" ] && [ "$SENDER" != "mouse.exited" ] && exit 0

source "$CONFIG_DIR/colors.sh"

FOCUSED_WORKSPACE=$(aerospace list-workspaces --focused --format "%{workspace}" 2>/dev/null)

if [ "$SENDER" = "mouse.entered" ]; then
  [ "$1" = "$FOCUSED_WORKSPACE" ] && exit 0
  sketchybar --set "$NAME" \
    background.drawing=on \
    label.color="$BACKGROUND" \
    icon.color="$BACKGROUND" \
    background.color="$ACCENT_COLOR"
fi

if [ "$SENDER" = "mouse.exited" ]; then
  [ "$1" = "$FOCUSED_WORKSPACE" ] && exit 0
  sketchybar --set "$NAME" \
    background.drawing=off \
    label.color="$ACCENT_COLOR" \
    icon.color="$ACCENT_COLOR" \
    background.color="$BAR_COLOR"
fi
