import { assert, assertEquals } from "@std/assert";
import { parseSync } from "oxc-parser";
import { customHookDepth } from "../../src/rules/custom-hook-depth.ts";

function runRuleOnFile(
  rule: any,
  filename: string,
  options: unknown[] = [],
): any[] {
  const code = Deno.readTextFileSync(filename);
  const diags: any[] = [];
  const handlers = rule.create({
    options,
    filename,
    cwd: Deno.cwd(),
    report: (d: any) => diags.push(d),
  });
  const ast = parseSync(filename, code, { lang: "tsx", sourceType: "module" })
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
  }
  walk(ast);
  return diags;
}

Deno.test("custom-hook-depth: deep custom hook fires", () => {
  const diags = runRuleOnFile(
    customHookDepth,
    "tests/fixtures/deep-custom-hook.tsx",
    [{ maxDepth: 2 }],
  );
  assert(
    diags.length >= 1,
    `expected diagnostic, got ${JSON.stringify(diags)}`,
  );
  assert(diags[0].message.includes("depth"));
});

Deno.test("custom-hook-depth: clean component does not fire", () => {
  const diags = runRuleOnFile(
    customHookDepth,
    "tests/fixtures/clean.tsx",
    [{ maxDepth: 2 }],
  );
  assertEquals(diags.length, 0);
});
