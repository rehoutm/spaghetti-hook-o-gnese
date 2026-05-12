// tests/eslint/hook-coupling.test.ts
//
// Tests for the `hook-coupling` ESLint rule wrapper.
// Uses Linter.verify directly — avoids RuleTester/describe/it interop issues
// with Deno's npm: shim, per spec guidance.
//
// NOTE: Config objects are cast via `as unknown as Parameters<Linter["verify"]>[1]`
// because ESLint's TypeScript types use `Severity` (number) for rule severity
// but flat config consumers typically use string literals ("warn"/"error").
//
// NOTE: isReactComponent requires JSX in the return statement to identify components.
// All test code uses JSX returns to satisfy this check.

import { assertEquals } from "@std/assert";
import { Linter } from "eslint";
import * as tsParser from "@typescript-eslint/parser";
import plugin from "../../src/eslint.ts";

type ESLintConfig = Parameters<Linter["verify"]>[1];

const linter = new Linter();

function makeConfig(ruleLevel: unknown = "warn"): ESLintConfig {
  return [
    {
      files: ["**"],
      plugins: { "hook-o-gnese": plugin },
      languageOptions: {
        parser: tsParser,
        parserOptions: {
          ecmaFeatures: { jsx: true },
          sourceType: "module",
        },
      },
      rules: {
        "hook-o-gnese/hook-coupling": ruleLevel,
      },
    },
  ] as unknown as ESLintConfig;
}

// -----------------------------------------------------------------------
// Valid cases
// -----------------------------------------------------------------------

Deno.test("hook-coupling: clean component produces no diagnostic", () => {
  const code = `
    function Foo() {
      const [c, setC] = useState(0);
      useEffect(() => { setC(0); }, []);
      return <div />;
    }
  `;
  const messages = linter.verify(code, makeConfig(), "test.tsx");
  assertEquals(messages.length, 0);
});

Deno.test("hook-coupling: effect that reads but does not write same state is clean", () => {
  const code = `
    function Foo() {
      const [value, setValue] = useState(0);
      const [other, setOther] = useState(0);
      useEffect(() => {
        if (value > 0) setOther(value * 2);
      }, [value]);
      return <div>{value}</div>;
    }
  `;
  const messages = linter.verify(code, makeConfig(), "test.tsx");
  assertEquals(messages.length, 0);
});

Deno.test("hook-coupling: no effects is clean", () => {
  const code = `
    function Foo() {
      const [count, setCount] = useState(0);
      return <button onClick={() => setCount(count + 1)}>{count}</button>;
    }
  `;
  const messages = linter.verify(code, makeConfig(), "test.tsx");
  assertEquals(messages.length, 0);
});

// -----------------------------------------------------------------------
// Invalid: effect reads + writes same state variable
// -----------------------------------------------------------------------

Deno.test("hook-coupling: read-write same state fires warn messageId", () => {
  // Coupling score: count is read AND written in same effect = total=3 ≥ warn threshold 3
  const code = `
    function Counter() {
      const [count, setCount] = useState(0);
      const [doubled, setDoubled] = useState(0);

      useEffect(() => {
        if (count > 0) setCount(count + 1);
        setDoubled(count * 2);
      }, [count]);
      return <div>{count}/{doubled}</div>;
    }
  `;
  const messages = linter.verify(code, makeConfig(), "test.tsx");
  const ruleMessages = messages.filter(
    (m) => m.ruleId === "hook-o-gnese/hook-coupling",
  );
  assertEquals(
    ruleMessages.length >= 1,
    true,
    `Expected diagnostic, got: ${JSON.stringify(messages)}`,
  );
  assertEquals(ruleMessages[0].messageId, "warn");
});

Deno.test("hook-coupling: custom low threshold triggers warn", () => {
  // threshold=1 forces even single coupling to fire
  const code = `
    function Foo() {
      const [x, setX] = useState(0);
      useEffect(() => {
        if (x > 0) setX(x - 1);
      }, [x]);
      return <div>{x}</div>;
    }
  `;
  const messages = linter.verify(
    code,
    makeConfig(["warn", { threshold: 1 }]),
    "test.tsx",
  );
  const ruleMessages = messages.filter(
    (m) => m.ruleId === "hook-o-gnese/hook-coupling",
  );
  assertEquals(
    ruleMessages.length >= 1,
    true,
    `Expected diagnostic with threshold=1, got: ${JSON.stringify(messages)}`,
  );
  assertEquals(ruleMessages[0].messageId, "warn");
});

Deno.test("hook-coupling: errorThreshold triggers error messageId", () => {
  // errorThreshold=1 causes even a single coupling to emit error messageId
  const code = `
    function Counter() {
      const [count, setCount] = useState(0);
      const [doubled, setDoubled] = useState(0);

      useEffect(() => {
        if (count > 0) setCount(count + 1);
        setDoubled(count * 2);
      }, [count]);
      return <div>{count}/{doubled}</div>;
    }
  `;
  const messages = linter.verify(
    code,
    makeConfig(["warn", { threshold: 1, errorThreshold: 1 }]),
    "test.tsx",
  );
  const ruleMessages = messages.filter(
    (m) => m.ruleId === "hook-o-gnese/hook-coupling",
  );
  assertEquals(
    ruleMessages.length >= 1,
    true,
    `Expected diagnostic, got: ${JSON.stringify(messages)}`,
  );
  assertEquals(ruleMessages[0].messageId, "error");
});
