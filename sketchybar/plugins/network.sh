#!/bin/bash

# ネットワーク速度（netstat差分計算）- Network Mini スタイル
INTERFACE="en0"
STATS_FILE="/tmp/sketchybar_network_stats"

current_rx=$(netstat -ib | grep -E "^$INTERFACE" | head -1 | awk '{print $7}')
current_tx=$(netstat -ib | grep -E "^$INTERFACE" | head -1 | awk '{print $10}')

if [ -f "$STATS_FILE" ]; then
    read -r prev_rx prev_tx < "$STATS_FILE"

    # バイト差分を計算（2秒間隔なので/2で1秒あたりの速度）
    rx_bytes_per_sec=$(( (current_rx - prev_rx) / 2 ))
    tx_bytes_per_sec=$(( (current_tx - prev_tx) / 2 ))

    # ビット変換 (×8) → kbps
    rx_kbps=$(( rx_bytes_per_sec * 8 / 1000 ))
    tx_kbps=$(( tx_bytes_per_sec * 8 / 1000 ))

    # ダウンロード表示
    if [ "$rx_kbps" -gt 999 ]; then
        down_label=$(awk -v k="$rx_kbps" 'BEGIN {printf "%.0f Mbps", k / 1000}')
    else
        down_label="${rx_kbps} kbps"
    fi

    # アップロード表示
    if [ "$tx_kbps" -gt 999 ]; then
        up_label=$(awk -v k="$tx_kbps" 'BEGIN {printf "%.0f Mbps", k / 1000}')
    else
        up_label="${tx_kbps} kbps"
    fi

    sketchybar --set network_down label="$down_label" \
                     icon.highlight="$(if [ "$rx_kbps" -gt 0 ]; then echo "on"; else echo "off"; fi)" \
               --set network_up label="$up_label" \
                     icon.highlight="$(if [ "$tx_kbps" -gt 0 ]; then echo "on"; else echo "off"; fi)"
else
    sketchybar --set network_down label="0 kbps" \
               --set network_up label="0 kbps"
fi

echo "$current_rx $current_tx" > "$STATS_FILE"
