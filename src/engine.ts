/**
 * Standalone linting engine for `hook-o-gnese`.
 *
 * Provides a runtime-agnostic pipeline that parses files with `oxc-parser`,
 * runs the package's rules against the resulting AST, and returns
 * {@link Diagnostic} records. Used directly by the CLI and embeddable in any
 * host that can supply a file reader.
 *
 * @module
 */

import { parseSync } from "oxc-parser";
import { ALL_RULES } from "./rules/registry.ts";

/** Rule severity. `"off"` disables a rule entirely. */
export type Severity = "off" | "warn" | "error";

/** A single lint finding produced by the engine. */
export interface Diagnostic {
  /** Absolute or workspace-relative path of the linted file. */
  file: string;
  /** Fully qualified rule id (e.g. `"hook-o-gnese/no-fat-effects"`). */
  rule: string;
  /** Effective severity after rule and config resolution. */
  severity: Exclude<Severity, "off">;
  /** Human-readable description of the problem. */
  message: string;
  /** 1-based line where the diagnostic starts. */
  line: number;
  /** 1-based column where the diagnostic starts. */
  column: number;
  /** 1-based line where the diagnostic ends, when known. */
  endLine?: number;
  /** 1-based column where the diagnostic ends, when known. */
  endColumn?: number;
}

/** Per-rule configuration: severity plus optional rule-specific options. */
export interface RuleConfig {
  severity: Severity;
  options?: unknown;
}

/** Configuration consumed by {@link lintFile} and {@link lintFiles}. */
export interface EngineConfig {
  /** Map of rule id to its configuration. */
  rules: Record<string, RuleConfig>;
  /** Working directory used to resolve TypeScript projects and relative paths. */
  cwd: string;
  /** When true, type-aware rules (e.g. `custom-hook-depth`) are run. */
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

/**
 * Lint a single source file and return any diagnostics produced.
 *
 * Parses `source` with `oxc-parser`, bails out early on non-React files, and
 * dispatches every enabled rule in `config` against the resulting AST.
 *
 * @param filePath Path used for diagnostic reporting and to infer the parser language.
 * @param source The source code to lint.
 * @param config Resolved engine configuration.
 */
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

/** Reads a file's contents as text. Injected so the engine stays runtime-agnostic. */
export type ReadTextFile = (path: string) => Promise<string>;

/**
 * Lint a batch of files in parallel and return their combined diagnostics.
 *
 * @param filePaths Paths to lint.
 * @param config Resolved engine configuration shared across files.
 * @param readTextFile File reader supplied by the host (Deno, Node, in-memory).
 */
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
