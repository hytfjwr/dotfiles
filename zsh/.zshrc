if [[ -r "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh" ]]; then
  source "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh"
fi
export ZSH="$HOME/.oh-my-zsh"
ZSH_THEME="powerlevel10k/powerlevel10k"
zstyle ':omz:update' frequency 13
plugins=(git zsh-autosuggestions zsh-syntax-highlighting aliases copypath history docker github composer laravel brew gh npm sudo web-search docker-compose)
source $ZSH/oh-my-zsh.sh
if [[ -n $SSH_CONNECTION ]]; then
  export EDITOR='vim'
else
  export EDITOR='nvim'
fi
alias v="nvim"
alias vim="nvim"
[[ ! -f ~/.p10k.zsh ]] || source ~/.p10k.zsh
export LANG=ja_JP.UTF-8

. "$HOME/.local/bin/env"
export PATH="/opt/homebrew/opt/ansible@10/bin:$PATH"
export PATH="/opt/homebrew/opt/bison/bin:$PATH"

# Prevent Homebrew from installing runtimes managed by mise
export HOMEBREW_FORBIDDEN_FORMULAE="node python python@3.11 python@3.12 python@3.13 php go rust ruby"

# mise - universal version manager
eval "$(mise activate zsh)"

# The following lines have been added by Docker Desktop to enable Docker CLI completions.
fpath=($HOME/.docker/completions $fpath)
autoload -Uz compinit
compinit
# End of Docker CLI completions


# The next line updates PATH for the Google Cloud SDK.
if [ -f "$HOME/google-cloud-sdk/path.zsh.inc" ]; then . "$HOME/google-cloud-sdk/path.zsh.inc"; fi

# The next line enables shell command completion for gcloud.
if [ -f "$HOME/google-cloud-sdk/completion.zsh.inc" ]; then . "$HOME/google-cloud-sdk/completion.zsh.inc"; fi

# pnpm
export PNPM_HOME="$HOME/Library/pnpm"
case ":$PATH:" in
  *":$PNPM_HOME:"*) ;;
  *) export PATH="$PNPM_HOME:$PATH" ;;
esac
# pnpm end


# neovide
alias nv='neovide'

# bun completions
[ -s "$HOME/.bun/_bun" ] && source "$HOME/.bun/_bun"

# bun
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"

# devcontainer CLI
export PATH="$HOME/.devcontainers/bin:$PATH"

# lazygit
alias lg="lazygit"

# claude-worktree
alias cw="bunx @hytfjwr/claude-worktree"

# bat - cat with syntax highlighting
alias cat="bat"

# yazi
function y() {
	local tmp="$(mktemp -t "yazi-cwd.XXXXXX")" cwd
	command yazi "$@" --cwd-file="$tmp"
	IFS= read -r -d '' cwd < "$tmp"
	[ "$cwd" != "$PWD" ] && [ -d "$cwd" ] && builtin cd -- "$cwd"
	rm -f -- "$tmp"
}

# WezTerm tmux shim for Claude Code Agent Team
# Must be at the end of .zshrc to ensure ~/.local/bin/tmux takes priority
if [[ -n "${WEZTERM_PANE:-}" ]]; then
  if [[ -z "${TMUX:-}" ]]; then
    export TMUX="wezterm-shim/${WEZTERM_PANE}/0"
  fi
  export PATH="$HOME/.local/bin:$PATH"
fi
# Added by dbt Fusion extension (ensure dbt binary dir on PATH)
if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
  export PATH="$HOME/.local/bin:$PATH"
fi
# Added by dbt Fusion extension
alias dbtf="$HOME/.local/bin/dbt"

# Added by dbt installer
export PATH="$PATH:$HOME/.local/bin"
# Added by dbt Fusion extension (ensure dbt binary dir on PATH)
if [[ ":$PATH:" != *":/Users/hayato.fujiwara/.local/bin:"* ]]; then
  export PATH=/Users/hayato.fujiwara/.local/bin:"$PATH"
fi

# Added by dbt installer
export PATH="$PATH:/Users/hayato.fujiwara/.local/bin"

# dbt aliases
alias dbtf=/Users/hayato.fujiwara/.local/bin/dbt

eval "$(tirith init --shell zsh)"

# zoxide - smarter cd command (must be at the end after all PATH modifications)
eval "$(zoxide init zsh)"
alias cd="z"
alias cdi="zi"
