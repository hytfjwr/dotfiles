#!/bin/bash

# ────────────────────────────────────
# ▸ VPN Popup List
# ────────────────────────────────────

# Anchor
sketchybar --add item vpn.anchor right \
           --set vpn.anchor \
                 script="$PLUGIN_DIR/vpn.sh" \
                 click_script="sketchybar -m --set vpn.anchor popup.drawing=toggle" \
                 update_freq=5 \
                 icon=󰖂 \
                 label.drawing=off \
                 popup.align=center \
                 popup.background.color=0xd9333333 \
                 popup.background.corner_radius=12 \
                 popup.background.border_width=2 \
                 popup.background.border_color=0xd9555555

# Popup items — one per VPN
VPN_INDEX=0
scutil --nc list | sed -n 's/.*"\(.*\)".*/\1/p' | while IFS= read -r vpn_name; do
  item_name="vpn.item.${VPN_INDEX}"

  sketchybar --add item "$item_name" popup.vpn.anchor \
             --set "$item_name" \
                   icon=󰖂 \
                   icon.color=0x80ffffff \
                   icon.padding_left=8 \
                   label="$vpn_name" \
                   label.font="SF Pro:Semibold:13.0" \
                   padding_left=4 \
                   padding_right=4 \
                   background.color=0x00ffffff \
                   background.corner_radius=8 \
                   background.height=40 \
                   background.drawing=on \
                   script="$PLUGIN_DIR/vpn.sh" \
             --subscribe "$item_name" mouse.clicked mouse.entered mouse.exited

  VPN_INDEX=$((VPN_INDEX + 1))
done
