#!/bin/bash

# VPN接続状態
VPN=$(scutil --nc list | grep Connected | awk -F'"' '{print $2}' | head -1)

if [ -n "$VPN" ]; then
    sketchybar --set "$NAME" label="$VPN"
else
    sketchybar --set "$NAME" label="--"
fi
