import { defineConfig } from "tsdown";
import license from "rollup-plugin-license";

interface BundledDep {
  name?: string | null;
  version?: string | null;
  license?: string | null;
  homepage?: string | null;
  repository?: { url?: string | null } | string | null;
  licenseText?: string | null;
}

const renderNotices = (deps: BundledDep[]): string => {
  const sorted = [...deps].sort((a, b) =>
    (a.name ?? "").localeCompare(b.name ?? "")
  );

  const header = `# Third-Party Notices

This file is auto-generated at build time by \`rollup-plugin-license\`.
It lists third-party software whose source code is bundled into the
distributed \`hook-o-gnese\` package (i.e. inlined into \`dist/\`).
Externalized dependencies (resolved via the consumer's package manager) are
not listed here — their licenses are delivered alongside their packages.

`;

  if (sorted.length === 0) {
    return `${header}No bundled third-party code at this version.\n`;
  }

  const blocks = sorted.map((d) => {
    const repo = typeof d.repository === "string"
      ? d.repository
      : d.repository?.url ?? null;
    const meta = [
      d.version && `- Version: ${d.version}`,
      d.license && `- License: ${d.license}`,
      d.homepage && `- Homepage: ${d.homepage}`,
      repo && `- Repository: ${repo}`,
    ].filter(Boolean).join("\n");

    const text = d.licenseText?.trim() ?? "(license text unavailable)";
    return `## ${d.name}\n\n${meta}\n\n\`\`\`\n${text}\n\`\`\`\n`;
  });

  return `${header}${blocks.join("\n---\n\n")}`;
};

export default defineConfig({
  entry: {
    index: "src/index.ts",
    cli: "src/cli.node.ts",
    engine: "src/engine.ts",
    eslint: "src/eslint.ts",
  },
  format: ["esm"],
  platform: "node",
  dts: true,
  clean: true,
  sourcemap: true,
  outDir: "dist",
  plugins: [
    // CJS interop: types resolve to a namespace, but the runtime default is the plugin factory.
    // deno-lint-ignore no-explicit-any
    (license as any)({
      thirdParty: {
        includePrivate: false,
        output: {
          file: "dist/THIRD_PARTY_NOTICES.md",
          template: renderNotices,
        },
      },
      // deno-lint-ignore no-explicit-any
    }) as any,
  ],
});
