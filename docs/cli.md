# CLI usage

```
hook-o-gnese [options] <paths...>

Options:
  --format=<fmt>          stylish (default) | json | sarif | github
  --config=<path>         path to .hookogneserc.json
  --type-aware            enable custom-hook-depth
  --rule=<id>=<sev>       override rule severity (off|warn|error). Repeatable.
  --help, -h
```

## Config file

`.hookogneserc.json` in your project root:

```jsonc
{
  "rules": {
    "hook-o-gnese/no-fat-effects": "warn",
    "hook-o-gnese/state-scatter": ["warn", { "threshold": 6 }],
    "hook-o-gnese/hook-coupling": "error",
    "hook-o-gnese/custom-hook-depth": ["warn", { "maxDepth": 3 }]
  },
  "ignore": ["**/legacy/**"],
  "typeAware": true
}
```

## Examples

```bash
# Lint a directory
npx hook-o-gnese ./src

# JSON output for tooling
npx hook-o-gnese ./src --format=json > report.json

# SARIF for GitHub code scanning
npx hook-o-gnese ./src --format=sarif > report.sarif

# GitHub Actions annotations
npx hook-o-gnese ./src --format=github

# Override a rule severity
npx hook-o-gnese ./src --rule=hook-o-gnese/state-scatter=error

# Standalone binary (built via deno compile)
./bin/hook-o-gnese ./src --type-aware
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

| Path                        | Cold start | Per-file warm |
| --------------------------- | ---------- | ------------- |
| Node CLI (`npx`)            | ~80ms      | ~3-5ms        |
| Deno-compiled binary        | ~30ms      | ~3-5ms        |
| Type-aware rule (first run) | +50-150ms  | TS Program    |
