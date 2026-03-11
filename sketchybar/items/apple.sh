#!/bin/bash

# ────────────────────────────────────
# ▸ Apple Menu
# ────────────────────────────────────

POPUP_SCRIPT="sketchybar -m --set apple.anchor popup.drawing=toggle"

# ────────────────────────────────────
# ▸ Items
# ────────────────────────────────────

apple_anchor=(
  script="$PLUGIN_DIR/apple.sh"
  click_script="$POPUP_SCRIPT"
  icon=
  padding_left=0
  label.drawing=off
  popup.align=left
  popup.background.color=0xd9333333
  popup.background.corner_radius=12
  popup.background.border_width=2
  popup.background.border_color=0xd9555555
)

apple_preferences=(
  icon=
  icon.color=0xff8be9fd
  icon.padding_left=8
  label="Preferences"
  label.font="SF Pro:Semibold:13.0"
  padding_left=4
  padding_right=4
  script="$PLUGIN_DIR/apple.sh"
)

apple_lock=(
  icon=󰌾
  icon.color=0xfff1fa8c
  icon.padding_left=8
  label="Lock Screen"
  label.font="SF Pro:Semibold:13.0"
  padding_left=4
  padding_right=4
  script="$PLUGIN_DIR/apple.sh"
)

apple_reload=(
  icon=󰑓
  icon.color=0xff50fa7b
  icon.padding_left=8
  label="Reload Sketchybar"
  label.font="SF Pro:Semibold:13.0"
  padding_left=4
  padding_right=4
  script="$PLUGIN_DIR/apple.sh"
)

apple_fix_windows=(
  icon=󰖲
  icon.color=0xffbd93f9
  icon.padding_left=8
  label="Fix Windows"
  label.font="SF Pro:Semibold:13.0"
  padding_left=4
  padding_right=4
  script="$PLUGIN_DIR/apple.sh"
)

apple_sleep=(
  icon=󰒲
  icon.color=0xff8be9fd
  icon.padding_left=8
  label="Sleep"
  label.font="SF Pro:Semibold:13.0"
  padding_left=4
  padding_right=4
  script="$PLUGIN_DIR/apple.sh"
)

apple_restart=(
  icon=󰜉
  icon.color=0xfff1fa8c
  icon.padding_left=8
  label="Restart"
  label.font="SF Pro:Semibold:13.0"
  padding_left=4
  padding_right=4
  script="$PLUGIN_DIR/apple.sh"
)

apple_shutdown=(
  icon=󰐥
  icon.color=0xffff5555
  icon.padding_left=8
  label="Shutdown"
  label.font="SF Pro:Semibold:13.0"
  padding_left=4
  padding_right=4
  script="$PLUGIN_DIR/apple.sh"
)

apple_awake=(
  icon=󰈈
  icon.color=0xff50fa7b
  icon.padding_left=8
  label="Awake"
  label.font="SF Pro:Semibold:13.0"
  padding_left=4
  padding_right=4
  script="$PLUGIN_DIR/apple.sh"
)

apple_nvim_clean=(
  icon=
  icon.color=0xff50fa7b
  icon.padding_left=8
  label="Clean Neovim Cache"
  label.font="SF Pro:Semibold:13.0"
  padding_left=4
  padding_right=4
  script="$PLUGIN_DIR/apple.sh"
)

# ────────────────────────────────────
# ▸ SketchyBar Setup
# ────────────────────────────────────

sketchybar --add item apple.anchor left                                    \
           --set apple.anchor "${apple_anchor[@]}"                         \
           --subscribe apple.anchor mouse.clicked                          \
                                                                            \
           --add item apple.preferences popup.apple.anchor                 \
           --set apple.preferences "${apple_preferences[@]}"               \
           --subscribe apple.preferences mouse.clicked                     \
                                                                            \
           --add item apple.lock popup.apple.anchor                        \
           --set apple.lock "${apple_lock[@]}"                             \
           --subscribe apple.lock mouse.clicked                            \
                                                                            \
           --add item apple.sleep popup.apple.anchor                       \
           --set apple.sleep "${apple_sleep[@]}"                           \
           --subscribe apple.sleep mouse.clicked                           \
                                                                            \
           --add item apple.restart popup.apple.anchor                     \
           --set apple.restart "${apple_restart[@]}"                       \
           --subscribe apple.restart mouse.clicked                         \
                                                                            \
           --add item apple.shutdown popup.apple.anchor                    \
           --set apple.shutdown "${apple_shutdown[@]}"                     \
           --subscribe apple.shutdown mouse.clicked                        \
                                                                            \
           --add item apple.reload popup.apple.anchor                      \
           --set apple.reload "${apple_reload[@]}"                         \
           --subscribe apple.reload mouse.clicked                          \
                                                                            \
           --add item apple.fix_windows popup.apple.anchor                 \
           --set apple.fix_windows "${apple_fix_windows[@]}"               \
           --subscribe apple.fix_windows mouse.clicked                     \
                                                                            \
           --add item apple.awake popup.apple.anchor                       \
           --set apple.awake "${apple_awake[@]}"                           \
           --subscribe apple.awake mouse.clicked                           \
                                                                            \
           --add item apple.nvim_clean popup.apple.anchor                  \
           --set apple.nvim_clean "${apple_nvim_clean[@]}"                 \
           --subscribe apple.nvim_clean mouse.clicked
