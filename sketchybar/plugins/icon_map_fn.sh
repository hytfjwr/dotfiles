#!/bin/bash

# App name to sketchybar-app-font ligature mapping
# Usage: icon_map_fn.sh "App Name" → outputs ligature string

__icon_map() {
    case "$1" in
        "Arc") echo ":arc:" ;;
        "Google Chrome") echo ":google_chrome:" ;;
        "Safari") echo ":safari:" ;;
        "Code") echo ":code:" ;;
        "Cursor") echo ":cursor:" ;;
        "PhpStorm") echo ":php_storm:" ;;
        "WezTerm" | "wezterm-gui") echo ":wezterm:" ;;
        "Ghostty") echo ":ghostty:" ;;
        "Neovide" | "neovide") echo ":neovide:" ;;
        "Slack") echo ":slack:" ;;
        "Spotify") echo ":spotify:" ;;
        "Bruno") echo ":bruno:" ;;
        "Sequel Ace") echo ":sequel_ace:" ;;
        "TablePlus") echo ":tableplus:" ;;
        "Raycast") echo ":raycast:" ;;
        "OrbStack") echo ":orbstack:" ;;
        "Terminal" | "ターミナル") echo ":terminal:" ;;
        *) echo ":default:" ;;
    esac
}

__icon_map "$1"
