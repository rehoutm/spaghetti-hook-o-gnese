// tests/rules/hook-coupling_test.ts
import { assert, assertEquals } from "@std/assert";
import { hookCoupling } from "../../src/rules/hook-coupling.ts";
import { runRule } from "./no-fat-effects_test.ts";

Deno.test("hook-coupling: clean component", () => {
  const diags = runRule(
    hookCoupling,
    `function Foo() {
      const [c, setC] = useState(0);
      useEffect(() => { setC(0); }, []);
      return <div />;
    }`,
  );
  assertEquals(diags.length, 0);
});

Deno.test("hook-coupling: fixture fires", async () => {
  const src = await Deno.readTextFile("tests/fixtures/coupled-hooks.tsx");
  const diags = runRule(hookCoupling, src);
  assert(diags.length >= 1);
});
