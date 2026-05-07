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
