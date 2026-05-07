// tests/fixtures/coupled-hooks.tsx
import { useEffect, useState } from "react";

export function Counter() {
  const [count, setCount] = useState(0);
  const [doubled, setDoubled] = useState(0);

  useEffect(() => {
    if (count > 0) setCount(count + 1); // reads + writes count
    setDoubled(count * 2);
  }, [count]);

  return <div>{count}/{doubled}</div>;
}
