import { TsProgramCache } from "../ts-program.ts";
import { DEFAULT_THRESHOLDS } from "../scoring/thresholds.ts";
import { getHookName } from "../ast-helpers.ts";
import type { RuleContext } from "./types.ts";

interface Options {
  maxDepth?: number;
  errorMaxDepth?: number;
}

const REACT_HOOKS = new Set([
  "useState",
  "useEffect",
  "useLayoutEffect",
  "useMemo",
  "useCallback",
  "useReducer",
  "useContext",
  "useRef",
  "useImperativeHandle",
  "useDebugValue",
  "useId",
  "useTransition",
  "useDeferredValue",
  "useSyncExternalStore",
  "useInsertionEffect",
]);

let sharedCache: TsProgramCache | null = null;

export const customHookDepth = {
  meta: {
    type: "suggestion" as const,
    docs: {
      description:
        "Flag custom hooks whose transitive nesting exceeds maxDepth (type-aware).",
    },
  },
  create(context: RuleContext) {
    const opts = (context.options[0] as Options | undefined) ?? {};
    const maxDepth = opts.maxDepth ?? DEFAULT_THRESHOLDS.customHookDepth.warn;
    const errorMaxDepth = opts.errorMaxDepth ??
      DEFAULT_THRESHOLDS.customHookDepth.error;
    let cache: TsProgramCache;
    if (context.tsProgramCache) {
      cache = context.tsProgramCache;
    } else {
      const g = globalThis as {
        Deno?: { cwd(): string };
        process?: { cwd(): string };
      };
      const cwd = context.cwd ?? g.process?.cwd() ?? g.Deno?.cwd() ?? ".";
      sharedCache ??= new TsProgramCache(cwd);
      cache = sharedCache;
    }
    const filename = context.filename;

    return {
      CallExpression(node: any) {
        const name = getHookName(node);
        if (!name || REACT_HOOKS.has(name)) return;
        if (!filename) return;
        const decl = cache.resolveIdentifierDeclaration(filename, name);
        if (!decl) return;
        const depth = cache.countTransitiveHookCalls(decl);
        if (depth >= maxDepth) {
          const severity = depth >= errorMaxDepth ? "error" : "warn";
          context.report({
            message:
              `custom hook '${name}' transitive depth ${depth} ≥ ${maxDepth}`,
            node,
            severity,
          });
        }
      },
    };
  },
};
