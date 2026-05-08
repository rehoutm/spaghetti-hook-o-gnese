#!/usr/bin/env -S deno run -A
/**
 * Deno entrypoint for the `hook-o-gnese` CLI.
 *
 * Parses argv, wires up Deno's filesystem and stdio handles, and delegates the
 * actual linting to {@link runCli} from `./cli-core.ts`. Run via
 * `deno task cli` or the compiled `bin/hook-o-gnese` binary.
 *
 * @module
 */
import { parseArgs } from "@std/cli/parse-args";
import { HELP, runCli } from "./cli-core.ts";
import type { Severity } from "./engine.ts";

if (import.meta.main) {
  const args = parseArgs(Deno.args, {
    boolean: ["help", "type-aware"],
    alias: { h: "help" },
    string: ["format", "config"],
    collect: ["rule"],
    default: { format: "stylish" },
  });

  if (args.help) {
    console.log(HELP);
    Deno.exit(0);
  }

  const overrides = ((args.rule ?? []) as string[]).map((spec) => {
    const [id, sev] = spec.split("=");
    return { id, severity: sev as Severity };
  });

  const enc = new TextEncoder();
  const color = Deno.stdout.isTerminal() && !Deno.env.get("NO_COLOR") &&
    args.format === "stylish";
  const code = await runCli(
    {
      paths: args._.map(String),
      format: args.format as string,
      config: args.config as string | undefined,
      typeAware: !!args["type-aware"],
      ruleOverrides: overrides,
      cwd: Deno.cwd(),
      color,
    },
    {
      readTextFile: (p) => Deno.readTextFile(p),
      writeStdout: (s) => {
        Deno.stdout.writeSync(enc.encode(s));
      },
      writeStderr: (s) => {
        Deno.stderr.writeSync(enc.encode(s));
      },
    },
  );
  Deno.exit(code);
}
