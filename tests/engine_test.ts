// tests/engine_test.ts
import { assert, assertEquals } from "@std/assert";
import { lintFile } from "../src/engine.ts";

const config = {
  rules: {
    "hook-o-gnese/no-fat-effects": { severity: "warn" as const },
    "hook-o-gnese/state-scatter": { severity: "warn" as const },
    "hook-o-gnese/hook-coupling": { severity: "error" as const },
    "hook-o-gnese/custom-hook-depth": { severity: "warn" as const },
  },
  cwd: Deno.cwd(),
  typeAware: false,
};

Deno.test("lintFile: clean fixture produces no diagnostics", async () => {
  const src = await Deno.readTextFile("tests/fixtures/clean.tsx");
  const diags = await lintFile("tests/fixtures/clean.tsx", src, config);
  assertEquals(diags.length, 0);
});

Deno.test("lintFile: fat-effect fixture produces no-fat-effects diagnostic", async () => {
  const src = await Deno.readTextFile("tests/fixtures/fat-effect.tsx");
  const diags = await lintFile("tests/fixtures/fat-effect.tsx", src, config);
  assert(diags.some((d) => d.rule === "hook-o-gnese/no-fat-effects"));
});

Deno.test("lintFile: state-scatter fixture produces state-scatter diagnostic", async () => {
  const src = await Deno.readTextFile("tests/fixtures/state-scatter.tsx");
  const diags = await lintFile("tests/fixtures/state-scatter.tsx", src, config);
  assert(diags.some((d) => d.rule === "hook-o-gnese/state-scatter"));
});

Deno.test("lintFile: hook-coupling fixture produces hook-coupling diagnostic", async () => {
  const src = await Deno.readTextFile("tests/fixtures/coupled-hooks.tsx");
  const diags = await lintFile("tests/fixtures/coupled-hooks.tsx", src, config);
  assert(diags.some((d) => d.rule === "hook-o-gnese/hook-coupling"));
});

Deno.test("lintFile: typeAware=false skips custom-hook-depth", async () => {
  const src = await Deno.readTextFile("tests/fixtures/deep-custom-hook.tsx");
  const diags = await lintFile(
    "tests/fixtures/deep-custom-hook.tsx",
    src,
    { ...config, typeAware: false },
  );
  assertEquals(
    diags.filter((d) => d.rule === "hook-o-gnese/custom-hook-depth").length,
    0,
  );
});

Deno.test("lintFile: typeAware=true enables custom-hook-depth", async () => {
  const src = await Deno.readTextFile("tests/fixtures/deep-custom-hook.tsx");
  const diags = await lintFile(
    "tests/fixtures/deep-custom-hook.tsx",
    src,
    {
      ...config,
      typeAware: true,
      rules: {
        ...config.rules,
        "hook-o-gnese/custom-hook-depth": {
          severity: "warn" as const,
          options: { maxDepth: 2 },
        },
      },
    },
  );
  assert(diags.some((d) => d.rule === "hook-o-gnese/custom-hook-depth"));
});

Deno.test("lintFile: non-React file produces no diagnostics", async () => {
  const diags = await lintFile(
    "foo.ts",
    `export const x = 1; function foo() { return 42; }`,
    config,
  );
  assertEquals(diags.length, 0);
});
