# Self-review: hook-o-gnese v0.0.1

Full sweep of all source, tests, and config before publish. Findings ranked by severity.

**Test status at review time:** 53/53 passing.
**LOC reviewed:** ~1,775 in `src/`, plus tests, config, CI.

---

## 🔴 Blockers (must fix before publish)

### B1 — `src/index.ts` recommended config points at `dist/index.js`, but bundle ships `dist/index.mjs`

```ts
// src/index.ts:10
jsPlugins: ["./node_modules/@your-scope/hook-o-gnese/dist/index.js"],
```

`tsdown.config.ts` only emits `format: ["esm"]`, so the file is `dist/index.mjs`. Anyone copying the `recommended` config or following the README's oxlint snippet (which has the same `.js` path) will get a **module-not-found** error.

**Fix:** change to `./node_modules/@your-scope/hook-o-gnese/dist/index.mjs` in both `src/index.ts` and `README.md`.

### B2 — Severity is hard-wired to config, not tied to score tiers

`DEFAULT_THRESHOLDS` defines both `warn` and `error` numbers in `src/scoring/thresholds.ts`. The rules only consume the `warn` tier — there's no path that emits `severity: "error"` when a score crosses the `error` threshold. Severity is whatever the user (or the default) put in config.

Real-world impact (rouvy-companion): `useArAppStateUpdate.ts` had entropy 42.0 (well past the error tier of 20). It was reported as `warn` because that's what the default config says.

`docs/thresholds.md` advertises tiered severity, so this is a **doc-vs-behavior mismatch**.

**Fix options (pick one):**
1. **Tier escalation in rule** — if `score >= error` threshold, emit a second diagnostic at `error` severity, or escalate the existing one. Cleanest UX.
2. **Drop the `error` numbers from `thresholds.ts` and the docs.** Honest about the actual behavior.
3. **Document that severity is config-driven, thresholds are score gates.** Smallest change, but readers will keep getting confused.

Recommend option 1 — gives the tool teeth.

### B3 — `applyCliRuleOverrides` allows `severity: "off"` to be merged but doesn't strip the rule

```ts
// src/config.ts:73
rules[o.id] = { ...(rules[o.id] ?? { severity: "off" }), severity: o.severity };
```

If a user passes `--rule=hook-o-gnese/no-fat-effects=off`, the rule stays in the rules map with `severity: "off"`. The engine handles this (line 100 of engine.ts: `if (ruleCfg.severity === "off") continue;`). But the public type `EngineConfig.rules.severity: Severity` still allows `"off"`, while the diagnostic emitted only ever has `"warn" | "error"` — that's mostly fine, just confusing.

**Verdict:** behavior is correct; type-doc only. Low priority.

---

## 🟡 Important (fix before stable v1.0)

### I1 — `src/engine.ts` `walkAST` doesn't skip `parent` pointers, but `src/ast-helpers.ts` `walk` does

Two different traversal helpers in the engine and the helpers module. Engine's `walkAST` (line 45-59) iterates every key on every node. If oxc-parser ever attaches a back-reference (`parent` on JS estree-compat is common), this will infinite-loop. The `seen` set in `walk` (ast-helpers.ts:57) and the `parent` skip (line 64) are the safe pattern.

**Fix:** consolidate on the helper from `ast-helpers.ts`. Engine should `import { walk }` and use the same logic.

### I2 — `lintFiles` reads + parses every file unconditionally, even non-React ones

Engine's `lintFile` bails early for non-React files (line 91-95, after parsing), but `lintFiles` reads all matched paths via globby. On a 470-file React-Native repo where ~40% of `.ts` files are non-React utilities, that's a lot of wasted parsing.

**Quick win:** add an even cheaper pre-check (substring `"react"` in raw source) before `parseSync`. Keeps the early-bail correctness while skipping the parse cost. Saves probably 30-50% on real codebases.

**Lower priority:** the rouvy-companion run was 415ms for 470 files, so this isn't a bottleneck today. But it'll matter at 5,000-file scale.

### I3 — `getLoc` in engine returns 1-based line but assumes 0-based column from oxc

```ts
// src/engine.ts:34-43
column: start?.column ?? 1,
```

oxc-parser emits columns as 0-based. We pass them through to formatters and SARIF as if they were 1-based. The stylish formatter prints `1:1` for a useEffect at column 0 — off by one. SARIF spec wants 1-based startColumn, so **SARIF output is currently wrong**.

**Fix:** `column: (start?.column ?? 0) + 1` and same for `endColumn`. Add a test fixture that verifies a known-position diagnostic lands on the correct line:column pair.

### I4 — `getLoc` falls back to `node.start` (offset, not line/col) when `node.loc` missing

```ts
const start = node?.loc?.start ?? node?.start;
```

`node.start` is a byte offset, not `{line, column}`. The `?.line` chain returns undefined → defaults to 1. So you silently get `1:1` for any node that lacks `loc`. That's exactly what we see in production output (every diagnostic at `1:1`). Looking at fixture output:

```
tests/fixtures/fat-effect.tsx
  1:1     warn   useEffect entropy 23.0 ...
```

The useEffect is on line 5, not line 1. **All locations are bogus.** This is a real correctness bug. SARIF, GitHub annotations, and stylish output all point at line 1 of every file regardless of where the issue actually is.

**Root cause:** rules pass the *component-level* node (FunctionDeclaration / VariableDeclaration) to `report.node`, but the relevant location is the `useEffect` call inside it. Either:
- Rules pass the inner offending node (e.g. the `useEffect` CallExpression itself).
- Or `getLoc` digs into `node.body` / argument nodes for a better location.

**Verdict:** B-class blocker masquerading as an I-class. SARIF + GitHub Actions annotations are the production interfaces — they're broken right now. **Bumping this to 🔴 B4** mentally; leaving it here for the audit trail.

### I5 — `TsProgramCache.rootDir` path math uses Unix-only `/` separator

```ts
// src/ts-program.ts:50-52, src/config.ts:33
filePath.startsWith("/")
${cwd.replace(/\/$/, "")}/...
```

Windows paths start with `C:\`, not `/`. The CI matrix runs on windows-latest. Either:
- Use Node's `path.join` / `path.isAbsolute` (would force a Node dep in pure-Deno code, naff)
- Use `@std/path` from JSR (already a peer in deno.json imports)
- Hand-roll: also accept `^[A-Z]:[\\/]`

**Fix:** import `isAbsolute` and `join` from `@std/path` in `config.ts` and `ts-program.ts`. The bundle path is via tsdown which won't ship the @std/path dep (it'll be Deno-only at runtime — needs verification with `npm pack`).

Actually — `cli-core.ts` is shared between the Deno + Node CLI, but path joining in config is `cwd + "/" + filename`. On windows-Node this produces `C:\foo/.hookogneserc.json`. Node's `fs.readFile` is forgiving with mixed separators on Windows, so it usually works. But it's fragile.

**Verdict:** 🟡 important. CI smoke on windows will surface it if it breaks.

### I6 — `ts-program.ts` infinite-recursion guard uses `depth > 10` AND `seen.has(decl)`

```ts
// src/ts-program.ts:82
if (depth > 10 || seen.has(decl)) return depth;
```

The hard cap of 10 silently saturates depth at 10 for legitimate deep trees. Dogfood reported max depth 3 in rouvy-companion, so we're nowhere near. But if a user tunes `maxDepth: 5` and has a real chain of 12, we report 10, not 12.

**Fix:** raise the cap to something like 100, or remove it (the `seen` set already prevents loops).

### I7 — Engine's per-rule walk re-traverses the entire AST for each rule

`engine.ts` line 122-124: for each rule, it calls `rule.create(context)` then `walkAST(parsed.program, handlers)`. With 4 rules that's 4 full-AST walks per file. Eslint solves this with handler merging (one walk, all visitors).

**Quick fix:** merge handlers from all rules into one map of `type → handler[]` and walk once. 4× speedup on per-file lint cost. Worth ~3ms → ~1ms per file at scale.

**Not blocking v0.0.1** — current perf is fine. **Park for v0.1.**

### I8 — `effect-score.ts` SET_STATE detection uses `^set[A-Z]` regex on every Identifier callee

This catches actual setState calls but also e.g. `setTimeout` (filtered separately) and any user-named `setFoo()` function. False positives in components that have their own `setX` helpers. Hard to fix without symbol resolution — keep heuristic, document.

**Fix:** add to `docs/rule-reference.md` under no-fat-effects: "any `set[A-Z]…` call counts as a setState. Custom setters with that naming pattern will inflate the score; rename or use options.threshold."

### I9 — `state-score.ts` `correlatedSetters` includes setters across **nested** functions

Walking the entire component for `FunctionDeclaration | FunctionExpression | ArrowFunctionExpression` and counting setters in each. A component with one event handler that calls 8 setters AND one nested helper that calls 2 of the same setters double-counts those setters in the score.

**Verdict:** the heuristic is loose by design — the doc says "correlated setters" loosely. Document the loose semantic in `docs/thresholds.md`.

---

## 🟢 Polish (nice-to-haves, not blocking)

### P1 — `src/cli.ts` shebang is `#!/usr/bin/env -S deno run -A`, broader than the binary needs

`deno task` definitions use precise permissions (`--allow-read --allow-env --allow-sys --allow-ffi`). The shebang grants everything. Won't matter once compiled (binary embeds permissions), but if anyone runs `./src/cli.ts` directly they get full perms.

**Fix:** match the task's exact perms in the shebang. Cosmetic.

### P2 — `cli-core.ts` `--no-error-on-warn` flag is parsed but never consumed

```ts
// runCli ignores opts.noErrorOnWarn entirely
if (diagnostics.some((d) => d.severity === "error")) return 1;
return 0;
```

Currently `--no-error-on-warn` does nothing — warnings already don't trigger exit-1. The flag is documented in `--help` and `docs/cli.md`. **It's a no-op.**

Either:
- Remove the flag entirely (cleaner).
- Or invert the default: warnings DO exit-1, and the flag opts out. Probably what users expect.

**Fix:** decide intent, then either implement or remove. Currently it's a lying flag.

### P3 — `engine.ts` `parse-error` diagnostics use `severity: "error"` unconditionally

If a single file fails to parse, we emit one or more "parse-error" diagnostics. They show up in stylish output but won't appear in the rule registry, and `severity: "error"` always exits non-zero. A repo with one broken file will fail CI even if the user wanted advisory mode. Acceptable behavior, but document.

### P4 — `formatters/github.ts` doesn't escape commas in messages

```ts
return `${cmd} file=${d.file},line=${d.line},col=${d.column},title=${d.rule}::${safe}`;
```

If a future rule emits a message with a comma in it before the `::`, parsing breaks. Currently safe (we use `::` separator and the prefix is fixed). Pin a comment that the title comes before `::` so future-us doesn't break the contract.

### P5 — SARIF formatter `informationUri` is hard-coded `github.com/your-scope/hook-o-gnese`

Will be `404` until the real repo exists at the published scope. Fix at scope-rename time (see `docs/publish-plan.md` Phase A).

### P6 — Test coverage gap: no integration test for the `engine → CLI → formatter` round trip on Windows path separators

We have CI matrix for windows, and the smoke job runs `--format=json` on a fixture. But no assertion on the JSON `file` field — does it contain `\` or `/`? Either is acceptable for SARIF, but consumers downstream may care.

**Fix:** in `.github/workflows/ci.yml` smoke-cli-binary job, parse the JSON output and assert `.diagnostics[0].file` is non-empty. Trivial guard against silent regression.

### P7 — `ALL_RULES` cast `as unknown as Rule`

```ts
// src/rules/registry.ts
"no-fat-effects": noFatEffects as unknown as Rule,
```

Necessary because `@oxlint/plugins` 1.63 widened `Rule` to `CreateRule | CreateOnceRule`. The double cast is a 🟡 technical debt comment more than a bug. Worth a code comment explaining why the cast.

### P8 — `package.json` `peerDependenciesMeta.oxlint.optional: true` set, but `typescript` is also optional in practice

CLI path doesn't need TypeScript at runtime — only `custom-hook-depth` rule does, and that only runs with `--type-aware`. Set `typescript` optional too with a meta entry, or document that non-type-aware users don't actually need TS installed.

### P9 — `tsdown.config.ts` `sourcemap: true` ships sourcemaps to npm

That's 60KB → bigger. JSR doesn't include them (publishes source). Probably fine for npm but tools that diff bundle sizes will see it. Consider conditional via env var.

---

## ✅ Things I checked that look fine

- **Rule registry → engine wiring** consistent: 4 rule files exported, 4 in `ALL_RULES`, 4 in `DEFAULT_RULES` config, 4 in plugin `recommended` config, 4 documented in `docs/rule-reference.md`. No orphans, no missing.
- **`RuleContext` type** defined once in `no-fat-effects.ts`, imported by the other 3 rules. Single source of truth.
- **Severity flow** end-to-end: `Severity` defined in `engine.ts`, re-exported via type-only imports through `cli-core.ts` and `cli.ts/cli.node.ts`. No duplicate definitions.
- **Diagnostic shape** stable from rule `report` → engine collection → formatter input. `endLine`/`endColumn` are optional throughout, formatters all guard.
- **Test fixtures** match what's in the doc thresholds (fat-effect score 23, state-scatter 12, coupled hooks count, deep custom hook depth 3).
- **No `console.log` debug statements** in src/ (grep confirmed clean).
- **Permissions** in `deno.json` tasks are minimal and intentional: `--allow-read --allow-env --allow-sys --allow-ffi` — `sys` for globby, `ffi` for oxc-parser native bindings, `env` for Deno internals, `read` for the file scan. No `--allow-write` or `--allow-net` in the CLI runtime path.
- **CI matrix** covers ubuntu/macos/windows for binary smoke; ubuntu for npm + JSR. Reasonable coverage.
- **`.gitignore`** excludes `dist/`, `bin/`, `node_modules/`, `*.tsbuildinfo`, `.deno/`. All build artifacts excluded.
- **No secrets, env-var leakage, or credentials** anywhere in src/ or tests/.
- **No external HTTP calls** at runtime (parser is local, TS Program is local, file scan is local).

---

## Recommended action before publish

**Before tagging v0.0.1 to npm/JSR:**
1. **Fix B1** (recommended config path `.js → .mjs`) — 30 seconds.
2. **Fix the location bug (I4 → reclassified blocker)** — rules pass component nodes; need to drill into the actual offending sub-node OR enrich `getLoc`. ~1 hour. **This is the one Homelander would crucify us with.** Without it, every diagnostic points at line 1.
3. **Decide on B2** (tiered severity) — either implement or strip from docs.
4. **Decide on P2** (`--no-error-on-warn`) — implement or remove the flag.

**During Phase A scope-rename (per `docs/publish-plan.md`):**
- Fix B1 alongside the `@your-scope` replacement.
- Fix P5 (SARIF informationUri) at the same time.

**Park for v0.1:**
- I1 (consolidate walk helpers)
- I2 (cheap pre-check before parse)
- I5 (windows path separators — wait for CI to fail first)
- I6 (raise depth cap)
- I7 (single-walk handler merge)
- P1, P3, P4, P6, P8, P9

**Document but don't fix:**
- I8, I9 (heuristic limitations — add to `docs/rule-reference.md`)
- P7 (cast comment)

---

## Bottom line

The MVP is structurally sound. Rules → scoring → engine → formatters separation is clean. Tests are real and pass. CI is wired. The 🔴 blockers are: 

1. **One broken file path** (B1, dist/index.js → index.mjs)
2. **Location info is bogus** (I4 — every diagnostic at 1:1)
3. **Severity tiers are advertised but not implemented** (B2)

Fix those three and v0.0.1 goes out the door without giving Vought any ammunition. Everything else is polish.
