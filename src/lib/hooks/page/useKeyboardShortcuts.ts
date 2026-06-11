import { useEffect } from 'react';
import { useGameStore } from '@/lib/game/store';
import { KEY_TAB_MAP } from '@/components/game/GameSidebar';

const SPEED_OPTIONS = [1, 2, 5, 10] as const;

// Global keyboard shortcuts: 1-9 switch tabs (via KEY_TAB_MAP), Space toggles
// pause, + / - change game speed, Escape deselects the active building.
// Ignores key events when the user is typing in an input.
export function useKeyboardShortcuts(): void {
  const setActiveTab = useGameStore(s => s.setActiveTab);
  const togglePause = useGameStore(s => s.togglePause);
  const setGameSpeed = useGameStore(s => s.setGameSpeed);
  const selectBuilding = useGameStore(s => s.selectBuilding);
  const gameSpeed = useGameStore(s => s.gameSpeed);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      if (KEY_TAB_MAP[e.key]) {
        e.preventDefault();
        setActiveTab(KEY_TAB_MAP[e.key]);
        return;
      }

      if (e.key === ' ') {
        e.preventDefault();
        togglePause();
        return;
      }

      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        const currentIdx = SPEED_OPTIONS.indexOf(gameSpeed as typeof SPEED_OPTIONS[number]);
        const nextIdx = Math.min(SPEED_OPTIONS.length - 1, currentIdx + 1);
        setGameSpeed(SPEED_OPTIONS[nextIdx]);
        return;
      }

      if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        const currentIdx = SPEED_OPTIONS.indexOf(gameSpeed as typeof SPEED_OPTIONS[number]);
        const prevIdx = Math.max(0, currentIdx - 1);
        setGameSpeed(SPEED_OPTIONS[prevIdx]);
        return;
      }

      if (e.key === 'Escape') {
        selectBuilding(null);
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setActiveTab, togglePause, setGameSpeed, selectBuilding, gameSpeed]);
}
