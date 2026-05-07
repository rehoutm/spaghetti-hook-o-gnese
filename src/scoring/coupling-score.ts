import { isHookCall, walk } from "../ast-helpers.ts";

type Node = { type: string; [k: string]: unknown };

export interface CouplingScore {
  total: number;
  readWriteSame: Array<{ state: string; effect: Node }>;
}

export function scoreCoupling(componentNode: Node): CouplingScore {
  const stateBySetter = new Map<string, string>();
  walk(componentNode, (n) => {
    if (n.type === "VariableDeclarator") {
      const init = (n as any).init as Node | undefined;
      const id = (n as any).id as Node | undefined;
      if (
        init?.type === "CallExpression" &&
        isHookCall(init, "useState") &&
        id?.type === "ArrayPattern"
      ) {
        const els = (id as any).elements as Node[];
        const stateId = els?.[0];
        const setterId = els?.[1];
        if (stateId?.type === "Identifier" && setterId?.type === "Identifier") {
          stateBySetter.set(
            (setterId as any).name as string,
            (stateId as any).name as string,
          );
        }
      }
    }
    return true;
  });

  const readWriteSame: Array<{ state: string; effect: Node }> = [];
  let total = 0;

  walk(componentNode, (n) => {
    if (n.type === "CallExpression" && isHookCall(n, "useEffect")) {
      const effectFn = ((n as any).arguments as Node[])?.[0];
      if (!effectFn) return true;

      const stateRefs = new Set<string>();
      const stateWrites = new Set<string>();
      const stateNames = new Set(stateBySetter.values());

      walk(effectFn, (m) => {
        if (m.type === "Identifier") {
          const name = (m as any).name as string;
          if (stateNames.has(name)) stateRefs.add(name);
        }
        if (m.type === "CallExpression") {
          const callee = (m as any).callee as Node;
          if (callee?.type === "Identifier") {
            const setter = (callee as any).name as string;
            const stateName = stateBySetter.get(setter);
            if (stateName) stateWrites.add(stateName);
          }
        }
        return true;
      });

      for (const written of stateWrites) {
        if (stateRefs.has(written)) {
          readWriteSame.push({ state: written, effect: n });
          total += 3;
        }
      }
    }
    return true;
  });

  return { total, readWriteSame };
}
