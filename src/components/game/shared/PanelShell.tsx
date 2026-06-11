import type { ReactNode } from 'react';

interface PanelShellProps {
  children: ReactNode;
  className?: string;
}

/**
 * Outer container for a game panel. Provides consistent padding,
 * background, and border-radius so every panel has the same outer feel.
 * Pair with <PanelHeader> + <PanelBody> for the full template.
 */
export function PanelShell({ children, className = '' }: PanelShellProps) {
  return (
    <section
      className={`game-card rounded-xl p-4 flex flex-col gap-3 min-h-0 ${className}`}
    >
      {children}
    </section>
  );
}
