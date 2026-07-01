'use client';

import { Loader2 } from 'lucide-react';

export function LoadingSpinner({ size = 'sm' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeClass = size === 'sm' ? 'h-3 w-3' : size === 'md' ? 'h-4 w-4' : 'h-6 w-6';
  return <Loader2 className={`animate-spin ${sizeClass} text-current`} aria-hidden="true" />;
}