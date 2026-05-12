import { createRequire } from "node:module";
import { join as joinPath } from "node:path";
import type ts from "typescript";

type TS = typeof ts;

// Per-cwd cache: different consumers may resolve to different `typescript`
// installs, so the cache key must include cwd.
const tsCache = new Map<string, TS>();

// Resolve from a fictitious file inside the consumer's CWD so Node walks UP
// their project tree (finding their installed `typescript`), not ours. This
// matters for `npx`, where the package lives in npm's npx cache.
function requireFromCwd(cwd: string) {
  return createRequire(joinPath(cwd, "_"));
}

function loadTs(cwd: string): TS {
  const cached = tsCache.get(cwd);
  if (cached) return cached;
  try {
    const mod = requireFromCwd(cwd)("typescript") as TS | { default: TS };
    const lib = ((mod as { default?: TS }).default ?? mod) as TS;
    tsCache.set(cwd, lib);
    return lib;
  } catch (err) {
    throw new Error(
      "hook-o-gnese: --type-aware requires the 'typescript' package to be " +
        "installed in your project. Install it with: npm i -D typescript@>=6",
      { cause: err as Error },
    );
  }
}

export function isTypescriptAvailable(cwd: string): boolean {
  try {
    loadTs(cwd);
    return true;
  } catch {
    return false;
  }
}

export class TsProgramCache {
  private program: ts.Program | null = null;
  private rootDir: string;
  private ts: TS;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
    this.ts = loadTs(rootDir);
  }

  // Alt constructor: accepts a pre-built ts.Program (e.g. from @typescript-eslint/parser
  // parserServices) and skips findConfigFile/createProgram. The ts module is loaded via
  // loadTs(cwd) — safe because @typescript-eslint/parser already resolved TS into
  // the consumer's project, so it will always be in the require cache.
  static fromProgram(program: ts.Program, cwd = process.cwd()): TsProgramCache {
    const instance = Object.create(TsProgramCache.prototype) as TsProgramCache;
    instance.program = program;
    instance.rootDir = cwd;
    instance.ts = loadTs(cwd);
    return instance;
  }

  private getProgram(): ts.Program {
    if (this.program) return this.program;
    const ts = this.ts;
    const configPath = ts.findConfigFile(
      this.rootDir,
      ts.sys.fileExists,
      "tsconfig.json",
    );
    let compilerOptions: ts.CompilerOptions = {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.Preserve,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      allowJs: true,
      noEmit: true,
      skipLibCheck: true,
      strict: false,
    };
    let fileNames: string[] = [];
    if (configPath) {
      const cfg = ts.readConfigFile(configPath, ts.sys.readFile);
      const configDir = configPath.slice(0, configPath.lastIndexOf("/"));
      const parsed = ts.parseJsonConfigFileContent(
        cfg.config,
        ts.sys,
        configDir,
      );
      compilerOptions = { ...compilerOptions, ...parsed.options };
      fileNames = parsed.fileNames;
    }
    this.program = ts.createProgram(fileNames, compilerOptions);
    return this.program;
  }

  resolveIdentifierDeclaration(
    filePath: string,
    identifier: string,
  ): ts.Declaration | null {
    const ts = this.ts;
    const program = this.getProgram();
    const checker = program.getTypeChecker();
    const absolute = filePath.startsWith("/")
      ? filePath
      : `${this.rootDir.replace(/\/$/, "")}/${filePath}`;
    const sourceFile = program.getSourceFile(absolute) ??
      program.getSourceFile(filePath);
    if (!sourceFile) return null;

    let target: ts.Node | null = null;
    function find(node: ts.Node) {
      if (target) return;
      if (ts.isIdentifier(node) && node.text === identifier) {
        target = node;
        return;
      }
      ts.forEachChild(node, find);
    }
    find(sourceFile);
    if (!target) return null;

    const symbol = checker.getSymbolAtLocation(target);
    if (!symbol) return null;
    const aliased = symbol.flags & ts.SymbolFlags.Alias
      ? checker.getAliasedSymbol(symbol)
      : symbol;
    return aliased.declarations?.[0] ?? null;
  }

  countTransitiveHookCalls(
    decl: ts.Declaration,
    depth = 0,
    seen = new Set<ts.Declaration>(),
  ): number {
    if (depth > 10 || seen.has(decl)) return depth;
    seen.add(decl);
    const ts = this.ts;
    const program = this.getProgram();
    const checker = program.getTypeChecker();
    let maxDepth = depth;

    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        /^use[A-Z]/.test(node.expression.text)
      ) {
        const sym = checker.getSymbolAtLocation(node.expression);
        if (sym) {
          const aliased = sym.flags & ts.SymbolFlags.Alias
            ? checker.getAliasedSymbol(sym)
            : sym;
          const innerDecl = aliased.declarations?.[0];
          if (innerDecl) {
            const sf = innerDecl.getSourceFile();
            if (
              sf.fileName.includes("node_modules/@types/react") ||
              sf.fileName.includes("node_modules/react/")
            ) {
              maxDepth = Math.max(maxDepth, depth + 1);
            } else {
              const childDepth = this.countTransitiveHookCalls(
                innerDecl,
                depth + 1,
                seen,
              );
              maxDepth = Math.max(maxDepth, childDepth);
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };

    visit(decl);
    return maxDepth;
  }
}
