#!/bin/bash

# AeroSpace workspace integration for SketchyBar
# This script displays workspaces that have windows and updates based on workspace changes

# アプリケーションアイコンのマッピング（SF Symbols）
get_app_icon() {
    case "$1" in
        "Arc") echo "􀎭" ;;                    # globe
        "Google Chrome") echo "􀎭" ;;         # globe
        "Safari") echo "􀎭" ;;                # globe
        "Code") echo "􀐱" ;;                  # chevron.left.forwardslash.chevron.right
        "Cursor") echo "􀐱" ;;                # chevron.left.forwardslash.chevron.right
        "PhpStorm") echo "􀐱" ;;              # chevron.left.forwardslash.chevron.right
        "WezTerm") echo "􀪫" ;;               # terminal
        "neovide") echo "􀫸" ;;               # doc.text
        "Slack") echo "􀌤" ;;                 # message
        "Spotify") echo "􀑪" ;;               # music.note
        "Bruno") echo "􀢚" ;;                 # network
        "Sequel Ace") echo "􀢺" ;;            # cylinder
        "TablePlus") echo "􀢺" ;;             # cylinder
        "Raycast") echo "􀊫" ;;               # command
        "System Settings") echo "􀣋" ;;       # gearshape
        *) echo "􀏜" ;;                       # app.fill
    esac
}

# 使用中のワークスペースを取得して表示を更新
update_workspaces() {
    # 現在フォーカスされているワークスペースを取得
    focused_workspace=$(aerospace list-workspaces --focused)

    # 既存のワークスペースアイテムをすべて削除
    sketchybar --remove '/aerospace\.space\..*/'

    # 使用中のワークスペースを取得（重複を除く）
    used_workspaces=$(aerospace list-windows --all --format "%{workspace}" | sort -u)

    # 各ワークスペースについて情報を取得して表示
    for workspace in $used_workspaces; do
        if [ -z "$workspace" ]; then
            continue
        fi

        # このワークスペースのウィンドウ情報を取得
        windows_info=$(aerospace list-windows --workspace "$workspace" --format "%{app-name}")
        window_count=$(echo "$windows_info" | wc -l | tr -d ' ')

        # アイコンを構築（最大2つのアプリアイコン）
        icon_display=""
        app_count=0
        seen_apps=""

        while IFS= read -r app; do
            if [ -z "$app" ]; then
                continue
            fi

            # 重複するアプリは1回だけ表示
            if [[ ! "$seen_apps" =~ "$app" ]]; then
                if [ $app_count -lt 2 ]; then
                    app_icon=$(get_app_icon "$app")
                    icon_display="${icon_display}${app_icon} "
                    app_count=$((app_count + 1))
                    seen_apps="${seen_apps}${app},"
                fi
            fi
        done <<< "$windows_info"

        # ウィンドウ数を表示（3個以上の場合）
        label_display="$workspace"
        if [ "$window_count" -ge 3 ]; then
            label_display="$workspace ($window_count)"
        fi

        # フォーカス状態に応じて背景色を変更
        if [ "$workspace" = "$focused_workspace" ]; then
            bg_color="0x80ffffff"
        else
            bg_color="0x40ffffff"
        fi

        # ワークスペースアイテムを追加
        sketchybar --add item "aerospace.space.$workspace" left \
                   --set "aerospace.space.$workspace" \
                         icon="$icon_display" \
                         label="$label_display" \
                         icon.padding_left=7 \
                         icon.padding_right=0 \
                         label.padding_left=4 \
                         label.padding_right=7 \
                         background.color="$bg_color" \
                         background.corner_radius=5 \
                         background.height=25 \
                         background.drawing=on \
                         click_script="aerospace workspace $workspace"
    done
}

# フォーカス変更時のみ背景色を更新（軽量化）
update_focus() {
    if [ -n "$FOCUSED_WORKSPACE" ]; then
        # すべてのワークスペースの背景を通常色に
        sketchybar --set '/aerospace\.space\..*/' background.color=0x40ffffff

        # フォーカス中のワークスペースを強調
        sketchybar --set "aerospace.space.$FOCUSED_WORKSPACE" background.color=0x80ffffff
    fi
}

# イベントに応じて処理を分岐
case "$SENDER" in
    "aerospace_workspace_change")
        update_focus
        ;;
    "forced"|"space_windows_change")
        update_workspaces
        ;;
    *)
        # 初期化時
        update_workspaces
        ;;
esac
