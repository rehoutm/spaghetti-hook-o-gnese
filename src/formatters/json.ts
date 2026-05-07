import type { Formatter } from "./types.ts";

export const json: Formatter = (ctx) => JSON.stringify(ctx, null, 2);
