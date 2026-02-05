#!/bin/bash

# CPU使用率（user + sys）
CPU_PERCENT=$(top -l 2 | grep -E "^CPU" | tail -1 | awk '{ print int($3 + $5)}')

# CPUグラフにデータをプッシュ
sketchybar --push "$NAME" $(awk "BEGIN {printf \"%.2f\", $CPU_PERCENT/100}")
