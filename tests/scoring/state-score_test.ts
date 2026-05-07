// tests/scoring/state-score_test.ts
import { assert, assertEquals } from "@std/assert";
import { parseSync } from "oxc-parser";
import { scoreComponentState } from "../../src/scoring/state-score.ts";

function parseComponent(code: string) {
  const ast = parseSync("t.tsx", code, { lang: "tsx", sourceType: "module" })
    .program;
  return (ast as any).body.find((n: any) => {
    if (n.type === "FunctionDeclaration" || n.type === "VariableDeclaration") {
      return true;
    }
    if (n.type === "ExportNamedDeclaration") {
      const decl = n.declaration;
      if (
        decl?.type === "FunctionDeclaration" ||
        decl?.type === "VariableDeclaration"
      ) {
        return true;
      }
    }
    return false;
  })?.declaration || (ast as any).body.find((n: any) =>
    n.type === "FunctionDeclaration" || n.type === "VariableDeclaration"
  );
}

Deno.test("scoreComponentState: counts useState calls", () => {
  const cmp = parseComponent(
    `function Foo() {
      const [a, setA] = useState(0);
      const [b, setB] = useState(0);
      return <div />;
    }`,
  );
  assertEquals(scoreComponentState(cmp).useStateCount, 2);
});

Deno.test("scoreComponentState: detects correlated setters in same handler", () => {
  const cmp = parseComponent(
    `function Foo() {
      const [a, setA] = useState(0);
      const [b, setB] = useState(0);
      function reset() { setA(0); setB(0); }
      return <div />;
    }`,
  );
  assert(scoreComponentState(cmp).correlatedSetters >= 2);
});

Deno.test("scoreComponentState: scatter fixture exceeds threshold", async () => {
  const src = await Deno.readTextFile("tests/fixtures/state-scatter.tsx");
  const cmp = parseComponent(src);
  assert(scoreComponentState(cmp).total > 5);
});
