import type { Formatter } from "./types.ts";

export const json: Formatter = ({ diagnostics, filesScanned, durationMs }) =>
  JSON.stringify({ diagnostics, filesScanned, durationMs }, null, 2);
