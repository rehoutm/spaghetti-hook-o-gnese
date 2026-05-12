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

Deno.test("hook-coupling: useRef-as-state fires", () => {
  const diags = runRule(
    hookCoupling,
    `function Foo() {
      const r = useRef(0);
      useEffect(() => {
        if (r.current > 3) return;
        r.current = r.current + 1;
      }, []);
      return <div />;
    }`,
  );
  assert(diags.length >= 1, "expected refAsState diagnostic");
  assert(
    diags[0].message.includes("r.current"),
    `expected ref name in message, got: ${diags[0].message}`,
  );
});

Deno.test("hook-coupling: latest-ref pattern stays clean", () => {
  const diags = runRule(
    hookCoupling,
    `function Foo({ cb }) {
      const cbRef = useRef(cb);
      useEffect(() => { cbRef.current = cb; }, [cb]);
      useEffect(() => {
        const id = setInterval(() => cbRef.current(), 1000);
        return () => clearInterval(id);
      }, []);
      return <div />;
    }`,
  );
  assertEquals(diags.length, 0);
});

Deno.test("hook-coupling: ref-as-state fixture fires once", async () => {
  const src = await Deno.readTextFile("tests/fixtures/ref-as-state.tsx");
  const diags = runRule(hookCoupling, src);
  // RetryThing fires; LatestCallback must not.
  assertEquals(diags.length, 1);
  assert(diags[0].message.includes("attemptsRef.current"));
});

Deno.test("hook-coupling: dep-cluster of 5 fires", async () => {
  const src = await Deno.readTextFile("tests/fixtures/dep-cluster.tsx");
  const diags = runRule(hookCoupling, src);
  assert(diags.length >= 1, "expected dep-cluster diagnostic");
  const m = diags.find((d) => d.message.includes("share the same deps"));
  assert(m, "expected a share-the-same-deps diagnostic");
  assert(
    m!.message.includes("[filters,query,sortKey]"),
    `expected normalized fingerprint, got: ${m!.message}`,
  );
});

Deno.test("hook-coupling: two hooks sharing deps stays clean (threshold is 3)", () => {
  const diags = runRule(
    hookCoupling,
    `function Foo({a,b}) {
      useEffect(() => f(a,b), [a,b]);
      const cb = useCallback(() => g(a,b), [a,b]);
      return <div onClick={cb} />;
    }`,
  );
  assertEquals(
    diags.filter((d) => d.message.includes("share the same deps")).length,
    0,
  );
});

Deno.test("hook-coupling: empty deps don't cluster", () => {
  const diags = runRule(
    hookCoupling,
    `function Foo() {
      useEffect(() => f1(), []);
      useEffect(() => f2(), []);
      useEffect(() => f3(), []);
      useEffect(() => f4(), []);
      return <div />;
    }`,
  );
  assertEquals(
    diags.filter((d) => d.message.includes("share the same deps")).length,
    0,
  );
});
