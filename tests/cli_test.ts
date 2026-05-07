// tests/cli_test.ts
import { assert, assertEquals } from "@std/assert";

async function runCli(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  const cmd = new Deno.Command("deno", {
    args: [
      "run",
      "--allow-read",
      "--allow-env",
      "--allow-run",
      "--allow-sys",
      "--allow-ffi",
      "src/cli.ts",
      ...args,
    ],
    stdout: "piped",
    stderr: "piped",
  });
  const out = await cmd.output();
  return {
    stdout: new TextDecoder().decode(out.stdout),
    stderr: new TextDecoder().decode(out.stderr),
    code: out.code,
  };
}

Deno.test("cli: --help prints usage", async () => {
  const { stdout, code } = await runCli(["--help"]);
  assert(stdout.includes("Usage"));
  assertEquals(code, 0);
});

Deno.test("cli: clean fixture exits 0", async () => {
  const { code } = await runCli(["tests/fixtures/clean.tsx"]);
  assertEquals(code, 0);
});

Deno.test("cli: fat-effect fixture escalates to error tier (score 23 ≥ 20)", async () => {
  const { stdout, code } = await runCli([
    "tests/fixtures/fat-effect.tsx",
    "--format=json",
  ]);
  // entropy 23 ≥ error threshold 20 → escalates to error → exit 1
  assertEquals(code, 1);
  const parsed = JSON.parse(stdout);
  const fat = parsed.diagnostics.find(
    (d: any) => d.rule === "hook-o-gnese/no-fat-effects",
  );
  assert(fat, "expected no-fat-effects diagnostic");
  assertEquals(fat.severity, "error");
});

Deno.test("cli: coupled-hooks fixture exits 1 (error severity)", async () => {
  const { code } = await runCli([
    "tests/fixtures/coupled-hooks.tsx",
    "--format=json",
  ]);
  assertEquals(code, 1);
});

Deno.test("cli: --format=github emits annotation lines", async () => {
  const { stdout } = await runCli([
    "tests/fixtures/fat-effect.tsx",
    "--format=github",
  ]);
  assert(stdout.includes("::warning") || stdout.includes("::error"));
});

Deno.test("cli: --format=sarif emits valid JSON", async () => {
  const { stdout } = await runCli([
    "tests/fixtures/fat-effect.tsx",
    "--format=sarif",
  ]);
  const parsed = JSON.parse(stdout);
  assertEquals(parsed.version, "2.1.0");
});

Deno.test("cli: diagnostic locations are real (not 1:1 stub)", async () => {
  const { stdout } = await runCli([
    "tests/fixtures/fat-effect.tsx",
    "--format=json",
  ]);
  const parsed = JSON.parse(stdout);
  const fatEffect = parsed.diagnostics.find(
    (d: any) => d.rule === "hook-o-gnese/no-fat-effects",
  );
  assert(fatEffect, "expected a no-fat-effects diagnostic");
  // The useEffect in fat-effect.tsx is well past line 1; if line === 1
  // we've regressed to the byte-offset-as-line bug.
  assert(
    fatEffect.line > 1,
    `expected line > 1, got ${fatEffect.line}:${fatEffect.column}`,
  );
});

Deno.test("cli: --type-aware enables custom-hook-depth", async () => {
  const { stdout } = await runCli([
    "tests/fixtures/deep-custom-hook.tsx",
    "--format=json",
    "--type-aware",
  ]);
  const parsed = JSON.parse(stdout);
  assert(
    parsed.diagnostics.some((d: any) => d.rule === "hook-o-gnese/custom-hook-depth"),
  );
});
