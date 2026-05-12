// tests/fixtures/noise-callback-effect.tsx
//
// Distilled from rouvy-companion's eslint9 + hook-o-gnese migration: a wave of
// "fixes" that just shuffled the useEffect dependency cluster into a sibling
// useCallback, leaving aggregate component complexity unchanged. Every case
// below MUST fire — the negative `Legitimate*` exports MUST NOT.
import { useCallback, useEffect } from "react";

// CustomTrainingPlanPromoModal.tsx — pattern: `() => { return cb(); }`.
export function PromoModal({ canCreateLoading, isPlanLoading }: any) {
  const maybeShowPromo = useCallback(() => {
    if (canCreateLoading || isPlanLoading) return undefined;
    return () => {};
  }, [canCreateLoading, isPlanLoading]);

  useEffect(() => {
    return maybeShowPromo();
  }, [maybeShowPromo]);

  return <div />;
}

// useTimezoneSync.ts — pattern: block body that just calls the callback.
export function TimezoneSync({ isLoaded, isUpdating, tz }: any) {
  const syncTimezone = useCallback(() => {
    if (!isLoaded || isUpdating) return;
    doThing(tz);
  }, [isLoaded, isUpdating, tz]);

  useEffect(() => {
    syncTimezone();
  }, [syncTimezone]);

  return <div />;
}

// useNavigationSync.tsx — same pattern with an async-ish branchy body.
export function NavigationSync(
  { isNavigating, direction, currentStep }: any,
) {
  const handleNavigationSync = useCallback(() => {
    if (!isNavigating) return;
    if (direction === "forward") moveTo(currentStep);
    else if (direction === "backward") goBack();
  }, [isNavigating, direction, currentStep]);

  useEffect(() => {
    handleNavigationSync();
  }, [handleNavigationSync]);

  return <div />;
}

// useRegenerationErrorStorage.ts — async callback laundered behind passthrough.
export function RegenErrorStorage({ planId, trainings }: any) {
  const checkForNewErrors = useCallback(async () => {
    const stored = await getStored();
    if (stored[planId] !== trainings.length) doThing(planId);
  }, [planId, trainings]);

  useEffect(() => {
    checkForNewErrors();
  }, [checkForNewErrors]);

  return <div />;
}

// HealthMetrics/hooks.ts — helper-extracted body still laundered into useEffect.
export function HealthSync({ defaultId, providers }: any) {
  const sync = useCallback(() => {
    syncDefault(providers, defaultId);
  }, [providers, defaultId]);

  useEffect(() => {
    sync();
  }, [sync]);

  return <div />;
}

// useRideScreenFocus.tsx — block body, single statement.
export function RideScreenFocus({ state, screen }: any) {
  const handleStateChange = useCallback(() => {
    if (state) navigate(screen);
  }, [state, screen]);

  useEffect(() => {
    handleStateChange();
  }, [handleStateChange]);

  return <div />;
}

// Negative: useCallback passed to a child as a prop. Must NOT be flagged.
export function LegitimatePropConsumer({ onClick }: any) {
  const handleClick = useCallback(() => {
    onClick?.("ok");
  }, [onClick]);

  useEffect(() => {
    document.title = "hi";
  }, []);

  return <button onClick={handleClick} />;
}

// Negative: useEffect does more than just call the callback (wraps in
// setTimeout). Same shape as useUnstuckRideScreen.ts in the rouvy PR — the
// callback is legitimately used inside the effect body, not laundered.
export function LegitimateTimerWrap({ a }: any) {
  const checkForStuck = useCallback(() => {
    doThing(a);
  }, [a]);

  useEffect(() => {
    const timer = setTimeout(checkForStuck, 5000);
    return () => clearTimeout(timer);
  }, [checkForStuck]);

  return <div />;
}

declare function doThing(_: unknown): void;
declare function moveTo(_: unknown): void;
declare function goBack(): void;
declare function getStored(): Promise<Record<string, number>>;
declare function syncDefault(_a: unknown, _b: unknown): void;
declare function navigate(_: unknown): void;
