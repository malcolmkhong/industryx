import Image from 'next/image';
import { memo } from 'react';

export type BrandLogoSize = 'sm' | 'md' | 'lg';

export interface BrandLogoProps {
  size?: BrandLogoSize;
  className?: string;
}

const SIZE_MAP: Record<BrandLogoSize, { box: string; px: number }> = {
  sm: { box: 'w-6 h-6 rounded-md', px: 24 },
  md: { box: 'w-10 h-10 rounded-lg', px: 40 },
  lg: { box: 'w-16 h-16 rounded-xl', px: 64 },
};

function BrandLogoImpl({ size = 'md', className = '' }: BrandLogoProps) {
  const { box, px } = SIZE_MAP[size];

  return (
    <span
      className={`relative inline-flex items-center justify-center bg-linear-to-br from-brand to-success/80 shadow-[0_0_12px_rgba(0,255,242,0.2)] shrink-0 overflow-hidden ${box} ${className}`}
      aria-label="IndustriaX logo"
    >
      <Image
        src="/brand/favicon-32x32.png"
        alt=""
        width={px}
        height={px}
        priority
        className="w-full h-full object-contain"
      />
    </span>
  );
}

export const BrandLogo = memo(BrandLogoImpl);