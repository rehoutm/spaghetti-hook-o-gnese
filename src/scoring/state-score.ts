import { isHookCall, walk } from "../ast-helpers.ts";

type Node = { type: string; [k: string]: unknown };

export interface StateScore {
  useStateCount: number;
  correlatedSetters: number;
  total: number;
}

export function scoreComponentState(componentNode: Node): StateScore {
  const setterNames = new Set<string>();
  let useStateCount = 0;

  // First pass: collect useState setters
  walk(componentNode, (n) => {
    if (!n) return true;
    if (n.type === "VariableDeclarator") {
      const init = (n as any).init as Node | undefined;
      const id = (n as any).id as Node | undefined;
      if (
        init?.type === "CallExpression" &&
        isHookCall(init, "useState") &&
        id?.type === "ArrayPattern"
      ) {
        useStateCount++;
        const els = (id as any).elements as Node[];
        const setter = els?.[1];
        if (setter?.type === "Identifier") {
          setterNames.add((setter as any).name as string);
        }
      }
    }
    return true;
  });

  // Second pass: count correlated setters
  let correlatedSetters = 0;
  walk(componentNode, (n) => {
    if (!n) return true;
    if (
      n.type === "FunctionDeclaration" ||
      n.type === "FunctionExpression" ||
      n.type === "ArrowFunctionExpression"
    ) {
      const calledSetters = new Set<string>();
      walk(n, (m) => {
        if (!m) return true;
        if (m.type === "CallExpression") {
          const callee = (m as any).callee as Node;
          if (callee?.type === "Identifier") {
            const name = (callee as any).name as string;
            if (setterNames.has(name)) calledSetters.add(name);
          }
        }
        return true;
      });
      if (calledSetters.size >= 2) correlatedSetters += calledSetters.size;
    }
    return true;
  });

  const total = useStateCount + correlatedSetters * 0.5;
  return { useStateCount, correlatedSetters, total };
}
