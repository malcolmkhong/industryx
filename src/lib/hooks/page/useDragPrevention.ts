import { useEffect } from 'react';

// Disables the HTML5 drag API on non-input elements to prevent ghost-drag
// previews on game UI. Inputs/textareas/contenteditable are still draggable
// (for text selection within inputs).
export function useDragPrevention(): void {
  useEffect(() => {
    const handleDragStart = (e: DragEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }
      e.preventDefault();
    };
    document.addEventListener('dragstart', handleDragStart);
    return () => document.removeEventListener('dragstart', handleDragStart);
  }, []);
}
