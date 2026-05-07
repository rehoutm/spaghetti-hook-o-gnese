// Phase 2 dogfood smoke runner. THROWAWAY — replaced by src/engine.ts + src/cli.ts in Tasks 11/13.
// Walks a directory, parses TS/TSX/JS/JSX, runs the no-fat-effects rule, prints findings.
//
// Usage:  deno run --allow-read --allow-env --allow-ffi scripts/smoke.ts <path>

import { parseSync } from "oxc-parser";
import { walk as fsWalk } from "@std/fs";
import { relative } from "@std/path";
import { noFatEffects } from "../src/rules/no-fat-effects.ts";

interface Diag {
  file: string;
  line: number;
  column: number;
  message: string;
  rule: string;
}

const root = Deno.args[0];
if (!root) {
  console.error("usage: smoke <path>");
  Deno.exit(2);
}

const cwd = Deno.cwd();
const exts = new Set([".ts", ".tsx", ".jsx", ".js"]);
const skipDirs = new Set(["node_modules", ".git", "dist", "build", "ios", "android", "__mocks__", "__tests__"]);

const diagnostics: Diag[] = [];
let fileCount = 0;
let parseFailures = 0;
const start = performance.now();

for await (const entry of fsWalk(root, { includeDirs: false, skip: [/node_modules/, /\.git/, /\/dist\//, /\/build\//, /\/ios\//, /\/android\//] })) {
  const ext = entry.path.slice(entry.path.lastIndexOf("."));
  if (!exts.has(ext)) continue;
  fileCount++;

  let source: string;
  try {
    source = await Deno.readTextFile(entry.path);
  } catch {
    continue;
  }

  const lang = ext === ".tsx" || ext === ".jsx" ? "tsx" : "ts";
  let program: any;
  try {
    const result = parseSync(entry.path, source, { lang, sourceType: "module" });
    program = result.program;
    if (result.errors && result.errors.length > 0) {
      // Soft-tolerate parse errors — common in monorepos with experimental syntax.
    }
  } catch {
    parseFailures++;
    continue;
  }

  const fileDiags: { message: string; node: any }[] = [];
  const context = {
    options: [],
    filename: entry.path,
    cwd,
    report: (d: { message: string; node: any }) => fileDiags.push(d),
  };
  const handlers = noFatEffects.create(context);

  function visit(n: any) {
    if (!n || typeof n !== "object") return;
    const enter = handlers[n.type];
    if (enter) enter(n);
    for (const k in n) {
      const v = n[k];
      if (Array.isArray(v)) v.forEach(visit);
      else if (v && typeof v === "object") visit(v);
    }
  }
  visit(program);

  for (const d of fileDiags) {
    const start = d.node.start ?? 0;
    let line = 1, column = 1;
    for (let i = 0; i < start && i < source.length; i++) {
      if (source[i] === "\n") { line++; column = 1; } else { column++; }
    }
    diagnostics.push({
      file: relative(cwd, entry.path),
      line,
      column,
      message: d.message,
      rule: "hook-o-gnese/no-fat-effects",
    });
  }
}

const elapsed = ((performance.now() - start) / 1000).toFixed(2);

// Stylish-ish output, grouped by file.
const byFile = new Map<string, Diag[]>();
for (const d of diagnostics) {
  const arr = byFile.get(d.file) ?? [];
  arr.push(d);
  byFile.set(d.file, arr);
}

for (const [file, diags] of byFile) {
  console.log(`\n${file}`);
  for (const d of diags) {
    console.log(`  ${String(d.line).padStart(4)}:${String(d.column).padEnd(3)}  warning  ${d.message}  ${d.rule}`);
  }
}

console.log(`\n${diagnostics.length} finding(s) across ${byFile.size} file(s) of ${fileCount} scanned (${parseFailures} parse failures) in ${elapsed}s`);
