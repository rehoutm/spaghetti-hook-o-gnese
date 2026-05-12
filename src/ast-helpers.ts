export type Node = { type: string; [k: string]: unknown };

const HOOK_RE = /^use[A-Z]/;

export function getHookName(node: Node): string | null {
  if (node.type !== "CallExpression") return null;
  const callee = node.callee as Node;
  if (callee?.type !== "Identifier") return null;
  const name = callee.name as string;
  return HOOK_RE.test(name) ? name : null;
}

export function isHookCall(node: Node, expected: string): boolean {
  return getHookName(node) === expected;
}

export function isReactComponent(node: Node): boolean {
  if (node.type === "FunctionDeclaration") {
    const id = node.id as Node | undefined;
    const name = id?.name as string | undefined;
    if (!name || !/^[A-Z]/.test(name)) return false;
    return findReturnsJSX(node);
  }
  if (node.type === "VariableDeclaration") {
    const decls = node.declarations as Node[] | undefined;
    const decl = decls?.[0];
    const declId = decl?.id as Node | undefined;
    const name = declId?.name as string | undefined;
    const init = decl?.init as Node | undefined;
    if (!name || !/^[A-Z]/.test(name) || !init) return false;
    if (
      init.type === "ArrowFunctionExpression" ||
      init.type === "FunctionExpression"
    ) {
      return findReturnsJSX(init);
    }
  }
  return false;
}

export function findReturnsJSX(node: Node): boolean {
  let found = false;
  walk(node, (n) => {
    if (
      n.type === "JSXElement" ||
      n.type === "JSXFragment" ||
      n.type === "JSXSelfClosingElement"
    ) {
      found = true;
      return false;
    }
    return true;
  });
  return found;
}

/**
 * Walks `root` but stops descending into nested React components. The root
 * itself is always visited; any *other* node that `isReactComponent()` accepts
 * is treated as a scope boundary so its hooks are not folded into the parent
 * component's score.
 */
export function walkComponentBody(
  root: Node,
  visit: (n: Node) => boolean | void,
): void {
  walk(root, (n) => {
    if (n !== root && isReactComponent(n)) return false;
    return visit(n);
  });
}

export function walk(
  node: Node,
  visit: (n: Node) => boolean | void,
  seen: WeakSet<Node> = new WeakSet(),
): void {
  if (seen.has(node)) return;
  seen.add(node);
  const cont = visit(node);
  if (cont === false) return;
  for (const key in node) {
    if (key === "parent") continue;
    const val = node[key];
    if (Array.isArray(val)) {
      for (const child of val) {
        if (child && typeof child === "object" && "type" in child) {
          walk(child as Node, visit, seen);
        }
      }
    } else if (val && typeof val === "object" && "type" in val) {
      walk(val as Node, visit, seen);
    }
  }
}
