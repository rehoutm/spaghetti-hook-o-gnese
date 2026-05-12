// tests/eslint/state-scatter.test.ts
//
// Tests for the `state-scatter` ESLint rule wrapper.
// Uses Linter.verify directly — avoids RuleTester/describe/it interop issues
// with Deno's npm: shim, per spec guidance.
//
// NOTE: Config objects are cast via `as unknown as Parameters<Linter["verify"]>[1]`
// because ESLint's TypeScript types use `Severity` (number) for rule severity
// but flat config consumers typically use string literals ("warn"/"error").
//
// NOTE: isReactComponent requires JSX in the return statement to identify components.
// All test code uses `return <div />;` to satisfy this check.

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
        "hook-o-gnese/state-scatter": ruleLevel,
      },
    },
  ] as unknown as ESLintConfig;
}

// -----------------------------------------------------------------------
// Valid cases
// -----------------------------------------------------------------------

Deno.test("state-scatter: single useState is clean", () => {
  const code = `
    function Foo() {
      const [a, setA] = useState(0);
      return <div />;
    }
  `;
  const messages = linter.verify(code, makeConfig(), "test.tsx");
  assertEquals(messages.length, 0);
});

Deno.test("state-scatter: three useState calls is below threshold", () => {
  const code = `
    function Foo() {
      const [a, setA] = useState(0);
      const [b, setB] = useState('');
      const [c, setC] = useState(false);
      return <div />;
    }
  `;
  const messages = linter.verify(code, makeConfig(), "test.tsx");
  assertEquals(messages.length, 0);
});

Deno.test("state-scatter: no hooks at all is clean", () => {
  const code = `
    function Foo({ name }) {
      return <div>{name}</div>;
    }
  `;
  const messages = linter.verify(code, makeConfig(), "test.tsx");
  assertEquals(messages.length, 0);
});

// -----------------------------------------------------------------------
// Invalid: 8 useState calls exceeds default warn threshold (5)
// -----------------------------------------------------------------------

Deno.test("state-scatter: 8-state form fires warn messageId", () => {
  // Default warn threshold is 5; 8 states fires
  const code = `
    function ProfileForm() {
      const [firstName, setFirstName] = useState('');
      const [lastName, setLastName] = useState('');
      const [email, setEmail] = useState('');
      const [phone, setPhone] = useState('');
      const [city, setCity] = useState('');
      const [country, setCountry] = useState('');
      const [zip, setZip] = useState('');
      const [bio, setBio] = useState('');
      return <form>{firstName}</form>;
    }
  `;
  const messages = linter.verify(code, makeConfig(), "test.tsx");
  const ruleMessages = messages.filter(
    (m) => m.ruleId === "hook-o-gnese/state-scatter",
  );
  assertEquals(
    ruleMessages.length >= 1,
    true,
    `Expected diagnostic, got: ${JSON.stringify(messages)}`,
  );
  const ids = ruleMessages.map((m) => m.messageId);
  for (const id of ids) {
    assertEquals(
      ["warn", "error"].includes(id as string),
      true,
      `Unexpected messageId: ${id}`,
    );
  }
});

Deno.test("state-scatter: custom low threshold triggers warn", () => {
  const code = `
    function Foo() {
      const [a, setA] = useState(0);
      const [b, setB] = useState('');
      return <div>{a}</div>;
    }
  `;
  const messages = linter.verify(
    code,
    makeConfig(["warn", { threshold: 1 }]),
    "test.tsx",
  );
  const ruleMessages = messages.filter(
    (m) => m.ruleId === "hook-o-gnese/state-scatter",
  );
  assertEquals(
    ruleMessages.length >= 1,
    true,
    `Expected diagnostic with threshold=1, got: ${JSON.stringify(messages)}`,
  );
  assertEquals(ruleMessages[0].messageId, "warn");
});

Deno.test("state-scatter: errorThreshold crossed triggers error messageId", () => {
  // 8 useState calls + correlated setters, errorThreshold=5 → crosses error threshold
  const code = `
    function ProfileForm() {
      const [firstName, setFirstName] = useState('');
      const [lastName, setLastName] = useState('');
      const [email, setEmail] = useState('');
      const [phone, setPhone] = useState('');
      const [city, setCity] = useState('');
      const [country, setCountry] = useState('');
      const [zip, setZip] = useState('');
      const [bio, setBio] = useState('');

      function reset() {
        setFirstName('');
        setLastName('');
        setEmail('');
        setPhone('');
      }
      return <form onClick={reset}>{firstName}</form>;
    }
  `;
  // errorThreshold=5 means scores >= 5 get "error" messageId
  const messages = linter.verify(
    code,
    makeConfig(["warn", { threshold: 1, errorThreshold: 5 }]),
    "test.tsx",
  );
  const ruleMessages = messages.filter(
    (m) => m.ruleId === "hook-o-gnese/state-scatter",
  );
  assertEquals(
    ruleMessages.length >= 1,
    true,
    `Expected diagnostic, got: ${JSON.stringify(messages)}`,
  );
  assertEquals(ruleMessages[0].messageId, "error");
});
