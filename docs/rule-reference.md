# Rule reference

## hook-o-gnese/no-fat-effects

Reports useEffect blocks whose entropy score crosses the threshold.

**Options**: `{ "threshold": 10 }`

## hook-o-gnese/state-scatter

Reports components with too many useState calls.

**Options**: `{ "threshold": 5 }`

## hook-o-gnese/hook-coupling

Reports useEffect blocks that read state they also write.

**Options**: `{ "threshold": 3 }`

## hook-o-gnese/custom-hook-depth

Reports custom hooks whose transitive call tree exceeds maxDepth. **Type-aware** (uses TypeScript Compiler API). Disabled by default in CLI mode; enable with `--type-aware` or `typeAware: true` in `.hookogneserc.json`. Requires `typescript` to be installed in your project (`npm i -D typescript`); the rule resolves it from your project's `node_modules` so analysis uses your TS version, not ours.

**Options**: `{ "maxDepth": 3 }`

## Type-aware companion rules (oxlint plugin path only)

The exported `recommended` config enables tsgolint built-ins alongside ours:

```ts
import { recommended } from "hook-o-gnese";
```

Adds:
- `typescript/no-floating-promises` — unawaited promises in effects
- `typescript/no-misused-promises` — `useEffect(async () => {})`
