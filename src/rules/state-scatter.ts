import { scoreComponentState } from "../scoring/state-score.ts";
import { DEFAULT_THRESHOLDS } from "../scoring/thresholds.ts";
import { isReactComponent } from "../ast-helpers.ts";
import type { RuleContext } from "./no-fat-effects.ts";

interface Options { threshold?: number; errorThreshold?: number }

export const stateScatter = {
  meta: {
    type: "suggestion" as const,
    docs: { description: "Flag components with too many useState calls" },
  },
  create(context: RuleContext) {
    const opts = (context.options[0] as Options | undefined) ?? {};
    const threshold = opts.threshold ?? DEFAULT_THRESHOLDS.stateScatter.warn;
    const errorThreshold = opts.errorThreshold ??
      DEFAULT_THRESHOLDS.stateScatter.error;
    function check(node: any) {
      if (!isReactComponent(node)) return;
      const s = scoreComponentState(node);
      if (s.total >= threshold) {
        const severity = s.total >= errorThreshold ? "error" : "warn";
        context.report({
          message:
            `state scatter ${s.total} ≥ ${threshold} (useStates=${s.useStateCount}, correlated setters=${s.correlatedSetters}). Consider useReducer.`,
          node,
          severity,
        });
      }
    }
    return {
      FunctionDeclaration: check,
      VariableDeclaration: check,
    };
  },
};
