# Preferred CLI Tools

This environment has modern CLI tools installed via Homebrew. **Always prefer these over built-in alternatives** when executing shell commands.

## Tool Mappings

| Preferred Tool | Replaces   | Purpose              |
|----------------|------------|----------------------|
| `rg`           | `grep`     | Fast regex search    |
| `fd`           | `find`     | File finder          |
| `bat`          | `cat`      | File viewer with syntax highlighting |
| `jq`           | -          | JSON processor       |
| `gh`           | -          | GitHub CLI           |
| `fzf`          | -          | Fuzzy finder         |

## Usage Guidelines

- Use `rg` instead of `grep` for all text search operations. It respects `.gitignore` by default.
- Use `fd` instead of `find` for locating files. It is faster and has a simpler syntax.
- Use `bat` instead of `cat` when displaying file contents in the terminal (for user-facing output).
- Use `jq` for parsing and manipulating JSON data in shell pipelines.
- Use `gh` for all GitHub operations (PRs, issues, releases, actions, etc.).
- Use `fzf` when interactive selection from a list is needed.

## Examples

```bash
# Search for a pattern in files
rg "pattern" --type py

# Find files by name
fd "*.ts" src/

# View a file with syntax highlighting
bat config.toml

# Parse JSON
curl -s https://api.example.com | jq '.data[]'

# GitHub operations
gh pr list
gh issue create

# Interactive selection
fd --type f | fzf
```
