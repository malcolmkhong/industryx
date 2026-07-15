'use client';

import Image from 'next/image';
import { useState } from 'react';

interface UserAvatarProps {
  avatarUrl?: string | null;
  email?: string | null;
  displayName?: string | null;
  size?: number;
  className?: string;
}

/**
 * Renders a user avatar: real image if available, initial-letter fallback otherwise.
 *
 * Edge cases handled:
 *  - null/undefined/empty avatarUrl → fallback to initial circle
 *  - Image load error (CDN 404, hotlink block, expired URL) → swap to initial via React state
 *  - referrerPolicy="no-referrer" prevents Google CDN hotlink rejection
 *  - next/image is lazy by default
 *  - Explicit width/height props prevent CLS while img loads
 *  - `unoptimized` skips the optimizer for arbitrary external URLs; the configured
 *    remotePatterns in next.config.ts cover common OAuth CDNs, but `unoptimized`
 *    keeps the component safe if an unexpected host appears in player data.
 */
export function UserAvatar({
  avatarUrl,
  email,
  displayName,
  size = 32,
  className = '',
}: UserAvatarProps) {
  const [hasError, setHasError] = useState(false);
  const initial = (email || displayName || 'U')[0].toUpperCase();
  const dim = `${size}px`;
  const fontSize = Math.max(10, Math.round(size * 0.4));

  if (avatarUrl && !hasError) {
    return (
      <Image
        src={avatarUrl}
        alt=""
        width={size}
        height={size}
        unoptimized
        referrerPolicy="no-referrer"
        className={`rounded-full object-cover shrink-0 bg-background/40 ${className}`}
        style={{ width: dim, height: dim }}
        onError={() => setHasError(true)}
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      className={`rounded-full bg-background/40 flex items-center justify-center text-subtle font-medium shrink-0 ${className}`}
      style={{ width: dim, height: dim, fontSize }}
    >
      {initial}
    </div>
  );
}

/**
 * Companion fallback element used when avatar img is rendered alongside an
 * initial-letter fallback that should appear only on img error.
 */
export function UserAvatarFallback({
  email,
  displayName,
  size = 32,
  className = '',
}: Omit<UserAvatarProps, 'avatarUrl'>) {
  const initial = (email || displayName || 'U')[0].toUpperCase();
  const dim = `${size}px`;
  const fontSize = Math.max(10, Math.round(size * 0.4));
  return (
    <div
      aria-hidden="true"
      className={`rounded-full bg-background/40 flex items-center justify-center text-subtle font-medium shrink-0 ${className}`}
      style={{ width: dim, height: dim, fontSize, display: 'none' }}
    >
      {initial}
    </div>
  );
}