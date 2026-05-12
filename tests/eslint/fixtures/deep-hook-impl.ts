import { useEffect, useState } from "react";

function useInterval(cb: () => void, ms: number) {
  useEffect(() => {
    const id = setInterval(cb, ms);
    return () => clearInterval(id);
  }, [cb, ms]);
}

function usePolling(fn: () => void) {
  useInterval(fn, 5000);
}

function useDeepPoll(fn: () => void) {
  usePolling(fn);
}

export function useDeepCustomHook(id: string) {
  const [data, setData] = useState<unknown>(null);
  useDeepPoll(() => {
    fetch(`/api/${id}`).then((r) => r.json()).then(setData);
  });
  return data;
}
