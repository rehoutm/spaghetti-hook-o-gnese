type Node = { type: string; [k: string]: unknown };

const HOOK_RE = /^use[A-Z]/;

export function getHookName(node: Node): string | null {
  if (node.type !== "CallExpression") return null;
  const callee = (node as any).callee as Node;
  if (callee?.type !== "Identifier") return null;
  const name = (callee as any).name as string;
  return HOOK_RE.test(name) ? name : null;
}

export function isHookCall(node: Node, expected: string): boolean {
  return getHookName(node) === expected;
}

export function isReactComponent(node: Node): boolean {
  if (node.type === "FunctionDeclaration") {
    const name = (node as any).id?.name as string | undefined;
    if (!name || !/^[A-Z]/.test(name)) return false;
    return findReturnsJSX(node);
  }
  if (node.type === "VariableDeclaration") {
    const decl = (node as any).declarations?.[0];
    const name = decl?.id?.name as string | undefined;
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

export function walk(
  node: Node,
  visit: (n: Node) => boolean | void,
): void {
  const cont = visit(node);
  if (cont === false) return;
  for (const key in node) {
    const val = (node as any)[key];
    if (Array.isArray(val)) {
      for (const child of val) {
        if (child && typeof child === "object" && "type" in child) {
          walk(child as Node, visit);
        }
      }
    } else if (val && typeof val === "object" && "type" in val) {
      walk(val as Node, visit);
    }
  }
}
