import {
  collectUseCallbackInlineBodies,
  scoreEffectAggregated,
} from "../scoring/effect-score.ts";
import { DEFAULT_THRESHOLDS } from "../scoring/thresholds.ts";
import {
  isHookCall,
  isReactComponent,
  type Node,
  walkComponentBody,
} from "../ast-helpers.ts";
import type { RuleContext } from "./types.ts";

interface Options {
  threshold?: number;
  errorThreshold?: number;
}

export const noFatEffects = {
  meta: {
    type: "suggestion" as const,
    docs: { description: "Flag dense useEffect blocks" },
  },
  create(context: RuleContext) {
    const opts = (context.options[0] as Options | undefined) ?? {};
    const threshold = opts.threshold ?? DEFAULT_THRESHOLDS.fatEffect.warn;
    const errorThreshold = opts.errorThreshold ??
      DEFAULT_THRESHOLDS.fatEffect.error;

    function check(node: Node) {
      // Walks each component as a unit so the aggregator can resolve local
      // useCallback bodies and fold their shape back into the effect's score
      // (otherwise the deps-laundering trick hides complexity). The
      // useCallback map is built once per component, not per effect.
      if (!isReactComponent(node)) {
        return;
      }
      const callbackBodies = collectUseCallbackInlineBodies(node);
      walkComponentBody(node, (n) => {
        if (n.type !== "CallExpression") return true;
        if (!isHookCall(n, "useEffect")) return true;
        const score = scoreEffectAggregated(n, callbackBodies);
        if (score.total < threshold) return true;
        const breakdown = `deps=${score.deps} branches=${score.branches} ` +
          `setStates=${score.setStateCount} nested=${score.nestedEffects}` +
          (score.hasSubscriptionLike && !score.hasCleanup
            ? " missing-cleanup"
            : "") +
          (score.aggregatedFrom
            ? ` aggregated-from=${score.aggregatedFrom}`
            : "");
        const severity = score.total >= errorThreshold ? "error" : "warn";
        context.report({
          message: `useEffect entropy ${
            score.total.toFixed(
              1,
            )
          } ≥ ${threshold} (${breakdown})`,
          node: n,
          severity,
        });
        return true;
      });
    }

    return {
      FunctionDeclaration: check,
      VariableDeclaration: check,
    };
  },
};
