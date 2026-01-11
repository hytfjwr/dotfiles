#!/bin/bash

# ネットワーク速度（netstat差分計算）
INTERFACE="en0"
STATS_FILE="/tmp/sketchybar_network_stats"

current_rx=$(netstat -ib | grep -E "^$INTERFACE" | head -1 | awk '{print $7}')
current_tx=$(netstat -ib | grep -E "^$INTERFACE" | head -1 | awk '{print $10}')

if [ -f "$STATS_FILE" ]; then
    read prev_rx prev_tx < "$STATS_FILE"

    # バイト差分を計算（2秒間隔なので/2で1秒あたりの速度）
    rx_bytes_per_sec=$(( (current_rx - prev_rx) / 2 ))
    tx_bytes_per_sec=$(( (current_tx - prev_tx) / 2 ))

    # KB/s または MB/s で表示
    if [ $rx_bytes_per_sec -gt 1048576 ]; then
        # MB/s
        rx_rate=$(awk -v bytes="$rx_bytes_per_sec" 'BEGIN {printf "%.1f", bytes / 1024 / 1024}')
        rx_unit="M"
    else
        # KB/s
        rx_rate=$(( rx_bytes_per_sec / 1024 ))
        rx_unit="K"
    fi

    if [ $tx_bytes_per_sec -gt 1048576 ]; then
        # MB/s
        tx_rate=$(awk -v bytes="$tx_bytes_per_sec" 'BEGIN {printf "%.1f", bytes / 1024 / 1024}')
        tx_unit="M"
    else
        # KB/s
        tx_rate=$(( tx_bytes_per_sec / 1024 ))
        tx_unit="K"
    fi

    sketchybar --set "$NAME" label="↓${rx_rate}${rx_unit} ↑${tx_rate}${tx_unit}"
else
    sketchybar --set "$NAME" label="--"
fi

echo "$current_rx $current_tx" > "$STATS_FILE"
