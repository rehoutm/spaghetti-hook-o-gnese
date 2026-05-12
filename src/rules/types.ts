import type { TsProgramCache } from "../ts-program.ts";

export interface RuleContext {
  options: unknown[];
  filename?: string;
  cwd?: string;
  tsProgramCache?: TsProgramCache;
  report: (d: {
    message: string;
    node: unknown;
    severity?: "warn" | "error";
  }) => void;
}
