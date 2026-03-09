#!/bin/bash

# 全ワークスペースの表示を一括更新するスクリプト
# 個別スクリプトが同時にaerospace CLIを呼び出してタイムアウトする問題を回避するため、
# 1つのスクリプトで最小限のCLI呼び出しにまとめる

source "$CONFIG_DIR/colors.sh"

# イベント経由の場合は環境変数から、定期実行の場合はCLIから取得
if [ -z "$FOCUSED_WORKSPACE" ]; then
  FOCUSED_WORKSPACE=$(aerospace list-workspaces --focused --format "%{workspace}" 2>/dev/null)
fi

if [ -z "$FOCUSED_WORKSPACE" ]; then
  exit 0
fi

# フォーカス変更時のみアニメーションを適用
PREV_FOCUSED=$(cat /tmp/sketchybar_focused_workspace 2>/dev/null)
echo "$FOCUSED_WORKSPACE" >/tmp/sketchybar_focused_workspace

# 全ウィンドウ情報を1回で取得
ALL_WINDOWS=$(aerospace list-windows --all --json --format "%{workspace}%{app-name}%{monitor-appkit-nsscreen-screens-id}" 2>/dev/null)
if [ $? -ne 0 ] || [ -z "$ALL_WINDOWS" ]; then
  ALL_WINDOWS="[]"
fi

for sid in $(aerospace list-workspaces --all 2>/dev/null); do
  # このワークスペースのアプリ名一覧を抽出
  WORKSPACE_APPS=$(echo "$ALL_WINDOWS" | jq -r --arg ws "$sid" '[.[] | select(.workspace == $ws)] | map(."app-name") | unique | .[]')
  WORKSPACE_MONITOR=$(echo "$ALL_WINDOWS" | jq -r --arg ws "$sid" '[.[] | select(.workspace == $ws)] | map(."monitor-appkit-nsscreen-screens-id") | unique | last // empty')

  icons=""
  if [ -n "$WORKSPACE_APPS" ]; then
    while IFS= read -r app; do
      [ -n "$app" ] && icons+=$("$CONFIG_DIR/plugins/icon_map_fn.sh" "$app") && icons+="  "
    done <<<"$WORKSPACE_APPS"
  fi

  monitor="${WORKSPACE_MONITOR:-1}"

  if [ -z "$icons" ]; then
    if [ "$sid" = "$FOCUSED_WORKSPACE" ]; then
      # フォーカス変更時のみアニメーション
      if [ "$FOCUSED_WORKSPACE" != "$PREV_FOCUSED" ]; then
        sketchybar --animate sin 10 \
          --set "space.$sid" \
          y_offset=10 y_offset=0 \
          background.drawing=on
      fi

      sketchybar --set "space.$sid" \
        display="$monitor" \
        drawing=on \
        label="" \
        label.color="$BACKGROUND" \
        icon.color="$BACKGROUND" \
        background.drawing=on \
        background.color="$ACCENT_COLOR"
    else
      sketchybar --set "space.$sid" drawing=off
    fi
  else
    if [ "$sid" = "$FOCUSED_WORKSPACE" ]; then
      if [ "$FOCUSED_WORKSPACE" != "$PREV_FOCUSED" ]; then
        sketchybar --animate sin 10 \
          --set "space.$sid" \
          y_offset=10 y_offset=0 \
          background.drawing=on
      fi

      sketchybar --set "space.$sid" \
        display="$monitor" \
        drawing=on \
        label="$icons" \
        label.color="$BACKGROUND" \
        icon.color="$BACKGROUND" \
        background.drawing=on \
        background.color="$ACCENT_COLOR"
    else
      sketchybar --set "space.$sid" \
        display="$monitor" \
        drawing=on \
        label="$icons" \
        background.drawing=off \
        label.color="$ACCENT_COLOR" \
        icon.color="$ACCENT_COLOR" \
        background.color="$BAR_COLOR"
    fi
  fi
done
