import type { Diagnostic } from "../engine.ts";

export interface FormatContext {
  diagnostics: Diagnostic[];
  filesScanned: number;
  durationMs: number;
}

export type Formatter = (ctx: FormatContext) => string;
