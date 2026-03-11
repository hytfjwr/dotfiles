#!/bin/bash

AWAKE_STATE="$HOME/.local/state/awake/saved_settings"

update_awake_label() {
  if [ -f "$AWAKE_STATE" ]; then
    sketchybar --set apple.awake label="Awake: ON" icon.color=0xff50fa7b
  else
    sketchybar --set apple.awake label="Awake: OFF" icon.color=0x80ffffff
  fi
}

mouse_clicked() {
  case "$NAME" in
    "apple.preferences") open "x-apple.systempreferences:" ;;
    "apple.lock")        pmset displaysleepnow ;;
    "apple.sleep")       osascript -e 'tell application "System Events" to sleep' ;;
    "apple.restart")     osascript -e 'tell application "System Events" to restart' ;;
    "apple.shutdown")    osascript -e 'tell application "System Events" to shut down' ;;
    "apple.reload")      sketchybar --reload ;;
    "apple.fix_windows") ~/.local/bin/aerospace-fix-windows --quiet ;;
    "apple.awake")
      if [ -f "$AWAKE_STATE" ]; then
        ~/.local/bin/awake off
      else
        ~/.local/bin/awake on
      fi
      update_awake_label
      ;;
    "apple.nvim_clean")  ~/.local/bin/nvim-clean ;;
    "apple.anchor")
      update_awake_label
      return
      ;;
    *) return ;;
  esac

  sketchybar --set apple.anchor popup.drawing=off
}

mouse_entered() {
  sketchybar --set "$NAME" background.color=0x30ffffff
}

mouse_exited() {
  sketchybar --set "$NAME" background.color=0x00ffffff
}

case "$SENDER" in
  "mouse.clicked") mouse_clicked ;;
  "mouse.entered") mouse_entered ;;
  "mouse.exited")  mouse_exited ;;
esac
