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
