// tests/rules/noise-callback-effect_test.ts
import { assert, assertEquals } from "@std/assert";
import { noiseCallbackEffect } from "../../src/rules/noise-callback-effect.ts";
import { runRule } from "./no-fat-effects_test.ts";

Deno.test("noise-callback-effect: passthrough expression-body fires", () => {
  const diags = runRule(
    noiseCallbackEffect,
    `function Foo({ a, b }) {
      const cb = useCallback(() => doThing(a, b), [a, b]);
      useEffect(() => cb(), [cb]);
      return <div />;
    }`,
  );
  assert(diags.length >= 1, "expected at least one diagnostic");
  assert(diags[0].message.includes("cb"));
});

Deno.test("noise-callback-effect: passthrough block-body fires", () => {
  const diags = runRule(
    noiseCallbackEffect,
    `function Foo({ a }) {
      const sync = useCallback(() => { doThing(a); }, [a]);
      useEffect(() => { sync(); }, [sync]);
      return <div />;
    }`,
  );
  assert(diags.length >= 1);
  assert(diags[0].message.includes("sync"));
});

Deno.test("noise-callback-effect: passthrough return-cleanup fires", () => {
  const diags = runRule(
    noiseCallbackEffect,
    `function Foo({ a }) {
      const sync = useCallback(() => () => doCleanup(), [a]);
      useEffect(() => { return sync(); }, [sync]);
      return <div />;
    }`,
  );
  assert(diags.length >= 1);
  assert(diags[0].message.includes("sync"));
});

Deno.test("noise-callback-effect: callback used elsewhere = no diag", () => {
  const diags = runRule(
    noiseCallbackEffect,
    `function Foo({ onClick }) {
      const handleClick = useCallback(() => onClick?.("ok"), [onClick]);
      useEffect(() => { document.title = "hi"; }, []);
      return <button onClick={handleClick} />;
    }`,
  );
  assertEquals(diags.length, 0);
});

Deno.test("noise-callback-effect: passthrough but target is not a useCallback = no diag", () => {
  const diags = runRule(
    noiseCallbackEffect,
    `function Foo() {
      function helper() { doThing(); }
      useEffect(() => helper(), []);
      return <div />;
    }`,
  );
  assertEquals(diags.length, 0);
});

Deno.test("noise-callback-effect: non-passthrough effect (does more than call) = no diag", () => {
  const diags = runRule(
    noiseCallbackEffect,
    `function Foo({ a }) {
      const cb = useCallback(() => doThing(a), [a]);
      useEffect(() => { setX(1); cb(); }, [cb]);
      return <div />;
    }`,
  );
  assertEquals(diags.length, 0);
});

Deno.test("noise-callback-effect: fixture file fires twice (and skips the legit case)", async () => {
  const src = await Deno.readTextFile(
    "tests/fixtures/noise-callback-effect.tsx",
  );
  const diags = runRule(noiseCallbackEffect, src);
  assertEquals(diags.length, 2);
  const names = diags.map((d) => d.message).join(" | ");
  assert(names.includes("maybeShowPromo"));
  assert(names.includes("sync"));
});
