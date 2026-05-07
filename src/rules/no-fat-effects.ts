import { scoreEffect } from "../scoring/effect-score.ts";
import { DEFAULT_THRESHOLDS } from "../scoring/thresholds.ts";
import { isHookCall } from "../ast-helpers.ts";

interface Options { threshold?: number; errorThreshold?: number }

export interface RuleContext {
  options: unknown[];
  filename?: string;
  cwd?: string;
  report: (d: {
    message: string;
    node: unknown;
    severity?: "warn" | "error";
  }) => void;
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
          const severity = score.total >= errorThreshold ? "error" : "warn";
          context.report({
            message:
              `useEffect entropy ${score.total.toFixed(1)} ≥ ${threshold} (${breakdown})`,
            node,
            severity,
          });
        }
      },
    };
  },
};
