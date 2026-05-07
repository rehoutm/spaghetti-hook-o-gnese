# hook-o-gnese

Score React component complexity from hook usage. Two ways to run from one shared core:

| Mode | When to use | Install |
| --- | --- | --- |
| **Standalone CLI** | Existing ESLint setup, agentic feedback loops, no extra config wanted | `npx @your-scope/hook-o-gnese ./src` |
| **Oxlint plugin** | Already running oxlint, want tsgolint type-aware rules alongside | Add to `.oxlintrc.json` |

## Rules

- `hook-o-gnese/no-fat-effects` — dense useEffect blocks
- `hook-o-gnese/state-scatter` — too many useState calls
- `hook-o-gnese/hook-coupling` — effects that read+write the same state
- `hook-o-gnese/custom-hook-depth` — transitive custom-hook nesting (type-aware)

## Standalone CLI

```bash
npx @your-scope/hook-o-gnese ./src
npx @your-scope/hook-o-gnese ./src --format=sarif > report.sarif
npx @your-scope/hook-o-gnese ./src --type-aware
```

See [docs/cli.md](docs/cli.md).

## Oxlint plugin

```bash
npm install -D @your-scope/hook-o-gnese oxlint
```

```jsonc
// .oxlintrc.json
{
  "jsPlugins": ["./node_modules/@your-scope/hook-o-gnese/dist/index.js"],
  "rules": {
    "hook-o-gnese/no-fat-effects": "warn",
    "hook-o-gnese/state-scatter": "warn",
    "hook-o-gnese/hook-coupling": "error",
    "hook-o-gnese/custom-hook-depth": ["warn", { "maxDepth": 3 }]
  }
}
```

Or use the recommended config (bundles tsgolint type-aware rules):

```ts
import { recommended } from "@your-scope/hook-o-gnese";
```

## Standalone binary

Built with `deno compile`:

```bash
git clone <this-repo>
cd hook-o-gnese && deno task build:bin
./bin/hook-o-gnese ./src
```

## See also

- [docs/rule-reference.md](docs/rule-reference.md)
- [docs/thresholds.md](docs/thresholds.md)
- [docs/cli.md](docs/cli.md)

## License

MIT
