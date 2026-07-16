'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Keyboard, X } from 'lucide-react';

const SHORTCUTS = [
  { keys: ['1', '2', '3', '4', '5', '6', '7', '8', '9'], description: 'Switch tabs' },
  { keys: ['Space'], description: 'Pause / Resume' },
  { keys: ['+', '='], description: 'Increase speed' },
  { keys: ['-'], description: 'Decrease speed' },
  { keys: ['Esc'], description: 'Deselect building' },
  { keys: ['?'], description: 'Toggle this help' },
];

export default function KeyboardShortcutsHelp() {
  const [isOpen, setIsOpen] = useState(false);

  const toggle = useCallback(() => {
    setIsOpen(prev => !prev);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        toggle();
      }

      // Close on Escape if open
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, toggle]);

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-100 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsOpen(false)}
              onKeyDown={(e) => { if (e.key === 'Escape') setIsOpen(false); }}
              role="button"
              tabIndex={0}
              aria-label="Close keyboard shortcuts"
            />

            {/* Modal */}
            <div
              className="fixed inset-0 z-101 flex items-center justify-center p-4 pointer-events-none"
              role="dialog"
              aria-modal="true"
              aria-label="Keyboard shortcuts"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                transition={{ duration: 0.2 }}
                className="pointer-events-auto w-full max-w-md bg-card border border-brand/40 rounded-xl shadow-2xl shadow-brand/20 overflow-hidden"
              >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-brand/30 bg-linear-to-r from-brand/20 to-transparent">
                  <div className="flex items-center gap-2">
                    <Keyboard className="w-4 h-4 text-brand" />
                    <h2 className="text-sm font-bold text-brand tracking-wide">Keyboard Shortcuts</h2>
                  </div>
                  <button
                    onClick={() => setIsOpen(false)}
                    aria-label="Close keyboard shortcuts help"
                    className="text-muted-label hover:text-subtle transition-colors p-1 rounded-md hover:bg-muted-label/50"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Shortcuts list */}
                <div className="px-5 py-4 space-y-3">
                  {SHORTCUTS.map((shortcut, idx) => (
                    <motion.div
                      key={shortcut.description}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.2, delay: 0.05 + idx * 0.04 }}
                      className="flex items-center justify-between gap-4"
                    >
                      <span className="text-xs text-subtle">{shortcut.description}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {shortcut.keys.map((key) => (
                          <span key={key}>
                            <kbd className="inline-flex items-center justify-center min-w-7 h-7 px-2 rounded-md bg-background border border-brand/30 text-[11px] font-mono text-brand shadow-sm">
                              {key}
                            </kbd>
                            {shortcut.keys.indexOf(key) < shortcut.keys.length - 1 && (
                              <span className="text-[10px] text-muted-label mx-0.5">/</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </motion.div>
                  ))}
                </div>

                {/* Footer hint */}
                <div className="px-5 py-2.5 border-t border-brand/20 bg-background/50">
                  <p className="text-[10px] text-muted-label text-center">
                    Press <kbd className="px-1 py-0.5 rounded bg-background border border-muted-label text-[10px] font-mono text-subtle">?</kbd> to toggle this panel
                  </p>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
