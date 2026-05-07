# Threshold reasoning

All thresholds are first-pass. Tune `options.threshold` (or `options.maxDepth`) per rule for your codebase.

## no-fat-effects

`score = deps + branches*2 + setStates*1.5 + nestedEffects*5 + (subscriptionWithoutCleanup ? 3 : 0)`

| Threshold | Default | Meaning |
| --- | --- | --- |
| warn | 10 | Approaching unmaintainability |
| error | 20 | Decompose |

## state-scatter

`score = useStateCount + correlatedSetters*0.5`

| Threshold | Default | Meaning |
| --- | --- | --- |
| warn | 5 | Consider useReducer |
| error | 8 | Likely needs split |

## hook-coupling

`score = sum over effects of (3 per state read+written in same effect)`

| Threshold | Default | Meaning |
| --- | --- | --- |
| warn | 3 | Suspicious |
| error | 6 | Likely loop bait |

## custom-hook-depth

Transitive nesting depth (non-React hooks only).

| Threshold | Default | Meaning |
| --- | --- | --- |
| warn | 3 | Hook tree getting tall |
| error | 5 | Over-abstracted |
