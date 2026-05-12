// tests/eslint/custom-hook-depth.test.ts
//
// Tests for the `custom-hook-depth` ESLint rule wrapper.
// This rule requires `parserServices.program` (projectService: true).
// Uses Linter.verify with projectService enabled against fixture .tsx files.
//
// NOTE: We use Linter.verify directly rather than RuleTester because
// RuleTester's describe/it lifecycle integration under Deno's npm: shim is
// unreliable. Per spec guidance, Linter.verify is the fallback path here.
//
// NOTE: Config objects are cast via `as unknown as Parameters<Linter["verify"]>[1]`
// because ESLint's TypeScript types use `Severity` (number) for rule severity
// but flat config consumers typically use string literals ("warn"/"error").
// This is a type-only issue; runtime behavior is correct.

import { assertEquals } from "@std/assert";
import { Linter } from "eslint";
import * as tsParser from "@typescript-eslint/parser";
import plugin from "../../src/eslint.ts";
import { fromFileUrl, join } from "@std/path";

type ESLintConfig = Parameters<Linter["verify"]>[1];

const __dirname = fromFileUrl(new URL(".", import.meta.url));
const fixturesDir = join(__dirname, "fixtures");

function makeConfig(ruleLevel = "warn"): ESLintConfig {
  return [
    {
      files: ["**"],
      plugins: { "hook-o-gnese": plugin },
      languageOptions: {
        parser: tsParser,
        parserOptions: {
          projectService: true,
          tsconfigRootDir: fixturesDir,
          ecmaFeatures: { jsx: true },
          sourceType: "module",
        },
      },
      rules: {
        "hook-o-gnese/custom-hook-depth": ruleLevel,
      },
    },
  ] as unknown as ESLintConfig;
}

// -----------------------------------------------------------------------
// Valid: shallow hook depth
// -----------------------------------------------------------------------

Deno.test("custom-hook-depth: shallow hook produces no diagnostic", async () => {
  const code = await Deno.readTextFile(
    join(fixturesDir, "shallow-component.tsx"),
  );
  const linter = new Linter();
  const messages = linter.verify(
    code,
    makeConfig(),
    join(fixturesDir, "shallow-component.tsx"),
  );
  const ruleMessages = messages.filter(
    (m) => m.ruleId === "hook-o-gnese/custom-hook-depth",
  );
  assertEquals(
    ruleMessages.length,
    0,
    `Expected no diagnostic, got: ${JSON.stringify(messages)}`,
  );
});

// -----------------------------------------------------------------------
// Invalid: deep hook depth exceeds maxDepth
// -----------------------------------------------------------------------

Deno.test("custom-hook-depth: deep hook with maxDepth=2 fires warn", async () => {
  const code = await Deno.readTextFile(join(fixturesDir, "deep-component.tsx"));
  const linter = new Linter();
  const config = [
    {
      files: ["**"],
      plugins: { "hook-o-gnese": plugin },
      languageOptions: {
        parser: tsParser,
        parserOptions: {
          projectService: true,
          tsconfigRootDir: fixturesDir,
          ecmaFeatures: { jsx: true },
          sourceType: "module",
        },
      },
      rules: {
        "hook-o-gnese/custom-hook-depth": ["warn", { maxDepth: 2 }],
      },
    },
  ] as unknown as ESLintConfig;
  const messages = linter.verify(
    code,
    config,
    join(fixturesDir, "deep-component.tsx"),
  );
  const ruleMessages = messages.filter(
    (m) => m.ruleId === "hook-o-gnese/custom-hook-depth",
  );
  assertEquals(
    ruleMessages.length >= 1,
    true,
    `Expected at least one diagnostic for deep hook, got: ${
      JSON.stringify(messages)
    }`,
  );
  // messageId is "warn" or "error" depending on depth vs errorMaxDepth
  const ids = ruleMessages.map((m) => m.messageId);
  for (const id of ids) {
    assertEquals(
      ["warn", "error"].includes(id as string),
      true,
      `Unexpected messageId: ${id}`,
    );
  }
});

Deno.test("custom-hook-depth: deep hook with errorMaxDepth=1 fires error messageId", async () => {
  const code = await Deno.readTextFile(join(fixturesDir, "deep-component.tsx"));
  const linter = new Linter();
  const config = [
    {
      files: ["**"],
      plugins: { "hook-o-gnese": plugin },
      languageOptions: {
        parser: tsParser,
        parserOptions: {
          projectService: true,
          tsconfigRootDir: fixturesDir,
          ecmaFeatures: { jsx: true },
          sourceType: "module",
        },
      },
      rules: {
        "hook-o-gnese/custom-hook-depth": ["warn", {
          maxDepth: 1,
          errorMaxDepth: 1,
        }],
      },
    },
  ] as unknown as ESLintConfig;
  const messages = linter.verify(
    code,
    config,
    join(fixturesDir, "deep-component.tsx"),
  );
  const ruleMessages = messages.filter(
    (m) => m.ruleId === "hook-o-gnese/custom-hook-depth",
  );
  assertEquals(
    ruleMessages.length >= 1,
    true,
    `Expected at least one diagnostic, got: ${JSON.stringify(messages)}`,
  );
  assertEquals(ruleMessages[0].messageId, "error");
});
