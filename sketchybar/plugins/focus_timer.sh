#!/bin/bash

TIMER_STATE="/tmp/focus_timer.state"

# Colors
COLOR_GREEN=0xff50fa7b
COLOR_YELLOW=0xfff1fa8c
COLOR_RED=0xffff5555
COLOR_RED_DIM=0x80ff5555
COLOR_DEFAULT=0xffffffff

start_timer() {
  local mode="$1"
  local duration="$2"

  if [ -z "$duration" ]; then
    case "$mode" in
      "Coding") duration=3000 ;; # 50 min
      "Review") duration=1200 ;; # 20 min
      "Break")  duration=600 ;;  # 10 min
    esac
  fi

  local end_time=$(($(date +%s) + duration))

  cat > "$TIMER_STATE" <<EOF
FOCUS_END_TIME=$end_time
FOCUS_MODE=$mode
EOF

  sketchybar --set focus_timer.anchor popup.drawing=off
  update
}

parse_duration() {
  local input="$1"
  if [[ "$input" =~ ^([0-9]+):([0-5][0-9])$ ]]; then
    # m:ss or mm:ss
    echo $(( ${BASH_REMATCH[1]} * 60 + 10#${BASH_REMATCH[2]} ))
  elif [[ "$input" =~ ^([0-9]+)[sS]$ ]]; then
    # Ns — seconds
    echo "${BASH_REMATCH[1]}"
  elif [[ "$input" =~ ^([0-9]+)[mM]?$ ]]; then
    # N or Nm — minutes
    echo $(( ${BASH_REMATCH[1]} * 60 ))
  else
    return 1
  fi
}

format_duration_label() {
  local sec="$1"
  if [ "$sec" -ge 60 ] && [ $((sec % 60)) -eq 0 ]; then
    echo "$((sec / 60))m"
  elif [ "$sec" -ge 60 ]; then
    echo "$((sec / 60))m$((sec % 60))s"
  else
    echo "${sec}s"
  fi
}

start_custom_timer() {
  sketchybar --set focus_timer.anchor popup.drawing=off

  local input
  input=$(osascript -e 'display dialog "時間を入力（例: 25, 25m, 90s, 1:30）" default answer "25" buttons {"Cancel", "Start"} default button "Start" with title "Focus Timer"' -e 'text returned of result' 2>/dev/null)

  if [ -z "$input" ]; then
    return
  fi

  local duration
  duration=$(parse_duration "$input")

  if [ -z "$duration" ] || [ "$duration" -le 0 ] 2>/dev/null; then
    osascript -e 'display notification "無効な入力です（例: 25, 25m, 90s, 1:30）" with title "Focus Timer"'
    return
  fi

  local label
  label=$(format_duration_label "$duration")
  start_timer "Custom($label)" "$duration"
}

stop_timer() {
  rm -f "$TIMER_STATE"
  sketchybar --set focus_timer.anchor popup.drawing=off \
                   label="--:--" \
                   icon.color=$COLOR_DEFAULT \
                   label.color=$COLOR_DEFAULT
}

update() {
  if [ ! -f "$TIMER_STATE" ]; then
    sketchybar --set focus_timer.anchor label="--:--" \
                     icon.color=$COLOR_DEFAULT \
                     label.color=$COLOR_DEFAULT
    return
  fi

  # Reset variables before sourcing
  FOCUS_END_TIME=""
  FOCUS_MODE=""
  FOCUS_COMPLETED_AT=""
  # shellcheck source=/dev/null
  source "$TIMER_STATE"

  local now
  now=$(date +%s)

  # "Done!" display phase — reset after 3 seconds
  if [ -n "$FOCUS_COMPLETED_AT" ]; then
    local elapsed=$((now - FOCUS_COMPLETED_AT))
    if [ "$elapsed" -ge 3 ]; then
      rm -f "$TIMER_STATE"
      sketchybar --set focus_timer.anchor label="--:--" \
                       icon.color=$COLOR_DEFAULT \
                       label.color=$COLOR_DEFAULT
    fi
    return
  fi

  # No valid timer data
  if [ -z "$FOCUS_END_TIME" ]; then
    rm -f "$TIMER_STATE"
    sketchybar --set focus_timer.anchor label="--:--" \
                     icon.color=$COLOR_DEFAULT \
                     label.color=$COLOR_DEFAULT
    return
  fi

  local remaining=$((FOCUS_END_TIME - now))

  # Timer completed
  if [ "$remaining" -le 0 ]; then
    osascript -e "display notification \"$FOCUS_MODE セッション完了！\" with title \"Focus Timer\""
    afplay /System/Library/Sounds/Glass.aiff &
    sketchybar --set focus_timer.anchor label="Done!" \
                     icon.color=$COLOR_GREEN \
                     label.color=$COLOR_GREEN

    cat > "$TIMER_STATE" <<EOF
FOCUS_COMPLETED_AT=$now
EOF
    return
  fi

  # Active countdown
  local minutes=$((remaining / 60))
  local seconds=$((remaining % 60))
  local label
  label=$(printf "%02d:%02d" "$minutes" "$seconds")

  local color
  if [ "$remaining" -le 60 ]; then
    # Blink red in last minute (toggle every ~2 seconds)
    if [ $(( $(date +%s) / 2 % 2 )) -eq 0 ]; then
      color=$COLOR_RED
    else
      color=$COLOR_RED_DIM
    fi
  elif [ "$remaining" -le 300 ]; then
    color=$COLOR_YELLOW
  else
    color=$COLOR_GREEN
  fi

  sketchybar --set focus_timer.anchor label="$label" \
                   icon.color="$color" \
                   label.color="$color"
}

mouse_clicked() {
  case "$NAME" in
    "focus_timer.coding") start_timer "Coding" ;;
    "focus_timer.review") start_timer "Review" ;;
    "focus_timer.break")  start_timer "Break" ;;
    "focus_timer.custom") start_custom_timer ;;
    "focus_timer.stop")   stop_timer ;;
    *) ;;
  esac
}

case "$SENDER" in
  "mouse.clicked") mouse_clicked ;;
  *) update ;;
esac
