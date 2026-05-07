// tests/rules/state-scatter_test.ts
import { assert, assertEquals } from "@std/assert";
import { stateScatter } from "../../src/rules/state-scatter.ts";
import { runRule } from "./no-fat-effects_test.ts";

Deno.test("state-scatter: small component clean", () => {
  const diags = runRule(
    stateScatter,
    `function Foo() {
      const [a, setA] = useState(0);
      return <div />;
    }`,
  );
  assertEquals(diags.length, 0);
});

Deno.test("state-scatter: 8-state form fires", async () => {
  const src = await Deno.readTextFile("tests/fixtures/state-scatter.tsx");
  const diags = runRule(stateScatter, src);
  assert(diags.length >= 1);
});
