"use client";

/**
 * AuthContext — PR4-4A.
 *
 * React context that exposes the `AuthOrchestrator` instance and its
 * current state. The provider wires the orchestrator's state subscription
 * to a `useState` so React re-renders consumers when the status changes.
 *
 * The legacy mirror shape (`user`, `session`, `loading`, `isGuest`) is no
 * longer here — PR4-4B's `AuthProvider` will keep that compatibility
 * surface while routing its data through the orchestrator's state.
 */

import React, { createContext, useEffect, useMemo, useState } from "react";

import { AuthOrchestrator } from "./AuthOrchestrator";
import type { OrchestratorState } from "./types";

export interface AuthContextValue {
  orchestrator: AuthOrchestrator;
  state: OrchestratorState;
}

export const AuthOrchestratorContext = createContext<AuthContextValue | null>(
  null,
);

export function AuthOrchestratorProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [orchestrator] = useState<AuthOrchestrator>(
    () => new AuthOrchestrator(),
  );
  const [state, setState] = useState<OrchestratorState>(
    () => orchestrator.getState(),
  );

  useEffect(() => {
    return orchestrator.subscribe(setState);
  }, [orchestrator]);

  const value = useMemo<AuthContextValue>(
    () => ({ orchestrator, state }),
    [orchestrator, state],
  );

  return (
    <AuthOrchestratorContext.Provider value={value}>
      {children}
    </AuthOrchestratorContext.Provider>
  );
}