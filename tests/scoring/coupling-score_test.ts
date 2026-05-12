// deno-lint-ignore-file no-explicit-any
// tests/scoring/coupling-score_test.ts
import { assert, assertEquals } from "@std/assert";
import { parseSync } from "oxc-parser";
import { scoreCoupling } from "../../src/scoring/coupling-score.ts";

function parseComponent(code: string) {
  const ast = parseSync("t.tsx", code, { lang: "tsx", sourceType: "module" })
    .program;
  return (ast as any).body.find((n: any) => n.type === "FunctionDeclaration");
}

Deno.test("coupling: effect that reads+writes same state scores", () => {
  const cmp = parseComponent(
    `function Foo() {
      const [count, setCount] = useState(0);
      useEffect(() => { if (count > 0) setCount(count + 1); }, [count]);
      return <div />;
    }`,
  );
  const s = scoreCoupling(cmp);
  assert(s.total >= 3);
  assertEquals(s.readWriteSame.length, 1);
});

Deno.test("coupling: effect that only writes scores 0", () => {
  const cmp = parseComponent(
    `function Foo() {
      const [c, setC] = useState(0);
      useEffect(() => { setC(0); }, []);
      return <div />;
    }`,
  );
  assertEquals(scoreCoupling(cmp).total, 0);
});
