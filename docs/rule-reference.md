# Rule reference

All rules use the namespace `hook-o-gnese/<rule-id>` in both standalone CLI,
oxlint, and ESLint adapters. Configuration syntax differs per host, but rule IDs
and options are identical.

## hook-o-gnese/no-fat-effects

Reports useEffect blocks whose entropy score crosses the threshold.

**Options**: `{ "threshold": 10 }`

## hook-o-gnese/state-scatter

Reports components with too many useState calls.

**Options**: `{ "threshold": 5 }`

## hook-o-gnese/hook-coupling

Reports useEffect blocks that read state they also write.

**Options**: `{ "threshold": 3 }`

## hook-o-gnese/noise-callback-effect

Reports `useCallback` whose only consumer is a passthrough `useEffect` — i.e. the effect body is one of `() => cb()`, `{ cb(); }`, or `{ return cb(); }`. This pattern launders the effect's dependency cluster into a sibling `useCallback` without reducing aggregate component complexity; rewrite the effect to inline the body (or move the work out of render entirely).

Three passthrough shapes are matched. The rule does not fire when the callback is also used elsewhere (e.g. passed to a child as a prop) or when the effect wraps the call in something else (e.g. `setTimeout(cb, 5000)`).

**Options**: none

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
