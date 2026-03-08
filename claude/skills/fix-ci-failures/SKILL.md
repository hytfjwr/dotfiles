---
name: fix-ci-failures
description: |
  Analyze and fix CI failures using GitHub CLI (gh). Fetches failed GitHub Actions logs,
  diagnoses the root cause, plans a fix, and applies it.
  Use this skill when the user mentions CI failures, broken builds, failed checks, red pipelines,
  or says things like "fix CI", "CI is failing", "the build is broken", "check why CI failed",
  "fix the pipeline", "GitHub Actions failed", or "/fix-ci-failures".
  Also trigger when the user references a specific GitHub Actions run that failed.
user_invocable: true
---

# Fix CI Failures

This skill analyzes failing GitHub Actions runs, diagnoses the root cause from the logs, and applies fixes to the codebase.

## Workflow

### Step 1: Identify failing CI runs

Find the most recent failing workflow runs for the current branch (or the branch/PR the user specifies):

```bash
gh run list --branch <branch> --status failure --limit 5
```

If no branch is specified, use the current git branch:

```bash
git branch --show-current
```

If there are no failing runs, report that all CI checks are passing and stop here. There is nothing to fix.

### Step 2: Fetch failure logs

For each failing run, retrieve the failed job logs:

```bash
gh run view <run-id> --log-failed
```

If the user has specified a particular run ID or PR, use that directly. Otherwise, start with the most recent failure.

Also check what workflow file is involved to understand the CI pipeline structure:

```bash
gh run view <run-id>
```

### Step 3: Diagnose the failure

Analyze the logs and categorize the failure:

- **Test failure**: A specific test case is failing — identify the test, the assertion, and the expected vs actual behavior
- **Lint/format error**: Code style violations — identify the rule and the offending files
- **Type error**: Type checking failures — identify the type mismatch and location
- **Build error**: Compilation or bundling failures — identify the missing dependency, syntax error, or config issue
- **Dependency issue**: Package installation failures — identify the conflicting or missing package
- **Environment/config issue**: CI environment problems — identify misconfiguration

Read the relevant source files to understand the context around the failure before proposing a fix.

### Step 4: Plan the fix

Before making changes, briefly explain to the user:

- What failed and why
- What the fix involves
- Which files will be modified

Keep the explanation concise — a few sentences, not an essay. If the fix is obvious (e.g., a lint error), just state what you're fixing and proceed.

### Step 5: Apply the fix

Make the necessary code changes. After applying the fix:

1. Run the same checks locally if possible (e.g., run the failing test, linter, or type checker) to verify the fix works
2. If local verification isn't possible, explain what was changed and why it should resolve the failure

### Step 6: Report the result

Summarize what was fixed:

- The failure type and root cause
- The changes made
- Whether local verification passed (if applicable)
- Suggest the user push and re-run CI to confirm

## Important guidelines

- **Start with the most recent failure** — older failures may already be resolved by newer commits
- **Read the actual source code** before fixing — don't guess at fixes based on log messages alone
- **One problem at a time** — if multiple independent failures exist, fix and explain them one by one
- **Don't change CI config unless necessary** — prefer fixing the application code over modifying workflow files, unless the workflow itself is the problem
- **Ask before large changes** — if the fix requires significant refactoring, check with the user first
