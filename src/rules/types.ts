export interface RuleContext {
  options: unknown[];
  filename?: string;
  cwd?: string;
  report: (d: {
    message: string;
    node: unknown;
    severity?: "warn" | "error";
  }) => void;
}
