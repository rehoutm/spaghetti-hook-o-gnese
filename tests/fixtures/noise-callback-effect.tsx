// tests/fixtures/noise-callback-effect.tsx
//
// Distilled from rouvy-companion's CustomTrainingPlanPromoModal "fix": a
// useCallback whose only use-site is a useEffect that does nothing but call it.
// The useCallback launders deps; aggregate complexity is unchanged.
import { useCallback, useEffect } from "react";

export function PromoModal({ canCreateLoading, isPlanLoading }: any) {
  // Pattern A — expression-body passthrough.
  const maybeShowPromo = useCallback(() => {
    if (canCreateLoading || isPlanLoading) return undefined;
    return () => {};
  }, [canCreateLoading, isPlanLoading]);

  useEffect(() => {
    return maybeShowPromo();
  }, [maybeShowPromo]);

  return <div />;
}

export function PromoModalBlock({ a, b }: any) {
  // Pattern A — block-body passthrough.
  const sync = useCallback(() => {
    if (!a) return;
    doThing(b);
  }, [a, b]);

  useEffect(() => {
    sync();
  }, [sync]);

  return <div />;
}

export function Legitimate({ onClick }: any) {
  // Negative: useCallback exists but is passed to a child as a prop, not
  // wrapped in a passthrough useEffect. Must NOT be flagged.
  const handleClick = useCallback(() => {
    onClick?.("ok");
  }, [onClick]);

  useEffect(() => {
    document.title = "hi";
  }, []);

  return <button onClick={handleClick} />;
}

declare function doThing(_: unknown): void;
