import { getHookName, isHookCall, walk } from "../ast-helpers.ts";

type Node = { type: string; [k: string]: unknown };

export interface DepCluster {
  /**
   * Sorted, deduped identifier names joined with ",". Empty dep arrays are
   * skipped before they reach this point — they aren't a cluster signal — so
   * a `DepCluster` instance always has a non-empty fingerprint.
   */
  fingerprint: string;
  /** Each member is a hook call (useEffect/useCallback/useMemo/…). */
  members: Node[];
}

export interface CouplingScore {
  total: number;
  readWriteSame: Array<{ state: string; effect: Node }>;
  refAsState: Array<{ ref: string; effect: Node }>;
  depClusters: DepCluster[];
}

export function scoreCoupling(componentNode: Node): CouplingScore {
  const stateBySetter = new Map<string, string>();
  const refNames = new Set<string>();
  walk(componentNode, (n) => {
    if (n.type === "VariableDeclarator") {
      const init = n.init as Node | undefined;
      const id = n.id as Node | undefined;
      if (init?.type !== "CallExpression") return true;
      if (
        isHookCall(init, "useState") &&
        id?.type === "ArrayPattern"
      ) {
        const els = id.elements as Node[];
        const stateId = els?.[0];
        const setterId = els?.[1];
        if (stateId?.type === "Identifier" && setterId?.type === "Identifier") {
          stateBySetter.set(
            setterId.name as string,
            stateId.name as string,
          );
        }
      }
      if (isHookCall(init, "useRef") && id?.type === "Identifier") {
        refNames.add(id.name as string);
      }
    }
    return true;
  });

  const readWriteSame: Array<{ state: string; effect: Node }> = [];
  const refAsState: Array<{ ref: string; effect: Node }> = [];
  let total = 0;

  walk(componentNode, (n) => {
    if (n.type === "CallExpression" && isHookCall(n, "useEffect")) {
      const effectFn = (n.arguments as Node[])?.[0];
      if (!effectFn) return true;

      const stateRefs = new Set<string>();
      const stateWrites = new Set<string>();
      const stateNames = new Set(stateBySetter.values());

      // ref.current read/write tracking inside this effect.
      // Track LHS member nodes separately so we don't double-count
      // `ref.current = x` as a read.
      const refReads = new Set<string>();
      const refWrites = new Set<string>();
      const lhsMembers = new WeakSet<Node>();

      walk(effectFn, (m) => {
        if (m.type === "Identifier") {
          const name = m.name as string;
          if (stateNames.has(name)) stateRefs.add(name);
        }
        if (m.type === "CallExpression") {
          const callee = m.callee as Node;
          if (callee?.type === "Identifier") {
            const setter = callee.name as string;
            const stateName = stateBySetter.get(setter);
            if (stateName) stateWrites.add(stateName);
          }
        }
        if (m.type === "AssignmentExpression") {
          const left = m.left as Node | undefined;
          if (left?.type === "MemberExpression") {
            lhsMembers.add(left);
            const refName = refCurrentName(left);
            if (refName && refNames.has(refName)) {
              refWrites.add(refName);
            }
          }
        }
        if (m.type === "MemberExpression" && !lhsMembers.has(m)) {
          const refName = refCurrentName(m);
          if (refName && refNames.has(refName)) {
            refReads.add(refName);
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

      // useRef-as-state: same ref read AND written inside the same effect.
      // Reads-only is fine (imperative handle); writes-only is fine (latest-ref
      // pattern). Both together means the ref is doing state's job with the
      // dependency tracking stripped off.
      for (const refName of refWrites) {
        if (refReads.has(refName)) {
          refAsState.push({ ref: refName, effect: n });
          total += 3;
        }
      }
    }
    return true;
  });

  const depClusters = collectDepClusters(componentNode);
  // Each cluster of ≥3 hooks sharing the same non-empty dep fingerprint is
  // strong evidence the work was split for cosmetic reasons — the original
  // tangle of state still binds them together.
  for (const c of depClusters) {
    if (c.members.length >= 3) total += c.members.length;
  }

  return { total, readWriteSame, refAsState, depClusters };
}

const DEPS_HOOKS = new Set([
  "useEffect",
  "useLayoutEffect",
  "useCallback",
  "useMemo",
  "useImperativeHandle",
]);

function collectDepClusters(componentNode: Node): DepCluster[] {
  const byFingerprint = new Map<string, Node[]>();
  walk(componentNode, (n) => {
    if (n.type !== "CallExpression") return true;
    const hook = getHookName(n);
    if (!hook || !DEPS_HOOKS.has(hook)) return true;
    const args = n.arguments as Node[] | undefined;
    // useImperativeHandle's deps is arg[2]; the rest use arg[1].
    const depsArg = hook === "useImperativeHandle" ? args?.[2] : args?.[1];
    if (depsArg?.type !== "ArrayExpression") return true;
    const fp = fingerprintDeps(depsArg);
    if (fp === null) return true; // skip non-identifier-only dep arrays
    if (fp === "") return true; // empty deps `[]` aren't a cluster signal
    const list = byFingerprint.get(fp) ?? [];
    list.push(n);
    byFingerprint.set(fp, list);
    return true;
  });
  const out: DepCluster[] = [];
  for (const [fingerprint, members] of byFingerprint) {
    out.push({ fingerprint, members });
  }
  return out;
}

/**
 * Normalize a dep array to a canonical string. Identifier-only deps sort to a
 * stable key. If any element is non-identifier (member expression, call, …),
 * return null — we can't fingerprint reliably without scope analysis.
 */
function fingerprintDeps(depsArr: Node): string | null {
  const elements = depsArr.elements as Array<Node | null> | undefined;
  if (!elements) return null;
  const names: string[] = [];
  for (const el of elements) {
    if (!el) continue;
    if (el.type !== "Identifier") return null;
    names.push(el.name as string);
  }
  return [...new Set(names)].sort().join(",");
}

/**
 * If `node` is a `<ident>.current` MemberExpression (not computed), return
 * `<ident>`'s name. Otherwise return null.
 */
function refCurrentName(node: Node): string | null {
  if (node.type !== "MemberExpression") return null;
  if (node.computed) return null;
  const obj = node.object as Node | undefined;
  const prop = node.property as Node | undefined;
  if (obj?.type !== "Identifier") return null;
  if (prop?.type !== "Identifier") return null;
  if (prop.name !== "current") return null;
  return obj.name as string;
}
