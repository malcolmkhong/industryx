import {
  Bell, Check, Cloud, Download, LogIn, LogOut, Pause, Play, RotateCcw, Settings, Upload,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip';
import { useGameStore, formatNumber } from '@/lib/game/store';
import { WEATHER_DEFS } from '@/lib/game/configCache';
import { GameIcon } from '@/components/game/shared/GameIcon';
import { OnlineCount } from '@/components/game/OnlineCount';
import { useAuth } from '@/components/providers/AuthProvider';
import { useGameConfig } from '@/components/providers/GameConfigProvider';
import { useCloudSync } from '@/lib/hooks/useCloudSync';
import { useLoginPrompt } from '@/lib/hooks/useLoginPrompt';
import { useAutoSaveIndicator } from '@/lib/hooks/page/useAutoSaveIndicator';
import type { GameTab } from '@/lib/game/types';

interface MobileHeaderProps {
  onExport: () => void;
  onImport: () => void;
  onReset: () => void;
  onTabChange: (tab: GameTab) => void;
}

const SPEED_OPTIONS = [1, 2, 5, 10] as const;

export function MobileHeader({ onExport, onImport, onReset, onTabChange }: MobileHeaderProps) {
  const gameSpeed = useGameStore(s => s.gameSpeed);
  const paused = useGameStore(s => s.paused);
  const notifications = useGameStore(s => s.notifications);
  const money = useGameStore(s => s.money);
  const pendingPayout = useGameStore(s => s.pendingPayout);
  const payoutConfig = useGameStore(s => s.payoutConfig);
  const collectPayout = useGameStore(s => s.collectPayout);
  const togglePause = useGameStore(s => s.togglePause);
  const setGameSpeed = useGameStore(s => s.setGameSpeed);
  const powerGrid = useGameStore(s => s.powerGrid);
  const researchPoints = useGameStore(s => s.researchPoints);
  const activeEvents = useGameStore(s => s.activeEvents);
  const weather = useGameStore(s => s.weather);

  const { showSavedFlash } = useAutoSaveIndicator();
  const { user, signOut, loading: authLoading } = useAuth();
  const { isUsingSupabase } = useGameConfig();
  const { saveToCloud } = useCloudSync();
  const { promptLogin } = useLoginPrompt();

  const powerPercent = powerGrid.totalConsumption > 0
    ? Math.min(100, (powerGrid.totalProduction / powerGrid.totalConsumption) * 100)
    : powerGrid.totalProduction > 0 ? 100 : 0;

  const unreadNotifications = notifications.filter(n => !n.read).length;
  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Commander';

  return (
    <div className="flex lg:hidden flex-col gap-0.5">
      {/* Row 1: Logo + compact stats */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="w-7 h-7 rounded-md bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
            IX
          </div>
          <span className="text-[11px] font-bold text-cyan-400 tracking-wider truncate">INDUSTRIAX</span>
        </div>

        <div className="flex items-center gap-1 text-[10px] flex-shrink-0">
          <span className="text-success font-mono font-bold">${formatNumber(money)}</span>
          {pendingPayout > 0 && !payoutConfig.autoCollect && (
            <button
              onClick={collectPayout}
              className="animate-pulse inline-flex items-center bg-success/40 text-success text-[9px] px-1.5 py-0.5 rounded border border-success/30 min-h-[28px]"
              title="Click to collect pending payout"
            >
              <GameIcon ui="money" size={12} className="inline-flex" />${formatNumber(pendingPayout)}
            </button>
          )}
          <span className="text-gray-700">|</span>
          <span className={powerPercent >= 80 ? 'text-yellow-400' : powerPercent >= 50 ? 'text-orange-400' : 'text-red-400'}>
            <GameIcon ui="power" size={12} className="inline-flex" />{formatNumber(powerGrid.totalProduction)}/{formatNumber(powerGrid.totalConsumption)}
          </span>
          <span className="text-gray-700">|</span>
          <span className="text-purple-400 font-mono inline-flex items-center gap-0.5"><GameIcon ui="researchPoints" size={12} className="inline-flex" />{formatNumber(researchPoints)}</span>
        </div>
      </div>

      {/* Row 2: Speed controls + power bar */}
      <div className="flex items-center gap-2">
        <div className="flex items-center bg-card rounded-lg border border-cyan-900/20 overflow-hidden flex-shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 min-w-[32px] flex items-center justify-center mobile-speed-btn"
            onClick={togglePause}
            aria-label={paused ? "Resume game" : "Pause game"}
          >
            {paused ? <Play className="w-3.5 h-3.5 text-success" /> : <Pause className="w-3.5 h-3.5 text-yellow-400" />}
          </Button>
          {SPEED_OPTIONS.map(speed => (
            <Button
              key={speed}
              variant="ghost"
              size="sm"
              className={`h-8 px-2 text-[11px] min-w-[34px] min-h-[32px] mobile-speed-btn ${gameSpeed === speed ? 'text-cyan-400 bg-cyan-900/20 font-bold' : 'text-gray-500'}`}
              onClick={() => setGameSpeed(speed)}
            >
              {speed}x
            </Button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <span className="text-[9px] text-gray-500 flex-shrink-0">PWR</span>
          <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden min-w-[40px]">
            <div
              className={`h-full transition-all duration-500 rounded-full ${
                powerPercent >= 80 ? 'bg-success' : powerPercent >= 50 ? 'bg-yellow-500' : 'bg-red-500'
              }`}
              style={{ width: `${powerPercent}%` }}
            />
          </div>
          <span className={`text-[9px] font-mono flex-shrink-0 ${powerPercent >= 80 ? 'text-success' : powerPercent >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
            {powerPercent}%
          </span>
        </div>
      </div>

      {/* Row 3: Status indicators + essential actions */}
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1.5">
          {/* Auto-save indicator */}
          <div className="flex items-center gap-0.5" role="status" aria-label={showSavedFlash ? 'Game saved' : 'Save pending'}>
            <Check className={`w-3 h-3 transition-colors duration-300 ${showSavedFlash ? 'text-success' : 'text-gray-600'}`} />
            <span className="text-[9px] text-gray-500">{showSavedFlash ? 'Saved' : ''}</span>
          </div>

          {/* Notification bell */}
          <button
            className="relative p-1.5 rounded-md hover:bg-white/[0.04] transition-colors min-w-[32px] min-h-[32px] flex items-center justify-center"
            onClick={() => onTabChange('notifications')}
            role="status"
            aria-label={`Notifications: ${unreadNotifications} unread`}
          >
            <Bell className="w-4 h-4 text-gray-400" />
            {unreadNotifications > 0 && (
              <span className="absolute top-0.5 right-0.5 w-3.5 h-3.5 bg-red-500 rounded-full text-[7px] text-white flex items-center justify-center font-bold">
                {unreadNotifications > 9 ? '9+' : unreadNotifications}
              </span>
            )}
          </button>

          {activeEvents.length > 0 && (
            <Badge variant="outline" className="text-[9px] border-orange-500/50 text-orange-400 bg-orange-900/20 px-1.5 py-0 h-5 cursor-pointer" onClick={() => onTabChange('events')}>
              <GameIcon icon={activeEvents[0].icon} size={12} className="inline-flex" /> {activeEvents.length}
            </Badge>
          )}

          <Badge variant="outline" className={`text-[9px] px-1.5 py-0 h-5 cursor-pointer ${
            weather.current === 'clear'
              ? 'border-gray-700 text-gray-500 bg-gray-900/20'
              : 'border-sky-500/50 text-sky-400 bg-sky-900/20'
          }`} onClick={() => onTabChange('dashboard')}>
            <GameIcon icon={WEATHER_DEFS[weather.current]?.icon} size={12} className="inline-flex" />
          </Badge>

          <Badge variant="outline" className={`text-[8px] px-1 py-0 ${isUsingSupabase ? 'border-success/50 text-success' : 'border-amber-500/50 text-amber-400'}`}>
            {isUsingSupabase ? 'Live' : 'Local'}
          </Badge>

          <OnlineCount compact />
        </div>

        <div className="flex items-center gap-0.5">
          {authLoading ? (
            <Play className="w-3.5 h-3.5 text-gray-500 animate-spin" />
          ) : user ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={async () => { await saveToCloud(); }}
                  className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center text-[10px] font-bold shadow-[0_0_8px_rgba(0,255,242,0.2)]"
                  aria-label={`Signed in as ${userName}. Tap to save.`}
                >
                  {userName.charAt(0).toUpperCase()}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="w-48 bg-card border-cyan-900/30 p-2">
                <p className="text-xs font-medium text-cyan-300 mb-1">{userName}</p>
                <div className="space-y-1">
                  <Button variant="ghost" size="sm" className="w-full justify-start h-8 text-[11px]" onClick={async () => { await saveToCloud(); }}><Cloud className="w-3 h-3 mr-1.5" /> Save to Cloud</Button>
                  <Button variant="ghost" size="sm" className="w-full justify-start h-8 text-[11px]" onClick={onExport}><Download className="w-3 h-3 mr-1.5" /> Export Save</Button>
                  <Button variant="ghost" size="sm" className="w-full justify-start h-8 text-[11px]" onClick={onImport}><Upload className="w-3 h-3 mr-1.5" /> Import Save</Button>
                  <Button variant="ghost" size="sm" className="w-full justify-start h-8 text-[11px] text-red-400" onClick={signOut}><LogOut className="w-3 h-3 mr-1.5" /> Sign Out</Button>
                </div>
              </TooltipContent>
            </Tooltip>
          ) : (
            <Button variant="ghost" size="sm" className="h-8 px-2.5 text-[10px] text-cyan-400 min-h-[32px]" onClick={() => promptLogin('manual')}>
              <LogIn className="w-3 h-3 mr-1" /> Sign In
            </Button>
          )}

          {!user && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="p-1.5 rounded-md hover:bg-white/[0.04] transition-colors min-w-[32px] min-h-[32px] flex items-center justify-center text-gray-500"
                  aria-label="More actions"
                >
                  <Settings className="w-4 h-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="w-48 bg-card border-cyan-900/30 p-2">
                <div className="space-y-1">
                  <Button variant="ghost" size="sm" className="w-full justify-start h-8 text-[11px]" onClick={onExport}><Download className="w-3 h-3 mr-1.5" /> Export Save</Button>
                  <Button variant="ghost" size="sm" className="w-full justify-start h-8 text-[11px]" onClick={onImport}><Upload className="w-3 h-3 mr-1.5" /> Import Save</Button>
                  <Button variant="ghost" size="sm" className="w-full justify-start h-8 text-[11px] text-red-400" onClick={onReset}><RotateCcw className="w-3 h-3 mr-1.5" /> Reset Game</Button>
                </div>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    </div>
  );
}
