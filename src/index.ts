/**
 * Oxlint plugin entrypoint for `hook-o-gnese`.
 *
 * Exports the plugin as the default export and a `recommended` config that
 * bundles the package's hook-complexity rules together with the type-aware
 * tsgolint built-ins it relies on.
 *
 * @example
 * ```ts
 * // oxlint.config.ts
 * import hookOGnese, { recommended } from "hook-o-gnese";
 * export default { plugins: [hookOGnese], ...recommended };
 * ```
 *
 * @module
 */

import { eslintCompatPlugin, type Plugin } from "@oxlint/plugins";
import { ALL_RULES } from "./rules/registry.ts";

const plugin: Plugin = eslintCompatPlugin({
  meta: { name: "hook-o-gnese" },
  rules: ALL_RULES,
});

/**
 * Recommended oxlint configuration for `hook-o-gnese`.
 *
 * Enables every rule the plugin ships with sensible severities, plus the
 * tsgolint type-aware rules required for full coverage. Spread into your
 * oxlint config alongside the default plugin export.
 */
export const recommended = {
  jsPlugins: ["./node_modules/hook-o-gnese/dist/index.mjs"],
  options: { typeAware: true, typeCheck: true },
  rules: {
    "hook-o-gnese/no-fat-effects": "warn",
    "hook-o-gnese/state-scatter": "warn",
    "hook-o-gnese/hook-coupling": "error",
    "hook-o-gnese/custom-hook-depth": ["warn", { maxDepth: 3 }],
    "hook-o-gnese/noise-callback-effect": "warn",
    "typescript/no-floating-promises": "error",
    "typescript/no-misused-promises": "error",
  },
};

/**
 * The `hook-o-gnese` oxlint plugin. Register as a plugin in your oxlint config
 * to enable React hook complexity rules.
 */
export default plugin;
