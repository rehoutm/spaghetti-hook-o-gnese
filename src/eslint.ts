/**
 * ESLint flat-config plugin adapter for `hook-o-gnese`.
 *
 * Exposes the four hook-complexity rules as an ESLint plugin compatible with
 * ESLint ≥ 9 flat config. Reuses the same scoring core and rule implementations
 * as the oxlint adapter — only the host-specific wiring lives here.
 *
 * Requires `eslint >= 9` and, for `custom-hook-depth`, a parser that provides
 * `parserServices.program` (e.g. `@typescript-eslint/parser` with
 * `parserOptions: { projectService: true }`).
 *
 * @example
 * ```ts
 * // eslint.config.ts
 * import hookOGnese from "hook-o-gnese/eslint";
 * export default [
 *   hookOGnese.configs.recommended,
 * ];
 * ```
 *
 * @module
 */

import type { Rule } from "eslint";
import { noFatEffects } from "./rules/no-fat-effects.ts";
import { stateScatter } from "./rules/state-scatter.ts";
import { hookCoupling } from "./rules/hook-coupling.ts";
import { customHookDepth } from "./rules/custom-hook-depth.ts";
import { TsProgramCache } from "./ts-program.ts";
import type { RuleContext } from "./rules/types.ts";

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

type Visitor = Record<string, (node: unknown) => void>;
type InternalRule = { create(ctx: RuleContext): Visitor };

// ---------------------------------------------------------------------------
// Per-rule meta
// ---------------------------------------------------------------------------

const baseMessages = { warn: "{{detail}}", error: "{{detail}}" } as const;

const thresholdSchema = {
  type: "object" as const,
  properties: {
    threshold: { type: "number" as const },
    errorThreshold: { type: "number" as const },
  },
  additionalProperties: false,
};

const depthSchema = {
  type: "object" as const,
  properties: {
    maxDepth: { type: "number" as const },
    errorMaxDepth: { type: "number" as const },
  },
  additionalProperties: false,
};

const BASE_URL =
  "https://github.com/rehoutm/spaghetti-hook-o-gnese/blob/master/docs/rule-reference.md";

const RULE_META: Record<string, Rule.RuleMetaData> = {
  "no-fat-effects": {
    type: "suggestion",
    docs: {
      description: "Flag dense useEffect blocks",
      url: `${BASE_URL}#hook-o-gnese-no-fat-effects`,
    },
    schema: [thresholdSchema],
    messages: baseMessages,
  },
  "state-scatter": {
    type: "suggestion",
    docs: {
      description: "Flag components with too many useState calls",
      url: `${BASE_URL}#hook-o-gnese-state-scatter`,
    },
    schema: [thresholdSchema],
    messages: baseMessages,
  },
  "hook-coupling": {
    type: "suggestion",
    docs: {
      description: "Flag effects that read state they also write (loop bait)",
      url: `${BASE_URL}#hook-o-gnese-hook-coupling`,
    },
    schema: [thresholdSchema],
    messages: baseMessages,
  },
  "custom-hook-depth": {
    type: "suggestion",
    docs: {
      description:
        "Flag custom hooks whose transitive nesting exceeds maxDepth (type-aware).",
      url: `${BASE_URL}#hook-o-gnese-custom-hook-depth`,
    },
    schema: [depthSchema],
    messages: baseMessages,
  },
};

// ---------------------------------------------------------------------------
// wrapRule helper
// ---------------------------------------------------------------------------

function wrapRule(
  rule: InternalRule,
  meta: Rule.RuleMetaData,
): Rule.RuleModule {
  return {
    meta,
    create(eslintContext: Rule.RuleContext): Visitor {
      const shim: RuleContext = {
        options: eslintContext.options,
        filename: eslintContext.filename,
        cwd: eslintContext.cwd,
        report({ message, node, severity }) {
          eslintContext.report({
            // deno-lint-ignore no-explicit-any
            node: node as any,
            messageId: severity ?? "warn",
            data: { detail: message },
          });
        },
      };
      return rule.create(shim);
    },
  };
}

// ---------------------------------------------------------------------------
// custom-hook-depth: special wrapper that injects parserServices.program
// ---------------------------------------------------------------------------

const customHookDepthRule: Rule.RuleModule = {
  meta: RULE_META["custom-hook-depth"],
  create(eslintContext: Rule.RuleContext): Visitor {
    // deno-lint-ignore no-explicit-any
    const parserServices = (eslintContext.sourceCode as any).parserServices as
      | { program?: import("typescript").Program }
      | undefined;
    const tsProgram = parserServices?.program;

    if (!tsProgram) {
      throw new Error(
        [
          "hook-o-gnese/custom-hook-depth requires type information.",
          "Add @typescript-eslint/parser to your ESLint config with one of:",
          "  parserOptions: { projectService: true }",
          "  parserOptions: { project: './tsconfig.json' }",
          `See: ${BASE_URL}#hook-o-gnese-custom-hook-depth`,
        ].join("\n"),
      );
    }

    const tsProgramCache = TsProgramCache.fromProgram(
      tsProgram,
      eslintContext.cwd,
    );

    const shim: RuleContext = {
      options: eslintContext.options,
      filename: eslintContext.filename,
      cwd: eslintContext.cwd,
      tsProgramCache,
      report({ message, node, severity }) {
        eslintContext.report({
          // deno-lint-ignore no-explicit-any
          node: node as any,
          messageId: severity ?? "warn",
          data: { detail: message },
        });
      },
    };

    return customHookDepth.create(shim);
  },
};

// ---------------------------------------------------------------------------
// Assemble plugin
// ---------------------------------------------------------------------------

const rules: Record<string, Rule.RuleModule> = {
  "no-fat-effects": wrapRule(noFatEffects, RULE_META["no-fat-effects"]),
  "state-scatter": wrapRule(stateScatter, RULE_META["state-scatter"]),
  "hook-coupling": wrapRule(hookCoupling, RULE_META["hook-coupling"]),
  "custom-hook-depth": customHookDepthRule,
};

const plugin = { rules, configs: {} as Record<string, unknown> };

const recommended = {
  plugins: { "hook-o-gnese": plugin },
  rules: {
    "hook-o-gnese/no-fat-effects": "warn",
    "hook-o-gnese/state-scatter": "warn",
    "hook-o-gnese/hook-coupling": "error",
    "hook-o-gnese/custom-hook-depth": ["warn", { maxDepth: 3 }],
  },
};

// Attach configs after construction so plugin self-reference works.
plugin.configs = { recommended };

export { rules };
export const configs = { recommended };
export default plugin;
