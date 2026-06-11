import { GameIcon } from '@/components/game/shared/GameIcon';

interface GameLoadingSkeletonProps {
  headerHeight: number;
}

export function GameLoadingSkeleton({ headerHeight }: GameLoadingSkeletonProps) {
  return (
    <div className="h-screen flex flex-col bg-[#0a0e17] text-gray-100 overflow-hidden safe-area-container">
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-cyan-900/30 px-2 lg:px-3 py-1.5 lg:py-2 bg-[#0a0e17]">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center text-base font-bold shadow-[0_0_12px_rgba(0,255,242,0.2)]">
            IX
          </div>
          <div>
            <h1 className="text-sm font-bold text-cyan-400 tracking-wider">INDUSTRIAX</h1>
            <p className="text-[10px] text-gray-500 -mt-0.5">Factory Dominion</p>
          </div>
          <div className="flex items-center gap-3 ml-4">
            <div className="h-5 w-24 bg-gray-800/60 rounded shimmer-loading" />
            <div className="h-5 w-20 bg-gray-800/60 rounded shimmer-loading" />
            <div className="h-5 w-16 bg-gray-800/60 rounded shimmer-loading" />
          </div>
        </div>
      </header>
      <div className="flex-shrink-0" style={{ height: headerHeight }} />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <nav className="hidden lg:block w-44 flex-shrink-0 bg-[#0d1220] border-r border-cyan-900/20">
          <div className="flex flex-col py-1 gap-1 px-3">
            {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
              <div key={i} className="h-8 bg-gray-800/30 rounded shimmer-loading" />
            ))}
          </div>
        </nav>
        <main className="flex-1 min-h-0 p-4 flex items-center justify-center">
          <div className="text-center loading-skeleton-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-xl bg-gradient-to-br from-cyan-500/20 to-teal-600/20 flex items-center justify-center text-3xl loading-icon-pulse">
              <GameIcon ui="production" size={32} />
            </div>
            <p className="text-cyan-400 font-bold text-lg">Loading Factory...</p>
            <p className="text-gray-500 text-xs mt-1">Initializing industrial empire</p>
            <div className="mt-4 w-48 h-1 bg-gray-800 rounded-full overflow-hidden mx-auto">
              <div className="h-full bg-gradient-to-r from-cyan-600 to-teal-500 rounded-full loading-progress-bar" />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
