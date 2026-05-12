// tests/fixtures/dep-cluster.tsx
// Five hooks share the same deps. Classic "I split the fat effect" laundering.
import { useCallback, useEffect, useMemo } from "react";

export function SearchPanel({ query, filters, sortKey }: any) {
  const normalized = useMemo(
    () => normalize(query, filters, sortKey),
    [query, filters, sortKey],
  );

  const onSearch = useCallback(
    () => doSearch(query, filters, sortKey),
    [query, filters, sortKey],
  );

  const summary = useMemo(
    () => buildSummary(query, filters, sortKey),
    [query, filters, sortKey],
  );

  useEffect(() => {
    logImpression(query, filters, sortKey);
  }, [query, filters, sortKey]);

  useEffect(() => {
    syncUrl(query, filters, sortKey);
  }, [query, filters, sortKey]);

  return <div onClick={onSearch}>{normalized.length} — {summary}</div>;
}

declare function normalize(...args: any[]): any[];
declare function doSearch(...args: any[]): void;
declare function buildSummary(...args: any[]): string;
declare function logImpression(...args: any[]): void;
declare function syncUrl(...args: any[]): void;
