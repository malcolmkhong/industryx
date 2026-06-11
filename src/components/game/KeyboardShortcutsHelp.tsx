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
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
          />

          {/* Modal */}
          <div
            className="fixed inset-0 z-[101] flex items-center justify-center p-4 pointer-events-none"
          >
            <div className="pointer-events-auto w-full max-w-md bg-card border border-cyan-900/40 rounded-xl shadow-2xl shadow-cyan-900/20 overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-cyan-900/30 bg-gradient-to-r from-cyan-900/20 to-transparent">
                <div className="flex items-center gap-2">
                  <Keyboard className="w-4 h-4 text-cyan-400" />
                  <h2 className="text-sm font-bold text-cyan-400 tracking-wide">Keyboard Shortcuts</h2>
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
                {SHORTCUTS.map((shortcut, index) => (
                  <div key={index} className="flex items-center justify-between gap-4">
                    <span className="text-xs text-subtle">{shortcut.description}</span>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {shortcut.keys.map((key, ki) => (
                        <span key={ki}>
                          <kbd className="inline-flex items-center justify-center min-w-[28px] h-7 px-2 rounded-md bg-[#0a0e17] border border-cyan-900/30 text-[11px] font-mono text-cyan-300 shadow-sm">
                            {key}
                          </kbd>
                          {ki < shortcut.keys.length - 1 && (
                            <span className="text-[10px] text-muted-label mx-0.5">/</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Footer hint */}
              <div className="px-5 py-2.5 border-t border-cyan-900/20 bg-[#0a0e17]/50">
                <p className="text-[10px] text-muted-label text-center">
                  Press <kbd className="px-1 py-0.5 rounded bg-[#0a0e17] border border-muted-label text-[10px] font-mono text-subtle">?</kbd> to toggle this panel
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
