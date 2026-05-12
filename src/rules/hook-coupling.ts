import { scoreCoupling } from "../scoring/coupling-score.ts";
import { DEFAULT_THRESHOLDS } from "../scoring/thresholds.ts";
import { isReactComponent, type Node } from "../ast-helpers.ts";
import type { RuleContext } from "./types.ts";

interface Options {
  threshold?: number;
  errorThreshold?: number;
}

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
    const errorThreshold = opts.errorThreshold ??
      DEFAULT_THRESHOLDS.hookCoupling.error;
    function check(node: Node) {
      if (!isReactComponent(node)) return;
      const s = scoreCoupling(node);
      if (s.total < threshold) return;
      const severity = s.total >= errorThreshold ? "error" : "warn";
      for (const v of s.readWriteSame) {
        context.report({
          message:
            `useEffect reads + writes same state '${v.state}' (loop risk)`,
          node: v.effect,
          severity,
        });
      }
      for (const r of s.refAsState) {
        context.report({
          message:
            `useEffect reads + writes '${r.ref}.current' — useRef is doing useState's job without React noticing. Use useState (or a useReducer slot) if the value drives render.`,
          node: r.effect,
          severity,
        });
      }
      for (const c of s.depClusters) {
        if (c.members.length < 3) continue;
        context.report({
          message:
            `${c.members.length} hooks share the same deps [${c.fingerprint}] — they were probably one tangle split for cosmetic reasons. Collapse them or co-locate the state they actually depend on.`,
          node: c.members[0],
          severity,
        });
      }
    }
    return { FunctionDeclaration: check, VariableDeclaration: check };
  },
};
