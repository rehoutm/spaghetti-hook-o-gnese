// tests/fixtures/deep-custom-hook-impl.ts
import { useEffect, useMemo, useState } from "react";

function useInterval(cb: () => void, ms: number) {
  useEffect(() => {
    const id = setInterval(cb, ms);
    return () => clearInterval(id);
  }, [cb, ms]);
}

function usePolling(fn: () => void) {
  useInterval(fn, 5000);
  useEffect(() => { fn(); }, [fn]);
}

function useDeepPoll(fn: () => void) {
  usePolling(fn);
}

export function useFetchAndPoll(id: string) {
  const [data, setData] = useState<unknown>(null);
  const memoId = useMemo(() => id.toLowerCase(), [id]);
  useDeepPoll(() => {
    fetch(`/api/${memoId}`).then((r) => r.json()).then(setData);
  });
  return data;
}
