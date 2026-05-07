// tests/fixtures/deep-custom-hook.tsx
import * as React from "react";
import { useFetchAndPoll } from "./deep-custom-hook-impl.ts";

export function Widget({ id }: { id: string }) {
  const data = useFetchAndPoll(id);
  return <div>{JSON.stringify(data)}</div>;
}
