// tests/formatters_test.ts
import { assert, assertEquals } from "@std/assert";
import type { Diagnostic } from "../src/engine.ts";
import { stylish } from "../src/formatters/stylish.ts";
import { json } from "../src/formatters/json.ts";
import { sarif } from "../src/formatters/sarif.ts";
import { github } from "../src/formatters/github.ts";

const sample: Diagnostic[] = [
  {
    file: "src/A.tsx",
    rule: "hook-o-gnese/no-fat-effects",
    severity: "warn",
    message: "useEffect entropy 12.0 ≥ 10",
    line: 10,
    column: 5,
  },
  {
    file: "src/B.tsx",
    rule: "hook-o-gnese/hook-coupling",
    severity: "error",
    message: "useEffect reads + writes same state 'count' (loop risk)",
    line: 22,
    column: 3,
  },
];
const ctx = { diagnostics: sample, filesScanned: 5, durationMs: 42 };

Deno.test("stylish: groups by file, prints summary", () => {
  const out = stylish(ctx);
  assert(out.includes("src/A.tsx"));
  assert(out.includes("src/B.tsx"));
  assert(out.includes("hook-o-gnese/no-fat-effects"));
  assert(out.includes("2 problems"));
  assert(out.includes("1 error"));
  assert(out.includes("1 warning"));
});

Deno.test("stylish: no ANSI codes when color disabled", () => {
  const out = stylish(ctx);
  assert(!out.includes("\x1b["), "expected no ANSI escapes when color is off");
});

Deno.test("stylish: paints errors red and warnings yellow when color enabled", () => {
  const out = stylish({ ...ctx, color: true });
  // 31 = red (errors), 33 = yellow (warnings)
  assert(out.includes("[31m"), "expected red ANSI for error severity");
  assert(out.includes("[33m"), "expected yellow ANSI for warn severity");
});

Deno.test("json: round-trips diagnostics", () => {
  const parsed = JSON.parse(json(ctx));
  assertEquals(parsed.diagnostics.length, 2);
  assertEquals(parsed.filesScanned, 5);
  assertEquals(parsed.durationMs, 42);
});

Deno.test("json: does not leak color flag into payload", () => {
  const parsed = JSON.parse(json({ ...ctx, color: true }));
  assertEquals(parsed.color, undefined);
});

Deno.test("sarif: emits SARIF 2.1.0 envelope", () => {
  const parsed = JSON.parse(sarif(ctx));
  assertEquals(parsed.version, "2.1.0");
  assert(parsed.runs[0].tool.driver.name === "hook-o-gnese");
  assertEquals(parsed.runs[0].results.length, 2);
});

Deno.test("github: emits annotation lines", () => {
  const out = github(ctx);
  assert(out.includes("::warning"));
  assert(out.includes("::error"));
  assert(out.includes("file=src/A.tsx,line=10,col=5"));
});
