import type { Formatter } from "./types.ts";

const wrap = (open: number, close: number) => (s: string) =>
  `\x1b[${open}m${s}\x1b[${close}m`;

const red = wrap(31, 39);
const yellow = wrap(33, 39);
const bold = wrap(1, 22);
const dim = wrap(2, 22);
const underline = wrap(4, 24);
const identity = (s: string) => s;

export const stylish: Formatter = (
  { diagnostics, filesScanned, durationMs, color },
) => {
  const paintRed = color ? red : identity;
  const paintYellow = color ? yellow : identity;
  const paintBold = color ? bold : identity;
  const paintDim = color ? dim : identity;
  const paintUnderline = color ? underline : identity;

  if (diagnostics.length === 0) {
    return `✓ no problems found (${filesScanned} files, ${durationMs}ms)\n`;
  }
  const byFile = new Map<string, typeof diagnostics>();
  for (const d of diagnostics) {
    if (!byFile.has(d.file)) byFile.set(d.file, []);
    byFile.get(d.file)!.push(d);
  }
  const lines: string[] = [];
  for (const [file, ds] of byFile) {
    lines.push(`\n${paintUnderline(file)}`);
    for (const d of ds) {
      const isError = d.severity === "error";
      const sevLabel = isError ? "error" : "warn ";
      const sev = paintBold(
        isError ? paintRed(sevLabel) : paintYellow(sevLabel),
      );
      const loc = paintDim(`${d.line}:${d.column}`.padEnd(7));
      lines.push(`  ${loc} ${sev}  ${d.message}  ${paintDim(d.rule)}`);
    }
  }
  const errors = diagnostics.filter((d) => d.severity === "error").length;
  const warnings = diagnostics.filter((d) => d.severity === "warn").length;
  const summary = `${diagnostics.length} problems (${errors} error${
    errors === 1 ? "" : "s"
  }, ${warnings} warning${
    warnings === 1 ? "" : "s"
  }) in ${filesScanned} files, ${durationMs}ms`;
  const paintSummary = errors > 0
    ? paintRed
    : warnings > 0
    ? paintYellow
    : identity;
  lines.push(`\n${paintBold(paintSummary(summary))}`);
  return lines.join("\n") + "\n";
};
