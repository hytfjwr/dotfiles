---
name: create-pr
description: Create a pull request from current changes. Handles branch creation, intelligent commit splitting, and PR description writing. Use this skill when the user wants to create a PR, submit changes for review, open a pull request, or says "/create-pr". Triggers on phrases like "create a PR", "make a PR", "submit for review", "open a pull request", "send a pull request", or any variation of requesting a pull request.
user_invocable: true
---

# Create PR Skill

This skill takes the user's current working tree changes and turns them into a well-structured pull request. It handles everything: branch creation, logical commit splitting, and writing a clear PR description for reviewers.

## Workflow

### Step 1: Assess the current state

Run these commands to understand the situation:

```bash
git status
git branch --show-current
git diff --stat
git diff --cached --stat
git log --oneline -5
```

Gather:
- Current branch name
- Staged and unstaged changes
- Untracked files that look relevant (ignore build artifacts, node_modules, etc.)

### Step 2: Determine if a new branch is needed

- If on `main`, `master`, or another primary branch → **create a new branch**
- If already on a feature branch → **stay on the current branch**

For branch naming, derive a short, descriptive name from the changes:
- Format: `<type>/<short-description>` (e.g., `feat/add-user-auth`, `fix/login-redirect`, `chore/update-deps`)
- Types: `feat`, `fix`, `chore`, `refactor`, `docs`, `style`, `test`, `ci`
- Keep it concise — 2-4 words in the description part, kebab-case

Before creating the branch, check whether there are files that MUST NOT be committed. Review the repository's CLAUDE.md or .gitignore for any restrictions. If restricted files are among the changes, exclude them from staging.

### Step 3: Split changes into logical commits

Analyze the diff and group changes into logical units. The goal is that each commit is a self-contained, meaningful change that a reviewer can understand independently.

Heuristics for splitting:
- **By file purpose**: config changes separate from feature code separate from tests
- **By feature**: if changes touch multiple independent features, split them
- **By layer**: database migrations, backend logic, and frontend changes can be separate commits
- **Single-file changes**: usually one commit is fine
- **Tightly coupled changes**: files that only make sense together go in the same commit

For each commit group:
1. Stage only the relevant files (`git add <specific-files>`)
2. Write a clear commit message following conventional commits style
3. The first line should be under 72 characters
4. Add a body if the change needs explanation (the "why", not the "what")

If it's ambiguous how to split, just make reasonable choices — don't ask the user unless the changes are genuinely complex and the grouping is unclear.

### Step 4: Push and create the PR

Push the branch and create a **draft** pull request unless the user explicitly asks for an open (non-draft) PR.

```bash
git push -u origin <branch-name>
```

#### Finding the PR template

Check for a PR template in this order:
1. `.github/PULL_REQUEST_TEMPLATE.md`
2. `.github/pull_request_template.md`
3. `docs/pull_request_template.md`
4. `PULL_REQUEST_TEMPLATE.md`

If a template exists, fill it in according to the template's structure.

#### Writing the PR description (no template)

Adapt the description to the complexity of the change:

**Simple changes** (doc updates, single-file fixes, minor refactors):
Keep it brief — 1-3 sentences explaining what changed and why.

**Complex changes** (multi-file features, architectural changes, bug fixes with investigation):
Structure the description for reviewers:

```markdown
## Summary
Brief explanation of what this PR does and why.

## Changes
- Bullet points of key changes
- Grouped logically

## Notes
Anything reviewers should pay attention to, context that helps review, or decisions worth explaining.
```

#### Creating the PR

```bash
gh pr create --draft --title "<title>" --body "<body>"
```

- PR title: concise, under 70 characters, conventional-commits style prefix is nice but not required
- Base branch: `main` (or `master`, whichever the repo uses)

### Step 5: Report the result

After creating the PR, tell the user:
- The PR URL
- A brief summary of what was committed and how it was split
- The branch name

## Important guidelines

- **Never push directly to main/master** without explicit permission from the user
- **Always create draft PRs** unless told otherwise
- **Ask before acting** when genuinely uncertain — use AskUserQuestion to clarify with the user rather than guessing. Examples: the changes seem unrelated and you're not sure if they should be one PR or multiple; there are sensitive-looking files you're not sure about; the user's intent is ambiguous.
- **Respect .gitignore and repository rules** — never commit files that should be excluded
- **Check for pre-commit hooks** — if a commit fails due to hooks, fix the issue and create a new commit (don't use --no-verify)
