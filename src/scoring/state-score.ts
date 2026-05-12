import { isHookCall, walk } from "../ast-helpers.ts";

type Node = { type: string; [k: string]: unknown };

export interface StateScore {
  useStateCount: number;
  correlatedSetters: number;
  reducerSlots: number;
  total: number;
}

export function scoreComponentState(componentNode: Node): StateScore {
  const setterNames = new Set<string>();
  let useStateCount = 0;
  let reducerSlots = 0;
  let reducerDiscount = 0;

  // First pass: collect useState setters AND analyse useReducer calls.
  walk(componentNode, (n) => {
    if (!n) return true;
    if (n.type !== "VariableDeclarator") return true;
    const init = (n as any).init as Node | undefined;
    const id = (n as any).id as Node | undefined;
    if (!init || init.type !== "CallExpression") return true;

    if (isHookCall(init, "useState") && id?.type === "ArrayPattern") {
      useStateCount++;
      const els = (id as any).elements as Node[];
      const setter = els?.[1];
      if (setter?.type === "Identifier") {
        setterNames.add((setter as any).name as string);
      }
      return true;
    }

    if (isHookCall(init, "useReducer")) {
      const r = scoreReducer(init);
      reducerSlots += r.slots;
      if (r.hasLogicBearingCase) reducerDiscount += 1;
    }
    return true;
  });

  // Second pass: count correlated setters.
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

  const reducerContribution = Math.max(0, reducerSlots - reducerDiscount);
  const total = useStateCount + reducerContribution + correlatedSetters * 0.5;
  return { useStateCount, correlatedSetters, reducerSlots, total };
}

interface ReducerShape {
  slots: number;
  hasLogicBearingCase: boolean;
}

/**
 * Inspect a `useReducer(reducerArg, initialArg)` call.
 *
 * `slots` is the number of top-level fields in the initial-state object
 * literal (zero if it's not an object expression — we don't try to resolve
 * imported initial-state constants).
 *
 * `hasLogicBearingCase` is true when an inline reducer has at least one
 * `case` body that either reads `state.<field>` directly or has its own
 * conditional branching. Pure spread-and-set cases ("setter-shaped") don't
 * count; those are useStates wearing a moustache.
 */
function scoreReducer(useReducerCall: Node): ReducerShape {
  const args = (useReducerCall as any).arguments as Node[] | undefined;
  const reducerArg = args?.[0];
  const initialArg = args?.[1];

  let slots = 0;
  if (initialArg?.type === "ObjectExpression") {
    const props = (initialArg as any).properties as Node[] | undefined;
    if (Array.isArray(props)) {
      slots = props.filter((p) => p.type === "Property").length;
    }
  }

  let hasLogicBearingCase = false;
  if (
    reducerArg &&
    (reducerArg.type === "ArrowFunctionExpression" ||
      reducerArg.type === "FunctionExpression")
  ) {
    const params = (reducerArg as any).params as Node[] | undefined;
    const stateParamName = params?.[0]?.type === "Identifier"
      ? ((params[0] as any).name as string)
      : "state";
    const body = (reducerArg as any).body as Node | undefined;
    if (body) {
      walk(body, (n) => {
        if (n.type !== "SwitchCase") return true;
        const consequent = (n as any).consequent as Node[] | undefined;
        if (!consequent) return true;
        for (const stmt of consequent) {
          if (caseIsLogicBearing(stmt, stateParamName)) {
            hasLogicBearingCase = true;
            break;
          }
        }
        return true;
      });
    }
  }

  return { slots, hasLogicBearingCase };
}

function caseIsLogicBearing(stmt: Node, stateParamName: string): boolean {
  let found = false;
  walk(stmt, (n) => {
    if (found) return false;
    if (n.type === "IfStatement" || n.type === "ConditionalExpression") {
      found = true;
      return false;
    }
    if (n.type === "MemberExpression") {
      const obj = (n as any).object as Node | undefined;
      if (
        obj?.type === "Identifier" &&
        (obj as any).name === stateParamName
      ) {
        // ignore the implicit spread `...state` (SpreadElement wraps it,
        // not a MemberExpression), so any `state.X` reference is real.
        found = true;
        return false;
      }
    }
    return true;
  });
  return found;
}
