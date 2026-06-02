'use client';

import { useState, useEffect, useMemo } from 'react';
import { useReducedMotion } from '@/components/game/shared/useReducedMotion';

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  color: string;
  opacity: number;
  duration: number;
  delay: number;
}

const PARTICLE_COLORS = [
  'rgba(0, 255, 242, 0.2)',   // cyan
  'rgba(57, 255, 20, 0.15)',  // green
  'rgba(191, 0, 255, 0.12)',  // purple
  'rgba(0, 255, 242, 0.15)',  // cyan lighter
  'rgba(57, 255, 20, 0.1)',   // green lighter
  'rgba(191, 0, 255, 0.08)',  // purple lighter
];

export default function AmbientParticles() {
  const [mounted, setMounted] = useState(false);
  const reducedMotion = useReducedMotion();

  const particles = useMemo<Particle[]>(() => {
    const count = 18;
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: 2 + Math.random() * 2,
      color: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)],
      opacity: 0.1 + Math.random() * 0.2,
      duration: 5 + Math.random() * 10,
      delay: Math.random() * -15,
    }));
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true" />;
  }

  if (reducedMotion) {
    return (
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        {particles.map(p => (
          <div
            key={p.id}
            className="absolute rounded-full"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: `${p.size}px`,
              height: `${p.size}px`,
              backgroundColor: p.color,
              opacity: p.opacity,
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {particles.map(p => (
        <div
          key={p.id}
          className="absolute rounded-full"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            backgroundColor: p.color,
            opacity: p.opacity,
            animation: `ambientFloat ${p.duration}s ease-in-out ${p.delay}s infinite`,
          }}
        />
      ))}
    </div>
  );
}
