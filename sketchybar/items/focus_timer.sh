#!/bin/bash

# ────────────────────────────────────
# ▸ Focus Flow Timer
# ────────────────────────────────────

POPUP_SCRIPT="sketchybar -m --set focus_timer.anchor popup.drawing=toggle"

# ────────────────────────────────────
# ▸ Items
# ────────────────────────────────────

focus_timer_anchor=(
  script="$PLUGIN_DIR/focus_timer.sh"
  click_script="$POPUP_SCRIPT"
  update_freq=2
  icon=󰔛
  label="--:--"
  label.font="SF Mono:Bold:14.0"
  popup.align=center
  popup.background.color=0xd9333333
  popup.background.corner_radius=12
  popup.background.border_width=2
  popup.background.border_color=0xd9555555
)

focus_timer_coding=(
  icon=󰅩
  icon.color=0xff50fa7b
  icon.padding_left=8
  label="Coding  50:00"
  label.font="SF Pro:Semibold:13.0"
  padding_left=4
  padding_right=4
  script="$PLUGIN_DIR/focus_timer.sh"
)

focus_timer_review=(
  icon=󰈈
  icon.color=0xff8be9fd
  icon.padding_left=8
  label="Review  20:00"
  label.font="SF Pro:Semibold:13.0"
  padding_left=4
  padding_right=4
  script="$PLUGIN_DIR/focus_timer.sh"
)

focus_timer_break=(
  icon=󰒲
  icon.color=0xfff1fa8c
  icon.padding_left=8
  label="Break   10:00"
  label.font="SF Pro:Semibold:13.0"
  padding_left=4
  padding_right=4
  script="$PLUGIN_DIR/focus_timer.sh"
)

focus_timer_custom=(
  icon=󰥔
  icon.color=0xffbd93f9
  icon.padding_left=8
  label="Custom"
  label.font="SF Pro:Semibold:13.0"
  padding_left=4
  padding_right=4
  script="$PLUGIN_DIR/focus_timer.sh"
)

focus_timer_stop=(
  icon=󰓛
  icon.color=0xffff5555
  icon.padding_left=8
  label="Stop"
  label.font="SF Pro:Semibold:13.0"
  padding_left=4
  padding_right=4
  script="$PLUGIN_DIR/focus_timer.sh"
)

# ────────────────────────────────────
# ▸ SketchyBar Setup
# ────────────────────────────────────

sketchybar --add item focus_timer.anchor right                           \
           --set focus_timer.anchor "${focus_timer_anchor[@]}"           \
                                                                         \
           --add item focus_timer.coding popup.focus_timer.anchor        \
           --set focus_timer.coding "${focus_timer_coding[@]}"           \
           --subscribe focus_timer.coding mouse.clicked                  \
                                                                         \
           --add item focus_timer.review popup.focus_timer.anchor        \
           --set focus_timer.review "${focus_timer_review[@]}"           \
           --subscribe focus_timer.review mouse.clicked                  \
                                                                         \
           --add item focus_timer.break popup.focus_timer.anchor         \
           --set focus_timer.break "${focus_timer_break[@]}"             \
           --subscribe focus_timer.break mouse.clicked                   \
                                                                         \
           --add item focus_timer.custom popup.focus_timer.anchor        \
           --set focus_timer.custom "${focus_timer_custom[@]}"           \
           --subscribe focus_timer.custom mouse.clicked                  \
                                                                         \
           --add item focus_timer.stop popup.focus_timer.anchor          \
           --set focus_timer.stop "${focus_timer_stop[@]}"               \
           --subscribe focus_timer.stop mouse.clicked
