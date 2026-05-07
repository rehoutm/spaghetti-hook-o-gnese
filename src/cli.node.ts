#!/usr/bin/env node
import { parseArgs } from "node:util";
import { readFile } from "node:fs/promises";
import { HELP, runCli } from "./cli-core.ts";
import type { Severity } from "./engine.ts";

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    help: { type: "boolean", short: "h" },
    "type-aware": { type: "boolean" },
    "no-error-on-warn": { type: "boolean" },
    format: { type: "string", default: "stylish" },
    config: { type: "string" },
    rule: { type: "string", multiple: true },
  },
  allowPositionals: true,
});

if (values.help) {
  console.log(HELP);
  process.exit(0);
}

const overrides = (values.rule ?? []).map((spec) => {
  const [id, sev] = spec.split("=");
  return { id, severity: sev as Severity };
});

const code = await runCli(
  {
    paths: positionals,
    format: values.format as string,
    config: values.config,
    typeAware: !!values["type-aware"],
    ruleOverrides: overrides,
    noErrorOnWarn: !!values["no-error-on-warn"],
    cwd: process.cwd(),
  },
  {
    readTextFile: (p) => readFile(p, "utf-8"),
    writeStdout: (s) => {
      process.stdout.write(s);
    },
    writeStderr: (s) => {
      process.stderr.write(s);
    },
  },
);
process.exit(code);
