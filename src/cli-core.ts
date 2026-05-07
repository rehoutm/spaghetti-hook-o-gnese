import { globby } from "globby";
import { lintFiles } from "./engine.ts";
import type { Severity } from "./engine.ts";
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

export const HELP = `
hook-o-gnese — score React hook complexity

Usage:
  hook-o-gnese [options] <paths...>

Options:
  --format=<fmt>          stylish (default) | json | sarif | github
  --config=<path>         path to .hookogneserc.json
  --type-aware            enable custom-hook-depth (slower, uses TS Compiler API)
  --rule=<id>=<sev>       override rule severity (off|warn|error). Repeatable.
  --help, -h              show this message

Examples:
  hook-o-gnese ./src
  hook-o-gnese ./src --format=sarif > report.sarif
  hook-o-gnese ./src --type-aware --rule=hook-o-gnese/state-scatter=error
`.trim();

export interface CliOptions {
  paths: string[];
  format: string;
  config?: string;
  typeAware: boolean;
  ruleOverrides: Array<{ id: string; severity: Severity }>;
  cwd: string;
}

export interface RuntimeIO {
  readTextFile(path: string): Promise<string>;
  writeStdout(s: string): void;
  writeStderr(s: string): void;
}

export async function runCli(opts: CliOptions, io: RuntimeIO): Promise<number> {
  if (opts.paths.length === 0) {
    io.writeStderr("Error: no paths provided. Use --help for usage.\n");
    return 2;
  }

  const formatter = FORMATTERS[opts.format];
  if (!formatter) {
    io.writeStderr(`Error: unknown format '${opts.format}'\n`);
    return 2;
  }

  const { engine, ignore } = await loadConfig(opts.cwd, opts.config, io.readTextFile);
  if (opts.typeAware) engine.typeAware = true;
  const finalEngine = applyCliRuleOverrides(engine, opts.ruleOverrides);

  const files = await globby(opts.paths, {
    ignore: [...DEFAULT_IGNORE, ...ignore],
    expandDirectories: { extensions: ["ts", "tsx", "js", "jsx"] },
    absolute: false,
  });

  if (files.length === 0) {
    io.writeStderr("Error: no matching files found\n");
    return 2;
  }

  const start = performance.now();
  const diagnostics = await lintFiles(files, finalEngine, io.readTextFile);
  const durationMs = Math.round(performance.now() - start);

  io.writeStdout(formatter({
    diagnostics,
    filesScanned: files.length,
    durationMs,
  }));

  if (diagnostics.some((d) => d.severity === "error")) return 1;
  return 0;
}
