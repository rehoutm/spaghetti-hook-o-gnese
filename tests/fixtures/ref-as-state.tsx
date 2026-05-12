// tests/fixtures/ref-as-state.tsx
// useRef as a hidden mutable state slot. The ref is both read and written in
// the same useEffect, which means it's state — just without React noticing.
import { useEffect, useRef, useState } from "react";

export function RetryThing({ url }: { url: string }) {
  const attemptsRef = useRef(0);
  const [data, setData] = useState<unknown>(null);

  useEffect(() => {
    if (attemptsRef.current > 3) return;
    attemptsRef.current = attemptsRef.current + 1;
    fetch(url).then((r) => r.json()).then(setData);
  }, [url]);

  return <div>{String(data)} ({attemptsRef.current} tries)</div>;
}

// Negative: latest-ref pattern. We only write the ref; reads happen elsewhere.
export function LatestCallback({ onTick }: { onTick: () => void }) {
  const cbRef = useRef(onTick);
  useEffect(() => {
    cbRef.current = onTick;
  }, [onTick]);
  useEffect(() => {
    const id = setInterval(() => cbRef.current(), 1000);
    return () => clearInterval(id);
  }, []);
  return null;
}
