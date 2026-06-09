'use client';

import { addCollection } from '@iconify/react';
import { useState, useSyncExternalStore } from 'react';

let loaded = false;
let loadVersion = 0;
const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => { listeners.delete(callback); };
}

function getSnapshot() {
  return loadVersion;
}

function getServerSnapshot() {
  return 0;
}

function notifyAll() {
  loadVersion++;
  listeners.forEach(l => l());
}

let loadPromise: Promise<void> | null = null;
let loadFailed = false;

const MAX_RETRIES = 3;
const RETRY_DELAYS = [2000, 5000, 10000]; // increasing backoff

function ensureLoaded() {
  if (loaded) return;
  if (loadPromise) return;

  let retryCount = 0;

  loadPromise = (async () => {
    while (retryCount < MAX_RETRIES) {
      try {
        // Cache-bust to avoid stale responses where prefix was 'game-icons' instead of 'gi'
        const response = await fetch(`/api/icons?t=${Date.now()}`, { cache: 'no-store' });
        if (!response.ok) {
          console.warn(`[IconPreloader] Failed to load icons (attempt ${retryCount + 1}):`, response.status);
          retryCount++;
          if (retryCount < MAX_RETRIES) {
            await new Promise(r => setTimeout(r, RETRY_DELAYS[retryCount - 1]));
            continue;
          }
          break;
        }
        const data = await response.json();
        if (data && data.icons) {
          addCollection(data);
          loaded = true;
          notifyAll();
          console.log(`[IconPreloader] Loaded ${Object.keys(data.icons).length} icons with prefix "${data.prefix}"`);
          return;
        }
      } catch (error) {
        console.warn(`[IconPreloader] Failed to load icons (attempt ${retryCount + 1}):`, error);
        retryCount++;
        if (retryCount < MAX_RETRIES) {
          await new Promise(r => setTimeout(r, RETRY_DELAYS[retryCount - 1]));
          continue;
        }
      }
    }
    // All retries exhausted — allow the game to render without custom icons
    loadFailed = true;
    notifyAll();
    console.warn('[IconPreloader] Could not load icons after retries — proceeding without them');
  })();
}

/**
 * Preloads all game icons from the server API and registers them with Iconify.
 * Shows a loading spinner while icons are being fetched, then renders children.
 * Must be placed high in the component tree (e.g., in layout.tsx).
 */
export function IconPreloader({ children }: { children: React.ReactNode }) {
  // useSyncExternalStore ensures all instances re-render when icons load
  const version = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const isReady = loaded || loadFailed || version > 0;

  // Start loading on first render
  if (!loaded && !loadPromise && typeof window !== 'undefined') {
    ensureLoaded();
  }

  if (!isReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0e17]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-400">Loading icons...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
