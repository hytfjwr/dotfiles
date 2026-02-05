#!/bin/bash

# メモリ使用率
MEMORY_PERCENT=$(memory_pressure | grep "System-wide memory free percentage:" | awk '{ printf "%.0f", 100-$5}')

# しきい値に応じて色を変更
if [ "$MEMORY_PERCENT" -gt 85 ]; then
    COLOR="0xffff5555"  # 赤色（高負荷）
elif [ "$MEMORY_PERCENT" -gt 70 ]; then
    COLOR="0xffffff88"  # 黄色（中負荷）
else
    COLOR="0xffffffff"  # 白色（正常）
fi

sketchybar --set "$NAME" label="${MEMORY_PERCENT}%" label.color="$COLOR"

# メモリグラフにデータをプッシュ
sketchybar --push "$NAME" $(awk "BEGIN {printf \"%.2f\", $MEMORY_PERCENT/100}")