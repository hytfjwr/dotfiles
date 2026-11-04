#!/bin/bash
# Generate ~/.claude/settings.json from the tracked base and the untracked local file.
#
#   claude/settings.base.json   shared settings (tracked, public)
#   claude/settings.local.json  work/machine-specific settings (ignored), deep-merged on top
#
# Claude Code writes /plugin and /config changes back into ~/.claude/settings.json.
# Those edits are not in this repo, so when the current file differs from what
# would be generated, it is backed up and the diff is shown before overwriting.
# Move anything worth keeping into base or local, then re-run.
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DOTFILES_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$SCRIPT_DIR/lib/colors.sh"

BASE="$DOTFILES_DIR/claude/settings.base.json"
LOCAL="$DOTFILES_DIR/claude/settings.local.json"
DST="$HOME/.claude/settings.json"

section "Generating Claude Code settings"

if ! command -v jq &> /dev/null; then
    error "jq is required (brew install jq)"
    exit 1
fi

sources=("$BASE")
if [ -f "$LOCAL" ]; then
    sources+=("$LOCAL")
else
    warn "claude/settings.local.json not found, using base only"
fi

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
jq -s 'reduce .[] as $s ({}; . * $s)' "${sources[@]}" > "$tmp"

mkdir -p "$(dirname "$DST")"

# Earlier setups linked the tracked file directly; replace the link with a real file.
if [ -L "$DST" ]; then
    rm "$DST"
elif [ -f "$DST" ] && ! diff -q <(jq -S . "$DST") <(jq -S . "$tmp") &> /dev/null; then
    backup="$DST.backup.$(date +%Y%m%d%H%M%S)"
    warn "$DST has changes not in dotfiles (- current, + generated):"
    diff -u <(jq -S . "$DST") <(jq -S . "$tmp") | tail -n +3 || true
    cp "$DST" "$backup"
    warn "Backed up to $backup"
fi

cp "$tmp" "$DST"
info "Wrote $DST"

section "Claude Code settings generated"
