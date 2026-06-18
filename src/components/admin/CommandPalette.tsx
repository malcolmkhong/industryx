/* eslint-disable jsx-a11y/control-has-associated-label */
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { ADMIN_NAV_TREE, type NavTreeGroup, type NavTreePage } from '@/lib/admin/navTree';

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const allPages: (NavTreePage & { group: string })[] = ADMIN_NAV_TREE.flatMap((g: NavTreeGroup) =>
    g.pages.map((p) => ({ ...p, group: g.label }))
  );

  const filtered = query
    ? allPages.filter(
        (p) =>
          p.label.toLowerCase().includes(query.toLowerCase()) ||
          p.group.toLowerCase().includes(query.toLowerCase())
      )
    : allPages;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
        setQuery('');
        setSelectedIndex(0);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const navigate = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && filtered[selectedIndex]) {
      navigate(filtered[selectedIndex].href);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <button type="button" className="absolute inset-0 bg-black/60 cursor-default" onClick={() => setOpen(false)} aria-label="Close palette" />

      <div className="relative w-full max-w-lg bg-background/80 border border-muted-label/30 rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-muted-label/40">
          <Search className="w-4 h-4 text-muted-label shrink-0" aria-hidden="true" />
          <input
            ref={inputRef}
            id="command-palette-input"
            role="combobox"
            aria-expanded={filtered.length > 0}
            aria-autocomplete="list"
            aria-controls="command-palette-list"
            aria-label="Search pages"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search pages..."
            className="flex-1 bg-transparent text-sm text-white placeholder-muted-label focus:outline-none"
          />
          <kbd className="text-[10px] text-muted-label/80 bg-background/60 px-1.5 py-0.5 rounded font-mono">ESC</kbd>
        </div>

        <div id="command-palette-list" className="max-h-72 overflow-y-auto p-2" role="listbox">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-label text-center py-6">No results</p>
          ) : (
            filtered.map((page, i) => (
              <button
                key={page.id}
                type="button"
                onClick={() => navigate(page.href)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                  i === selectedIndex ? 'bg-warning/60/10 text-white' : 'text-muted-label hover:text-white hover:bg-background/60/50'
                }`}
              >
                <page.icon className="w-4 h-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{page.label}</p>
                  <p className="text-xs text-muted-label/80">Jump to {page.group.toLowerCase()}</p>
                </div>
              </button>
            ))
          )}
        </div>

        <div className="px-4 py-2 border-t border-muted-label/40 flex items-center gap-4 text-[10px] text-muted-label/80">
          <span>↑↓ Navigate</span>
          <span>↵ Open</span>
          <span>Esc Close</span>
        </div>
      </div>
    </div>
  );
}
