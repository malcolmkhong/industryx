"use client";

import { useState, useEffect, useMemo } from "react";
import { useReducedMotion } from "@/components/game/shared/useReducedMotion";

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
  "rgba(0, 255, 242, 0.2)", // cyan
  "rgba(57, 255, 20, 0.15)", // green
  "rgba(191, 0, 255, 0.12)", // purple
  "rgba(0, 255, 242, 0.15)", // cyan lighter
  "rgba(57, 255, 20, 0.1)", // green lighter
  "rgba(191, 0, 255, 0.08)", // purple lighter
];

export default function AmbientParticles() {
  const [mounted, setMounted] = useState(false);
  const reducedMotion = useReducedMotion();

  // A5 (REAL-DEFECT-A5): SEC-008 forbids Math.random for any
  // id-shaped context. Even though particle positions are decorative
  // and not security-sensitive, the A5 architecture test widens the
  // rule to any id-shaped context. Use a deterministic mulberry32
  // PRNG seeded from a constant so the visual output is stable
  // across mounts (also makes E2E snapshots deterministic).
  const particles = useMemo<Particle[]>(() => {
    const count = 18;
    const rng = mulberry32(0xc0ffee);
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      x: rng() * 100,
      y: rng() * 100,
      size: 2 + rng() * 2,
      color: PARTICLE_COLORS[Math.floor(rng() * PARTICLE_COLORS.length)],
      opacity: 0.1 + rng() * 0.2,
      duration: 5 + rng() * 10,
      delay: rng() * -15,
    }));
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div
        className="absolute inset-0 overflow-hidden pointer-events-none"
        aria-hidden="true"
      />
    );
  }

  if (reducedMotion) {
    return (
      <div
        className="absolute inset-0 overflow-hidden pointer-events-none"
        aria-hidden="true"
      >
        {particles.map((p) => (
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
    <div
      className="absolute inset-0 overflow-hidden pointer-events-none"
      aria-hidden="true"
    >
      {particles.map((p) => (
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

// Mulberry32 — small, fast, deterministic PRNG. Public domain.
// Used here so the AmbientParticles visual is stable across mounts
// without relying on Math.random (per A5 / SEC-008).
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
