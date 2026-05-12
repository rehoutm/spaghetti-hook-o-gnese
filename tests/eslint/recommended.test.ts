// tests/eslint/recommended.test.ts
//
// Regression guard: verifies the recommended config shape fires the expected
// rule IDs against a fixture with known violations.
// Skips custom-hook-depth (needs projectService).
//
// NOTE: Config objects are cast via `as unknown as Parameters<Linter["verify"]>[1]`
// because ESLint's TypeScript types use `Severity` (number) for rule severity
// but flat config consumers typically use string literals ("warn"/"error").

import { assertEquals, assertGreater } from "@std/assert";
import { Linter } from "eslint";
import * as tsParser from "@typescript-eslint/parser";
import plugin from "../../src/eslint.ts";

type ESLintConfig = Parameters<Linter["verify"]>[1];

// A source that has:
// - A fat effect (no-fat-effects should fire)
// - Many useState calls (state-scatter should fire)
// - Read-write same state (hook-coupling should fire)
const SOURCE_WITH_KNOWN_VIOLATIONS = `
import { useEffect, useState } from "react";

export function GodComponent({ userId, region, locale, theme, currency }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [count, setCount] = useState(0);
  const [mode, setMode] = useState("default");
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    setLoading(true);
    if (userId) {
      if (region === "EU") {
        fetch("/api/" + userId + "?r=" + region + "&l=" + locale)
          .then(r => r.json())
          .then(d => {
            if (theme === "dark") setData({ ...d, theme });
            else setData(d);
            setLoading(false);
          })
          .catch(e => {
            setErr(e);
            setLoading(false);
          });
      } else {
        setData(null);
        setLoading(false);
      }
    }
  }, [userId, region, locale, theme, currency]);

  useEffect(() => {
    if (count > 0) setCount(count + 1);
    setTotal(count * 2);
  }, [count]);

  return <div>{count}/{total}</div>;
}
`;

Deno.test("recommended config fires expected rule IDs", () => {
  const linter = new Linter();
  // custom-hook-depth is excluded here — it requires projectService (type-aware)
  const config = [
    plugin.configs.recommended,
    {
      files: ["**"],
      languageOptions: {
        parser: tsParser,
        parserOptions: {
          ecmaFeatures: { jsx: true },
          sourceType: "module",
        },
      },
      rules: {
        // Disable type-aware rule; projectService not configured here
        "hook-o-gnese/custom-hook-depth": "off",
      },
    },
  ] as unknown as ESLintConfig;

  const messages = linter.verify(
    SOURCE_WITH_KNOWN_VIOLATIONS,
    config,
    "test.tsx",
  );
  const ruleIds = new Set(messages.map((m) => m.ruleId));

  assertEquals(
    ruleIds.has("hook-o-gnese/no-fat-effects"),
    true,
    `Expected hook-o-gnese/no-fat-effects to fire; got ruleIds: ${
      [...ruleIds].join(", ")
    }`,
  );
  assertEquals(
    ruleIds.has("hook-o-gnese/state-scatter"),
    true,
    `Expected hook-o-gnese/state-scatter to fire; got ruleIds: ${
      [...ruleIds].join(", ")
    }`,
  );
  assertEquals(
    ruleIds.has("hook-o-gnese/hook-coupling"),
    true,
    `Expected hook-o-gnese/hook-coupling to fire; got ruleIds: ${
      [...ruleIds].join(", ")
    }`,
  );
});

Deno.test("recommended config: hook-coupling fires as ESLint severity 2 (error)", () => {
  // The recommended config sets hook-coupling to "error" at config level
  const linter = new Linter();
  // custom-hook-depth is excluded here — it requires projectService (type-aware)
  const config = [
    plugin.configs.recommended,
    {
      files: ["**"],
      languageOptions: {
        parser: tsParser,
        parserOptions: {
          ecmaFeatures: { jsx: true },
          sourceType: "module",
        },
      },
      rules: {
        // Disable type-aware rule; projectService not configured here
        "hook-o-gnese/custom-hook-depth": "off",
      },
    },
  ] as unknown as ESLintConfig;

  const messages = linter.verify(
    SOURCE_WITH_KNOWN_VIOLATIONS,
    config,
    "test.tsx",
  );
  const couplingMessages = messages.filter(
    (m) => m.ruleId === "hook-o-gnese/hook-coupling",
  );
  assertGreater(couplingMessages.length, 0, "Expected hook-coupling to fire");
  // Config sets severity="error" so ESLint severity property should be 2
  for (const msg of couplingMessages) {
    assertEquals(
      msg.severity,
      2,
      `Expected ESLint severity 2 (error) for hook-coupling`,
    );
  }
});

Deno.test("recommended config: plugin object shape is correct", () => {
  assertEquals(typeof plugin.rules, "object");
  assertEquals(typeof plugin.rules["no-fat-effects"], "object");
  assertEquals(typeof plugin.rules["state-scatter"], "object");
  assertEquals(typeof plugin.rules["hook-coupling"], "object");
  assertEquals(typeof plugin.rules["custom-hook-depth"], "object");

  assertEquals(typeof plugin.configs.recommended, "object");
  const rec = plugin.configs.recommended as Record<string, unknown>;
  assertEquals(typeof rec.plugins, "object");
  assertEquals(typeof rec.rules, "object");
});

Deno.test("recommended config: all four rules are referenced", () => {
  const rec = plugin.configs.recommended as Record<string, unknown>;
  const rules = rec.rules as Record<string, unknown>;
  assertEquals("hook-o-gnese/no-fat-effects" in rules, true);
  assertEquals("hook-o-gnese/state-scatter" in rules, true);
  assertEquals("hook-o-gnese/hook-coupling" in rules, true);
  assertEquals("hook-o-gnese/custom-hook-depth" in rules, true);
});
