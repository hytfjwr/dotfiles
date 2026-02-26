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
  local duration=0
  case "$mode" in
    "Coding") duration=3000 ;; # 50 min
    "Review") duration=1200 ;; # 20 min
    "Break")  duration=600 ;;  # 10 min
  esac

  local end_time=$(($(date +%s) + duration))

  cat > "$TIMER_STATE" <<EOF
FOCUS_END_TIME=$end_time
FOCUS_MODE=$mode
EOF

  sketchybar --set focus_timer.anchor popup.drawing=off
  update
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
    "focus_timer.stop")   stop_timer ;;
    *) ;;
  esac
}

case "$SENDER" in
  "mouse.clicked") mouse_clicked ;;
  *) update ;;
esac
