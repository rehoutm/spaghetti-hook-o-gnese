import type { EngineConfig, Severity } from "./engine.ts";

const DEFAULT_RULES: Record<string, { severity: Severity; options?: unknown }> =
  {
    "hook-o-gnese/no-fat-effects": { severity: "warn" },
    "hook-o-gnese/state-scatter": { severity: "warn" },
    "hook-o-gnese/hook-coupling": { severity: "error" },
    "hook-o-gnese/custom-hook-depth": {
      severity: "warn",
      options: { maxDepth: 3 },
    },
    "hook-o-gnese/noise-callback-effect": { severity: "warn" },
  };

export const DEFAULT_IGNORE = [
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/.next/**",
  "**/.cache/**",
];

interface FileConfig {
  rules?: Record<string, Severity | [Severity, unknown]>;
  ignore?: string[];
  typeAware?: boolean;
}

export type ReadTextFile = (path: string) => Promise<string>;

export async function loadConfig(
  cwd: string,
  configPath: string | undefined,
  readTextFile: ReadTextFile,
): Promise<{ engine: EngineConfig; ignore: string[] }> {
  const candidates = configPath
    ? [configPath]
    : [`${cwd.replace(/\/$/, "")}/.hookogneserc.json`];

  let fileCfg: FileConfig = {};
  for (const c of candidates) {
    try {
      const text = await readTextFile(c);
      fileCfg = JSON.parse(text);
      break;
    } catch {
      // not found — fine, use defaults
    }
  }

  const rules: EngineConfig["rules"] = { ...DEFAULT_RULES };
  if (fileCfg.rules) {
    for (const [id, spec] of Object.entries(fileCfg.rules)) {
      if (Array.isArray(spec)) {
        rules[id] = { severity: spec[0], options: spec[1] };
      } else {
        rules[id] = { severity: spec };
      }
    }
  }

  return {
    engine: {
      rules,
      cwd,
      typeAware: fileCfg.typeAware ?? false,
    },
    ignore: fileCfg.ignore ?? DEFAULT_IGNORE,
  };
}

export function applyCliRuleOverrides(
  cfg: EngineConfig,
  overrides: Array<{ id: string; severity: Severity }>,
): EngineConfig {
  const rules = { ...cfg.rules };
  for (const o of overrides) {
    rules[o.id] = {
      ...(rules[o.id] ?? { severity: "off" }),
      severity: o.severity,
    };
  }
  return { ...cfg, rules };
}
