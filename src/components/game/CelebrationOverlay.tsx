'use client';

import { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/lib/game/store';
import { Celebration } from '@/lib/game/types';
import { soundEngine } from '@/lib/game/soundEngine';

// Confetti particle component
function ConfettiParticles({ color }: { color: string }) {
  const particles = useMemo(() => {
    const items = [];
    const colors = [color, '#00fff2', '#39ff14', '#ff6600', '#bf00ff', '#ffff00', '#f472b6', '#4ade80'];
    for (let i = 0; i < 24; i++) {
      items.push({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 0.5,
        size: 3 + Math.random() * 5,
        color: colors[Math.floor(Math.random() * colors.length)],
        duration: 1.5 + Math.random() * 1,
      });
    }
    return items;
  }, [color]);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map(p => (
        <div
          key={p.id}
          className="confetti-particle absolute rounded-full"
          style={{
            left: `${p.left}%`,
            top: '-10px',
            width: `${p.size}px`,
            height: `${p.size}px`,
            backgroundColor: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
          }}
        />
      ))}
    </div>
  );
}

// Single celebration card
function CelebrationCard({ celebration, onDismiss }: { celebration: Celebration; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 3000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.9, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      className="relative"
    >
      {/* Confetti particles */}
      <ConfettiParticles color={celebration.color} />

      {/* Card */}
      <div
        className="relative rounded-2xl p-6 border-2 backdrop-blur-xl bg-[#111827]/90 shadow-2xl max-w-sm mx-auto text-center"
        style={{
          borderColor: celebration.color,
          boxShadow: `0 0 30px ${celebration.color}40, 0 0 60px ${celebration.color}20, inset 0 0 20px ${celebration.color}10`,
        }}
      >
        {/* Emoji */}
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1.2, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 15, delay: 0.1 }}
          className="text-5xl mb-3"
        >
          {celebration.emoji}
        </motion.div>

        {/* Title */}
        <motion.h2
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-xl font-bold mb-2"
          style={{ color: celebration.color }}
        >
          {celebration.title}
        </motion.h2>

        {/* Description */}
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-sm text-gray-300"
        >
          {celebration.description}
        </motion.p>

        {/* Sparkle decorations */}
        <div className="absolute -top-2 -right-2 text-xl animate-pulse">✨</div>
        <div className="absolute -bottom-1 -left-2 text-lg animate-pulse" style={{ animationDelay: '0.5s' }}>⭐</div>
        <div className="absolute top-2 -left-3 text-sm animate-pulse" style={{ animationDelay: '1s' }}>💫</div>

        {/* Progress bar auto-dismiss indicator */}
        <motion.div
          className="mt-4 h-1 rounded-full overflow-hidden bg-gray-800"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          <motion.div
            className="h-full rounded-full"
            style={{ backgroundColor: celebration.color }}
            initial={{ width: '100%' }}
            animate={{ width: '0%' }}
            transition={{ duration: 3, ease: 'linear' }}
          />
        </motion.div>

        {/* Click to dismiss */}
        <button
          onClick={onDismiss}
          className="mt-2 text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
        >
          Click to dismiss
        </button>
      </div>
    </motion.div>
  );
}

export default function CelebrationOverlay() {
  const celebrations = useGameStore(state => state.celebrations);
  const dismissCelebration = useGameStore(state => state.dismissCelebration);
  const [hasPlayedSound, setHasPlayedSound] = useState<string>('');

  // Play levelUp sound when a new celebration appears
  useEffect(() => {
    if (celebrations.length > 0) {
      const first = celebrations[0];
      if (first && first.title !== hasPlayedSound) {
        const t = setTimeout(() => {
          setHasPlayedSound(first.title);
          soundEngine.play('levelUp', 'events');
        }, 0);
        return () => clearTimeout(t);
      }
    } else {
      const t = setTimeout(() => setHasPlayedSound(''), 0);
      return () => clearTimeout(t);
    }
  }, [celebrations, hasPlayedSound]);

  const currentCelebration = celebrations[0] ?? null;

  const handleDismiss = () => {
    dismissCelebration();
  };

  return (
    <AnimatePresence mode="wait">
      {currentCelebration && (
        <motion.div
          key={currentCelebration.title + currentCelebration.type}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none"
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm pointer-events-auto" onClick={handleDismiss} />

          {/* Celebration card */}
          <div className="relative z-10 pointer-events-auto">
            <CelebrationCard celebration={currentCelebration} onDismiss={handleDismiss} />
          </div>

          {/* Queue indicator */}
          {celebrations.length > 1 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-[#111827]/80 backdrop-blur-md rounded-full px-4 py-2 border border-cyan-900/30 text-xs text-gray-400"
            >
              +{celebrations.length - 1} more celebration{celebrations.length > 2 ? 's' : ''} queued
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
