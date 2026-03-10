#!/bin/bash

# OrbStack / Homebrew の docker CLI にパスを通す
export PATH="$HOME/.orbstack/bin:/opt/homebrew/bin:$PATH"

# ────────────────────────────────────
# ▸ Docker Container Status
# ────────────────────────────────────

# Anchor item
sketchybar --add item docker.anchor right \
           --set docker.anchor \
                 script="$PLUGIN_DIR/docker.sh" \
                 click_script="sketchybar -m --set docker.anchor popup.drawing=toggle" \
                 update_freq=10 \
                 icon=󰡨 \
                 label.drawing=off \
                 popup.align=center \
                 popup.background.color=0xd9333333 \
                 popup.background.corner_radius=12 \
                 popup.background.border_width=2 \
                 popup.background.border_color=0xd9555555

# Popup items — one per container (dynamic)
if command -v docker &>/dev/null && docker info &>/dev/null; then
  DOCKER_INDEX=0
  docker ps -a --format '{{.Names}}' | while IFS= read -r container_name; do
    item_name="docker.item.${DOCKER_INDEX}"

    sketchybar --add item "$item_name" popup.docker.anchor \
               --set "$item_name" \
                     icon=󰡨 \
                     icon.color=0x80ffffff \
                     icon.padding_left=8 \
                     label="$container_name" \
                     label.font="SF Pro:Semibold:13.0" \
                     padding_left=4 \
                     padding_right=4 \
                     script="$PLUGIN_DIR/docker.sh" \
               --subscribe "$item_name" mouse.clicked

    DOCKER_INDEX=$((DOCKER_INDEX + 1))
  done
fi
