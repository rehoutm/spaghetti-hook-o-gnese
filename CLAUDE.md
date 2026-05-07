# CLAUDE.md

Guidance for Claude Code working in this repo.

## What this repo is

`spaghetti-hook-o-gnese` is the GitHub repo; `hook-o-gnese` is the package it
ships. The package is dual-published:

- **npm:** `hook-o-gnese` (unscoped) —
  https://www.npmjs.com/package/hook-o-gnese
- **JSR:** `@mrht/hook-o-gnese` — https://jsr.io/@mrht/hook-o-gnese
- **Binary:** `bin/hook-o-gnese` (via `deno compile`)
- **Plugin/rule namespace:** `hook-o-gnese/<rule-id>`
- **CLI config file consumers create:** `.hookogneserc.json`

Don't reintroduce a `@your-scope` placeholder. Don't conflate the repo name with
the package name.

## Architecture

A TypeScript library that scores React component complexity from hook usage. Two
consumption modes share a core:

1. **Core (linter-agnostic):** `src/scoring/*`, `src/ast-helpers.ts`,
   `src/ts-program.ts`, `src/rules/*`. Rules use the ESLint-compatible
   `create(context)` shape so any host can supply a context.
2. **Adapter A — Oxlint plugin** (`src/index.ts`): wraps rules via
   `@oxlint/plugins`' `eslintCompatPlugin`. Exports a `recommended` config that
   bundles tsgolint built-ins (`typescript/no-floating-promises`, etc.) for
   type-aware coverage.
3. **Adapter B — Standalone engine + CLI** (`src/engine.ts`, `src/cli.ts`,
   `src/formatters/*`): own file-walking + parsing pipeline on top of
   `oxc-parser`. No oxlint dependency at runtime. Emits stylish / JSON / SARIF /
   GitHub formats.

### Invariants

- Scoring (`src/scoring/*`) is **pure** — input AST/data, output number/struct.
  No I/O, no context.
- Rules are **thin wrappers** over scoring + `context.report`. Don't pile logic
  into rules.
- Engine and plugin are **adapters** that supply a context object to rules. The
  same rule code runs in both.
- Formatters are pure: `Diagnostic[] → string`. Side effects (writing to
  stdout/files) live in `cli.ts`.
- The type-aware rule (`custom-hook-depth`) goes through `src/ts-program.ts`,
  which lazily constructs a `ts.Program`. Non-type-aware code paths must not
  import it.

## Tasks (use these, don't spell out commands)

`deno.json` defines: `test`, `lint`, `fmt`, `cli`, `build:npm`, `build:bin`,
`publish:jsr`, `dogfood:plugin`, `dogfood:cli`.

## Release flow

Versioning is automated by **release-please**
(`.github/workflows/release-please.yml` + `release-please-config.json` +
`.release-please-manifest.json`):

1. Push conventional commits (`feat:`, `fix:`, `feat!:`, `chore:`, `docs:`,
   `ci:`, etc.) to `master`.
2. The bot opens/updates a "chore: release X.Y.Z" PR that bumps `package.json` +
   `deno.json` in lockstep and updates `CHANGELOG.md`.
3. Merging the release PR tags `vX.Y.Z` and creates a GitHub Release.
4. `release.yml` fires on `release: published` → publishes to npm and JSR in
   parallel via OIDC trusted publishing. No tokens.

Pre-1.0 bump rules (set in `release-please-config.json`): breaking changes are
minor bumps, features are patch bumps, fixes are patch bumps. Do not hand-bump
versions; do not hand-edit `CHANGELOG.md`.
