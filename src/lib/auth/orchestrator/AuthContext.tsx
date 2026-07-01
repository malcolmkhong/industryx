'use client';

/**
 * AuthContext — Phase 1 skeleton.
 *
 * Provides the AuthOrchestrator instance via React context. Phase 1: just
 * exposes the orchestrator and its state. Later phases wire STARTUP, SIGN_OUT,
 * OAUTH_* events to actual pipelines.
 */

import React, { createContext, useEffect, useMemo, useState } from 'react';

import { AuthOrchestrator } from './AuthOrchestrator';
import type { OrchestratorState } from './types';

export interface AuthContextValue {
  orchestrator: AuthOrchestrator;
  state: OrchestratorState;
}

export const AuthOrchestratorContext = createContext<AuthContextValue | null>(null);

export function AuthOrchestratorProvider({ children }: { children: React.ReactNode }) {
  const [orchestrator] = useState<AuthOrchestrator>(() => new AuthOrchestrator());
  const [state, setState] = useState<OrchestratorState>(() => orchestrator.getState());

  useEffect(() => {
    return orchestrator.subscribe(setState);
  }, [orchestrator]);

  const value = useMemo<AuthContextValue>(() => ({ orchestrator, state }), [orchestrator, state]);

  return (
    <AuthOrchestratorContext.Provider value={value}>
      {children}
    </AuthOrchestratorContext.Provider>
  );
}