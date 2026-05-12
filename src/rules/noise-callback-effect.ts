import { scoreNoiseCallback } from "../scoring/noise-callback-score.ts";
import { isReactComponent } from "../ast-helpers.ts";
import type { RuleContext } from "./types.ts";

export const noiseCallbackEffect = {
  meta: {
    type: "problem" as const,
    docs: {
      description:
        "Flag useCallback whose only use-site is a passthrough useEffect (laundered deps)",
    },
  },
  create(context: RuleContext) {
    function check(node: any) {
      if (!isReactComponent(node)) return;
      const findings = scoreNoiseCallback(node);
      for (const f of findings) {
        context.report({
          message:
            `useCallback '${f.callbackName}' is only consumed by a passthrough useEffect; inline it or extract a pure helper outside the component`,
          node: f.effectNode,
          severity: "warn",
        });
      }
    }
    return {
      FunctionDeclaration: check,
      VariableDeclaration: check,
    };
  },
};
