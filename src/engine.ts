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

function buildLineOffsets(source: string): number[] {
  const offsets = [0];
  for (let i = 0; i < source.length; i++) {
    if (source.charCodeAt(i) === 10) offsets.push(i + 1);
  }
  return offsets;
}

function offsetToLineCol(
  offset: number,
  lineOffsets: number[],
): { line: number; column: number } {
  let lo = 0;
  let hi = lineOffsets.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (lineOffsets[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return { line: lo + 1, column: offset - lineOffsets[lo] + 1 };
}

function getLoc(
  node: any,
  lineOffsets: number[],
): { line: number; column: number; endLine?: number; endColumn?: number } {
  const startOffset = typeof node?.start === "number" ? node.start : undefined;
  const endOffset = typeof node?.end === "number" ? node.end : undefined;
  if (startOffset === undefined) {
    return { line: 1, column: 1 };
  }
  const start = offsetToLineCol(startOffset, lineOffsets);
  const end = endOffset !== undefined
    ? offsetToLineCol(endOffset, lineOffsets)
    : undefined;
  return {
    line: start.line,
    column: start.column,
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

  const lineOffsets = buildLineOffsets(source);

  if (parsed.errors?.length) {
    return parsed.errors.map((e: any) => {
      const offset = typeof e.labels?.[0]?.start === "number"
        ? e.labels[0].start
        : undefined;
      const loc = offset !== undefined
        ? offsetToLineCol(offset, lineOffsets)
        : { line: 1, column: 1 };
      return {
        file: filePath,
        rule: "parse-error",
        severity: "error" as const,
        message: e.message ?? "parse error",
        line: loc.line,
        column: loc.column,
      };
    });
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
      report(d: { message: string; node: any; severity?: "warn" | "error" }) {
        const loc = getLoc(d.node, lineOffsets);
        const cfgSev = ruleCfg.severity as "warn" | "error";
        // Rule-emitted severity only escalates (warn → error); never downgrades.
        const severity = d.severity === "error" ? "error" : cfgSev;
        localDiags.push({
          file: filePath,
          rule: ruleId,
          severity,
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
  readTextFile: ReadTextFile,
): Promise<Diagnostic[]> {
  const results = await Promise.all(
    filePaths.map(async (p) => {
      const src = await readTextFile(p);
      return lintFile(p, src, config);
    }),
  );
  return results.flat();
}
