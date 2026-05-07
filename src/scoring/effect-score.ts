import { walk } from "../ast-helpers.ts";

type Node = { type: string; [k: string]: unknown };

export interface EffectScore {
  deps: number;
  branches: number;
  setStateCount: number;
  nestedEffects: number;
  hasCleanup: boolean;
  hasSubscriptionLike: boolean;
  total: number;
}

const SET_STATE_RE = /^set[A-Z]/;
const BRANCH_TYPES = new Set([
  "IfStatement",
  "ConditionalExpression",
  "SwitchCase",
  "LogicalExpression",
]);

export function scoreEffect(node: Node): EffectScore {
  const args = (node as any).arguments as Node[];
  const fn = args?.[0] as Node | undefined;
  const depsArr = args?.[1] as any;

  const deps = Array.isArray(depsArr?.elements) ? depsArr.elements.length : 0;
  let branches = 0;
  let setStateCount = 0;
  let nestedEffects = 0;
  let hasCleanup = false;
  let hasSubscriptionLike = false;

  if (fn) {
    const body = (fn as any).body as Node;
    if (body?.type === "BlockStatement") {
      for (const stmt of (body as any).body as Node[]) {
        if (stmt.type === "ReturnStatement") {
          const arg = (stmt as any).argument as Node | undefined;
          if (
            arg &&
            (arg.type === "ArrowFunctionExpression" ||
              arg.type === "FunctionExpression")
          ) hasCleanup = true;
        }
      }
    }

    walk(fn, (n) => {
      if (BRANCH_TYPES.has(n.type)) branches++;
      if (n.type === "CallExpression") {
        const callee = (n as any).callee as Node;
        if (callee?.type === "Identifier") {
          const name = (callee as any).name as string;
          if (SET_STATE_RE.test(name)) setStateCount++;
          if (name === "useEffect" && n !== node) nestedEffects++;
          if (
            name === "addEventListener" ||
            name === "subscribe" ||
            name === "setInterval" ||
            name === "setTimeout"
          ) hasSubscriptionLike = true;
        }
        if (callee?.type === "MemberExpression") {
          const prop = (callee as any).property as Node;
          if (prop?.type === "Identifier") {
            const name = (prop as any).name as string;
            if (
              name === "addEventListener" ||
              name === "subscribe" ||
              name === "on"
            ) hasSubscriptionLike = true;
          }
        }
      }
      return true;
    });
  }

  const cleanupPenalty = hasSubscriptionLike && !hasCleanup ? 3 : 0;
  const total = deps + branches * 2 + setStateCount * 1.5 +
    nestedEffects * 5 + cleanupPenalty;

  return {
    deps,
    branches,
    setStateCount,
    nestedEffects,
    hasCleanup,
    hasSubscriptionLike,
    total,
  };
}
