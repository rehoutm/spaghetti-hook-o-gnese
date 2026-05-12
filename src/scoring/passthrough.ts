type Node = { type: string; [k: string]: unknown };

/**
 * If the useEffect's effect-fn body is one of:
 *   () => cb()
 *   () => { cb(); }
 *   () => { return cb(); }
 * return the callee identifier name. Otherwise return null.
 *
 * Shared between `noise-callback-score` (for direct flagging) and
 * `no-fat-effects` (for aggregating the callback's score back into the
 * effect's, so deps-laundering doesn't hide complexity).
 */
export function passthroughCallTarget(useEffectCall: Node): string | null {
  const args = (useEffectCall as any).arguments as Node[] | undefined;
  const fn = args?.[0] as Node | undefined;
  if (!fn) return null;
  if (
    fn.type !== "ArrowFunctionExpression" &&
    fn.type !== "FunctionExpression"
  ) {
    return null;
  }
  const body = (fn as any).body as Node | undefined;
  if (!body) return null;

  // Expression-bodied arrow: () => cb()
  if (body.type === "CallExpression") {
    return calleeIdentName(body);
  }

  if (body.type !== "BlockStatement") return null;
  const stmts = (body as any).body as Node[];
  if (stmts.length !== 1) return null;
  const stmt = stmts[0];

  if (stmt.type === "ExpressionStatement") {
    const expr = (stmt as any).expression as Node | undefined;
    if (expr?.type === "CallExpression") return calleeIdentName(expr);
  }
  if (stmt.type === "ReturnStatement") {
    const arg = (stmt as any).argument as Node | undefined;
    if (arg?.type === "CallExpression") return calleeIdentName(arg);
  }
  return null;
}

function calleeIdentName(call: Node): string | null {
  const callee = (call as any).callee as Node | undefined;
  if (callee?.type !== "Identifier") return null;
  return (callee as any).name as string;
}
