import { useEffect, useState, type RefObject } from 'react';

// Tracks the height of a fixed-position header element via ResizeObserver and
// exposes it as a number. Pair with a spacer <div> to prevent content from
// being hidden under the fixed header.
export function useHeaderHeightObserver(
  headerRef: RefObject<HTMLElement>,
  enabled: boolean,
): number {
  const [headerHeight, setHeaderHeight] = useState(52);
  useEffect(() => {
    if (!enabled) return;
    const el = headerRef.current;
    if (!el) return;
    const updateHeight = () => setHeaderHeight(el.offsetHeight);
    const observer = new ResizeObserver(updateHeight);
    observer.observe(el);
    updateHeight();
    return () => observer.disconnect();
  }, [enabled, headerRef]);
  return headerHeight;
}
