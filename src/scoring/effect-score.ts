import { isHookCall, walk } from "../ast-helpers.ts";
import { passthroughCallTarget } from "./passthrough.ts";

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

export interface AggregatedEffectScore extends EffectScore {
  /** Name of the local useCallback whose body was folded into this score, or null. */
  aggregatedFrom: string | null;
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
  return finalize(deps, scoreFunctionBody(fn));
}

/**
 * Score a useEffect, plus fold in the shape of any local useCallback it
 * passes through. This is the bit that prevents the
 * `useEffect(() => doIt(), [a,b])` + `const doIt = useCallback(..., [a,b])`
 * laundering trick from making fat-effect scores melt to zero.
 *
 * `callbackBodies` is the per-component map of useCallback name → inline
 * body. Build once with `collectUseCallbackInlineBodies` and pass per effect;
 * we used to walk the whole component once per passthrough effect, which got
 * pricey on components with many effects.
 *
 * We do NOT pull in the callback's own deps — those are accounted for by the
 * effect's deps (or, if not, by the no-fat-effects threshold itself once
 * aggregated).
 */
export function scoreEffectAggregated(
  node: Node,
  callbackBodies?: Map<string, Node>,
): AggregatedEffectScore {
  const base = scoreEffect(node);
  const cbName = callbackBodies ? passthroughCallTarget(node) : null;
  const cbBody = cbName ? callbackBodies!.get(cbName) : undefined;
  if (!cbName || !cbBody) {
    return { ...base, aggregatedFrom: null };
  }
  const extra = scoreFunctionBody(cbBody);
  const final = finalize(base.deps, {
    branches: base.branches + extra.branches,
    setStateCount: base.setStateCount + extra.setStateCount,
    nestedEffects: base.nestedEffects + extra.nestedEffects,
    hasCleanup: base.hasCleanup || extra.hasCleanup,
    hasSubscriptionLike: base.hasSubscriptionLike || extra.hasSubscriptionLike,
  });
  return { ...final, aggregatedFrom: cbName };
}

interface ScoreParts {
  branches: number;
  setStateCount: number;
  nestedEffects: number;
  hasCleanup: boolean;
  hasSubscriptionLike: boolean;
}

function scoreFunctionBody(fn: Node | undefined): ScoreParts {
  let branches = 0;
  let setStateCount = 0;
  let nestedEffects = 0;
  let hasCleanup = false;
  let hasSubscriptionLike = false;
  if (!fn) {
    return {
      branches,
      setStateCount,
      nestedEffects,
      hasCleanup,
      hasSubscriptionLike,
    };
  }
  const body = (fn as any).body as Node | undefined;
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
        if (name === "useEffect") nestedEffects++;
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
  return {
    branches,
    setStateCount,
    nestedEffects,
    hasCleanup,
    hasSubscriptionLike,
  };
}

function finalize(deps: number, p: ScoreParts): EffectScore {
  const cleanupPenalty = p.hasSubscriptionLike && !p.hasCleanup ? 3 : 0;
  const total = deps + p.branches * 2 + p.setStateCount * 1.5 +
    p.nestedEffects * 5 + cleanupPenalty;
  return {
    deps,
    branches: p.branches,
    setStateCount: p.setStateCount,
    nestedEffects: p.nestedEffects,
    hasCleanup: p.hasCleanup,
    hasSubscriptionLike: p.hasSubscriptionLike,
    total,
  };
}

/**
 * One walk over the component, returning a map from each local useCallback's
 * declarator name to its inline function body. Callbacks whose first arg
 * isn't an inline function are skipped (can't see the shape, can't score it).
 */
export function collectUseCallbackInlineBodies(
  componentNode: Node,
): Map<string, Node> {
  const out = new Map<string, Node>();
  walk(componentNode, (n) => {
    if (n.type !== "VariableDeclarator") return true;
    const id = (n as any).id as Node | undefined;
    const init = (n as any).init as Node | undefined;
    if (id?.type !== "Identifier") return true;
    if (!init || init.type !== "CallExpression") return true;
    if (!isHookCall(init, "useCallback")) return true;
    const cbArgs = (init as any).arguments as Node[] | undefined;
    const inline = cbArgs?.[0];
    if (
      inline?.type === "ArrowFunctionExpression" ||
      inline?.type === "FunctionExpression"
    ) {
      out.set((id as any).name as string, inline);
    }
    return true;
  });
  return out;
}
