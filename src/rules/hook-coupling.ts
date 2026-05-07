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
