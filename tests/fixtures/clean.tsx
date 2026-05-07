// tests/fixtures/clean.tsx
import { useState } from "react";
export function Counter() {
  const [c, setC] = useState(0);
  return <button onClick={() => setC(c + 1)}>{c}</button>;
}
