---
name: build-test-cases
description: Propose test cases for code as a prioritized list — not writing test code, but identifying what should be tested and why. Use this skill when the user asks to "think about test cases", "what tests do I need", "propose tests", "list test cases", "build test cases", "テストケースを考えて", "テストケースを提案して", "テストを洗い出して", or any variation of requesting test case analysis. Also trigger when the user says "/build-test-cases" or asks "what should I test" for a given function, module, or feature.
user_invocable: true
---

# Build Test Cases

This skill analyzes code and proposes test cases as a structured, prioritized list. The output is a document — not test code — that helps the developer understand what needs to be tested and why, at a glance.

## Core Concept

The output uses a three-tier priority system with visual indicators:

- 🟩 **必須（Must）** — これがないとテストとして不十分。正常系の基本動作や、壊れたらユーザーに直接影響するケース。
- 🟨 **推奨（Should）** — カバレッジと信頼性を高めるために重要。境界値やエッジケースなど。
- 🟥 **任意（Nice to have）** — 余裕があれば対応。レアケース、パフォーマンス、極端な入力など。

## Workflow

### Step 1: Understand the target

Identify what the user wants test cases for:

- **Specific function/method**: Read the function and understand its inputs, outputs, side effects, and error handling.
- **Module/class**: Read the entire module and understand its public API, internal state, and dependencies.
- **Feature (integration)**: Identify the components involved, how they interact, and the user-facing behavior.

Read the actual code thoroughly before proposing anything. Pay attention to:
- Conditional branches (if/else, switch, early returns)
- Error handling (try/catch, error codes, validation)
- External dependencies (API calls, DB queries, file I/O)
- State mutations
- Type constraints and business rules implicit in the code

### Step 2: Check existing tests

Look for existing test files in the project. This tells you:
- What's already covered (avoid duplicating)
- The project's testing conventions (framework, naming, structure)
- Gaps in current coverage

If existing tests are found, note them and focus on uncovered areas.

### Step 3: Build the test case list

Organize test cases into a table per function, method, or logical unit. Use this format:

```
## functionName / FeatureName

| 優先度 | テストケース | 入力例 | 期待結果 |
|--------|------------|--------|----------|
| 🟩 | ケースの説明 | 具体的な入力値 | 具体的な期待出力 |
```

#### Priority assignment guidelines

**🟩 必須（Must）** — assign when:
- The test covers the primary happy path (normal usage)
- A failure here means the core feature is broken
- The code has explicit validation/error handling that should be verified
- Business-critical logic (payments, auth, data integrity)

**🟨 推奨（Should）** — assign when:
- Boundary values (0, empty string, max values, off-by-one)
- Common edge cases that real users might hit
- Important branches in conditional logic
- Interaction between components in integration scenarios

**🟥 任意（Nice to have）** — assign when:
- Rare or unlikely input combinations
- Performance under stress
- Defensive checks for scenarios the code may not explicitly handle
- Platform-specific or environment-specific behavior

#### What makes a good test case entry

Each row should be specific enough that a developer can write the test from it:

- **テストケース**: A concise description of what is being tested and why it matters. Not just "invalid input" — say *what kind* of invalid input and what behavior is expected.
- **入力例**: Concrete values, not abstract descriptions. Write `items=[], discount=0` not "empty list with zero discount."
- **期待結果**: The specific expected output or behavior. Write `0を返す` or `ValidationErrorをthrow` not "handles correctly."

### Step 4: Add a summary

After the tables, include a brief summary:

```
### まとめ

- 🟩 必須: X件
- 🟨 推奨: Y件
- 🟥 任意: Z件
- 合計: N件
```

If there are existing tests that already cover some cases, mention what's covered and what's new.

### Step 5: Offer next steps

After presenting the test cases, ask the user if they want to:
- Adjust priorities or add/remove cases
- Proceed to actually write the test code for selected cases (starting from 🟩)

## Guidelines

- **Read the code first** — never propose test cases based solely on function names or signatures. Understanding the implementation reveals edge cases that the signature alone won't show.
- **Be concrete** — abstract test descriptions like "test error handling" are useless. Specify *which* error, *what* input triggers it, and *what* should happen.
- **Respect project context** — if the project has specific business rules, domain terminology, or testing patterns, use them. The test cases should feel like they belong in this project.
- **Don't over-propose** — aim for thoroughness without noise. 8-15 test cases per function/unit is typical. If you're listing 30+ cases, you're probably being too granular.
- **Consider integration points** — for feature-level analysis, think about how components interact, not just individual function behavior. Include test cases that verify the integration seams.
- **Language** — match the language the user is communicating in. If the conversation is in Japanese, write test case descriptions in Japanese.
