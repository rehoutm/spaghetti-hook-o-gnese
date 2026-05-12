// deno-lint-ignore-file no-explicit-any
// tests/ts-program_test.ts
import { assert, assertEquals } from "@std/assert";
import { TsProgramCache } from "../src/ts-program.ts";

Deno.test("TsProgramCache: resolves identifier symbol across files", () => {
  const cache = new TsProgramCache(Deno.cwd());
  const decl = cache.resolveIdentifierDeclaration(
    "tests/fixtures/deep-custom-hook.tsx",
    "useFetchAndPoll",
  );
  assert(decl !== null);
  assertEquals(typeof (decl as any).getSourceFile().fileName, "string");
});
