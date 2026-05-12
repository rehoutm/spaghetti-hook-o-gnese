// tests/eslint/no-fat-effects.test.ts
//
// Tests for the `no-fat-effects` ESLint rule wrapper.
// Uses Linter.verify directly — avoids RuleTester/describe/it interop issues
// with Deno's npm: shim, per spec guidance.
//
// NOTE: Config objects are cast via `as unknown as Parameters<Linter["verify"]>[1]`
// because ESLint's TypeScript types use `Severity` (number) for rule severity
// but flat config consumers typically use string literals ("warn"/"error").
// This is a type-only issue; runtime behavior is correct.

import { assertEquals, assertMatch } from "@std/assert";
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
        "hook-o-gnese/no-fat-effects": ruleLevel,
      },
    },
  ] as unknown as ESLintConfig;
}

// -----------------------------------------------------------------------
// Valid: clean effect should produce no diagnostic
// -----------------------------------------------------------------------

Deno.test("no-fat-effects: clean effect produces no diagnostic", () => {
  const code = `
    function Foo() {
      useEffect(() => { setX(1); }, [x]);
      return <div />;
    }
  `;
  const messages = linter.verify(code, makeConfig(), "test.tsx");
  assertEquals(messages.length, 0);
});

Deno.test("no-fat-effects: single dep no branches is clean", () => {
  const code = `
    function Foo({ id }) {
      useEffect(() => {
        fetch('/api/' + id).then(setData);
      }, [id]);
      return <div />;
    }
  `;
  const messages = linter.verify(code, makeConfig(), "test.tsx");
  assertEquals(messages.length, 0);
});

Deno.test("no-fat-effects: no effect call is clean", () => {
  const code = `
    function Foo() {
      const [x, setX] = useState(0);
      return <div />;
    }
  `;
  const messages = linter.verify(code, makeConfig(), "test.tsx");
  assertEquals(messages.length, 0);
});

// -----------------------------------------------------------------------
// Invalid: over warn threshold
// -----------------------------------------------------------------------

Deno.test("no-fat-effects: fat effect over default threshold reports warn messageId", () => {
  // deps=5 branches=4 setStates=4 → total > 10 (default warn threshold)
  const code = `
    function Dashboard({ userId, region, locale, theme, currency }) {
      const [data, setData] = useState(null);
      const [loading, setLoading] = useState(false);
      const [err, setErr] = useState(null);

      useEffect(() => {
        setLoading(true);
        if (userId) {
          if (region === "EU") {
            fetch('/api/' + userId + '?r=' + region + '&l=' + locale)
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

      return <div />;
    }
  `;
  const messages = linter.verify(code, makeConfig(), "test.tsx");
  const ruleMessages = messages.filter((m) =>
    m.ruleId === "hook-o-gnese/no-fat-effects"
  );
  assertEquals(ruleMessages.length, 1);
  assertEquals(ruleMessages[0].messageId, "error");
});

Deno.test("no-fat-effects: custom low threshold triggers warn", () => {
  const code = `
    function Foo({ a, b }) {
      useEffect(() => {
        if (a) setX(1);
      }, [a, b]);
      return <div />;
    }
  `;
  // threshold=1 means any score ≥ 1 fires; deps=2 + branch=1*2 + setState=1*1.5 = 5.5 total
  const messages = linter.verify(
    code,
    makeConfig(["warn", { threshold: 1 }]),
    "test.tsx",
  );
  const ruleMessages = messages.filter((m) =>
    m.ruleId === "hook-o-gnese/no-fat-effects"
  );
  assertEquals(ruleMessages.length, 1);
  assertEquals(ruleMessages[0].messageId, "warn");
});

Deno.test("no-fat-effects: errorThreshold triggers error messageId", () => {
  // errorThreshold=1 so any effect crosses to "error" messageId
  const code = `
    function Foo({ a, b }) {
      useEffect(() => {
        if (a) setX(1);
      }, [a, b]);
      return <div />;
    }
  `;
  const messages = linter.verify(
    code,
    makeConfig(["warn", { threshold: 1, errorThreshold: 1 }]),
    "test.tsx",
  );
  const ruleMessages = messages.filter((m) =>
    m.ruleId === "hook-o-gnese/no-fat-effects"
  );
  assertEquals(ruleMessages.length, 1);
  assertEquals(ruleMessages[0].messageId, "error");
});

// -----------------------------------------------------------------------
// Message text passes through via data.detail
// -----------------------------------------------------------------------

Deno.test("no-fat-effects: message text contains 'entropy'", () => {
  const code = `
    function Dashboard({ userId, region, locale, theme, currency }) {
      const [data, setData] = useState(null);
      const [loading, setLoading] = useState(false);
      const [err, setErr] = useState(null);

      useEffect(() => {
        setLoading(true);
        if (userId) {
          if (region === "EU") {
            fetch('/api/' + userId + '?r=' + region + '&l=' + locale)
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

      return <div />;
    }
  `;
  const messages = linter.verify(code, makeConfig(), "test.tsx");
  const ruleMessages = messages.filter((m) =>
    m.ruleId === "hook-o-gnese/no-fat-effects"
  );
  assertEquals(ruleMessages.length, 1);
  assertMatch(ruleMessages[0].message, /entropy/);
});
