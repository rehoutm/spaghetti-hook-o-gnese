// tests/fixtures/deep-custom-hook.tsx
import { useFetchAndPoll } from "./deep-custom-hook-impl.ts";

export function Widget({ id }: { id: string }) {
  const data = useFetchAndPoll(id);
  return <div>{JSON.stringify(data)}</div>;
}
