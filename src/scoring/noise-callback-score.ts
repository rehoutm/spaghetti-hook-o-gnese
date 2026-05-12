import { isHookCall, walk, walkComponentBody } from "../ast-helpers.ts";
import { passthroughCallTarget } from "./passthrough.ts";

type Node = { type: string; [k: string]: unknown };

export interface NoiseCallbackFinding {
  callbackName: string;
  callbackNode: Node;
  effectNode: Node;
}

/**
 * Identifies useCallback declarations whose only consumer is a useEffect
 * whose body does nothing but invoke that callback. This is "laundering":
 * the deps cluster moves from useEffect into useCallback, the per-effect
 * complexity score drops, but the aggregate hook complexity is unchanged.
 *
 * Strategy: one walk over the component collects useCallbacks (name →
 * declarator), passthrough effects (name → effectNode), and a global
 * identifier-ref count per name. For each passthrough effect we do one small
 * walk over JUST that effect's subtree to subtract refs that live inside it
 * (the passthrough body itself and the dep-array entry don't count as
 * "consumed elsewhere"). Total cost: 1 component walk + P passthrough-effect
 * walks. The previous shape did K+2 full-component walks for K useCallbacks.
 */
export function scoreNoiseCallback(
  componentNode: Node,
): NoiseCallbackFinding[] {
  const declByName = new Map<string, Node>();
  const declIdNodes = new WeakSet<Node>();
  const passthroughByName = new Map<string, Node>();
  const refCounts = new Map<string, number>();

  walkComponentBody(componentNode, (n) => {
    if (n.type === "VariableDeclarator") {
      const init = n.init as Node | undefined;
      const id = n.id as Node | undefined;
      if (
        init?.type === "CallExpression" &&
        isHookCall(init, "useCallback") &&
        id?.type === "Identifier"
      ) {
        declByName.set(id.name as string, n);
        declIdNodes.add(id);
      }
    }
    if (n.type === "CallExpression" && isHookCall(n, "useEffect")) {
      const target = passthroughCallTarget(n);
      if (target) passthroughByName.set(target, n);
    }
    if (n.type === "Identifier" && !declIdNodes.has(n)) {
      const name = n.name as string;
      refCounts.set(name, (refCounts.get(name) ?? 0) + 1);
    }
    return true;
  });

  const findings: NoiseCallbackFinding[] = [];
  for (const [name, effectNode] of passthroughByName) {
    const decl = declByName.get(name);
    if (!decl) continue;
    let insideRefs = 0;
    walk(effectNode, (m) => {
      if (m.type === "Identifier" && m.name === name) insideRefs++;
      return true;
    });
    if ((refCounts.get(name) ?? 0) - insideRefs === 0) {
      findings.push({ callbackName: name, callbackNode: decl, effectNode });
    }
  }
  return findings;
}
