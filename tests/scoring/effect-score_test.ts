// tests/scoring/effect-score_test.ts
import { assert, assertEquals } from "@std/assert";
import { parseSync } from "oxc-parser";
import { scoreEffect } from "../../src/scoring/effect-score.ts";

function getFirstUseEffect(code: string): any {
  const ast = parseSync("t.tsx", code, { lang: "tsx", sourceType: "module" })
    .program;
  let found: any = null;
  function walk(n: any) {
    if (!n || typeof n !== "object" || found) return;
    if (
      n.type === "CallExpression" &&
      n.callee?.type === "Identifier" &&
      n.callee.name === "useEffect"
    ) {
      found = n;
      return;
    }
    for (const k in n) {
      const v = n[k];
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") walk(v);
    }
  }
  walk(ast);
  return found;
}

Deno.test("scoreEffect: empty effect = 0", () => {
  const node = getFirstUseEffect(`useEffect(() => {}, [])`);
  assertEquals(scoreEffect(node).total, 0);
});

Deno.test("scoreEffect: counts deps", () => {
  const node = getFirstUseEffect(`useEffect(() => {}, [a, b, c])`);
  assertEquals(scoreEffect(node).deps, 3);
});

Deno.test("scoreEffect: branches contribute", () => {
  const node = getFirstUseEffect(
    `useEffect(() => { if (a) {} else if (b) {} }, [a, b])`,
  );
  assertEquals(scoreEffect(node).branches, 2);
});

Deno.test("scoreEffect: setState count", () => {
  const node = getFirstUseEffect(
    `useEffect(() => { setA(1); setB(2); }, [])`,
  );
  assertEquals(scoreEffect(node).setStateCount, 2);
});

Deno.test("scoreEffect: nested useEffect", () => {
  const node = getFirstUseEffect(
    `useEffect(() => { useEffect(() => {}, []); }, [])`,
  );
  assertEquals(scoreEffect(node).nestedEffects, 1);
});

Deno.test("scoreEffect: fat-effect fixture exceeds warn threshold", async () => {
  const src = await Deno.readTextFile("tests/fixtures/fat-effect.tsx");
  const node = getFirstUseEffect(src);
  const s = scoreEffect(node);
  assert(s.total > 10, `expected > 10, got ${s.total}`);
});
