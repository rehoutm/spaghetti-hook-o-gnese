# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

This repo (`spaghetti-hook-o-gnese`) is the home of the `hook-o-gnese` package. The implementation has not started yet:

- `hook-o-gnese-mvp-plan.md` — step-by-step MVP implementation plan, 21 tasks, TDD-structured.
- `CLAUDE.md` — this file.
- Git repo is initialized (`master`) but has **no commits yet**.
- No `package.json`, no `deno.json`, no `src/`, no tests. Don't invent build/lint/test commands — there's nothing to build until Task 1 of the plan runs.

The repo folder name (`spaghetti-hook-o-gnese`) and the published package name (`hook-o-gnese`) are intentionally related but not identical — the package name is the shorter form. The package ships to JSR/npm as `@your-scope/hook-o-gnese`, the binary is `bin/hook-o-gnese`, the plugin/rule namespace is `hook-o-gnese/<rule-id>`, and the CLI's config file is `.hookogneserc.json`.

## Executing the plan

Tasks use `- [ ]` checkbox syntax. The plan's preamble names two skills, either is fine:

- `superpowers:subagent-driven-development` (recommended) — dispatch independent tasks to subagents.
- `superpowers:executing-plans` — drive task-by-task in the current session with review checkpoints.

Invoke whichever skill the user requests before touching code. The plan uses strict TDD per step: write failing test → run → implement → run → commit. Don't shortcut that ordering — task commit boundaries depend on it.

Task 1 Step 1 is now a **verification** step (the directory and git repo already exist), not a `mkdir`. Don't re-init git or you'll lose the existing branch state.

## Architecture being built (read this before discussing changes to the plan)

`hook-entropy` is a TypeScript library that scores React component complexity from hook usage. It ships in **two consumption modes from a shared core**:

1. **Core (linter-agnostic):** `src/scoring/*`, `src/ast-helpers.ts`, `src/ts-program.ts`, `src/rules/*`. Rules use the ESLint-compatible `create(context)` shape so any host can supply a context.
2. **Adapter A — Oxlint plugin** (`src/index.ts`): wraps rules via `@oxlint/plugins`' `eslintCompatPlugin`. Exports a `recommended` config that bundles tsgolint built-ins (`typescript/no-floating-promises`, etc.) for type-aware coverage.
3. **Adapter B — Standalone engine + CLI** (`src/engine.ts`, `src/cli.ts`, `src/formatters/*`): own file-walking + parsing pipeline on top of `oxc-parser`. No oxlint dependency at runtime. Emits stylish / JSON / SARIF / GitHub formats.

**Key invariants the plan enforces:**

- Scoring (`src/scoring/*`) is **pure** — input AST/data, output number/struct. No I/O, no context.
- Rules are **thin wrappers** over scoring + `context.report`. Don't pile logic into rules.
- Engine and plugin are **adapters** that supply a context object to rules. The same rule code runs in both.
- Formatters are pure: `Diagnostic[] → string`. Side effects (writing to stdout/files) live in `cli.ts`.
- The type-aware rule (`custom-hook-depth`) goes through `src/ts-program.ts`, which lazily constructs a `ts.Program`. Non-type-aware code paths must not import it.

**Distribution:** dual-published to JSR (Deno-native) and npm (via `tsdown` bundle). The CLI also ships as a static binary via `deno compile`. Once Task 1 lands, `deno.json` will define tasks: `test`, `lint`, `fmt`, `cli`, `build:npm`, `build:bin`, `publish:jsr`, `dogfood:plugin`, `dogfood:cli`. Use those rather than spelling out commands.

## When working on the plan document itself

If the user asks you to revise `hook-o-gnese-mvp-plan.md`:

- Preserve the `- [ ]` checkbox syntax — the executing-plans / subagent-driven-development skills key off it.
- Preserve the per-step TDD ordering (failing test → impl → passing test → commit).
- Preserve task boundaries; each task ends with a commit. Don't merge tasks.
- The `@your-scope` placeholder is intentional — flag it but don't replace with a guess.
- The package name `hook-o-gnese` (binary `bin/hook-o-gnese`, rule namespace `hook-o-gnese/*`) is the **shorter form** derived from the repo folder name `spaghetti-hook-o-gnese`. Don't conflate them and don't revert to longer names.
