'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/lib/game/store';
import { CheckCircle, AlertTriangle, XCircle, Info, X } from 'lucide-react';

interface ToastItem {
  id: string;
  type: 'success' | 'warning' | 'error' | 'info';
  message: string;
  timestamp: number;
}

const TOAST_ICONS = {
  success: CheckCircle,
  warning: AlertTriangle,
  error: XCircle,
  info: Info,
};

const TOAST_COLORS = {
  success: {
    border: 'border-green-500/50',
    bg: 'bg-green-900/20',
    icon: 'text-green-400',
    glow: 'shadow-green-500/10',
  },
  warning: {
    border: 'border-yellow-500/50',
    bg: 'bg-yellow-900/20',
    icon: 'text-yellow-400',
    glow: 'shadow-yellow-500/10',
  },
  error: {
    border: 'border-red-500/50',
    bg: 'bg-red-900/20',
    icon: 'text-red-400',
    glow: 'shadow-red-500/10',
  },
  info: {
    border: 'border-cyan-500/50',
    bg: 'bg-cyan-900/20',
    icon: 'text-cyan-400',
    glow: 'shadow-cyan-500/10',
  },
};

const MAX_TOASTS = 5;
const AUTO_DISMISS_MS = 4000;

export default function GameToast() {
  const notifications = useGameStore(s => s.notifications);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const seenIds = useRef<Set<string>>(new Set());
  const dismissTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const dismissToast = useCallback((id: string) => {
    if (dismissTimers.current.has(id)) {
      clearTimeout(dismissTimers.current.get(id)!);
      dismissTimers.current.delete(id);
    }
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Watch for new unread notifications
  useEffect(() => {
    const unread = notifications.filter(n => !n.read);
    const newNotifications = unread.filter(n => !seenIds.current.has(n.id));

    if (newNotifications.length === 0) return;

    // Mark as seen
    newNotifications.forEach(n => seenIds.current.add(n.id));

    // Create toast items
    const newToasts: ToastItem[] = newNotifications.map(n => ({
      id: n.id,
      type: n.type,
      message: n.message,
      timestamp: Date.now(),
    }));

    setToasts(prev => {
      const combined = [...prev, ...newToasts];
      // Keep only the most recent MAX_TOASTS
      return combined.slice(-MAX_TOASTS);
    });

    // Set auto-dismiss timers
    newToasts.forEach(toast => {
      const timer = setTimeout(() => {
        dismissToast(toast.id);
      }, AUTO_DISMISS_MS);
      dismissTimers.current.set(toast.id, timer);
    });

    // Clean up old seen IDs to prevent memory leak
    if (seenIds.current.size > 200) {
      const currentNotifIds = new Set(notifications.map(n => n.id));
      seenIds.current.forEach(id => {
        if (!currentNotifIds.has(id)) {
          seenIds.current.delete(id);
        }
      });
    }
  }, [notifications, dismissToast]);

  // Cleanup timers on unmount
  useEffect(() => {
    const timers = dismissTimers.current;
    return () => {
      timers.forEach(timer => clearTimeout(timer));
    };
  }, []);

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none" style={{ maxWidth: '360px' }}>
      <AnimatePresence mode="popLayout">
        {toasts.map(toast => {
          const colors = TOAST_COLORS[toast.type];
          const Icon = TOAST_ICONS[toast.type];
          return (
            <motion.div
              key={toast.id}
              layout
              initial={{ x: 100, opacity: 0, scale: 0.9 }}
              animate={{ x: 0, opacity: 1, scale: 1 }}
              exit={{ x: 80, opacity: 0, scale: 0.85 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className={`game-toast pointer-events-auto flex items-start gap-2.5 p-3 rounded-lg bg-[#111827] border ${colors.border} shadow-lg ${colors.glow}`}
            >
              <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${colors.icon}`} />
              <p className="text-xs text-gray-200 leading-relaxed flex-1 min-w-0 break-words">
                {toast.message}
              </p>
              <button
                onClick={() => dismissToast(toast.id)}
                className="flex-shrink-0 p-0.5 rounded hover:bg-white/10 transition-colors"
              >
                <X className="w-3 h-3 text-gray-500 hover:text-gray-300" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
