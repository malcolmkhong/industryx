import { useSyncExternalStore } from 'react';

// Hydration guard: with server-authoritative persistence, the store
// initializes synchronously on import — there is no async rehydration
// step. The only job here is to defer the first client render to the
// post-mount phase so SSR markup (rendered before the orchestrator
// loads the user session) does not mismatch client markup.
//
// useSyncExternalStore is the React-recommended primitive for "snapshot
// that flips once on mount" — it satisfies the
// react-hooks/set-state-in-effect rule without the cascading render
// of an effect-driven setState.
export function useHydrationGuard(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}