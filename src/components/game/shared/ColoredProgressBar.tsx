'use client';

import * as React from 'react';
import * as ProgressPrimitive from '@radix-ui/react-progress';
import { cn } from '@/lib/utils';

interface ColoredProgressBarProps {
  value: number;
  color: string;
  showShimmer?: boolean;
  className?: string;
  animate?: boolean;
}

export function ColoredProgressBar({
  value,
  color,
  showShimmer = false,
  className,
  animate: _animate = false,
}: ColoredProgressBarProps) {
  const normalizedValue = Math.min(100, Math.max(0, (value || 0) * 100));

  return (
    <div className={cn('relative h-2 w-full overflow-hidden rounded-full bg-muted-label/20', className)}>
      <ProgressPrimitive.Root
        data-slot="progress"
        className="relative h-full w-full overflow-hidden rounded-full"
        value={normalizedValue}
      >
        <ProgressPrimitive.Indicator
          data-slot="progress-indicator"
          className="h-full w-full flex-1 transition-all"
          style={{ transform: `translateX(-${100 - normalizedValue}%)`, backgroundColor: color, boxShadow: `0 0 8px ${color}66` }}
        >
          {showShimmer && (
            <div className="absolute inset-0 bg-linear-to-b from-white/15 to-transparent" />
          )}
        </ProgressPrimitive.Indicator>
      </ProgressPrimitive.Root>
    </div>
  );
}
