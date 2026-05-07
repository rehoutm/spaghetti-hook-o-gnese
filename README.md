# hook-o-gnese

> Score React component complexity from hook usage. Catch fat effects, scattered
> state, and coupled hooks before they ship.

[![npm](https://img.shields.io/npm/v/hook-o-gnese.svg)](https://www.npmjs.com/package/hook-o-gnese)
[![JSR](https://jsr.io/badges/@mrht/hook-o-gnese)](https://jsr.io/@mrht/hook-o-gnese)
[![CI](https://github.com/rehoutm/spaghetti-hook-o-gnese/actions/workflows/ci.yml/badge.svg)](https://github.com/rehoutm/spaghetti-hook-o-gnese/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Most lint rules check syntax. **hook-o-gnese checks complexity.** It scores how
dense your React hooks are — useEffect blocks bloated with branches and
`setState` calls, components with too many `useState`s that should be a
`useReducer`, effects that read and write the same state (loop bait), and custom
hooks stacked too deep.

```bash
npx hook-o-gnese ./src
```

```
src/components/Banner.tsx
  1:1     warn   useEffect entropy 23.5 ≥ 10 (deps=4 branches=9 setStates=1 nested=0)  hook-o-gnese/no-fat-effects
  1:1     error  useEffect reads + writes same state 'open' (loop risk)                hook-o-gnese/hook-coupling

src/screens/Settings.tsx
  1:1     warn   state scatter 8 ≥ 5 (useStates=3, correlated setters=10). Consider useReducer.  hook-o-gnese/state-scatter

3 problems (1 error, 2 warnings) in 470 files, 415ms
```

## Why

You've seen the file. 800 lines of component, fifteen `useState` calls, a
`useEffect` whose dependency array reads like a phone book, and a comment that
says `// TODO: refactor`. By the time anyone notices, it's already in production
and nobody wants to touch it.

`hook-o-gnese` is your early warning system. It measures the smells objectively,
surfaces them in CI, and gives you concrete numbers to argue with in code
review.

## What it catches

| Rule                | Smell                                                                  | Default            |
| ------------------- | ---------------------------------------------------------------------- | ------------------ |
| `no-fat-effects`    | useEffect blocks dense with branches, setState calls, missing cleanup  | warn at score ≥ 10 |
| `state-scatter`     | Components with too many `useState` calls (probably want `useReducer`) | warn at score ≥ 5  |
| `hook-coupling`     | useEffect that reads state it also writes (re-render loop bait)        | error              |
| `custom-hook-depth` | Custom hooks calling custom hooks calling custom hooks (type-aware)    | warn at depth ≥ 3  |

Full scoring formulas in [docs/thresholds.md](docs/thresholds.md). Per-rule
reference in [docs/rule-reference.md](docs/rule-reference.md).

## Two ways to run

### 1. Standalone CLI — recommended for most

No linter setup required. Works in any project. Outputs stylish, JSON, SARIF
(for GitHub code scanning), or GitHub Actions annotations.

```bash
npx hook-o-gnese ./src
npx hook-o-gnese ./src --format=sarif > report.sarif
npx hook-o-gnese ./src --type-aware  # enables custom-hook-depth (needs `typescript` in your project)
```

Add a `.hookogneserc.json` if you want to tune thresholds:

```jsonc
{
  "rules": {
    "hook-o-gnese/no-fat-effects": ["warn", { "threshold": 12 }],
    "hook-o-gnese/state-scatter": "warn",
    "hook-o-gnese/hook-coupling": "error",
    "hook-o-gnese/custom-hook-depth": ["warn", { "maxDepth": 3 }]
  },
  "ignore": ["**/legacy/**"],
  "typeAware": true
}
```

Full CLI reference: [docs/cli.md](docs/cli.md).

### 2. Oxlint plugin — if you're already on oxlint

```bash
npm install -D hook-o-gnese oxlint
```

```jsonc
// .oxlintrc.json
{
  "jsPlugins": ["./node_modules/hook-o-gnese/dist/index.mjs"],
  "rules": {
    "hook-o-gnese/no-fat-effects": "warn",
    "hook-o-gnese/state-scatter": "warn",
    "hook-o-gnese/hook-coupling": "error",
    "hook-o-gnese/custom-hook-depth": ["warn", { "maxDepth": 3 }]
  }
}
```

Or import the recommended preset, which bundles tsgolint type-aware rules
(`no-floating-promises`, `no-misused-promises`):

```ts
import { recommended } from "hook-o-gnese";
```

## Output formats

```bash
# Human-readable (default)
hook-o-gnese ./src

# Machine-readable for tooling / agentic loops
hook-o-gnese ./src --format=json

# SARIF for GitHub code scanning
hook-o-gnese ./src --format=sarif > report.sarif

# GitHub Actions inline annotations
hook-o-gnese ./src --format=github
```

## CI: GitHub Actions

```yaml
- name: Lint hook complexity
  run: npx hook-o-gnese ./src --format=github
```

For PR-level code-scanning UI:

```yaml
- run: npx hook-o-gnese ./src --format=sarif > hook-o-gnese.sarif
- uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: hook-o-gnese.sarif
```

## Programmatic API

```ts
import { lintFile, lintFiles } from "hook-o-gnese/engine";

const diagnostics = await lintFile("Component.tsx", source, {
  rules: { "hook-o-gnese/no-fat-effects": { severity: "warn" } },
  cwd: process.cwd(),
  typeAware: false,
});
```

## Performance

Sequential per-file scan, but each file is cheap:

| Path                               | Cold start | Per-file warm   |
| ---------------------------------- | ---------- | --------------- |
| Node CLI (`npx`)                   | ~80ms      | ~3–5ms          |
| Standalone binary (`deno compile`) | ~30ms      | ~3–5ms          |
| Type-aware rule (first run)        | +50–150ms  | TS Program load |

Linear scan of ~200 files/sec on a single core. Rouvy companion app: 470 files
in 415ms.

## Standalone binary

The CLI also ships as a single static binary built with `deno compile` — no
Node, no Deno, no install required:

```bash
git clone https://github.com/rehoutm/spaghetti-hook-o-gnese
cd hook-o-gnese
deno task build:bin
./bin/hook-o-gnese ./src
```

## Honest limitations

- **`custom-hook-depth` uses the TypeScript Compiler API**, not tsgolint's Go
  backend. Oxlint's JS plugin API doesn't expose tsgolint type info to custom
  rules, so we lazily build a `ts.Program` for that one rule. ~50–150ms
  first-run cost, then cached.
- **Sequential file scan.** Worker-thread parallelism is on the v1.5 list.
  Current per-file cost (~3–5ms) means linear scanning is fine through
  ~thousands of files.
- **No daemon mode yet.** Each invocation is a fresh process. Also v1.5.

## Compatibility

- **Node:** ≥ 20.18
- **Deno:** ≥ 2.x
- **TypeScript:** ≥ 6.0 (peer)
- **Oxlint:** ≥ 1.63 (peer, optional — only needed for plugin path)

ESM only. No CJS build.

## License

MIT
