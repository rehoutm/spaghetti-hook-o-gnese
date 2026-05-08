import type { Diagnostic } from "../engine.ts";

export interface FormatContext {
  diagnostics: Diagnostic[];
  filesScanned: number;
  durationMs: number;
  color?: boolean;
}

export type Formatter = (ctx: FormatContext) => string;
