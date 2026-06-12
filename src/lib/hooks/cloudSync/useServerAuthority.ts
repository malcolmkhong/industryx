'use client';

import { useState } from 'react';

/**
 * Manages the server authority state for cloud sync.
 *
 * After guest-to-auth migration, the server is ALWAYS authoritative.
 * serverStateHash is used as clientChecksum on saves.
 * serverStateVersion tracks the server-side version counter.
 */
export function useServerAuthority() {
  const [serverStateHash, setServerStateHash] = useState<string | null>(null);
  const [serverStateVersion, setServerStateVersion] = useState<number | null>(null);
  const [isServerAuthoritative, setIsServerAuthoritative] = useState(false);

  return {
    serverStateHash,
    serverStateVersion,
    isServerAuthoritative,
    setServerStateHash,
    setServerStateVersion,
    setIsServerAuthoritative,
  };
}
