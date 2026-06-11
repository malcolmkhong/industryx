import { useEffect } from 'react';

// Disables the right-click context menu on game elements to prevent mobile
// long-press from triggering it. Inputs/textareas/contenteditable and <a>
// links keep their default context menu.
export function useContextMenuPrevention(): void {
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }
      if (target.closest('a')) {
        return;
      }
      e.preventDefault();
    };
    document.addEventListener('contextmenu', handleContextMenu);
    return () => document.removeEventListener('contextmenu', handleContextMenu);
  }, []);
}
