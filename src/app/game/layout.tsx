'use client';

import { usePathname } from 'next/navigation';
import { GameShell } from '@/components/game/GameShell';

// Layout for the entire game area (`/game/...`).
//
// The shell (header, sidebar, bottom nav, FAB, dialogs, hooks) is mounted ONCE
// for the lifetime of the /game/ segment. Tab navigation swaps only the [tab]
// page subtree, so all Zustand state, the game tick loop, cloud sync, and every
// other long-lived subscriber stay alive across instant Next.js client-side
// route transitions.
export default function GameLayout({ children }: { children: React.ReactNode }) {
  // The pathname is just used here as a hook to subscribe the layout to
  // navigation changes. Active-tab derivation lives inside `GameSidebar` and
  // `BottomNavigationBar` where it's actually needed.
  usePathname();

  return <GameShell>{children}</GameShell>;
}