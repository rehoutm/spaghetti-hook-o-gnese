#!/usr/bin/env node
import { parseArgs } from "@std/cli/parse-args";
import { globby } from "globby";
import { lintFiles } from "./engine.ts";
import { applyCliRuleOverrides, DEFAULT_IGNORE, loadConfig } from "./config.ts";
import { stylish } from "./formatters/stylish.ts";
import { json as jsonFmt } from "./formatters/json.ts";
import { sarif } from "./formatters/sarif.ts";
import { github } from "./formatters/github.ts";
import type { Formatter } from "./formatters/types.ts";

const FORMATTERS: Record<string, Formatter> = {
  stylish,
  json: jsonFmt,
  sarif,
  github,
};

const HELP = `
hook-o-gnese — score React hook complexity

Usage:
  hook-o-gnese [options] <paths...>

Options:
  --format=<fmt>          stylish (default) | json | sarif | github
  --config=<path>         path to .hookogneserc.json
  --type-aware            enable custom-hook-depth (slower, uses TS Compiler API)
  --rule=<id>=<sev>       override rule severity (off|warn|error). Repeatable.
  --no-error-on-warn      do not exit non-zero on warnings
  --help, -h              show this message

Examples:
  hook-o-gnese ./src
  hook-o-gnese ./src --format=sarif > report.sarif
  hook-o-gnese ./src --type-aware --rule=hook-o-gnese/state-scatter=error
`.trim();

async function main(argv: string[]): Promise<number> {
  const args = parseArgs(argv, {
    boolean: ["help", "type-aware", "no-error-on-warn"],
    alias: { h: "help" },
    string: ["format", "config"],
    collect: ["rule"],
    default: { format: "stylish" },
  });

  if (args.help) {
    console.log(HELP);
    return 0;
  }

  const paths = args._.map(String);
  if (paths.length === 0) {
    console.error("Error: no paths provided. Use --help for usage.");
    return 2;
  }

  const formatter = FORMATTERS[args.format as string];
  if (!formatter) {
    console.error(`Error: unknown format '${args.format}'`);
    return 2;
  }

  const cwd = Deno.cwd();
  const { engine, ignore } = await loadConfig(cwd, args.config as string | undefined);
  if (args["type-aware"]) engine.typeAware = true;

  const overrides = ((args.rule ?? []) as string[]).map((spec) => {
    const [id, sev] = spec.split("=");
    return { id, severity: sev as "off" | "warn" | "error" };
  });
  const finalEngine = applyCliRuleOverrides(engine, overrides);

  const files = await globby(paths, {
    ignore: [...DEFAULT_IGNORE, ...ignore],
    expandDirectories: { extensions: ["ts", "tsx", "js", "jsx"] },
    absolute: false,
  });

  if (files.length === 0) {
    console.error("Error: no matching files found");
    return 2;
  }

  const start = performance.now();
  const diagnostics = await lintFiles(files, finalEngine);
  const durationMs = Math.round(performance.now() - start);

  const output = formatter({
    diagnostics,
    filesScanned: files.length,
    durationMs,
  });
  Deno.stdout.writeSync(new TextEncoder().encode(output));

  const hasError = diagnostics.some((d) => d.severity === "error");
  const hasWarn = diagnostics.some((d) => d.severity === "warn");
  if (hasError) return 1;
  if (hasWarn && !args["no-error-on-warn"]) return 0;
  return 0;
}

if (import.meta.main) {
  const code = await main(Deno.args);
  Deno.exit(code);
}
