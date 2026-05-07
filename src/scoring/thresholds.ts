export interface Thresholds {
  fatEffect: { warn: number; error: number };
  stateScatter: { warn: number; error: number };
  hookCoupling: { warn: number; error: number };
  customHookDepth: { warn: number; error: number };
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  fatEffect: { warn: 10, error: 20 },
  stateScatter: { warn: 5, error: 8 },
  hookCoupling: { warn: 3, error: 6 },
  customHookDepth: { warn: 3, error: 5 },
};
