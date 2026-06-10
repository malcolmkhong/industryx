'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence, useMotionValue, animate } from 'framer-motion';
import { Plus, X } from 'lucide-react';
import { ICON_MAP } from '@/components/game/BottomNavigationBar';
import { useSettingsStore, type QuickAccessShortcut } from '@/lib/game/settingsStore';
import { GameTab } from '@/lib/game/types';
import { useReducedMotion } from '@/components/game/shared/useReducedMotion';

// ─── Constants ────────────────────────────────────────────────────────────────

const FAB_SIZE = 56;
const SHORTCUT_SIZE = 44;
const DRAG_THRESHOLD = 5;
const DOUBLE_TAP_MS = 300;
const EDGE_SNAP_THRESHOLD = 0.3;
const BOTTOM_NAV_HEIGHT = 70; // Approximate bottom nav bar height (without safe area)
const HEADER_HEIGHT = 80; // Approximate mobile header height (3 rows)
const SHORTCUT_RADIUS = 80;
const MIN_MARGIN = 12;

// ─── Angle Computation ────────────────────────────────────────────────────────

/**
 * Compute the angle (in radians) for a shortcut in the radial layout.
 * If FAB is near the bottom, shortcuts fan out upward in a semicircle.
 * Otherwise, they fan out in a full circle around the FAB.
 *
 * In standard math coordinates:
 *   - 0   = right
 *   - π/2 = up
 *   - π   = left
 *
 * We convert to CSS coordinates where Y points down, so we negate sin for Y.
 */
function computeShortcutAngle(
  index: number,
  total: number,
  isBottom: boolean,
): number {
  if (total <= 0) return 0;
  if (isBottom) {
    // Semicircle above: spread from π (left) to 0 (right) across the top
    if (total === 1) return Math.PI / 2;
    const step = Math.PI / (total - 1);
    return Math.PI - step * index;
  } else {
    // Full circle arrangement starting from top
    const step = (2 * Math.PI) / total;
    return Math.PI / 2 + step * index;
  }
}

// ─── Shortcut Button ──────────────────────────────────────────────────────────

function ShortcutButton({
  shortcut,
  index,
  total,
  isBottom,
  onSelect,
  reducedMotion,
}: {
  shortcut: QuickAccessShortcut;
  index: number;
  total: number;
  isBottom: boolean;
  onSelect: (action: string) => void;
  reducedMotion: boolean;
}) {
  const IconComponent = ICON_MAP[shortcut.icon];
  const angle = computeShortcutAngle(index, total, isBottom);
  const x = Math.cos(angle) * SHORTCUT_RADIUS;
  // In CSS, positive Y is downward. Our angles assume standard math (positive Y = up),
  // so we negate to convert: an angle of π/2 (up in math) becomes negative Y (up in CSS).
  const y = -Math.sin(angle) * SHORTCUT_RADIUS;

  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.3, x: 0, y: 0 }}
      animate={{
        opacity: 1,
        scale: 1,
        x,
        y,
        transition: reducedMotion
          ? { duration: 0.01 }
          : {
              type: 'spring',
              stiffness: 350,
              damping: 25,
              delay: index * 0.04,
            },
      }}
      exit={{
        opacity: 0,
        scale: 0.3,
        x: 0,
        y: 0,
        transition: reducedMotion
          ? { duration: 0.01 }
          : { duration: 0.15, ease: 'easeIn' as const },
      }}
      whileTap={{ scale: 0.9 }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(shortcut.action);
      }}
      className={`
        absolute flex items-center justify-center
        rounded-full
        bg-[#0d1220]/90 border border-cyan-900/30
        backdrop-blur-md
        hover:bg-white/[0.08] hover:border-cyan-500/40
        active:bg-white/[0.12]
        transition-colors duration-150
        group
      `}
      style={{
        width: SHORTCUT_SIZE,
        height: SHORTCUT_SIZE,
        left: (FAB_SIZE - SHORTCUT_SIZE) / 2,
        top: (FAB_SIZE - SHORTCUT_SIZE) / 2,
      }}
      aria-label={shortcut.label}
    >
      {IconComponent && (
        <IconComponent className={`w-5 h-5 ${shortcut.color}`} />
      )}
      <span
        className={`
          absolute left-1/2 -translate-x-1/2 whitespace-nowrap
          text-[10px] font-medium text-cyan-300/90
          bg-[#0d1220]/95 border border-cyan-900/30 rounded px-1.5 py-0.5
          pointer-events-none opacity-0 group-hover:opacity-100
          transition-opacity duration-150 z-10
          ${isBottom ? 'bottom-full mb-2' : 'top-full mt-2'}
        `}
      >
        {shortcut.label}
      </span>
    </motion.button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface FloatingActionButtonProps {
  onTabChange: (tab: GameTab) => void;
}

export function FloatingActionButton({ onTabChange }: FloatingActionButtonProps) {
  const fabEnabled = useSettingsStore((s) => s.fabEnabled);
  const fabPosition = useSettingsStore((s) => s.fabPosition);
  const setFABPosition = useSettingsStore((s) => s.setFABPosition);
  const quickAccessShortcuts = useSettingsStore((s) => s.quickAccessShortcuts);
  const maxQuickAccessShortcuts = useSettingsStore((s) => s.maxQuickAccessShortcuts);
  const reducedMotion = useReducedMotion();

  const [isExpanded, setIsExpanded] = useState(false);

  // Refs for drag state — avoids stale closure issues
  const isDraggingRef = useRef(false);
  const hasMovedRef = useRef(false);
  const posRef = useRef({ x: 0, y: 0 });
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const lastTapRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const motionX = useMotionValue(0);
  const motionY = useMotionValue(0);

  const visibleShortcuts = useMemo(
    () => quickAccessShortcuts.slice(0, maxQuickAccessShortcuts),
    [quickAccessShortcuts, maxQuickAccessShortcuts],
  );

  const isBottom = fabPosition.y > 40;

  // ── Position helpers ──

  const clampPosition = useCallback((x: number, y: number) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const safeTop = HEADER_HEIGHT + MIN_MARGIN;
    const safeBottom = BOTTOM_NAV_HEIGHT + FAB_SIZE + MIN_MARGIN + parseInt(getComputedStyle(document.documentElement).getPropertyValue('env(safe-area-inset-bottom)') || '0', 10);
    return {
      x: Math.max(MIN_MARGIN, Math.min(vw - FAB_SIZE - MIN_MARGIN, x)),
      y: Math.max(safeTop, Math.min(vh - safeBottom, y)),
    };
  }, []);

  const savePosition = useCallback(
    (x: number, y: number) => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      // x is percentage from RIGHT edge
      const pctX = ((vw - x - FAB_SIZE / 2) / vw) * 100;
      // y is percentage from BOTTOM edge
      const pctY = ((vh - y - FAB_SIZE / 2) / vh) * 100;
      setFABPosition({
        x: Math.max(0, Math.min(100, pctX)),
        y: Math.max(0, Math.min(100, pctY)),
      });
    },
    [setFABPosition],
  );

  const snapToEdge = useCallback((x: number, y: number) => {
    const vw = window.innerWidth;
    const relativeX = x / vw;
    if (relativeX < EDGE_SNAP_THRESHOLD) {
      return { x: MIN_MARGIN, y };
    } else if (relativeX > 1 - EDGE_SNAP_THRESHOLD) {
      return { x: vw - FAB_SIZE - MIN_MARGIN, y };
    }
    return { x, y };
  }, []);

  // ── Initialize position from store on mount ──

  useEffect(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const x = vw - (fabPosition.x / 100) * vw - FAB_SIZE / 2;
    const y = vh - (fabPosition.y / 100) * vh - FAB_SIZE / 2;
    const clamped = clampPosition(x, y);
    posRef.current = clamped;
    motionX.set(clamped.x);
    motionY.set(clamped.y);
  }, []);

  // ── Unified pointer event handlers ──

  const handlePointerDown = useCallback(
    (clientX: number, clientY: number) => {
      isDraggingRef.current = true;
      hasMovedRef.current = false;
      dragStartRef.current = { x: clientX, y: clientY };

      // Close menu if expanded when starting a new drag
      setIsExpanded((prev) => {
        if (prev) return false;
        return prev;
      });
    },
    [],
  );

  const handlePointerMove = useCallback(
    (clientX: number, clientY: number) => {
      if (!isDraggingRef.current || !dragStartRef.current) return;

      const dx = clientX - dragStartRef.current.x;
      const dy = clientY - dragStartRef.current.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > DRAG_THRESHOLD) {
        hasMovedRef.current = true;
      }

      if (hasMovedRef.current) {
        const newX = posRef.current.x + dx;
        const newY = posRef.current.y + dy;
        const clamped = clampPosition(newX, newY);
        motionX.set(clamped.x);
        motionY.set(clamped.y);
        dragStartRef.current = { x: clientX, y: clientY };
        posRef.current = clamped;
      }
    },
    [clampPosition, motionX, motionY],
  );

  const handlePointerUp = useCallback(() => {
    if (!isDraggingRef.current) return;

    const wasDrag = hasMovedRef.current;
    isDraggingRef.current = false;
    dragStartRef.current = null;

    if (wasDrag) {
      // Snap to nearest edge and save
      const snapped = snapToEdge(posRef.current.x, posRef.current.y);
      const clamped = clampPosition(snapped.x, snapped.y);

      posRef.current = clamped;
      savePosition(clamped.x, clamped.y);

      // Animate to the snapped position with a spring
      if (!reducedMotion) {
        animate(motionX, clamped.x, { type: 'spring', stiffness: 300, damping: 30 });
        animate(motionY, clamped.y, { type: 'spring', stiffness: 300, damping: 30 });
      } else {
        motionX.set(clamped.x);
        motionY.set(clamped.y);
      }
    } else {
      // It was a tap — toggle the menu
      const now = Date.now();
      const timeSinceLastTap = now - lastTapRef.current;
      lastTapRef.current = now;

      if (timeSinceLastTap < DOUBLE_TAP_MS) {
        // Double tap — toggle menu
        setIsExpanded((prev) => !prev);
      } else {
        // Single tap — toggle menu (per spec: both single and double tap toggle)
        setIsExpanded((prev) => !prev);
      }
    }
  }, [clampPosition, motionX, motionY, reducedMotion, savePosition, snapToEdge]);

  // ── Touch event wiring ──

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      const touch = e.touches[0];
      handlePointerDown(touch.clientX, touch.clientY);
    },
    [handlePointerDown],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      const touch = e.touches[0];
      handlePointerMove(touch.clientX, touch.clientY);
    },
    [handlePointerMove],
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      handlePointerUp();
    },
    [handlePointerUp],
  );

  // ── Mouse event wiring ──

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      handlePointerDown(e.clientX, e.clientY);

      const onMouseMove = (ev: MouseEvent) => {
        handlePointerMove(ev.clientX, ev.clientY);
      };
      const onMouseUp = () => {
        handlePointerUp();
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    },
    [handlePointerDown, handlePointerMove, handlePointerUp],
  );

  // ── Close menu on outside click ──

  useEffect(() => {
    if (!isExpanded) return;

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsExpanded(false);
      }
    };

    // Small delay to prevent the opening tap from immediately closing
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }, 50);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isExpanded]);

  // ── Shortcut selection ──

  const handleShortcutSelect = useCallback(
    (action: string) => {
      setIsExpanded(false);
      onTabChange(action as GameTab);
    },
    [onTabChange],
  );

  // ── Don't render if disabled ──

  if (!fabEnabled) return null;

  return (
    <>
      {/* Backdrop */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            key="fab-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={reducedMotion ? { duration: 0.01 } : { duration: 0.2 }}
            className="fixed inset-0 z-[35] bg-black/20 backdrop-blur-sm"
            onClick={() => setIsExpanded(false)}
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      {/* FAB Container */}
      <div
        ref={containerRef}
        className="fixed inset-0 z-50 lg:hidden pointer-events-none"
      >
        <motion.div
          style={{
            x: motionX,
            y: motionY,
            position: 'absolute',
            left: 0,
            top: 0,
            pointerEvents: 'auto',
          }}
        >
          {/* Shortcuts radial menu */}
          <AnimatePresence>
            {isExpanded && visibleShortcuts.length > 0 && (
              <div
                key="shortcut-container"
                className="absolute"
                style={{
                  width: FAB_SIZE,
                  height: FAB_SIZE,
                  pointerEvents: 'auto',
                }}
              >
                {visibleShortcuts.map((shortcut, i) => (
                  <ShortcutButton
                    key={shortcut.id}
                    shortcut={shortcut}
                    index={i}
                    total={visibleShortcuts.length}
                    isBottom={isBottom}
                    onSelect={handleShortcutSelect}
                    reducedMotion={reducedMotion}
                  />
                ))}
              </div>
            )}
          </AnimatePresence>

          {/* Main FAB button */}
          <motion.button
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onMouseDown={handleMouseDown}
            onClick={(e) => {
              // Prevent default to avoid double-firing with mouse handlers
              e.preventDefault();
            }}
            whileTap={{ scale: 1.1 }}
            transition={
              reducedMotion
                ? { duration: 0.01 }
                : { type: 'spring', stiffness: 400, damping: 25 }
            }
            className={`
              relative flex items-center justify-center
              rounded-full
              bg-gradient-to-br from-cyan-500 to-teal-600
              shadow-[0_0_20px_rgba(0,255,242,0.3)]
              cursor-grab active:cursor-grabbing
              select-none touch-none
              focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0e17]
            `}
            style={{
              width: FAB_SIZE,
              height: FAB_SIZE,
            }}
            role="button"
            aria-label="Quick access menu"
            aria-expanded={isExpanded}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setIsExpanded((prev) => !prev);
              }
              if (e.key === 'Escape' && isExpanded) {
                setIsExpanded(false);
              }
            }}
          >
            {/* Pulsing glow ring (idle) */}
            {!isExpanded && (
              <motion.span
                className="absolute inset-0 rounded-full pointer-events-none"
                animate={
                  reducedMotion
                    ? { boxShadow: '0 0 20px rgba(0,255,242,0.3)' }
                    : {
                        boxShadow: [
                          '0 0 20px rgba(0,255,242,0.3)',
                          '0 0 35px rgba(0,255,242,0.5)',
                          '0 0 20px rgba(0,255,242,0.3)',
                        ],
                      }
                }
                transition={
                  reducedMotion
                    ? undefined
                    : {
                        duration: 2.5,
                        repeat: Infinity,
                        ease: 'easeInOut',
                      }
                }
              />
            )}

            {/* Icon: Plus when collapsed, X when expanded */}
            <AnimatePresence mode="wait" initial={false}>
              {isExpanded ? (
                <motion.div
                  key="close-icon"
                  initial={{ rotate: -90, opacity: 0, scale: 0.5 }}
                  animate={{ rotate: 0, opacity: 1, scale: 1 }}
                  exit={{ rotate: 90, opacity: 0, scale: 0.5 }}
                  transition={
                    reducedMotion
                      ? { duration: 0.01 }
                      : { type: 'spring', stiffness: 400, damping: 25 }
                  }
                  className="relative z-10"
                >
                  <X className="w-6 h-6 text-white" />
                </motion.div>
              ) : (
                <motion.div
                  key="plus-icon"
                  initial={{ rotate: 90, opacity: 0, scale: 0.5 }}
                  animate={{ rotate: 0, opacity: 1, scale: 1 }}
                  exit={{ rotate: -90, opacity: 0, scale: 0.5 }}
                  transition={
                    reducedMotion
                      ? { duration: 0.01 }
                      : { type: 'spring', stiffness: 400, damping: 25 }
                  }
                  className="relative z-10"
                >
                  <Plus className="w-6 h-6 text-white" />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.button>
        </motion.div>
      </div>
    </>
  );
}
