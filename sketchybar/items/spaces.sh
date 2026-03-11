#!/bin/bash

# ワークスペースアイテムを作成（初期状態は非表示）
# 表示更新はaerospace_update.shが一括で担当
for sid in $(aerospace list-workspaces --all); do
  sketchybar --add item space."$sid" left \
    --subscribe space."$sid" mouse.entered mouse.exited \
    --set space."$sid" \
    drawing=off \
    padding_right=0 \
    icon="$sid" \
    icon.font="SF Pro:Bold:14.0" \
    label.font="sketchybar-app-font:Regular:18.0" \
    label.y_offset=-2 \
    label.padding_right=7 \
    icon.padding_left=7 \
    icon.padding_right=4 \
    background.drawing=on \
    background.color="$ACCENT_COLOR" \
    icon.color="$BACKGROUND" \
    label.color="$BACKGROUND" \
    background.corner_radius=5 \
    background.height=30 \
    label.drawing=on \
    click_script="aerospace workspace $sid" \
    script="$CONFIG_DIR/plugins/aerospace.sh $sid"
done
