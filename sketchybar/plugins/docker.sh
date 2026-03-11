#!/bin/bash

# OrbStack / Homebrew の docker CLI にパスを通す
export PATH="$HOME/.orbstack/bin:/opt/homebrew/bin:$PATH"

# Colors
COLOR_GREEN=0xff50fa7b
COLOR_YELLOW=0xfff1fa8c
COLOR_RED=0xffff5555
COLOR_WHITE=0xffffffff
COLOR_WHITE_DIM=0x80ffffff

# ────────────────────────────────────
# ▸ Helpers
# ────────────────────────────────────

is_docker_running() {
  docker info &>/dev/null
}

# docker.item.N → コンテナ名を返す
get_container_name() {
  local index="${1##docker.item.}"
  docker ps -a --format '{{.Names}}' | sed -n "$((index + 1))p"
}

# コンテナ状態 (running / paused / exited / created / dead)
get_container_status() {
  docker inspect --format '{{.State.Status}}' "$1" 2>/dev/null
}

# 稼働時間 or 終了時刻を人間可読形式で返す
format_uptime() {
  local name="$1" status="$2"
  if [ "$status" = "running" ]; then
    docker ps --filter "name=^${name}$" --format '{{.Status}}' | sed 's/^Up /↑ /'
  elif [ "$status" = "exited" ]; then
    docker ps -a --filter "name=^${name}$" --format '{{.Status}}' | sed 's/^Exited ([0-9]*) /↓ /'
  else
    echo "$status"
  fi
}

# 状態に応じたアイコン色
status_icon_color() {
  case "$1" in
    "running") echo "$COLOR_GREEN" ;;
    "paused")  echo "$COLOR_YELLOW" ;;
    "exited"|"dead"|"removing") echo "$COLOR_RED" ;;
    *) echo "$COLOR_WHITE_DIM" ;;
  esac
}

# ────────────────────────────────────
# ▸ Update
# ────────────────────────────────────

update() {
  if ! is_docker_running; then
    sketchybar --set docker.anchor \
                     icon.color=$COLOR_WHITE_DIM \
                     label.drawing=off
    return
  fi

  # アンカー: 起動中コンテナ数を表示
  local running_count
  running_count=$(docker ps -q | wc -l | tr -d ' ')

  if [ "$running_count" -gt 0 ]; then
    sketchybar --set docker.anchor \
                     icon.color=$COLOR_GREEN \
                     label="$running_count" \
                     label.drawing=on
  else
    sketchybar --set docker.anchor \
                     icon.color=$COLOR_WHITE \
                     label.drawing=off
  fi

  # 各コンテナアイテムの状態更新
  local i=0 max_len=0
  while IFS= read -r name; do
    local item_name="docker.item.${i}"
    local status color uptime label
    status=$(get_container_status "$name")
    color=$(status_icon_color "$status")
    uptime=$(format_uptime "$name" "$status")
    label="$name  $uptime"
    local len=${#label}
    [ "$len" -gt "$max_len" ] && max_len=$len

    sketchybar --set "$item_name" \
                     icon.color="$color" \
                     label="$label"
    i=$((i + 1))
  done < <(docker ps -a --format '{{.Names}}')

  # 全アイテムの幅をポップアップ幅に揃える
  if [ "$i" -gt 0 ]; then
    local popup_width=$(( max_len * 8 + 44 ))
    local width_args=""
    for j in $(seq 0 $((i - 1))); do
      width_args+=" --set docker.item.$j width=$popup_width"
    done
    sketchybar $width_args
  fi
}

# ────────────────────────────────────
# ▸ Mouse Click — toggle container
# ────────────────────────────────────

mouse_clicked() {
  local container_name
  container_name=$(get_container_name "$NAME")
  [ -z "$container_name" ] && return

  local status
  status=$(get_container_status "$container_name")

  case "$status" in
    "running")  docker stop "$container_name" &>/dev/null & ;;
    "paused")   docker unpause "$container_name" &>/dev/null & ;;
    "exited"|"created"|"dead") docker start "$container_name" &>/dev/null & ;;
  esac

  sketchybar --set docker.anchor popup.drawing=off
  sleep 2
  update
}

# ────────────────────────────────────
# ▸ Entry Point
# ────────────────────────────────────

mouse_entered() {
  sketchybar --set "$NAME" background.color=0x30ffffff
}

mouse_exited() {
  sketchybar --set "$NAME" background.color=0x00ffffff
}

case "$SENDER" in
  "mouse.clicked") mouse_clicked ;;
  "mouse.entered") mouse_entered ;;
  "mouse.exited")  mouse_exited ;;
  *) update ;;
esac
