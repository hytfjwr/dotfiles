#!/bin/bash

LAST_USED_STATE="/tmp/vpn_last_used.state"

# Colors
COLOR_BLUE=0xff5eadf2
COLOR_WHITE=0xffffffff
COLOR_WHITE_DIM=0x80ffffff

# ────────────────────────────────────
# ▸ Helpers
# ────────────────────────────────────

is_vpn_connected() {
  scutil --nc status "$1" 2>/dev/null | head -1 | grep -q "Connected"
}

record_last_used() {
  local vpn_name="$1"
  local now
  now=$(date +%s)
  touch "$LAST_USED_STATE"
  if grep -q "^${vpn_name}=" "$LAST_USED_STATE" 2>/dev/null; then
    sed -i '' "s/^${vpn_name}=.*/${vpn_name}=${now}/" "$LAST_USED_STATE"
  else
    echo "${vpn_name}=${now}" >> "$LAST_USED_STATE"
  fi
}

relative_time() {
  local timestamp="$1"
  [ -z "$timestamp" ] && return
  local now diff
  now=$(date +%s)
  diff=$((now - timestamp))
  if [ "$diff" -lt 60 ]; then echo "now"
  elif [ "$diff" -lt 3600 ]; then echo "$((diff / 60))m ago"
  elif [ "$diff" -lt 86400 ]; then echo "$((diff / 3600))h ago"
  else echo "$((diff / 86400))d ago"
  fi
}

get_last_used() {
  [ -f "$LAST_USED_STATE" ] || return
  grep "^${1}=" "$LAST_USED_STATE" 2>/dev/null | cut -d= -f2
}

# Get VPN name for vpn.item.N by index
get_vpn_name() {
  local index="${1##vpn.item.}"
  scutil --nc list | sed -n 's/.*"\(.*\)".*/\1/p' | sed -n "$((index + 1))p"
}

# ────────────────────────────────────
# ▸ Update
# ────────────────────────────────────

update() {
  local i=0 max_len=0

  while IFS= read -r name; do
    local item_name="vpn.item.${i}"
    local label

    if is_vpn_connected "$name"; then
      record_last_used "$name"
      label="$name  Connected"
      sketchybar --set "$item_name" \
                       icon.color=$COLOR_BLUE \
                       label="$label"
    else
      local ts
      ts=$(get_last_used "$name")
      if [ -n "$ts" ]; then
        label="$name  Last: $(relative_time "$ts")"
      else
        label="$name"
      fi
      sketchybar --set "$item_name" \
                       icon.color=$COLOR_WHITE_DIM \
                       label="$label"
    fi

    local len=${#label}
    [ "$len" -gt "$max_len" ] && max_len=$len
    i=$((i + 1))
  done < <(scutil --nc list | sed -n 's/.*"\(.*\)".*/\1/p')

  # 全アイテムの幅をポップアップ幅に揃える
  if [ "$i" -gt 0 ]; then
    local popup_width=$(( max_len * 8 + 44 ))
    local width_args=""
    for j in $(seq 0 $((i - 1))); do
      width_args+=" --set vpn.item.$j width=$popup_width"
    done
    sketchybar $width_args
  fi

  # Anchor color
  if scutil --nc list | grep -q "Connected"; then
    sketchybar --set vpn.anchor icon.color=$COLOR_BLUE
  else
    sketchybar --set vpn.anchor icon.color=$COLOR_WHITE
  fi
}

# ────────────────────────────────────
# ▸ Mouse Click — toggle VPN
# ────────────────────────────────────

mouse_clicked() {
  local vpn_name
  vpn_name=$(get_vpn_name "$NAME")
  [ -z "$vpn_name" ] && return

  if is_vpn_connected "$vpn_name"; then
    scutil --nc stop "$vpn_name"
  else
    scutil --nc start "$vpn_name"
    record_last_used "$vpn_name"
  fi

  sketchybar --set vpn.anchor popup.drawing=off
  sleep 1
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
