'use client';

/**
 * useAuth — Phase 1 skeleton.
 *
 * Returns the orchestrator state and instance. Phase 1 read-only. Later phases
 * add action helpers (requestLogin, etc.).
 */

import { useContext } from 'react';

import { AuthOrchestratorContext, type AuthContextValue } from './AuthContext';

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthOrchestratorContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthOrchestratorProvider');
  }
  return ctx;
}