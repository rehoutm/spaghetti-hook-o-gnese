import { parseSync } from "oxc-parser";
import { ALL_RULES } from "./rules/registry.ts";

export type Severity = "off" | "warn" | "error";

export interface Diagnostic {
  file: string;
  rule: string;
  severity: Exclude<Severity, "off">;
  message: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
}

export interface RuleConfig {
  severity: Severity;
  options?: unknown;
}

export interface EngineConfig {
  rules: Record<string, RuleConfig>;
  cwd: string;
  typeAware: boolean;
}

const TYPE_AWARE_RULES = new Set(["hook-o-gnese/custom-hook-depth"]);

function ruleNamespace(id: string): string {
  return id.replace(/^hook-o-gnese\//, "");
}

function getLoc(node: any): { line: number; column: number; endLine?: number; endColumn?: number } {
  const start = node?.loc?.start ?? node?.start;
  const end = node?.loc?.end ?? node?.end;
  return {
    line: start?.line ?? 1,
    column: start?.column ?? 1,
    endLine: end?.line,
    endColumn: end?.column,
  };
}

function walkAST(node: any, handlers: Record<string, any>) {
  if (!node || typeof node !== "object") return;
  const enter = handlers[node.type];
  if (enter) enter(node);
  for (const key in node) {
    const v = node[key];
    if (Array.isArray(v)) {
      for (const c of v) walkAST(c, handlers);
    } else if (v && typeof v === "object") {
      walkAST(v, handlers);
    }
  }
  const exit = handlers[`${node.type}:exit`];
  if (exit) exit(node);
}

export async function lintFile(
  filePath: string,
  source: string,
  config: EngineConfig,
): Promise<Diagnostic[]> {
  const lang = filePath.endsWith(".tsx")
    ? "tsx"
    : filePath.endsWith(".ts")
    ? "ts"
    : filePath.endsWith(".jsx")
    ? "jsx"
    : "js";

  const parsed = parseSync(filePath, source, {
    lang,
    sourceType: "module",
  });

  if (parsed.errors?.length) {
    return parsed.errors.map((e: any) => ({
      file: filePath,
      rule: "parse-error",
      severity: "error" as const,
      message: e.message ?? "parse error",
      line: e.labels?.[0]?.start?.line ?? 1,
      column: e.labels?.[0]?.start?.column ?? 1,
    }));
  }

  // Bail early on non-React files
  const imports = parsed.module?.staticImports ?? [];
  const hasReact = imports.some((i: any) =>
    (i.moduleRequest?.value ?? i.source?.value) === "react"
  );
  if (!hasReact) return [];

  const out: Diagnostic[] = [];

  for (const [ruleId, ruleCfg] of Object.entries(config.rules)) {
    if (ruleCfg.severity === "off") continue;
    if (!config.typeAware && TYPE_AWARE_RULES.has(ruleId)) continue;

    const rule = (ALL_RULES as any)[ruleNamespace(ruleId)];
    if (!rule) continue;

    const localDiags: Diagnostic[] = [];
    const context = {
      options: ruleCfg.options ? [ruleCfg.options] : [],
      filename: filePath,
      cwd: config.cwd,
      report(d: { message: string; node: any }) {
        const loc = getLoc(d.node);
        localDiags.push({
          file: filePath,
          rule: ruleId,
          severity: ruleCfg.severity as "warn" | "error",
          message: d.message,
          ...loc,
        });
      },
    };

    const handlers = rule.create(context);
    walkAST(parsed.program, handlers);
    out.push(...localDiags);
  }

  return out;
}

export type ReadTextFile = (path: string) => Promise<string>;

export async function lintFiles(
  filePaths: string[],
  config: EngineConfig,
  readTextFile?: ReadTextFile,
): Promise<Diagnostic[]> {
  const reader = readTextFile ?? ((p: string) => Deno.readTextFile(p));
  const results = await Promise.all(
    filePaths.map(async (p) => {
      const src = await reader(p);
      return lintFile(p, src, config);
    }),
  );
  return results.flat();
}
