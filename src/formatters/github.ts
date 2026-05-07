import type { Formatter } from "./types.ts";

export const github: Formatter = ({ diagnostics }) =>
  diagnostics.map((d) => {
    const cmd = d.severity === "error" ? "::error" : "::warning";
    const safe = d.message.replace(/\r?\n/g, " ").replace(/::/g, ":");
    return `${cmd} file=${d.file},line=${d.line},col=${d.column},title=${d.rule}::${safe}`;
  }).join("\n") + "\n";
