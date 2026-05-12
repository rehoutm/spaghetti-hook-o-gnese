// tests/rules/no-fat-effects_test.ts
import { assert, assertEquals } from "@std/assert";
import { parseSync } from "oxc-parser";
import { noFatEffects } from "../../src/rules/no-fat-effects.ts";

interface Diag {
  message: string;
  node: any;
}

export function runRule(
  rule: any,
  code: string,
  options: unknown[] = [],
): Diag[] {
  const diags: Diag[] = [];
  const context = {
    options,
    filename: "t.tsx",
    cwd: Deno.cwd(),
    report: (d: Diag) => diags.push(d),
  };
  const handlers = rule.create(context);
  const ast = parseSync("t.tsx", code, { lang: "tsx", sourceType: "module" })
    .program;
  function walk(n: any) {
    if (!n || typeof n !== "object") return;
    const v = handlers[n.type];
    if (v) v(n);
    for (const k in n) {
      const x = n[k];
      if (Array.isArray(x)) x.forEach(walk);
      else if (x && typeof x === "object") walk(x);
    }
    const e = handlers[`${n.type}:exit`];
    if (e) e(n);
  }
  walk(ast);
  return diags;
}

Deno.test("no-fat-effects: clean effect produces no diagnostic", () => {
  const diags = runRule(
    noFatEffects,
    `function Foo() { useEffect(() => { setX(1); }, [x]); return <div />; }`,
  );
  assertEquals(diags.length, 0);
});

Deno.test("no-fat-effects: fat effect over warn threshold reports", async () => {
  const src = await Deno.readTextFile("tests/fixtures/fat-effect.tsx");
  const diags = runRule(noFatEffects, src);
  assert(diags.length >= 1);
  assert(diags[0].message.includes("entropy"));
});

Deno.test("no-fat-effects: custom threshold via options", () => {
  const code =
    `function Foo() { useEffect(() => { if (a) setX(1); }, [a, b]); return <div />; }`;
  const diags = runRule(noFatEffects, code, [{ threshold: 1 }]);
  assert(diags.length >= 1);
});

Deno.test("no-fat-effects: aggregates passthrough useCallback body", () => {
  // The effect itself is trivial — but it passes through a useCallback whose
  // body is fat. Aggregated score must cross the threshold; without
  // aggregation it would slip through.
  const code = `function Foo({ a, b, c, d }) {
    const doIt = useCallback(() => {
      if (a) setX(1);
      if (b) setY(2);
      if (c) setZ(3);
      addEventListener('click', () => {});
    }, [a, b, c, d]);
    useEffect(() => doIt(), [doIt]);
    return <div />;
  }`;
  const diags = runRule(noFatEffects, code);
  assert(
    diags.length >= 1,
    `expected aggregated effect to fire, got ${diags.length}`,
  );
  assert(
    diags[0].message.includes("aggregated-from=doIt"),
    `expected aggregated-from in message, got: ${diags[0].message}`,
  );
});

Deno.test("no-fat-effects: no aggregation when callback resolved outside component", () => {
  // doIt is a named import / outer binding — we can't see its body, so we
  // don't add anything. The trivial passthrough effect stays clean.
  const code = `function Foo({ doIt }) {
    useEffect(() => doIt(), [doIt]);
    return <div />;
  }`;
  const diags = runRule(noFatEffects, code);
  assertEquals(diags.length, 0);
});
