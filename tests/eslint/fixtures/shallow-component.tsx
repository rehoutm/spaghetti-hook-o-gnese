import { useCounter } from "./shallow-hook-impl.ts";

export function ShallowWidget() {
  const { count } = useCounter();
  return <div>{count}</div>;
}
