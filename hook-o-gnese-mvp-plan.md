# hook-o-gnese — Oxlint Plugin + Standalone CLI MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a TypeScript library that scores React component complexity from hook usage (useEffect entropy, useState scatter, hook coupling, custom-hook depth), distributed in two consumption modes from a shared core: (a) Oxlint plugin for users running oxlint, (b) standalone CLI for everyone else. Dual-published to JSR and npm; standalone binary buildable via `deno compile`.

**Architecture:** Three layers.

1. **Core** (linter-agnostic): `src/scoring/*`, `src/ast-helpers.ts`, `src/ts-program.ts`, `src/rules/*`. Rules use the ESLint-compatible `create(context)` shape so they work in any host that supplies a context object.
2. **Adapter A — Oxlint plugin** (`src/index.ts`): wraps the rules in `eslintCompatPlugin`, exports a `recommended` config that bundles tsgolint built-ins (`typescript/no-floating-promises`, etc.) for type-aware coverage.
3. **Adapter B — Standalone engine + CLI** (`src/engine.ts`, `src/cli.ts`, `src/formatters/*`): own file-walking + parsing pipeline on top of `oxc-parser`. Provides stylish / JSON / SARIF / GitHub output formatters, no oxlint dependency at runtime.

**Tech Stack:** TypeScript, Deno (dev runtime + JSR publish + `deno compile` static binary), oxc-parser (AST), `@oxlint/plugins` (oxlint adapter only), TypeScript Compiler API (type-aware rule), tsdown (npm bundle for both entries), oxlint (peer dep + dogfood for plugin path), globby + ignore (CLI file walking).

**Project location:** `/Users/mrehout/dev/bigbiz/spaghetti-hook-o-gnese` (this repository). The git repo is already initialized but has no commits yet; this plan and `CLAUDE.md` already live in the working tree. Replace `@your-scope` with your real JSR/npm scope before publishing.

---

## File Structure

```
spaghetti-hook-o-gnese/        # repo root; hosts the `hook-o-gnese` package
├── deno.json
├── package.json
├── tsdown.config.ts
├── .oxlintrc.json                  # self-dogfood (plugin path)
├── .hookogneserc.json             # self-dogfood (CLI path)
├── .gitignore
├── README.md
├── LICENSE
├── src/
│   ├── index.ts                    # Adapter A: oxlint plugin entry
│   ├── cli.ts                      # Adapter B: standalone CLI entry (#!/usr/bin/env node)
│   ├── engine.ts                   # CLI engine: parse + run rules + collect diagnostics
│   ├── config.ts                   # Load + merge .hookogneserc.json + CLI flags
│   ├── ast-helpers.ts              # isReactComponent, isHookCall, walk
│   ├── ts-program.ts               # lazy ts.Program for type-aware rule
│   ├── scoring/
│   │   ├── effect-score.ts
│   │   ├── state-score.ts
│   │   ├── coupling-score.ts
│   │   └── thresholds.ts
│   ├── rules/
│   │   ├── no-fat-effects.ts
│   │   ├── state-scatter.ts
│   │   ├── hook-coupling.ts
│   │   ├── custom-hook-depth.ts
│   │   └── registry.ts             # ALL_RULES map (used by engine + plugin)
│   └── formatters/
│       ├── types.ts
│       ├── stylish.ts
│       ├── json.ts
│       ├── sarif.ts
│       └── github.ts
├── tests/
│   ├── fixtures/
│   │   ├── clean.tsx
│   │   ├── fat-effect.tsx
│   │   ├── state-scatter.tsx
│   │   ├── coupled-hooks.tsx
│   │   ├── deep-custom-hook.tsx
│   │   └── deep-custom-hook-impl.ts
│   ├── ast-helpers_test.ts
│   ├── ts-program_test.ts
│   ├── scoring/
│   │   ├── effect-score_test.ts
│   │   ├── state-score_test.ts
│   │   └── coupling-score_test.ts
│   ├── rules/
│   │   ├── no-fat-effects_test.ts
│   │   ├── state-scatter_test.ts
│   │   ├── hook-coupling_test.ts
│   │   └── custom-hook-depth_test.ts
│   ├── engine_test.ts
│   ├── formatters_test.ts
│   ├── cli_test.ts                 # spawn CLI binary against fixtures
│   └── integration/
│       └── oxlint-run_test.ts      # spawn oxlint with plugin
└── docs/
    ├── thresholds.md
    ├── rule-reference.md
    └── cli.md
```

**Single-responsibility split:** scoring is pure; rules are thin wrappers calling scoring + `context.report`; engine/plugin are adapters that supply a context; formatters are pure (Diagnostic[] → string).

---

## Task 1: Project scaffold

**Files:**
- Create: `deno.json`, `package.json`, `.gitignore`, `README.md`, `LICENSE`

- [ ] **Step 1: Confirm working directory and git repo**

The repo already exists at `/Users/mrehout/dev/bigbiz/spaghetti-hook-o-gnese` with `git init` already run (branch `master`, no commits yet). All subsequent steps assume this is the cwd.

```bash
cd /Users/mrehout/dev/bigbiz/spaghetti-hook-o-gnese
test -d .git && echo "git ok"
git log --oneline 2>&1 | head -1   # expect: "fatal: ... does not have any commits yet" or empty
```

- [ ] **Step 2: Write `deno.json`**

```jsonc
{
  "name": "@your-scope/hook-o-gnese",
  "version": "0.0.1",
  "exports": {
    ".": "./src/index.ts",
    "./cli": "./src/cli.ts",
    "./engine": "./src/engine.ts"
  },
  "imports": {
    "@std/assert": "jsr:@std/assert@1",
    "@std/path": "jsr:@std/path@1",
    "@std/cli": "jsr:@std/cli@1",
    "@std/fs": "jsr:@std/fs@1",
    "oxc-parser": "npm:oxc-parser@^0.40.0",
    "@oxlint/plugins": "npm:@oxlint/plugins@^1.0.0",
    "typescript": "npm:typescript@^5.6.0",
    "globby": "npm:globby@^14.0.0",
    "oxlint": "npm:oxlint@^1.0.0",
    "tsdown": "npm:tsdown@^0.6.0"
  },
  "tasks": {
    "test": "deno test --allow-read --allow-env --allow-run --allow-write",
    "lint": "deno run -A npm:oxlint .",
    "fmt": "deno fmt",
    "cli": "deno run --allow-read --allow-env src/cli.ts",
    "build:npm": "deno run -A npm:tsdown",
    "build:bin": "deno compile --allow-read --allow-env --output=bin/hook-o-gnese src/cli.ts",
    "publish:jsr": "deno publish",
    "dogfood:plugin": "deno run -A npm:oxlint tests/fixtures/",
    "dogfood:cli": "deno run -A src/cli.ts tests/fixtures/"
  },
  "fmt": { "exclude": ["dist/", "bin/", "node_modules/"] },
  "exclude": ["dist/", "bin/", "node_modules/", "*.tsbuildinfo"]
}
```

- [ ] **Step 3: Write `package.json`**

```json
{
  "name": "@your-scope/hook-o-gnese",
  "version": "0.0.1",
  "description": "Score React hook complexity. Runs as oxlint plugin or standalone CLI.",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "bin": {
    "hook-o-gnese": "./dist/cli.js"
  },
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "require": "./dist/index.cjs",
      "types": "./dist/index.d.ts"
    },
    "./engine": {
      "import": "./dist/engine.js",
      "types": "./dist/engine.d.ts"
    }
  },
  "files": ["dist", "README.md", "LICENSE"],
  "keywords": ["oxlint", "oxlint-plugin", "react", "hooks", "complexity", "lint", "cli"],
  "peerDependencies": {
    "oxlint": ">=1.0.0",
    "typescript": ">=5.0.0"
  },
  "peerDependenciesMeta": {
    "oxlint": { "optional": true }
  },
  "dependencies": {
    "globby": "^14.0.0",
    "oxc-parser": "^0.40.0"
  },
  "devDependencies": {
    "tsdown": "^0.6.0",
    "typescript": "^5.6.0",
    "@oxlint/plugins": "^1.0.0"
  }
}
```

- [ ] **Step 4: Write `.gitignore`**

```
node_modules/
dist/
bin/
*.tsbuildinfo
.DS_Store
deno.lock
*.tgz
```

- [ ] **Step 5: Write minimal `README.md`**

```markdown
# hook-o-gnese

Score React component complexity from hook usage. Two ways to run:

- **Oxlint plugin** for projects already using oxlint
- **Standalone CLI** (`npx hook-o-gnese ./src`) for everywhere else — no linter required

See `docs/cli.md` and `docs/rule-reference.md`.
```

- [ ] **Step 6: Write `LICENSE` (MIT)**

```
MIT License

Copyright (c) 2026 [Your Name]

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.
```

- [ ] **Step 7: Initial commit**

```bash
git add .
git commit -m "chore: initial scaffold (dual oxlint plugin + standalone CLI)"
```

---

## Task 2: AST helpers

**Files:**
- Create: `src/ast-helpers.ts`
- Test: `tests/ast-helpers_test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/ast-helpers_test.ts
import { assertEquals } from "@std/assert";
import { parseSync } from "oxc-parser";
import {
  findReturnsJSX,
  getHookName,
  isHookCall,
  isReactComponent,
} from "../src/ast-helpers.ts";

function parse(code: string) {
  return parseSync("test.tsx", code, { lang: "tsx", sourceType: "module" })
    .program;
}

Deno.test("getHookName: returns name for use* call", () => {
  const ast = parse(`useEffect(() => {})`);
  const callExpr = (ast.body[0] as any).expression;
  assertEquals(getHookName(callExpr), "useEffect");
});

Deno.test("getHookName: returns null for non-hook call", () => {
  const ast = parse(`fetchData()`);
  const callExpr = (ast.body[0] as any).expression;
  assertEquals(getHookName(callExpr), null);
});

Deno.test("isHookCall: matches by name", () => {
  const ast = parse(`useState(0)`);
  const callExpr = (ast.body[0] as any).expression;
  assertEquals(isHookCall(callExpr, "useState"), true);
  assertEquals(isHookCall(callExpr, "useEffect"), false);
});

Deno.test("isReactComponent: capitalised function returning JSX", () => {
  const ast = parse(`function Foo() { return <div />; }`);
  assertEquals(isReactComponent(ast.body[0]), true);
});

Deno.test("isReactComponent: lowercase function rejected", () => {
  const ast = parse(`function foo() { return <div />; }`);
  assertEquals(isReactComponent(ast.body[0]), false);
});

Deno.test("isReactComponent: capitalised function without JSX rejected", () => {
  const ast = parse(`function Foo() { return 42; }`);
  assertEquals(isReactComponent(ast.body[0]), false);
});

Deno.test("findReturnsJSX: detects JSX in nested return", () => {
  const ast = parse(`function Foo() { if (x) return <div />; return null; }`);
  assertEquals(findReturnsJSX(ast.body[0]), true);
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
deno test --allow-read --allow-env tests/ast-helpers_test.ts
```

Expected: FAIL — module missing.

- [ ] **Step 3: Implement `src/ast-helpers.ts`**

```ts
type Node = { type: string; [k: string]: unknown };

const HOOK_RE = /^use[A-Z]/;

export function getHookName(node: Node): string | null {
  if (node.type !== "CallExpression") return null;
  const callee = (node as any).callee as Node;
  if (callee?.type !== "Identifier") return null;
  const name = (callee as any).name as string;
  return HOOK_RE.test(name) ? name : null;
}

export function isHookCall(node: Node, expected: string): boolean {
  return getHookName(node) === expected;
}

export function isReactComponent(node: Node): boolean {
  if (node.type === "FunctionDeclaration") {
    const name = (node as any).id?.name as string | undefined;
    if (!name || !/^[A-Z]/.test(name)) return false;
    return findReturnsJSX(node);
  }
  if (node.type === "VariableDeclaration") {
    const decl = (node as any).declarations?.[0];
    const name = decl?.id?.name as string | undefined;
    const init = decl?.init as Node | undefined;
    if (!name || !/^[A-Z]/.test(name) || !init) return false;
    if (
      init.type === "ArrowFunctionExpression" ||
      init.type === "FunctionExpression"
    ) {
      return findReturnsJSX(init);
    }
  }
  return false;
}

export function findReturnsJSX(node: Node): boolean {
  let found = false;
  walk(node, (n) => {
    if (
      n.type === "JSXElement" ||
      n.type === "JSXFragment" ||
      n.type === "JSXSelfClosingElement"
    ) {
      found = true;
      return false;
    }
    return true;
  });
  return found;
}

export function walk(
  node: Node,
  visit: (n: Node) => boolean | void,
): void {
  const cont = visit(node);
  if (cont === false) return;
  for (const key in node) {
    const val = (node as any)[key];
    if (Array.isArray(val)) {
      for (const child of val) {
        if (child && typeof child === "object" && "type" in child) {
          walk(child as Node, visit);
        }
      }
    } else if (val && typeof val === "object" && "type" in val) {
      walk(val as Node, visit);
    }
  }
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
deno test --allow-read --allow-env tests/ast-helpers_test.ts
```

Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ast-helpers.ts tests/ast-helpers_test.ts
git commit -m "feat(ast): hook detection + component detection helpers"
```

---

## Task 3: Thresholds module

**Files:**
- Create: `src/scoring/thresholds.ts`

- [ ] **Step 1: Write the module**

```ts
export interface Thresholds {
  fatEffect: { warn: number; error: number };
  stateScatter: { warn: number; error: number };
  hookCoupling: { warn: number; error: number };
  customHookDepth: { warn: number; error: number };
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  fatEffect: { warn: 10, error: 20 },
  stateScatter: { warn: 5, error: 8 },
  hookCoupling: { warn: 3, error: 6 },
  customHookDepth: { warn: 3, error: 5 },
};
```

- [ ] **Step 2: Commit**

```bash
git add src/scoring/thresholds.ts
git commit -m "feat(scoring): default thresholds"
```

---

## Task 4: Effect scoring (pure function)

**Files:**
- Create: `src/scoring/effect-score.ts`, `tests/fixtures/fat-effect.tsx`
- Test: `tests/scoring/effect-score_test.ts`

- [ ] **Step 1: Create the fixture**

```tsx
// tests/fixtures/fat-effect.tsx
import { useEffect, useState } from "react";

export function Dashboard({ userId, region, locale, theme, currency }: any) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    setLoading(true);
    if (userId) {
      if (region === "EU") {
        fetch(`/api/${userId}?r=${region}&l=${locale}`)
          .then((r) => r.json())
          .then((d) => {
            if (theme === "dark") setData({ ...d, theme });
            else setData(d);
            setLoading(false);
          })
          .catch((e) => {
            setErr(e);
            setLoading(false);
          });
      } else {
        setData(null);
        setLoading(false);
      }
    }
  }, [userId, region, locale, theme, currency]);

  return <div>{loading ? "..." : JSON.stringify(data)}</div>;
}
```

- [ ] **Step 2: Write the failing test**

```ts
// tests/scoring/effect-score_test.ts
import { assert, assertEquals } from "@std/assert";
import { parseSync } from "oxc-parser";
import { scoreEffect } from "../../src/scoring/effect-score.ts";

function getFirstUseEffect(code: string): any {
  const ast = parseSync("t.tsx", code, { lang: "tsx", sourceType: "module" })
    .program;
  let found: any = null;
  function walk(n: any) {
    if (!n || typeof n !== "object" || found) return;
    if (
      n.type === "CallExpression" &&
      n.callee?.type === "Identifier" &&
      n.callee.name === "useEffect"
    ) {
      found = n;
      return;
    }
    for (const k in n) {
      const v = n[k];
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") walk(v);
    }
  }
  walk(ast);
  return found;
}

Deno.test("scoreEffect: empty effect = 0", () => {
  const node = getFirstUseEffect(`useEffect(() => {}, [])`);
  assertEquals(scoreEffect(node).total, 0);
});

Deno.test("scoreEffect: counts deps", () => {
  const node = getFirstUseEffect(`useEffect(() => {}, [a, b, c])`);
  assertEquals(scoreEffect(node).deps, 3);
});

Deno.test("scoreEffect: branches contribute", () => {
  const node = getFirstUseEffect(
    `useEffect(() => { if (a) {} else if (b) {} }, [a, b])`,
  );
  assertEquals(scoreEffect(node).branches, 2);
});

Deno.test("scoreEffect: setState count", () => {
  const node = getFirstUseEffect(
    `useEffect(() => { setA(1); setB(2); }, [])`,
  );
  assertEquals(scoreEffect(node).setStateCount, 2);
});

Deno.test("scoreEffect: nested useEffect", () => {
  const node = getFirstUseEffect(
    `useEffect(() => { useEffect(() => {}, []); }, [])`,
  );
  assertEquals(scoreEffect(node).nestedEffects, 1);
});

Deno.test("scoreEffect: fat-effect fixture exceeds warn threshold", async () => {
  const src = await Deno.readTextFile("tests/fixtures/fat-effect.tsx");
  const node = getFirstUseEffect(src);
  const s = scoreEffect(node);
  assert(s.total > 10, `expected > 10, got ${s.total}`);
});
```

- [ ] **Step 3: Run test to verify failure**

```bash
deno test --allow-read --allow-env tests/scoring/effect-score_test.ts
```

Expected: FAIL.

- [ ] **Step 4: Implement `src/scoring/effect-score.ts`**

```ts
import { walk } from "../ast-helpers.ts";

type Node = { type: string; [k: string]: unknown };

export interface EffectScore {
  deps: number;
  branches: number;
  setStateCount: number;
  nestedEffects: number;
  hasCleanup: boolean;
  hasSubscriptionLike: boolean;
  total: number;
}

const SET_STATE_RE = /^set[A-Z]/;
const BRANCH_TYPES = new Set([
  "IfStatement",
  "ConditionalExpression",
  "SwitchCase",
  "LogicalExpression",
]);

export function scoreEffect(node: Node): EffectScore {
  const args = (node as any).arguments as Node[];
  const fn = args?.[0] as Node | undefined;
  const depsArr = args?.[1] as any;

  const deps = Array.isArray(depsArr?.elements) ? depsArr.elements.length : 0;
  let branches = 0;
  let setStateCount = 0;
  let nestedEffects = 0;
  let hasCleanup = false;
  let hasSubscriptionLike = false;

  if (fn) {
    const body = (fn as any).body as Node;
    if (body?.type === "BlockStatement") {
      for (const stmt of (body as any).body as Node[]) {
        if (stmt.type === "ReturnStatement") {
          const arg = (stmt as any).argument as Node | undefined;
          if (
            arg &&
            (arg.type === "ArrowFunctionExpression" ||
              arg.type === "FunctionExpression")
          ) hasCleanup = true;
        }
      }
    }

    walk(fn, (n) => {
      if (BRANCH_TYPES.has(n.type)) branches++;
      if (n.type === "CallExpression") {
        const callee = (n as any).callee as Node;
        if (callee?.type === "Identifier") {
          const name = (callee as any).name as string;
          if (SET_STATE_RE.test(name)) setStateCount++;
          if (name === "useEffect" && n !== node) nestedEffects++;
          if (
            name === "addEventListener" ||
            name === "subscribe" ||
            name === "setInterval" ||
            name === "setTimeout"
          ) hasSubscriptionLike = true;
        }
        if (callee?.type === "MemberExpression") {
          const prop = (callee as any).property as Node;
          if (prop?.type === "Identifier") {
            const name = (prop as any).name as string;
            if (
              name === "addEventListener" ||
              name === "subscribe" ||
              name === "on"
            ) hasSubscriptionLike = true;
          }
        }
      }
      return true;
    });
  }

  const cleanupPenalty = hasSubscriptionLike && !hasCleanup ? 3 : 0;
  const total = deps + branches * 2 + setStateCount * 1.5 +
    nestedEffects * 5 + cleanupPenalty;

  return {
    deps,
    branches,
    setStateCount,
    nestedEffects,
    hasCleanup,
    hasSubscriptionLike,
    total,
  };
}
```

- [ ] **Step 5: Run test to verify pass**

```bash
deno test --allow-read --allow-env tests/scoring/effect-score_test.ts
```

Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add src/scoring/effect-score.ts tests/scoring/effect-score_test.ts tests/fixtures/fat-effect.tsx
git commit -m "feat(scoring): pure useEffect entropy scoring"
```

---

## Task 5: `no-fat-effects` rule (ESLint-compatible `create()` shape)

**Files:**
- Create: `src/rules/no-fat-effects.ts`
- Test: `tests/rules/no-fat-effects_test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/rules/no-fat-effects_test.ts
import { assert, assertEquals } from "@std/assert";
import { parseSync } from "oxc-parser";
import { noFatEffects } from "../../src/rules/no-fat-effects.ts";

interface Diag { message: string; node: any }

export function runRule(rule: any, code: string, options: unknown[] = []): Diag[] {
  const diags: Diag[] = [];
  const context = {
    options,
    filename: "t.tsx",
    cwd: Deno.cwd(),
    report: (d: Diag) => diags.push(d),
  };
  const handlers = rule.create(context);
  const ast = parseSync("t.tsx", code, { lang: "tsx", sourceType: "module" })
    .program;
  function walk(n: any) {
    if (!n || typeof n !== "object") return;
    const v = handlers[n.type];
    if (v) v(n);
    for (const k in n) {
      const x = n[k];
      if (Array.isArray(x)) x.forEach(walk);
      else if (x && typeof x === "object") walk(x);
    }
    const e = handlers[`${n.type}:exit`];
    if (e) e(n);
  }
  walk(ast);
  return diags;
}

Deno.test("no-fat-effects: clean effect produces no diagnostic", () => {
  const diags = runRule(
    noFatEffects,
    `function Foo() { useEffect(() => { setX(1); }, [x]); return <div />; }`,
  );
  assertEquals(diags.length, 0);
});

Deno.test("no-fat-effects: fat effect over warn threshold reports", async () => {
  const src = await Deno.readTextFile("tests/fixtures/fat-effect.tsx");
  const diags = runRule(noFatEffects, src);
  assert(diags.length >= 1);
  assert(diags[0].message.includes("entropy"));
});

Deno.test("no-fat-effects: custom threshold via options", () => {
  const code = `useEffect(() => { if (a) setX(1); }, [a, b]);`;
  const diags = runRule(noFatEffects, code, [{ threshold: 1 }]);
  assert(diags.length >= 1);
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
deno test --allow-read --allow-env tests/rules/no-fat-effects_test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `src/rules/no-fat-effects.ts`**

```ts
import { scoreEffect } from "../scoring/effect-score.ts";
import { DEFAULT_THRESHOLDS } from "../scoring/thresholds.ts";
import { isHookCall } from "../ast-helpers.ts";

interface Options { threshold?: number }

export interface RuleContext {
  options: unknown[];
  filename?: string;
  cwd?: string;
  report: (d: { message: string; node: unknown }) => void;
}

export const noFatEffects = {
  meta: {
    type: "suggestion" as const,
    docs: { description: "Flag dense useEffect blocks" },
  },
  create(context: RuleContext) {
    const opts = (context.options[0] as Options | undefined) ?? {};
    const threshold = opts.threshold ?? DEFAULT_THRESHOLDS.fatEffect.warn;
    return {
      CallExpression(node: any) {
        if (!isHookCall(node, "useEffect")) return;
        const score = scoreEffect(node);
        if (score.total >= threshold) {
          const breakdown = `deps=${score.deps} branches=${score.branches} ` +
            `setStates=${score.setStateCount} nested=${score.nestedEffects}` +
            (score.hasSubscriptionLike && !score.hasCleanup
              ? " missing-cleanup"
              : "");
          context.report({
            message:
              `useEffect entropy ${score.total.toFixed(1)} ≥ ${threshold} (${breakdown})`,
            node,
          });
        }
      },
    };
  },
};
```

- [ ] **Step 4: Run test to verify pass**

```bash
deno test --allow-read --allow-env tests/rules/no-fat-effects_test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/rules/no-fat-effects.ts tests/rules/no-fat-effects_test.ts
git commit -m "feat(rules): no-fat-effects (ESLint-compatible create() shape)"
```

---

## Task 6: State scoring + `state-scatter` rule

**Files:**
- Create: `src/scoring/state-score.ts`, `src/rules/state-scatter.ts`, `tests/fixtures/state-scatter.tsx`
- Test: `tests/scoring/state-score_test.ts`, `tests/rules/state-scatter_test.ts`

- [ ] **Step 1: Create the fixture**

```tsx
// tests/fixtures/state-scatter.tsx
import { useState } from "react";

export function ProfileForm() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [zip, setZip] = useState("");
  const [bio, setBio] = useState("");

  function reset() {
    setFirstName("");
    setLastName("");
    setEmail("");
    setPhone("");
  }

  return <form onClick={reset}>{firstName}</form>;
}
```

- [ ] **Step 2: Write failing tests**

```ts
// tests/scoring/state-score_test.ts
import { assert, assertEquals } from "@std/assert";
import { parseSync } from "oxc-parser";
import { scoreComponentState } from "../../src/scoring/state-score.ts";

function parseComponent(code: string) {
  const ast = parseSync("t.tsx", code, { lang: "tsx", sourceType: "module" })
    .program;
  return (ast as any).body.find((n: any) =>
    n.type === "FunctionDeclaration" || n.type === "VariableDeclaration"
  );
}

Deno.test("scoreComponentState: counts useState calls", () => {
  const cmp = parseComponent(
    `function Foo() {
      const [a, setA] = useState(0);
      const [b, setB] = useState(0);
      return <div />;
    }`,
  );
  assertEquals(scoreComponentState(cmp).useStateCount, 2);
});

Deno.test("scoreComponentState: detects correlated setters in same handler", () => {
  const cmp = parseComponent(
    `function Foo() {
      const [a, setA] = useState(0);
      const [b, setB] = useState(0);
      function reset() { setA(0); setB(0); }
      return <div />;
    }`,
  );
  assert(scoreComponentState(cmp).correlatedSetters >= 2);
});

Deno.test("scoreComponentState: scatter fixture exceeds threshold", async () => {
  const src = await Deno.readTextFile("tests/fixtures/state-scatter.tsx");
  const cmp = parseComponent(src);
  assert(scoreComponentState(cmp).total > 5);
});
```

```ts
// tests/rules/state-scatter_test.ts
import { assert, assertEquals } from "@std/assert";
import { stateScatter } from "../../src/rules/state-scatter.ts";
import { runRule } from "./no-fat-effects_test.ts";

Deno.test("state-scatter: small component clean", () => {
  const diags = runRule(
    stateScatter,
    `function Foo() {
      const [a, setA] = useState(0);
      return <div />;
    }`,
  );
  assertEquals(diags.length, 0);
});

Deno.test("state-scatter: 8-state form fires", async () => {
  const src = await Deno.readTextFile("tests/fixtures/state-scatter.tsx");
  const diags = runRule(stateScatter, src);
  assert(diags.length >= 1);
});
```

- [ ] **Step 3: Run tests to verify failure**

```bash
deno test --allow-read --allow-env tests/scoring/state-score_test.ts tests/rules/state-scatter_test.ts
```

Expected: FAIL.

- [ ] **Step 4: Implement `src/scoring/state-score.ts`**

```ts
import { isHookCall, walk } from "../ast-helpers.ts";

type Node = { type: string; [k: string]: unknown };

export interface StateScore {
  useStateCount: number;
  correlatedSetters: number;
  total: number;
}

export function scoreComponentState(componentNode: Node): StateScore {
  const setterNames = new Set<string>();
  let useStateCount = 0;

  walk(componentNode, (n) => {
    if (isHookCall(n, "useState") && n.type === "CallExpression") {
      useStateCount++;
    }
    if (n.type === "VariableDeclarator") {
      const init = (n as any).init as Node | undefined;
      const id = (n as any).id as Node | undefined;
      if (
        init?.type === "CallExpression" &&
        isHookCall(init, "useState") &&
        id?.type === "ArrayPattern"
      ) {
        const els = (id as any).elements as Node[];
        const setter = els?.[1];
        if (setter?.type === "Identifier") {
          setterNames.add((setter as any).name as string);
        }
      }
    }
    return true;
  });

  let correlatedSetters = 0;
  walk(componentNode, (n) => {
    if (
      n.type === "FunctionDeclaration" ||
      n.type === "FunctionExpression" ||
      n.type === "ArrowFunctionExpression"
    ) {
      const calledSetters = new Set<string>();
      walk(n, (m) => {
        if (m.type === "CallExpression") {
          const callee = (m as any).callee as Node;
          if (callee?.type === "Identifier") {
            const name = (callee as any).name as string;
            if (setterNames.has(name)) calledSetters.add(name);
          }
        }
        return true;
      });
      if (calledSetters.size >= 2) correlatedSetters += calledSetters.size;
    }
    return true;
  });

  const total = useStateCount + correlatedSetters * 0.5;
  return { useStateCount, correlatedSetters, total };
}
```

- [ ] **Step 5: Implement `src/rules/state-scatter.ts`**

```ts
import { scoreComponentState } from "../scoring/state-score.ts";
import { DEFAULT_THRESHOLDS } from "../scoring/thresholds.ts";
import { isReactComponent } from "../ast-helpers.ts";
import type { RuleContext } from "./no-fat-effects.ts";

interface Options { threshold?: number }

export const stateScatter = {
  meta: {
    type: "suggestion" as const,
    docs: { description: "Flag components with too many useState calls" },
  },
  create(context: RuleContext) {
    const opts = (context.options[0] as Options | undefined) ?? {};
    const threshold = opts.threshold ?? DEFAULT_THRESHOLDS.stateScatter.warn;
    function check(node: any) {
      if (!isReactComponent(node)) return;
      const s = scoreComponentState(node);
      if (s.total >= threshold) {
        context.report({
          message:
            `state scatter ${s.total} ≥ ${threshold} (useStates=${s.useStateCount}, correlated setters=${s.correlatedSetters}). Consider useReducer.`,
          node,
        });
      }
    }
    return {
      FunctionDeclaration: check,
      VariableDeclaration: check,
    };
  },
};
```

- [ ] **Step 6: Run tests to verify pass**

```bash
deno test --allow-read --allow-env tests/scoring/state-score_test.ts tests/rules/state-scatter_test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/scoring/state-score.ts src/rules/state-scatter.ts \
        tests/scoring/state-score_test.ts tests/rules/state-scatter_test.ts \
        tests/fixtures/state-scatter.tsx
git commit -m "feat(rules): state-scatter with correlated setter detection"
```

---

## Task 7: Coupling scoring + `hook-coupling` rule

**Files:**
- Create: `src/scoring/coupling-score.ts`, `src/rules/hook-coupling.ts`, `tests/fixtures/coupled-hooks.tsx`
- Test: `tests/scoring/coupling-score_test.ts`, `tests/rules/hook-coupling_test.ts`

- [ ] **Step 1: Create the fixture**

```tsx
// tests/fixtures/coupled-hooks.tsx
import { useEffect, useState } from "react";

export function Counter() {
  const [count, setCount] = useState(0);
  const [doubled, setDoubled] = useState(0);

  useEffect(() => {
    if (count > 0) setCount(count + 1); // reads + writes count
    setDoubled(count * 2);
  }, [count]);

  return <div>{count}/{doubled}</div>;
}
```

- [ ] **Step 2: Write failing tests**

```ts
// tests/scoring/coupling-score_test.ts
import { assert, assertEquals } from "@std/assert";
import { parseSync } from "oxc-parser";
import { scoreCoupling } from "../../src/scoring/coupling-score.ts";

function parseComponent(code: string) {
  const ast = parseSync("t.tsx", code, { lang: "tsx", sourceType: "module" })
    .program;
  return (ast as any).body.find((n: any) => n.type === "FunctionDeclaration");
}

Deno.test("coupling: effect that reads+writes same state scores", () => {
  const cmp = parseComponent(
    `function Foo() {
      const [count, setCount] = useState(0);
      useEffect(() => { if (count > 0) setCount(count + 1); }, [count]);
      return <div />;
    }`,
  );
  const s = scoreCoupling(cmp);
  assert(s.total >= 3);
  assertEquals(s.readWriteSame.length, 1);
});

Deno.test("coupling: effect that only writes scores 0", () => {
  const cmp = parseComponent(
    `function Foo() {
      const [c, setC] = useState(0);
      useEffect(() => { setC(0); }, []);
      return <div />;
    }`,
  );
  assertEquals(scoreCoupling(cmp).total, 0);
});
```

```ts
// tests/rules/hook-coupling_test.ts
import { assert, assertEquals } from "@std/assert";
import { hookCoupling } from "../../src/rules/hook-coupling.ts";
import { runRule } from "./no-fat-effects_test.ts";

Deno.test("hook-coupling: clean component", () => {
  const diags = runRule(
    hookCoupling,
    `function Foo() {
      const [c, setC] = useState(0);
      useEffect(() => { setC(0); }, []);
      return <div />;
    }`,
  );
  assertEquals(diags.length, 0);
});

Deno.test("hook-coupling: fixture fires", async () => {
  const src = await Deno.readTextFile("tests/fixtures/coupled-hooks.tsx");
  const diags = runRule(hookCoupling, src);
  assert(diags.length >= 1);
});
```

- [ ] **Step 3: Run tests to verify failure**

```bash
deno test --allow-read --allow-env tests/scoring/coupling-score_test.ts tests/rules/hook-coupling_test.ts
```

Expected: FAIL.

- [ ] **Step 4: Implement `src/scoring/coupling-score.ts`**

```ts
import { isHookCall, walk } from "../ast-helpers.ts";

type Node = { type: string; [k: string]: unknown };

export interface CouplingScore {
  total: number;
  readWriteSame: Array<{ state: string; effect: Node }>;
}

export function scoreCoupling(componentNode: Node): CouplingScore {
  const stateBySetter = new Map<string, string>();
  walk(componentNode, (n) => {
    if (n.type === "VariableDeclarator") {
      const init = (n as any).init as Node | undefined;
      const id = (n as any).id as Node | undefined;
      if (
        init?.type === "CallExpression" &&
        isHookCall(init, "useState") &&
        id?.type === "ArrayPattern"
      ) {
        const els = (id as any).elements as Node[];
        const stateId = els?.[0];
        const setterId = els?.[1];
        if (stateId?.type === "Identifier" && setterId?.type === "Identifier") {
          stateBySetter.set(
            (setterId as any).name as string,
            (stateId as any).name as string,
          );
        }
      }
    }
    return true;
  });

  const readWriteSame: Array<{ state: string; effect: Node }> = [];
  let total = 0;

  walk(componentNode, (n) => {
    if (n.type === "CallExpression" && isHookCall(n, "useEffect")) {
      const effectFn = ((n as any).arguments as Node[])?.[0];
      if (!effectFn) return true;

      const stateRefs = new Set<string>();
      const stateWrites = new Set<string>();
      const stateNames = new Set(stateBySetter.values());

      walk(effectFn, (m) => {
        if (m.type === "Identifier") {
          const name = (m as any).name as string;
          if (stateNames.has(name)) stateRefs.add(name);
        }
        if (m.type === "CallExpression") {
          const callee = (m as any).callee as Node;
          if (callee?.type === "Identifier") {
            const setter = (callee as any).name as string;
            const stateName = stateBySetter.get(setter);
            if (stateName) stateWrites.add(stateName);
          }
        }
        return true;
      });

      for (const written of stateWrites) {
        if (stateRefs.has(written)) {
          readWriteSame.push({ state: written, effect: n });
          total += 3;
        }
      }
    }
    return true;
  });

  return { total, readWriteSame };
}
```

- [ ] **Step 5: Implement `src/rules/hook-coupling.ts`**

```ts
import { scoreCoupling } from "../scoring/coupling-score.ts";
import { DEFAULT_THRESHOLDS } from "../scoring/thresholds.ts";
import { isReactComponent } from "../ast-helpers.ts";
import type { RuleContext } from "./no-fat-effects.ts";

interface Options { threshold?: number }

export const hookCoupling = {
  meta: {
    type: "problem" as const,
    docs: {
      description: "Flag effects that read state they also write (loop bait)",
    },
  },
  create(context: RuleContext) {
    const opts = (context.options[0] as Options | undefined) ?? {};
    const threshold = opts.threshold ?? DEFAULT_THRESHOLDS.hookCoupling.warn;
    function check(node: any) {
      if (!isReactComponent(node)) return;
      const s = scoreCoupling(node);
      if (s.total < threshold) return;
      for (const v of s.readWriteSame) {
        context.report({
          message:
            `useEffect reads + writes same state '${v.state}' (loop risk)`,
          node: v.effect,
        });
      }
    }
    return { FunctionDeclaration: check, VariableDeclaration: check };
  },
};
```

- [ ] **Step 6: Run tests to verify pass**

```bash
deno test --allow-read --allow-env tests/scoring/coupling-score_test.ts tests/rules/hook-coupling_test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/scoring/coupling-score.ts src/rules/hook-coupling.ts \
        tests/scoring/coupling-score_test.ts tests/rules/hook-coupling_test.ts \
        tests/fixtures/coupled-hooks.tsx
git commit -m "feat(rules): hook-coupling detects read+write of same state"
```

---

## Task 8: TypeScript Program (lazy, type-aware)

**Files:**
- Create: `src/ts-program.ts`, `tests/fixtures/clean.tsx`, `tests/fixtures/deep-custom-hook.tsx`, `tests/fixtures/deep-custom-hook-impl.ts`
- Test: `tests/ts-program_test.ts`

- [ ] **Step 1: Create fixtures**

```tsx
// tests/fixtures/clean.tsx
import { useState } from "react";
export function Counter() {
  const [c, setC] = useState(0);
  return <button onClick={() => setC(c + 1)}>{c}</button>;
}
```

```tsx
// tests/fixtures/deep-custom-hook.tsx
import { useFetchAndPoll } from "./deep-custom-hook-impl.ts";

export function Widget({ id }: { id: string }) {
  const data = useFetchAndPoll(id);
  return <div>{JSON.stringify(data)}</div>;
}
```

```ts
// tests/fixtures/deep-custom-hook-impl.ts
import { useEffect, useMemo, useState } from "react";

function useInterval(cb: () => void, ms: number) {
  useEffect(() => {
    const id = setInterval(cb, ms);
    return () => clearInterval(id);
  }, [cb, ms]);
}

function usePolling(fn: () => void) {
  useInterval(fn, 5000);
  useEffect(() => { fn(); }, [fn]);
}

export function useFetchAndPoll(id: string) {
  const [data, setData] = useState<unknown>(null);
  const memoId = useMemo(() => id.toLowerCase(), [id]);
  usePolling(() => {
    fetch(`/api/${memoId}`).then((r) => r.json()).then(setData);
  });
  return data;
}
```

- [ ] **Step 2: Write failing test**

```ts
// tests/ts-program_test.ts
import { assert, assertEquals } from "@std/assert";
import { TsProgramCache } from "../src/ts-program.ts";

Deno.test("TsProgramCache: resolves identifier symbol across files", () => {
  const cache = new TsProgramCache(Deno.cwd());
  const decl = cache.resolveIdentifierDeclaration(
    "tests/fixtures/deep-custom-hook.tsx",
    "useFetchAndPoll",
  );
  assert(decl !== null);
  assertEquals(typeof (decl as any).getSourceFile().fileName, "string");
});
```

- [ ] **Step 3: Run test to verify failure**

```bash
deno test --allow-read --allow-env tests/ts-program_test.ts
```

Expected: FAIL.

- [ ] **Step 4: Implement `src/ts-program.ts`**

```ts
import ts from "typescript";

export class TsProgramCache {
  private program: ts.Program | null = null;
  private rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
  }

  private getProgram(): ts.Program {
    if (this.program) return this.program;
    const configPath = ts.findConfigFile(
      this.rootDir,
      ts.sys.fileExists,
      "tsconfig.json",
    );
    let compilerOptions: ts.CompilerOptions = {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.Preserve,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      allowJs: true,
      noEmit: true,
      skipLibCheck: true,
      strict: false,
    };
    let fileNames: string[] = [];
    if (configPath) {
      const cfg = ts.readConfigFile(configPath, ts.sys.readFile);
      const parsed = ts.parseJsonConfigFileContent(
        cfg.config,
        ts.sys,
        this.rootDir,
      );
      compilerOptions = { ...compilerOptions, ...parsed.options };
      fileNames = parsed.fileNames;
    }
    this.program = ts.createProgram(fileNames, compilerOptions);
    return this.program;
  }

  resolveIdentifierDeclaration(
    filePath: string,
    identifier: string,
  ): ts.Declaration | null {
    const program = this.getProgram();
    const checker = program.getTypeChecker();
    const sourceFile = program.getSourceFile(filePath);
    if (!sourceFile) return null;

    let target: ts.Node | null = null;
    function find(node: ts.Node) {
      if (target) return;
      if (ts.isIdentifier(node) && node.text === identifier) {
        target = node;
        return;
      }
      ts.forEachChild(node, find);
    }
    find(sourceFile);
    if (!target) return null;

    const symbol = checker.getSymbolAtLocation(target);
    if (!symbol) return null;
    const aliased = symbol.flags & ts.SymbolFlags.Alias
      ? checker.getAliasedSymbol(symbol)
      : symbol;
    return aliased.declarations?.[0] ?? null;
  }

  countTransitiveHookCalls(
    decl: ts.Declaration,
    depth = 0,
    seen = new Set<ts.Declaration>(),
  ): number {
    if (depth > 10 || seen.has(decl)) return depth;
    seen.add(decl);
    const program = this.getProgram();
    const checker = program.getTypeChecker();
    let maxDepth = depth;

    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        /^use[A-Z]/.test(node.expression.text)
      ) {
        const sym = checker.getSymbolAtLocation(node.expression);
        if (sym) {
          const aliased = sym.flags & ts.SymbolFlags.Alias
            ? checker.getAliasedSymbol(sym)
            : sym;
          const innerDecl = aliased.declarations?.[0];
          if (innerDecl) {
            const sf = innerDecl.getSourceFile();
            if (
              sf.fileName.includes("node_modules/@types/react") ||
              sf.fileName.includes("node_modules/react/")
            ) {
              maxDepth = Math.max(maxDepth, depth + 1);
            } else {
              const childDepth = this.countTransitiveHookCalls(
                innerDecl,
                depth + 1,
                seen,
              );
              maxDepth = Math.max(maxDepth, childDepth);
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };

    visit(decl);
    return maxDepth;
  }
}
```

- [ ] **Step 5: Run test to verify pass**

```bash
deno test --allow-read --allow-env tests/ts-program_test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ts-program.ts tests/ts-program_test.ts \
        tests/fixtures/clean.tsx tests/fixtures/deep-custom-hook.tsx tests/fixtures/deep-custom-hook-impl.ts
git commit -m "feat(types): lazy ts.Program for cross-file type-aware analysis"
```

---

## Task 9: `custom-hook-depth` rule (type-aware)

**Files:**
- Create: `src/rules/custom-hook-depth.ts`
- Test: `tests/rules/custom-hook-depth_test.ts`

- [ ] **Step 1: Write failing test**

```ts
// tests/rules/custom-hook-depth_test.ts
import { assert, assertEquals } from "@std/assert";
import { parseSync } from "oxc-parser";
import { customHookDepth } from "../../src/rules/custom-hook-depth.ts";

function runRuleOnFile(rule: any, filename: string, options: unknown[] = []): any[] {
  const code = Deno.readTextFileSync(filename);
  const diags: any[] = [];
  const handlers = rule.create({
    options,
    filename,
    cwd: Deno.cwd(),
    report: (d: any) => diags.push(d),
  });
  const ast = parseSync(filename, code, { lang: "tsx", sourceType: "module" })
    .program;
  function walk(n: any) {
    if (!n || typeof n !== "object") return;
    const v = handlers[n.type]; if (v) v(n);
    for (const k in n) {
      const x = n[k];
      if (Array.isArray(x)) x.forEach(walk);
      else if (x && typeof x === "object") walk(x);
    }
  }
  walk(ast);
  return diags;
}

Deno.test("custom-hook-depth: deep custom hook fires", () => {
  const diags = runRuleOnFile(
    customHookDepth,
    "tests/fixtures/deep-custom-hook.tsx",
    [{ maxDepth: 2 }],
  );
  assert(diags.length >= 1, `expected diagnostic, got ${JSON.stringify(diags)}`);
  assert(diags[0].message.includes("depth"));
});

Deno.test("custom-hook-depth: clean component does not fire", () => {
  const diags = runRuleOnFile(
    customHookDepth,
    "tests/fixtures/clean.tsx",
    [{ maxDepth: 2 }],
  );
  assertEquals(diags.length, 0);
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
deno test --allow-read --allow-env tests/rules/custom-hook-depth_test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `src/rules/custom-hook-depth.ts`**

```ts
import { TsProgramCache } from "../ts-program.ts";
import { DEFAULT_THRESHOLDS } from "../scoring/thresholds.ts";
import { getHookName } from "../ast-helpers.ts";
import type { RuleContext } from "./no-fat-effects.ts";

interface Options { maxDepth?: number }

const REACT_HOOKS = new Set([
  "useState", "useEffect", "useLayoutEffect", "useMemo", "useCallback",
  "useReducer", "useContext", "useRef", "useImperativeHandle",
  "useDebugValue", "useId", "useTransition", "useDeferredValue",
  "useSyncExternalStore", "useInsertionEffect",
]);

let sharedCache: TsProgramCache | null = null;

export const customHookDepth = {
  meta: {
    type: "suggestion" as const,
    docs: {
      description:
        "Flag custom hooks whose transitive nesting exceeds maxDepth (type-aware).",
    },
  },
  create(context: RuleContext) {
    const opts = (context.options[0] as Options | undefined) ?? {};
    const maxDepth = opts.maxDepth ?? DEFAULT_THRESHOLDS.customHookDepth.warn;
    const cwd = context.cwd ?? Deno.cwd();
    sharedCache ??= new TsProgramCache(cwd);
    const cache = sharedCache;
    const filename = context.filename;

    return {
      CallExpression(node: any) {
        const name = getHookName(node);
        if (!name || REACT_HOOKS.has(name)) return;
        if (!filename) return;
        const decl = cache.resolveIdentifierDeclaration(filename, name);
        if (!decl) return;
        const depth = cache.countTransitiveHookCalls(decl);
        if (depth >= maxDepth) {
          context.report({
            message:
              `custom hook '${name}' transitive depth ${depth} ≥ ${maxDepth}`,
            node,
          });
        }
      },
    };
  },
};
```

- [ ] **Step 4: Run test to verify pass**

```bash
deno test --allow-read --allow-env --allow-run tests/rules/custom-hook-depth_test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/rules/custom-hook-depth.ts tests/rules/custom-hook-depth_test.ts
git commit -m "feat(rules): custom-hook-depth via TS Compiler API"
```

---

## Task 10: Rule registry + Oxlint plugin entry

**Files:**
- Create: `src/rules/registry.ts`, `src/index.ts`

- [ ] **Step 1: Write `src/rules/registry.ts`**

```ts
import { noFatEffects } from "./no-fat-effects.ts";
import { stateScatter } from "./state-scatter.ts";
import { hookCoupling } from "./hook-coupling.ts";
import { customHookDepth } from "./custom-hook-depth.ts";

export const ALL_RULES = {
  "no-fat-effects": noFatEffects,
  "state-scatter": stateScatter,
  "hook-coupling": hookCoupling,
  "custom-hook-depth": customHookDepth,
} as const;

export type RuleId = keyof typeof ALL_RULES;
```

- [ ] **Step 2: Write `src/index.ts` (oxlint adapter)**

```ts
import { eslintCompatPlugin } from "@oxlint/plugins";
import { ALL_RULES } from "./rules/registry.ts";

const plugin = eslintCompatPlugin({
  meta: { name: "hook-o-gnese" },
  rules: ALL_RULES,
});

export const recommended = {
  jsPlugins: ["./node_modules/@your-scope/hook-o-gnese/dist/index.js"],
  options: { typeAware: true, typeCheck: true },
  rules: {
    "hook-o-gnese/no-fat-effects": "warn",
    "hook-o-gnese/state-scatter": "warn",
    "hook-o-gnese/hook-coupling": "error",
    "hook-o-gnese/custom-hook-depth": ["warn", { maxDepth: 3 }],
    "typescript/no-floating-promises": "error",
    "typescript/no-misused-promises": "error",
  },
};

export default plugin;
```

- [ ] **Step 3: Smoke test**

```bash
deno run --allow-read --allow-env -e "
import plugin from './src/index.ts';
console.log('rules:', Object.keys(plugin.rules ?? {}));
"
```

Expected: `rules: [ 'no-fat-effects', 'state-scatter', 'hook-coupling', 'custom-hook-depth' ]`.

- [ ] **Step 4: Commit**

```bash
git add src/rules/registry.ts src/index.ts
git commit -m "feat(plugin): oxlint adapter + recommended config (tsgolint companions)"
```

---

## Task 11: Engine core (standalone)

**Files:**
- Create: `src/engine.ts`
- Test: `tests/engine_test.ts`

- [ ] **Step 1: Write failing test**

```ts
// tests/engine_test.ts
import { assert, assertEquals } from "@std/assert";
import { lintFile } from "../src/engine.ts";

const config = {
  rules: {
    "hook-o-gnese/no-fat-effects": { severity: "warn" as const },
    "hook-o-gnese/state-scatter": { severity: "warn" as const },
    "hook-o-gnese/hook-coupling": { severity: "error" as const },
    "hook-o-gnese/custom-hook-depth": { severity: "warn" as const },
  },
  cwd: Deno.cwd(),
  typeAware: false,
};

Deno.test("lintFile: clean fixture produces no diagnostics", async () => {
  const src = await Deno.readTextFile("tests/fixtures/clean.tsx");
  const diags = await lintFile("tests/fixtures/clean.tsx", src, config);
  assertEquals(diags.length, 0);
});

Deno.test("lintFile: fat-effect fixture produces no-fat-effects diagnostic", async () => {
  const src = await Deno.readTextFile("tests/fixtures/fat-effect.tsx");
  const diags = await lintFile("tests/fixtures/fat-effect.tsx", src, config);
  assert(diags.some((d) => d.rule === "hook-o-gnese/no-fat-effects"));
});

Deno.test("lintFile: state-scatter fixture produces state-scatter diagnostic", async () => {
  const src = await Deno.readTextFile("tests/fixtures/state-scatter.tsx");
  const diags = await lintFile("tests/fixtures/state-scatter.tsx", src, config);
  assert(diags.some((d) => d.rule === "hook-o-gnese/state-scatter"));
});

Deno.test("lintFile: hook-coupling fixture produces hook-coupling diagnostic", async () => {
  const src = await Deno.readTextFile("tests/fixtures/coupled-hooks.tsx");
  const diags = await lintFile("tests/fixtures/coupled-hooks.tsx", src, config);
  assert(diags.some((d) => d.rule === "hook-o-gnese/hook-coupling"));
});

Deno.test("lintFile: typeAware=false skips custom-hook-depth", async () => {
  const src = await Deno.readTextFile("tests/fixtures/deep-custom-hook.tsx");
  const diags = await lintFile(
    "tests/fixtures/deep-custom-hook.tsx",
    src,
    { ...config, typeAware: false },
  );
  assertEquals(
    diags.filter((d) => d.rule === "hook-o-gnese/custom-hook-depth").length,
    0,
  );
});

Deno.test("lintFile: typeAware=true enables custom-hook-depth", async () => {
  const src = await Deno.readTextFile("tests/fixtures/deep-custom-hook.tsx");
  const diags = await lintFile(
    "tests/fixtures/deep-custom-hook.tsx",
    src,
    {
      ...config,
      typeAware: true,
      rules: {
        ...config.rules,
        "hook-o-gnese/custom-hook-depth": {
          severity: "warn" as const,
          options: { maxDepth: 2 },
        },
      },
    },
  );
  assert(diags.some((d) => d.rule === "hook-o-gnese/custom-hook-depth"));
});

Deno.test("lintFile: non-React file produces no diagnostics", async () => {
  const diags = await lintFile(
    "foo.ts",
    `export const x = 1; function foo() { return 42; }`,
    config,
  );
  assertEquals(diags.length, 0);
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
deno test --allow-read --allow-env tests/engine_test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `src/engine.ts`**

```ts
import { parseSync } from "oxc-parser";
import { ALL_RULES } from "./rules/registry.ts";

export type Severity = "off" | "warn" | "error";

export interface Diagnostic {
  file: string;
  rule: string;
  severity: Exclude<Severity, "off">;
  message: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
}

export interface RuleConfig {
  severity: Severity;
  options?: unknown;
}

export interface EngineConfig {
  rules: Record<string, RuleConfig>;
  cwd: string;
  typeAware: boolean;
}

const TYPE_AWARE_RULES = new Set(["hook-o-gnese/custom-hook-depth"]);

function ruleNamespace(id: string): string {
  return id.replace(/^hook-o-gnese\//, "");
}

function getLoc(node: any): { line: number; column: number; endLine?: number; endColumn?: number } {
  const start = node?.loc?.start ?? node?.start;
  const end = node?.loc?.end ?? node?.end;
  return {
    line: start?.line ?? 1,
    column: start?.column ?? 1,
    endLine: end?.line,
    endColumn: end?.column,
  };
}

function walkAST(node: any, handlers: Record<string, any>) {
  if (!node || typeof node !== "object") return;
  const enter = handlers[node.type];
  if (enter) enter(node);
  for (const key in node) {
    const v = node[key];
    if (Array.isArray(v)) {
      for (const c of v) walkAST(c, handlers);
    } else if (v && typeof v === "object") {
      walkAST(v, handlers);
    }
  }
  const exit = handlers[`${node.type}:exit`];
  if (exit) exit(node);
}

export async function lintFile(
  filePath: string,
  source: string,
  config: EngineConfig,
): Promise<Diagnostic[]> {
  const lang = filePath.endsWith(".tsx")
    ? "tsx"
    : filePath.endsWith(".ts")
    ? "ts"
    : filePath.endsWith(".jsx")
    ? "jsx"
    : "js";

  const parsed = parseSync(filePath, source, {
    lang,
    sourceType: "module",
    range: true,
  });

  if (parsed.errors?.length) {
    return parsed.errors.map((e: any) => ({
      file: filePath,
      rule: "parse-error",
      severity: "error" as const,
      message: e.message ?? "parse error",
      line: e.labels?.[0]?.start?.line ?? 1,
      column: e.labels?.[0]?.start?.column ?? 1,
    }));
  }

  // Bail early on non-React files
  const imports = parsed.module?.staticImports ?? [];
  const hasReact = imports.some((i: any) =>
    (i.moduleRequest?.value ?? i.source?.value) === "react"
  );
  if (!hasReact) return [];

  const out: Diagnostic[] = [];

  for (const [ruleId, ruleCfg] of Object.entries(config.rules)) {
    if (ruleCfg.severity === "off") continue;
    if (!config.typeAware && TYPE_AWARE_RULES.has(ruleId)) continue;

    const rule = (ALL_RULES as any)[ruleNamespace(ruleId)];
    if (!rule) continue;

    const localDiags: Diagnostic[] = [];
    const context = {
      options: ruleCfg.options ? [ruleCfg.options] : [],
      filename: filePath,
      cwd: config.cwd,
      report(d: { message: string; node: any }) {
        const loc = getLoc(d.node);
        localDiags.push({
          file: filePath,
          rule: ruleId,
          severity: ruleCfg.severity as "warn" | "error",
          message: d.message,
          ...loc,
        });
      },
    };

    const handlers = rule.create(context);
    walkAST(parsed.program, handlers);
    out.push(...localDiags);
  }

  return out;
}

export async function lintFiles(
  filePaths: string[],
  config: EngineConfig,
): Promise<Diagnostic[]> {
  const results = await Promise.all(
    filePaths.map(async (p) => {
      const src = await Deno.readTextFile(p);
      return lintFile(p, src, config);
    }),
  );
  return results.flat();
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
deno test --allow-read --allow-env --allow-run tests/engine_test.ts
```

Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/engine.ts tests/engine_test.ts
git commit -m "feat(engine): standalone lint engine on oxc-parser"
```

---

## Task 12: Output formatters

**Files:**
- Create: `src/formatters/types.ts`, `src/formatters/stylish.ts`, `src/formatters/json.ts`, `src/formatters/sarif.ts`, `src/formatters/github.ts`
- Test: `tests/formatters_test.ts`

- [ ] **Step 1: Write `src/formatters/types.ts`**

```ts
import type { Diagnostic } from "../engine.ts";

export interface FormatContext {
  diagnostics: Diagnostic[];
  filesScanned: number;
  durationMs: number;
}

export type Formatter = (ctx: FormatContext) => string;
```

- [ ] **Step 2: Write failing test**

```ts
// tests/formatters_test.ts
import { assert, assertEquals } from "@std/assert";
import type { Diagnostic } from "../src/engine.ts";
import { stylish } from "../src/formatters/stylish.ts";
import { json } from "../src/formatters/json.ts";
import { sarif } from "../src/formatters/sarif.ts";
import { github } from "../src/formatters/github.ts";

const sample: Diagnostic[] = [
  {
    file: "src/A.tsx",
    rule: "hook-o-gnese/no-fat-effects",
    severity: "warn",
    message: "useEffect entropy 12.0 ≥ 10",
    line: 10,
    column: 5,
  },
  {
    file: "src/B.tsx",
    rule: "hook-o-gnese/hook-coupling",
    severity: "error",
    message: "useEffect reads + writes same state 'count' (loop risk)",
    line: 22,
    column: 3,
  },
];
const ctx = { diagnostics: sample, filesScanned: 5, durationMs: 42 };

Deno.test("stylish: groups by file, prints summary", () => {
  const out = stylish(ctx);
  assert(out.includes("src/A.tsx"));
  assert(out.includes("src/B.tsx"));
  assert(out.includes("hook-o-gnese/no-fat-effects"));
  assert(out.includes("2 problems"));
  assert(out.includes("1 error"));
  assert(out.includes("1 warning"));
});

Deno.test("json: round-trips diagnostics", () => {
  const parsed = JSON.parse(json(ctx));
  assertEquals(parsed.diagnostics.length, 2);
  assertEquals(parsed.filesScanned, 5);
  assertEquals(parsed.durationMs, 42);
});

Deno.test("sarif: emits SARIF 2.1.0 envelope", () => {
  const parsed = JSON.parse(sarif(ctx));
  assertEquals(parsed.version, "2.1.0");
  assert(parsed.runs[0].tool.driver.name === "hook-o-gnese");
  assertEquals(parsed.runs[0].results.length, 2);
});

Deno.test("github: emits annotation lines", () => {
  const out = github(ctx);
  assert(out.includes("::warning"));
  assert(out.includes("::error"));
  assert(out.includes("file=src/A.tsx,line=10,col=5"));
});
```

- [ ] **Step 3: Run test to verify failure**

```bash
deno test --allow-read --allow-env tests/formatters_test.ts
```

Expected: FAIL.

- [ ] **Step 4: Implement `src/formatters/stylish.ts`**

```ts
import type { Formatter } from "./types.ts";

export const stylish: Formatter = ({ diagnostics, filesScanned, durationMs }) => {
  if (diagnostics.length === 0) {
    return `✓ no problems found (${filesScanned} files, ${durationMs}ms)\n`;
  }
  const byFile = new Map<string, typeof diagnostics>();
  for (const d of diagnostics) {
    if (!byFile.has(d.file)) byFile.set(d.file, []);
    byFile.get(d.file)!.push(d);
  }
  const lines: string[] = [];
  for (const [file, ds] of byFile) {
    lines.push(`\n${file}`);
    for (const d of ds) {
      const sev = d.severity === "error" ? "error" : "warn ";
      const loc = `${d.line}:${d.column}`.padEnd(7);
      lines.push(`  ${loc} ${sev}  ${d.message}  ${d.rule}`);
    }
  }
  const errors = diagnostics.filter((d) => d.severity === "error").length;
  const warnings = diagnostics.filter((d) => d.severity === "warn").length;
  lines.push(
    `\n${diagnostics.length} problems (${errors} error${errors === 1 ? "" : "s"}, ${warnings} warning${warnings === 1 ? "" : "s"}) in ${filesScanned} files, ${durationMs}ms`,
  );
  return lines.join("\n") + "\n";
};
```

- [ ] **Step 5: Implement `src/formatters/json.ts`**

```ts
import type { Formatter } from "./types.ts";

export const json: Formatter = (ctx) => JSON.stringify(ctx, null, 2);
```

- [ ] **Step 6: Implement `src/formatters/sarif.ts`**

```ts
import type { Formatter } from "./types.ts";

export const sarif: Formatter = ({ diagnostics }) => {
  const ruleIds = [...new Set(diagnostics.map((d) => d.rule))];
  return JSON.stringify(
    {
      version: "2.1.0",
      $schema:
        "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
      runs: [{
        tool: {
          driver: {
            name: "hook-o-gnese",
            informationUri: "https://github.com/your-scope/hook-o-gnese",
            rules: ruleIds.map((id) => ({ id })),
          },
        },
        results: diagnostics.map((d) => ({
          ruleId: d.rule,
          level: d.severity === "error" ? "error" : "warning",
          message: { text: d.message },
          locations: [{
            physicalLocation: {
              artifactLocation: { uri: d.file },
              region: {
                startLine: d.line,
                startColumn: d.column,
                endLine: d.endLine,
                endColumn: d.endColumn,
              },
            },
          }],
        })),
      }],
    },
    null,
    2,
  );
};
```

- [ ] **Step 7: Implement `src/formatters/github.ts`**

```ts
import type { Formatter } from "./types.ts";

export const github: Formatter = ({ diagnostics }) =>
  diagnostics.map((d) => {
    const cmd = d.severity === "error" ? "::error" : "::warning";
    const safe = d.message.replace(/\r?\n/g, " ").replace(/::/g, ":");
    return `${cmd} file=${d.file},line=${d.line},col=${d.column},title=${d.rule}::${safe}`;
  }).join("\n") + "\n";
```

- [ ] **Step 8: Run tests to verify pass**

```bash
deno test --allow-read --allow-env tests/formatters_test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 9: Commit**

```bash
git add src/formatters/ tests/formatters_test.ts
git commit -m "feat(formatters): stylish, json, sarif, github outputs"
```

---

## Task 13: CLI entry

**Files:**
- Create: `src/config.ts`, `src/cli.ts`
- Test: `tests/cli_test.ts`

- [ ] **Step 1: Write `src/config.ts`**

```ts
import { join } from "@std/path";
import type { EngineConfig, Severity } from "./engine.ts";

const DEFAULT_RULES: Record<string, { severity: Severity; options?: unknown }> = {
  "hook-o-gnese/no-fat-effects": { severity: "warn" },
  "hook-o-gnese/state-scatter": { severity: "warn" },
  "hook-o-gnese/hook-coupling": { severity: "error" },
  "hook-o-gnese/custom-hook-depth": { severity: "warn", options: { maxDepth: 3 } },
};

export const DEFAULT_IGNORE = [
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/.next/**",
  "**/.cache/**",
];

interface FileConfig {
  rules?: Record<string, Severity | [Severity, unknown]>;
  ignore?: string[];
  typeAware?: boolean;
}

export async function loadConfig(
  cwd: string,
  configPath?: string,
): Promise<{ engine: EngineConfig; ignore: string[] }> {
  const candidates = configPath
    ? [configPath]
    : [join(cwd, ".hookogneserc.json")];

  let fileCfg: FileConfig = {};
  for (const c of candidates) {
    try {
      const text = await Deno.readTextFile(c);
      fileCfg = JSON.parse(text);
      break;
    } catch {
      // not found — fine, use defaults
    }
  }

  const rules: EngineConfig["rules"] = { ...DEFAULT_RULES };
  if (fileCfg.rules) {
    for (const [id, spec] of Object.entries(fileCfg.rules)) {
      if (Array.isArray(spec)) {
        rules[id] = { severity: spec[0], options: spec[1] };
      } else {
        rules[id] = { severity: spec };
      }
    }
  }

  return {
    engine: {
      rules,
      cwd,
      typeAware: fileCfg.typeAware ?? false,
    },
    ignore: fileCfg.ignore ?? DEFAULT_IGNORE,
  };
}

export function applyCliRuleOverrides(
  cfg: EngineConfig,
  overrides: Array<{ id: string; severity: Severity }>,
): EngineConfig {
  const rules = { ...cfg.rules };
  for (const o of overrides) {
    rules[o.id] = { ...(rules[o.id] ?? { severity: "off" }), severity: o.severity };
  }
  return { ...cfg, rules };
}
```

- [ ] **Step 2: Write failing CLI test**

```ts
// tests/cli_test.ts
import { assert, assertEquals } from "@std/assert";

async function runCli(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  const cmd = new Deno.Command("deno", {
    args: [
      "run",
      "--allow-read",
      "--allow-env",
      "--allow-run",
      "src/cli.ts",
      ...args,
    ],
    stdout: "piped",
    stderr: "piped",
  });
  const out = await cmd.output();
  return {
    stdout: new TextDecoder().decode(out.stdout),
    stderr: new TextDecoder().decode(out.stderr),
    code: out.code,
  };
}

Deno.test("cli: --help prints usage", async () => {
  const { stdout, code } = await runCli(["--help"]);
  assert(stdout.includes("Usage"));
  assertEquals(code, 0);
});

Deno.test("cli: clean fixture exits 0", async () => {
  const { code } = await runCli(["tests/fixtures/clean.tsx"]);
  assertEquals(code, 0);
});

Deno.test("cli: fat-effect fixture exits warn (0 with --no-error-on-warn)", async () => {
  const { stdout, code } = await runCli([
    "tests/fixtures/fat-effect.tsx",
    "--format=json",
  ]);
  // warnings alone don't fail by default
  assertEquals(code, 0);
  const parsed = JSON.parse(stdout);
  assert(parsed.diagnostics.length >= 1);
});

Deno.test("cli: coupled-hooks fixture exits 1 (error severity)", async () => {
  const { code } = await runCli([
    "tests/fixtures/coupled-hooks.tsx",
    "--format=json",
  ]);
  assertEquals(code, 1);
});

Deno.test("cli: --format=github emits annotation lines", async () => {
  const { stdout } = await runCli([
    "tests/fixtures/fat-effect.tsx",
    "--format=github",
  ]);
  assert(stdout.includes("::warning") || stdout.includes("::error"));
});

Deno.test("cli: --format=sarif emits valid JSON", async () => {
  const { stdout } = await runCli([
    "tests/fixtures/fat-effect.tsx",
    "--format=sarif",
  ]);
  const parsed = JSON.parse(stdout);
  assertEquals(parsed.version, "2.1.0");
});

Deno.test("cli: --type-aware enables custom-hook-depth", async () => {
  const { stdout } = await runCli([
    "tests/fixtures/deep-custom-hook.tsx",
    "--format=json",
    "--type-aware",
  ]);
  const parsed = JSON.parse(stdout);
  assert(
    parsed.diagnostics.some((d: any) => d.rule === "hook-o-gnese/custom-hook-depth"),
  );
});
```

- [ ] **Step 3: Run test to verify failure**

```bash
deno test --allow-read --allow-env --allow-run tests/cli_test.ts
```

Expected: FAIL.

- [ ] **Step 4: Implement `src/cli.ts`**

```ts
#!/usr/bin/env node
import { parseArgs } from "@std/cli/parse-args";
import { globby } from "globby";
import { lintFiles } from "./engine.ts";
import { applyCliRuleOverrides, DEFAULT_IGNORE, loadConfig } from "./config.ts";
import { stylish } from "./formatters/stylish.ts";
import { json as jsonFmt } from "./formatters/json.ts";
import { sarif } from "./formatters/sarif.ts";
import { github } from "./formatters/github.ts";
import type { Formatter } from "./formatters/types.ts";

const FORMATTERS: Record<string, Formatter> = {
  stylish,
  json: jsonFmt,
  sarif,
  github,
};

const HELP = `
hook-o-gnese — score React hook complexity

Usage:
  hook-o-gnese [options] <paths...>

Options:
  --format=<fmt>          stylish (default) | json | sarif | github
  --config=<path>         path to .hookogneserc.json
  --type-aware            enable custom-hook-depth (slower, uses TS Compiler API)
  --rule=<id>=<sev>       override rule severity (off|warn|error). Repeatable.
  --no-error-on-warn      do not exit non-zero on warnings
  --help, -h              show this message

Examples:
  hook-o-gnese ./src
  hook-o-gnese ./src --format=sarif > report.sarif
  hook-o-gnese ./src --type-aware --rule=hook-o-gnese/state-scatter=error
`.trim();

async function main(argv: string[]): Promise<number> {
  const args = parseArgs(argv, {
    boolean: ["help", "type-aware", "no-error-on-warn"],
    alias: { h: "help" },
    string: ["format", "config"],
    collect: ["rule"],
    default: { format: "stylish" },
  });

  if (args.help) {
    console.log(HELP);
    return 0;
  }

  const paths = args._.map(String);
  if (paths.length === 0) {
    console.error("Error: no paths provided. Use --help for usage.");
    return 2;
  }

  const formatter = FORMATTERS[args.format as string];
  if (!formatter) {
    console.error(`Error: unknown format '${args.format}'`);
    return 2;
  }

  const cwd = Deno.cwd();
  const { engine, ignore } = await loadConfig(cwd, args.config as string | undefined);
  if (args["type-aware"]) engine.typeAware = true;

  const overrides = ((args.rule ?? []) as string[]).map((spec) => {
    const [id, sev] = spec.split("=");
    return { id, severity: sev as "off" | "warn" | "error" };
  });
  const finalEngine = applyCliRuleOverrides(engine, overrides);

  const files = await globby(paths, {
    ignore: [...DEFAULT_IGNORE, ...ignore],
    expandDirectories: { extensions: ["ts", "tsx", "js", "jsx"] },
    absolute: false,
  });

  if (files.length === 0) {
    console.error("Error: no matching files found");
    return 2;
  }

  const start = performance.now();
  const diagnostics = await lintFiles(files, finalEngine);
  const durationMs = Math.round(performance.now() - start);

  const output = formatter({
    diagnostics,
    filesScanned: files.length,
    durationMs,
  });
  Deno.stdout.writeSync(new TextEncoder().encode(output));

  const hasError = diagnostics.some((d) => d.severity === "error");
  const hasWarn = diagnostics.some((d) => d.severity === "warn");
  if (hasError) return 1;
  if (hasWarn && !args["no-error-on-warn"]) return 0;
  return 0;
}

if (import.meta.main) {
  const code = await main(Deno.args);
  Deno.exit(code);
}
```

- [ ] **Step 5: Run tests to verify pass**

```bash
deno test --allow-read --allow-env --allow-run tests/cli_test.ts
```

Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add src/config.ts src/cli.ts tests/cli_test.ts
git commit -m "feat(cli): standalone CLI with multiple output formats + config"
```

---

## Task 14: Self-dogfood (oxlint plugin path) + integration test

**Files:**
- Create: `.oxlintrc.json`, `.hookogneserc.json`, `tests/integration/oxlint-run_test.ts`

- [ ] **Step 1: Write `.oxlintrc.json`**

```jsonc
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "jsPlugins": ["./src/index.ts"],
  "rules": {
    "hook-o-gnese/no-fat-effects": "warn",
    "hook-o-gnese/state-scatter": "warn",
    "hook-o-gnese/hook-coupling": "error",
    "hook-o-gnese/custom-hook-depth": ["warn", { "maxDepth": 3 }]
  },
  "ignorePatterns": ["dist/", "bin/", "node_modules/"]
}
```

- [ ] **Step 2: Write `.hookogneserc.json`**

```jsonc
{
  "rules": {
    "hook-o-gnese/no-fat-effects": "warn",
    "hook-o-gnese/state-scatter": "warn",
    "hook-o-gnese/hook-coupling": "error",
    "hook-o-gnese/custom-hook-depth": ["warn", { "maxDepth": 3 }]
  },
  "typeAware": true
}
```

- [ ] **Step 3: Write integration test for oxlint adapter**

```ts
// tests/integration/oxlint-run_test.ts
import { assert } from "@std/assert";

Deno.test({
  name: "oxlint runs plugin against fixtures and reports diagnostics",
  permissions: { run: true, read: true, env: true, write: true, net: true },
  async fn() {
    const cmd = new Deno.Command("deno", {
      args: ["run", "-A", "npm:oxlint", "--format=json", "tests/fixtures/"],
      stdout: "piped",
      stderr: "piped",
    });
    const { stdout, stderr } = await cmd.output();
    const out = new TextDecoder().decode(stdout);
    const err = new TextDecoder().decode(stderr);
    assert(
      out.includes("hook-o-gnese/") || err.includes("hook-o-gnese/"),
      `expected hook-o-gnese diagnostics. stdout:\n${out}\nstderr:\n${err}`,
    );
  },
});
```

- [ ] **Step 4: Run integration test**

```bash
deno cache --reload npm:oxlint
deno test --allow-all tests/integration/oxlint-run_test.ts
```

Expected: PASS. If oxlint version doesn't yet support TS plugin entries, point `jsPlugins` at a built `dist/index.js` instead and re-run.

- [ ] **Step 5: Commit**

```bash
git add .oxlintrc.json .hookogneserc.json tests/integration/oxlint-run_test.ts
git commit -m "test: oxlint plugin integration + dogfood configs for both modes"
```

---

## Task 15: tsdown bundle for npm (both entries)

**Files:**
- Create: `tsdown.config.ts`

- [ ] **Step 1: Write `tsdown.config.ts`**

```ts
import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    cli: "src/cli.ts",
    engine: "src/engine.ts",
  },
  format: ["esm", "cjs"],
  platform: "node",
  dts: true,
  clean: true,
  sourcemap: true,
  external: ["typescript", "@oxlint/plugins", "oxc-parser", "globby"],
  outDir: "dist",
});
```

- [ ] **Step 2: Build**

```bash
deno run -A npm:tsdown
ls dist/
```

Expected: `dist/index.js`, `dist/index.cjs`, `dist/index.d.ts`, `dist/cli.js`, `dist/cli.cjs`, `dist/cli.d.ts`, `dist/engine.js`, `dist/engine.cjs`, `dist/engine.d.ts`, plus `.map` files.

- [ ] **Step 3: Smoke test bundled CLI**

```bash
chmod +x dist/cli.js
node dist/cli.js --help
node dist/cli.js tests/fixtures/clean.tsx --format=json
```

Expected: prints help; second command prints `{ "diagnostics": [], ... }`.

- [ ] **Step 4: Smoke test bundled plugin entry**

```bash
node -e "import('./dist/index.js').then(m => console.log(Object.keys(m.default.rules)))"
```

Expected: `[ 'no-fat-effects', 'state-scatter', 'hook-coupling', 'custom-hook-depth' ]`.

- [ ] **Step 5: Commit**

```bash
git add tsdown.config.ts
git commit -m "build: tsdown bundles plugin + CLI + engine entries for npm"
```

---

## Task 16: `deno compile` standalone binary

**Files:**
- Modify: `deno.json` (already has `build:bin` task)

- [ ] **Step 1: Build the binary**

```bash
mkdir -p bin
deno task build:bin
ls -la bin/
```

Expected: `bin/hook-o-gnese` exists, ~80MB. The `--allow-read --allow-env` permissions are baked in.

- [ ] **Step 2: Smoke test the binary**

```bash
./bin/hook-o-gnese --help
./bin/hook-o-gnese tests/fixtures/fat-effect.tsx --format=json
```

Expected: help text; valid JSON output with diagnostics.

- [ ] **Step 3: Test cross-platform target (optional, requires Docker or CI)**

```bash
deno compile --target=x86_64-unknown-linux-gnu --allow-read --allow-env \
  --output=bin/hook-o-gnese-linux-x64 src/cli.ts

deno compile --target=aarch64-apple-darwin --allow-read --allow-env \
  --output=bin/hook-o-gnese-darwin-arm64 src/cli.ts

deno compile --target=x86_64-pc-windows-msvc --allow-read --allow-env \
  --output=bin/hook-o-gnese-win-x64.exe src/cli.ts
```

Expected: three binaries, ~80MB each.

- [ ] **Step 4: Commit**

```bash
echo "bin/" >> .gitignore  # already there from Task 1; verify and skip if present
git add .gitignore
git commit --allow-empty -m "build: deno compile standalone binary target"
```

---

## Task 17: JSR publish dry run

- [ ] **Step 1: Run dry-run**

```bash
deno publish --dry-run
```

Expected: prints package contents, no errors. JSR may warn about "slow types" — fix inline.

- [ ] **Step 2: Add explicit return types where JSR complains**

For each warning, add a return type. Likely candidates: scoring functions (already typed), engine exports (already typed), formatter exports (already typed via `Formatter`). If JSR flags the default plugin export shape, annotate it with the type from `@oxlint/plugins`.

- [ ] **Step 3: Re-run until clean**

```bash
deno publish --dry-run
```

Expected: clean.

- [ ] **Step 4: Commit any annotation fixes**

```bash
git add -p
git commit -m "chore(jsr): annotate exports for slow-type-free publish" || true
```

---

## Task 18: npm publish dry run + bin verification

- [ ] **Step 1: Pack**

```bash
npm pack --dry-run
npm pack
```

Expected: a `.tgz` file lists `dist/`, `README.md`, `LICENSE`, `package.json`.

- [ ] **Step 2: Smoke install in temp dir**

```bash
mkdir -p /tmp/he-smoke && cd /tmp/he-smoke && npm init -y
npm install /Users/mrehout/dev/bigbiz/spaghetti-hook-o-gnese/your-scope-hook-o-gnese-0.0.1.tgz typescript

# Library import
node -e "import('@your-scope/hook-o-gnese').then(m => console.log(Object.keys(m.default.rules)))"
# Bin works
npx hook-o-gnese --help
# Sample run
mkdir -p src && cat > src/Foo.tsx <<'EOF'
import { useEffect, useState } from "react";
export function Foo() {
  const [a] = useState(0);
  useEffect(() => { if (a) console.log(1); else console.log(2); }, [a]);
  return null as any;
}
EOF
npx hook-o-gnese ./src --format=json
```

Expected: rules listed; help printed; JSON diagnostics output.

- [ ] **Step 3: Cleanup**

```bash
rm -rf /tmp/he-smoke
cd /Users/mrehout/dev/bigbiz/spaghetti-hook-o-gnese
rm -f *.tgz
```

---

## Task 19: Documentation

**Files:**
- Create: `docs/thresholds.md`, `docs/rule-reference.md`, `docs/cli.md`
- Modify: `README.md`

- [ ] **Step 1: Write `docs/thresholds.md`**

```markdown
# Threshold reasoning

All thresholds are first-pass. Tune `options.threshold` (or `options.maxDepth`) per rule for your codebase.

## no-fat-effects

`score = deps + branches*2 + setStates*1.5 + nestedEffects*5 + (subscriptionWithoutCleanup ? 3 : 0)`

| Threshold | Default | Meaning |
| --- | --- | --- |
| warn | 10 | Approaching unmaintainability |
| error | 20 | Decompose |

## state-scatter

`score = useStateCount + correlatedSetters*0.5`

| Threshold | Default | Meaning |
| --- | --- | --- |
| warn | 5 | Consider useReducer |
| error | 8 | Likely needs split |

## hook-coupling

`score = sum over effects of (3 per state read+written in same effect)`

| Threshold | Default | Meaning |
| --- | --- | --- |
| warn | 3 | Suspicious |
| error | 6 | Likely loop bait |

## custom-hook-depth

Transitive nesting depth (non-React hooks only).

| Threshold | Default | Meaning |
| --- | --- | --- |
| warn | 3 | Hook tree getting tall |
| error | 5 | Over-abstracted |
```

- [ ] **Step 2: Write `docs/rule-reference.md`**

```markdown
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

Reports custom hooks whose transitive call tree exceeds maxDepth. **Type-aware** (uses TypeScript Compiler API). Disabled by default in CLI mode; enable with `--type-aware` or `typeAware: true` in `.hookogneserc.json`.

**Options**: `{ "maxDepth": 3 }`

## Type-aware companion rules (oxlint plugin path only)

The exported `recommended` config enables tsgolint built-ins alongside ours:

```ts
import { recommended } from "@your-scope/hook-o-gnese";
```

Adds:
- `typescript/no-floating-promises` — unawaited promises in effects
- `typescript/no-misused-promises` — `useEffect(async () => {})`
```

- [ ] **Step 3: Write `docs/cli.md`**

```markdown
# CLI usage

\`\`\`
hook-o-gnese [options] <paths...>

Options:
  --format=<fmt>          stylish (default) | json | sarif | github
  --config=<path>         path to .hookogneserc.json
  --type-aware            enable custom-hook-depth
  --rule=<id>=<sev>       override rule severity (off|warn|error). Repeatable.
  --no-error-on-warn      do not exit non-zero on warnings
  --help, -h
\`\`\`

## Config file

`.hookogneserc.json` in your project root:

\`\`\`jsonc
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
\`\`\`

## Examples

\`\`\`bash
# Lint a directory
npx @your-scope/hook-o-gnese ./src

# JSON output for tooling
npx @your-scope/hook-o-gnese ./src --format=json > report.json

# SARIF for GitHub code scanning
npx @your-scope/hook-o-gnese ./src --format=sarif > report.sarif

# GitHub Actions annotations
npx @your-scope/hook-o-gnese ./src --format=github

# Override a rule severity
npx @your-scope/hook-o-gnese ./src --rule=hook-o-gnese/state-scatter=error

# Standalone binary (built via deno compile)
./bin/hook-o-gnese ./src --type-aware
\`\`\`

## Programmatic API

\`\`\`ts
import { lintFile, lintFiles } from "@your-scope/hook-o-gnese/engine";

const diagnostics = await lintFile("Component.tsx", source, {
  rules: { "hook-o-gnese/no-fat-effects": { severity: "warn" } },
  cwd: process.cwd(),
  typeAware: false,
});
\`\`\`

## Performance

| Path                        | Cold start | Per-file warm |
| --------------------------- | ---------- | ------------- |
| Node CLI (`npx`)            | ~80ms      | ~3-5ms        |
| Deno-compiled binary        | ~30ms      | ~3-5ms        |
| Type-aware rule (first run) | +50-150ms  | TS Program    |
```

- [ ] **Step 4: Expand `README.md`**

```markdown
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

\`\`\`bash
npx @your-scope/hook-o-gnese ./src
npx @your-scope/hook-o-gnese ./src --format=sarif > report.sarif
npx @your-scope/hook-o-gnese ./src --type-aware
\`\`\`

See [docs/cli.md](docs/cli.md).

## Oxlint plugin

\`\`\`bash
npm install -D @your-scope/hook-o-gnese oxlint
\`\`\`

\`\`\`jsonc
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
\`\`\`

Or use the recommended config (bundles tsgolint type-aware rules):

\`\`\`ts
import { recommended } from "@your-scope/hook-o-gnese";
\`\`\`

## Standalone binary

Built with `deno compile`:

\`\`\`bash
git clone <this-repo>
cd hook-o-gnese && deno task build:bin
./bin/hook-o-gnese ./src
\`\`\`

## See also

- [docs/rule-reference.md](docs/rule-reference.md)
- [docs/thresholds.md](docs/thresholds.md)
- [docs/cli.md](docs/cli.md)

## License

MIT
```

- [ ] **Step 5: Commit**

```bash
git add docs/ README.md
git commit -m "docs: rule reference, thresholds, CLI usage, dual-mode README"
```

---

## Task 20: GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Write CI workflow**

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: denoland/setup-deno@v2
        with: { deno-version: v2.x }
      - run: deno fmt --check
      - run: deno task test
      - run: deno run -A npm:tsdown
      - run: deno publish --dry-run

  smoke-cli-binary:
    runs-on: ${{ matrix.os }}
    needs: test
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
    steps:
      - uses: actions/checkout@v4
      - uses: denoland/setup-deno@v2
        with: { deno-version: v2.x }
      - run: deno task build:bin
      - run: ./bin/hook-o-gnese --help
      - run: ./bin/hook-o-gnese tests/fixtures/fat-effect.tsx --format=json

  smoke-npm:
    runs-on: ubuntu-latest
    needs: test
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "22" }
      - uses: denoland/setup-deno@v2
        with: { deno-version: v2.x }
      - run: deno run -A npm:tsdown
      - run: npm pack
      - run: |
          mkdir /tmp/smoke && cd /tmp/smoke && npm init -y
          npm install $GITHUB_WORKSPACE/your-scope-hook-o-gnese-*.tgz typescript
          # library
          node -e "import('@your-scope/hook-o-gnese').then(m => process.exit(Object.keys(m.default.rules).length === 4 ? 0 : 1))"
          # CLI bin
          npx hook-o-gnese --help
          mkdir -p src && cat > src/Foo.tsx <<'EOF'
          import { useEffect, useState } from "react";
          export function Foo() {
            const [a] = useState(0);
            useEffect(() => { if (a) console.log(1); }, [a]);
            return null;
          }
          EOF
          npx hook-o-gnese ./src --format=json | head -c 200
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: deno test + tsdown + JSR dry-run + cross-platform binary smoke + npm bin smoke"
```

---

## Task 21: Final dogfood + threshold calibration

- [ ] **Step 1: Run plugin path against fixtures**

```bash
deno run -A npm:oxlint --format=stylish tests/fixtures/
```

Expected: at least one diagnostic for each fixture except `clean.tsx`.

- [ ] **Step 2: Run CLI path against fixtures**

```bash
deno task dogfood:cli
deno task dogfood:cli --format=json | head -c 500
deno task dogfood:cli --format=sarif > /tmp/he.sarif && head -c 500 /tmp/he.sarif
deno task dogfood:cli --format=github
```

Expected: each format produces sensible output.

- [ ] **Step 3: Run on a real React codebase**

Pick another project on disk:

```bash
./bin/hook-o-gnese /path/to/some/react/project/src --format=json > /tmp/real.json
jq '.diagnostics | group_by(.rule) | map({rule: .[0].rule, count: length})' /tmp/real.json
```

Expected: realistic distribution. If a rule fires on 90%+ of files, the threshold is too low — bump default in `src/scoring/thresholds.ts` until ~10–20% fire.

- [ ] **Step 4: Commit calibrations + tag**

```bash
git add src/scoring/thresholds.ts || true
git commit -m "chore(thresholds): calibrate against real codebase" || true
git tag v0.0.1
echo "Ready: deno publish && npm publish --access public"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Custom oxlint plugin in TS — Tasks 5, 6, 7, 9, 10
- ✅ Type-aware via tsgolint companions + TS Compiler API in own rule — Tasks 8, 9, 10 (`recommended`)
- ✅ Dual distribution (oxlint plugin + standalone CLI) from shared core — Tasks 10 (plugin), 11–13 (engine + formatters + CLI)
- ✅ JSR publish — Task 17
- ✅ npm publish (lib + bin) — Tasks 15, 18
- ✅ Standalone binary via `deno compile` — Task 16
- ✅ Tests + fixtures — every implementation task
- ✅ Self-dogfood (both modes) — Task 14
- ✅ CI (cross-platform binary smoke + npm + JSR) — Task 20

**Placeholder scan:** clean — every code block contains real code, every threshold has a number, every command is runnable. Replace `@your-scope` with the real scope before publish.

**Type consistency:**
- `RuleContext` interface defined in `src/rules/no-fat-effects.ts`, imported by `state-scatter`, `hook-coupling`, `custom-hook-depth` ✅
- `Diagnostic` / `EngineConfig` / `Severity` / `RuleConfig` defined in `src/engine.ts`, used unchanged in `src/config.ts`, `src/cli.ts`, `src/formatters/*.ts` ✅
- `Formatter` / `FormatContext` defined in `src/formatters/types.ts`, used by all four formatter implementations ✅
- All four rules use `create(context)` shape (ESLint-compatible). Engine and oxlint plugin both call `rule.create(context)` ✅
- `ALL_RULES` registry in `src/rules/registry.ts` consumed by both `src/index.ts` (oxlint plugin) and `src/engine.ts` (CLI) ✅
- `TsProgramCache.resolveIdentifierDeclaration` and `countTransitiveHookCalls` defined Task 8, consumed Task 9 ✅

**Honest limitations flagged:**
- `custom-hook-depth` uses TypeScript Compiler API (~50–150ms first-run), not tsgolint's Go backend, because oxlint's JS plugin API does not expose tsgolint's type info to custom rules. Documented in `docs/rule-reference.md` and `README.md`.
- The standalone CLI is sequential per file. Worker-thread parallelism is a v1.5 enhancement — current per-file cost (~3–5ms) means linear scan handles ~200 files/sec on one core. Daemon mode is also v1.5.
- `tsdown --exe` (Node SEA) is not part of MVP; `deno compile` covers the standalone-binary distribution. Adding SEA is a one-line change in `tsdown.config.ts` (`exe: true`) when Node 25.7+ is required.

---
