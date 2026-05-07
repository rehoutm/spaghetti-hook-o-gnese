import type { Rule } from "@oxlint/plugins";
import { noFatEffects } from "./no-fat-effects.ts";
import { stateScatter } from "./state-scatter.ts";
import { hookCoupling } from "./hook-coupling.ts";
import { customHookDepth } from "./custom-hook-depth.ts";

// Rules use our internal ESLint-compatible RuleContext shape; eslintCompatPlugin
// adapts them to oxlint's stricter Rule contract at runtime.
export const ALL_RULES: Record<string, Rule> = {
  "no-fat-effects": noFatEffects as unknown as Rule,
  "state-scatter": stateScatter as unknown as Rule,
  "hook-coupling": hookCoupling as unknown as Rule,
  "custom-hook-depth": customHookDepth as unknown as Rule,
};

export type RuleId =
  | "no-fat-effects"
  | "state-scatter"
  | "hook-coupling"
  | "custom-hook-depth";
