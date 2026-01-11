#!/bin/bash

# CPU使用率（user + sys）
CPU_PERCENT=$(top -l 2 | grep -E "^CPU" | tail -1 | awk '{ print int($3 + $5)}')

# しきい値に応じて色を変更
if [ "$CPU_PERCENT" -gt 80 ]; then
    COLOR="0xffff5555"  # 赤色（高負荷）
elif [ "$CPU_PERCENT" -gt 50 ]; then
    COLOR="0xffffff88"  # 黄色（中負荷）
else
    COLOR="0xffffffff"  # 白色（正常）
fi

sketchybar --set "$NAME" label="${CPU_PERCENT}%" label.color="$COLOR"

# CPUグラフにデータをプッシュ
sketchybar --push cpu_graph "$CPU_PERCENT"
