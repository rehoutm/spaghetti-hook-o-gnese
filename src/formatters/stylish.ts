import type { Formatter } from "./types.ts";

export const stylish: Formatter = (
  { diagnostics, filesScanned, durationMs },
) => {
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
    lines.push(`\n${file}`);
    for (const d of ds) {
      const sev = d.severity === "error" ? "error" : "warn ";
      const loc = `${d.line}:${d.column}`.padEnd(7);
      lines.push(`  ${loc} ${sev}  ${d.message}  ${d.rule}`);
    }
  }
  const errors = diagnostics.filter((d) => d.severity === "error").length;
  const warnings = diagnostics.filter((d) => d.severity === "warn").length;
  lines.push(
    `\n${diagnostics.length} problems (${errors} error${
      errors === 1 ? "" : "s"
    }, ${warnings} warning${
      warnings === 1 ? "" : "s"
    }) in ${filesScanned} files, ${durationMs}ms`,
  );
  return lines.join("\n") + "\n";
};
