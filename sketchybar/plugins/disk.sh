#!/bin/bash

# ディスク使用率
DISK=$(df -h / | tail -1 | awk '{print $5}')

sketchybar --set "$NAME" label="$DISK"
