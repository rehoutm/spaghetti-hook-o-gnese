// tests/eslint/errors.test.ts
//
// Failure-mode tests:
// 1. custom-hook-depth without parserServices.program → throws with actionable message
// 2. Invalid rule options (schema validation) → ESLint surfaces a config error
//
// NOTE: Config objects are cast via `as unknown as Parameters<Linter["verify"]>[1]`
// because ESLint's TypeScript types use `Severity` (number) for rule severity
// but flat config consumers typically use string literals ("warn"/"error").

import { assertEquals, assertMatch } from "@std/assert";
import { Linter } from "eslint";
import * as tsParser from "@typescript-eslint/parser";
import plugin from "../../src/eslint.ts";

type ESLintConfig = Parameters<Linter["verify"]>[1];

// -----------------------------------------------------------------------
// 1. custom-hook-depth without parserServices.program throws
// -----------------------------------------------------------------------

Deno.test("custom-hook-depth: missing parserServices.program throws with projectService hint", () => {
  const linter = new Linter();

  // Use @typescript-eslint/parser WITHOUT projectService so parserServices.program is absent
  const config = [
    {
      files: ["**"],
      plugins: { "hook-o-gnese": plugin },
      languageOptions: {
        parser: tsParser,
        parserOptions: {
          // Deliberately omit projectService / project
          ecmaFeatures: { jsx: true },
          sourceType: "module",
        },
      },
      rules: {
        "hook-o-gnese/custom-hook-depth": "warn",
      },
    },
  ] as unknown as ESLintConfig;

  const code = `
    import { useDeepCustomHook } from "./some-hook";
    function Widget({ id }) {
      const data = useDeepCustomHook(id);
      return null;
    }
  `;

  // ESLint wraps rule create() errors and surfaces them as fatal messages.
  // We assert it throws OR surfaces as a fatal/error message containing "projectService".
  let threw = false;
  let messages: ReturnType<Linter["verify"]> = [];
  try {
    messages = linter.verify(code, config, "test.tsx");
  } catch (err) {
    threw = true;
    const errMsg = (err as Error).message;
    assertMatch(
      errMsg,
      /projectService/,
      `Expected 'projectService' in error, got: ${errMsg}`,
    );
  }

  if (!threw) {
    // ESLint may surface rule create() errors as fatal diagnostics
    const projectServiceMessages = messages.filter(
      (m) => m.fatal === true || m.message.includes("projectService"),
    );
    assertEquals(
      projectServiceMessages.length >= 1,
      true,
      `Expected a fatal/projectService message; got: ${
        JSON.stringify(messages)
      }`,
    );
    assertMatch(
      projectServiceMessages[0].message,
      /projectService/,
      `Expected 'projectService' in message text`,
    );
  }
});

// -----------------------------------------------------------------------
// 2. Schema validation: invalid option type surfaces a config error
// -----------------------------------------------------------------------

Deno.test("no-fat-effects: invalid option threshold type surfaces error", () => {
  const linter = new Linter();

  const config = [
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
        // threshold should be a number; passing a string violates the JSON schema
        "hook-o-gnese/no-fat-effects": ["warn", { threshold: "not-a-number" }],
      },
    },
  ] as unknown as ESLintConfig;

  const code = `
    function Foo() {
      useEffect(() => { setX(1); }, [x]);
      return null;
    }
  `;

  // ESLint schema validation can throw OR return a fatal diagnostic.
  // Either is acceptable — the important thing is the error is surfaced.
  let threw = false;
  let messages: ReturnType<Linter["verify"]> = [];
  try {
    messages = linter.verify(code, config, "test.tsx");
  } catch {
    threw = true;
  }

  if (!threw) {
    // Some ESLint versions return schema violations as fatal messages
    const configErrors = messages.filter(
      (m) => m.fatal === true || (m.ruleId === null && m.message.length > 0),
    );
    assertEquals(
      configErrors.length >= 1,
      true,
      `Expected a config validation error; got: ${JSON.stringify(messages)}`,
    );
  }
});
