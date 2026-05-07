import ts from "typescript";

export class TsProgramCache {
  private program: ts.Program | null = null;
  private rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
  }

  private getProgram(): ts.Program {
    if (this.program) return this.program;
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
    const program = this.getProgram();
    const checker = program.getTypeChecker();
    const sourceFile = program.getSourceFile(filePath);
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
