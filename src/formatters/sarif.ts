import type { Formatter } from "./types.ts";

export const sarif: Formatter = ({ diagnostics }) => {
  const ruleIds = [...new Set(diagnostics.map((d) => d.rule))];
  return JSON.stringify(
    {
      version: "2.1.0",
      $schema:
        "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json",
      runs: [{
        tool: {
          driver: {
            name: "hook-o-gnese",
            informationUri: "https://github.com/rehoutm/spaghetti-hook-o-gnese",
            rules: ruleIds.map((id) => ({ id })),
          },
        },
        results: diagnostics.map((d) => ({
          ruleId: d.rule,
          level: d.severity === "error" ? "error" : "warning",
          message: { text: d.message },
          locations: [{
            physicalLocation: {
              artifactLocation: { uri: d.file },
              region: {
                startLine: d.line,
                startColumn: d.column,
                endLine: d.endLine,
                endColumn: d.endColumn,
              },
            },
          }],
        })),
      }],
    },
    null,
    2,
  );
};
