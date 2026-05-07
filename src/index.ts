import { eslintCompatPlugin, type Plugin } from "@oxlint/plugins";
import { ALL_RULES } from "./rules/registry.ts";

const plugin: Plugin = eslintCompatPlugin({
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
