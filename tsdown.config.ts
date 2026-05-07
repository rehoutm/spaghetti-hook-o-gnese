import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    cli: "src/cli.node.ts",
    engine: "src/engine.ts",
  },
  format: ["esm"],
  platform: "node",
  dts: true,
  clean: true,
  sourcemap: true,
  outDir: "dist",
});
