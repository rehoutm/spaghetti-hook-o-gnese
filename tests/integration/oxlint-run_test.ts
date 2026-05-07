// tests/integration/oxlint-run_test.ts
import { assert } from "@std/assert";

Deno.test({
  name: "oxlint runs plugin against fixtures and reports diagnostics",
  permissions: { run: true, read: true, env: true, write: true, net: true },
  async fn() {
    const cmd = new Deno.Command("deno", {
      args: ["run", "-A", "npm:oxlint", "--format=json", "tests/fixtures/"],
      stdout: "piped",
      stderr: "piped",
    });
    const { stdout, stderr } = await cmd.output();
    const out = new TextDecoder().decode(stdout);
    const err = new TextDecoder().decode(stderr);
    assert(
      out.includes("hook-o-gnese") || err.includes("hook-o-gnese"),
      `expected hook-o-gnese diagnostics. stdout:\n${out}\nstderr:\n${err}`,
    );
  },
});
