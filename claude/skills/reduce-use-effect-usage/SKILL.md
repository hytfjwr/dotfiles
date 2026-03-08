---
name: reduce-use-effect-usage
description: |
  A skill to evaluate useEffect usage in React codebases and replace unnecessary useEffect calls with alternative patterns.
  Use in the context of reducing useEffect usage, refactoring, code review, or performance improvement.
  Triggers when the user says things like "reduce useEffect", "review useEffect usage", "check for unnecessary useEffects",
  "clean up Effects", "improve React performance", "optimize rendering", etc.
  Also proactively check for unnecessary useEffect usage when asked to refactor or review React components.
---

# reduce-use-effect-usage

A skill to evaluate `useEffect` in React codebases and eliminate unnecessary usage.

## Core Principle

In React, `useEffect` is a **last resort**. `useEffect` exists for "synchronizing with external systems outside of React." When used for any other purpose, there is almost certainly a better alternative.

When you find a `useEffect`, first ask: "Is this truly synchronizing with an external system?" If the answer is No, apply an alternative pattern.

## Reference Documentation

Before starting work, always review the following official React documentation:

- **You Might Not Need an Effect**: https://react.dev/learn/you-might-not-need-an-effect

This document comprehensively covers specific patterns of unnecessary `useEffect` usage and their alternatives. When evaluating each `useEffect`, compare it against the patterns described in this document, and if a match is found, replace it with the recommended alternative.

## Workflow

1. Fetch the reference documentation above using WebFetch and understand its contents
2. Search for all `useEffect` usage within the target files/directories
3. Classify each `useEffect` based on the criteria from the reference documentation
4. Replace unnecessary `useEffect` calls with appropriate alternative patterns
5. Add comments explaining why `useEffect` is needed **only for those that are truly necessary**
6. Verify that the modified code works correctly

## Evaluation Guidelines

When you find a `useEffect`, evaluate it in the following order:

1. **Ask "Why does this code need to run?"**
2. "Because the component was displayed" → `useEffect` may be necessary (verify if it's external synchronization)
3. "Because a specific user action occurred" → Move to an event handler
4. "Because data needs to be transformed/computed" → Compute directly during rendering
5. "Because it's an expensive computation" → Use `useMemo`
6. "Because state needs to reset when props change" → Use the `key` prop
7. "Because I want to avoid duplicating logic" → Extract a shared function

For detailed patterns and alternatives, always refer to the reference documentation.

## Comment Convention

Only leave comments when `useEffect` is truly necessary, using the following format:

```tsx
// useEffect required: [brief explanation of the reason]
useEffect(() => {
  // ...
}, [deps]);
```

Do not leave comments where unnecessary `useEffect` calls were removed. The code itself should be self-explanatory through the alternative pattern.
