import { useDeepCustomHook } from "./deep-hook-impl.ts";

export function DeepWidget({ id }: { id: string }) {
  const data = useDeepCustomHook(id);
  return <div>{JSON.stringify(data)}</div>;
}
