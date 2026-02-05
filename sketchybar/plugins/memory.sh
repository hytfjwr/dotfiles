#!/bin/bash

# メモリ使用率
MEMORY_PERCENT=$(memory_pressure | grep "System-wide memory free percentage:" | awk '{ printf "%.0f", 100-$5}')

# メモリグラフにデータをプッシュ
sketchybar --push "$NAME" $(awk "BEGIN {printf \"%.2f\", $MEMORY_PERCENT/100}")
