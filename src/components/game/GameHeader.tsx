'use client';

import React, { useState } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useGameConfig } from '@/components/providers/GameConfigProvider';
import { useCloudSync } from '@/lib/hooks/useCloudSync';
import { useGameStore, formatNumber } from '@/lib/game/store';
import { BUILDING_DEFS, WEATHER_DEFS } from '@/lib/game/configCache';
import { GameIcon } from '@/components/game/shared/GameIcon';
import {
  Play, Pause, Bell, Check, Download, Upload, RotateCcw,
  Cloud, CloudOff, Loader2, LogOut, LogIn, User, RefreshCw,
  Save, Wifi, WifiOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

const SPEED_OPTIONS = [1, 2, 5, 10];

export function GameHeader() {
  const { user, signInWithGoogle, signOut, loading: authLoading } = useAuth();
  const { config, isUsingSupabase, reload: reloadConfig } = useGameConfig();
  const { saveToCloud, loadFromCloud, isSyncing } = useCloudSync();

  // Game state selectors
  const gameSpeed = useGameStore(s => s.gameSpeed);
  const prestigeSpeedBonus = useGameStore(s => s.prestigeState.bonuses.filter(b => b.purchased && b.effect.type === 'gameSpeed').reduce((sum, b) => sum + b.effect.value, 0));
  const effectiveSpeed = gameSpeed * (1 + prestigeSpeedBonus);
  const paused = useGameStore(s => s.paused);
  const money = useGameStore(s => s.money);
  const totalMoneyEarned = useGameStore(s => s.totalMoneyEarned);
  const researchPoints = useGameStore(s => s.researchPoints);
  const prestigeState = useGameStore(s => s.prestigeState);
  const powerGrid = useGameStore(s => s.powerGrid);
  const pendingPayout = useGameStore(s => s.pendingPayout);
  const payoutConfig = useGameStore(s => s.payoutConfig);
  const notifications = useGameStore(s => s.notifications);
  const activeEvents = useGameStore(s => s.activeEvents);
  const weather = useGameStore(s => s.weather);
  const buildings = useGameStore(s => s.buildings);
  const gameTick = useGameStore(s => s.gameTick);

  // Actions
  const togglePause = useGameStore(s => s.togglePause);
  const setGameSpeed = useGameStore(s => s.setGameSpeed);
  const collectPayout = useGameStore(s => s.collectPayout);
  const exportSave = useGameStore(s => s.exportSave);
  const importSave = useGameStore(s => s.importSave);
  const resetGame = useGameStore(s => s.resetGame);

  // UI state
  const [showSavedFlash, setShowSavedFlash] = useState(false);
  const [moneyGlow, setMoneyGlow] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [exportString, setExportString] = useState('');
  const [importString, setImportString] = useState('');
  const [importError, setImportError] = useState('');
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);
  const [cloudSyncStatus, setCloudSyncStatus] = useState<'idle' | 'saving' | 'loading' | 'success' | 'error'>('idle');
  const [authMenuOpen, setAuthMenuOpen] = useState(false);

  // Derived values
  const unreadNotifications = notifications.filter(n => !n.read).length;
  const powerPercent = powerGrid.totalConsumption > 0
    ? Math.min(100, (powerGrid.totalProduction / powerGrid.totalConsumption) * 100)
    : powerGrid.totalProduction > 0 ? 100 : 0;

  const activeBuildings = buildings.filter(b => b.active);
  const factoryEfficiency = activeBuildings.length > 0
    ? activeBuildings.reduce((sum, b) => sum + b.efficiency, 0) / activeBuildings.length * powerGrid.efficiency
    : 0;

  // Cloud save handler
  const handleCloudSave = async () => {
    setCloudSyncStatus('saving');
    const result = await saveToCloud();
    setCloudSyncStatus(result.success ? 'success' : 'error');
    setTimeout(() => setCloudSyncStatus('idle'), 2000);
  };

  // Cloud load handler
  const handleCloudLoad = async () => {
    setCloudSyncStatus('loading');
    const result = await loadFromCloud();
    if (result.success && result.data) {
      // Import the cloud save data
      const saveStr = JSON.stringify(result.data);
      const success = importSave(saveStr);
      setCloudSyncStatus(success ? 'success' : 'error');
    } else if (result.isNew) {
      setCloudSyncStatus('success'); // No cloud save yet, that's OK
    } else {
      setCloudSyncStatus('error');
    }
    setTimeout(() => setCloudSyncStatus('idle'), 2000);
  };

  // Export handler
  const handleExport = () => {
    const saveStr = exportSave();
    setExportString(saveStr);
    setExportDialogOpen(true);
    setCopiedToClipboard(false);
  };

  // Import handler
  const handleImportConfirm = () => {
    if (!importString.trim()) {
      setImportError('Please paste a save string.');
      return;
    }
    const success = importSave(importString.trim());
    if (success) {
      setImportDialogOpen(false);
      setImportString('');
      setImportError('');
    } else {
      setImportError('Invalid save data.');
    }
  };

  // Reset handler
  const handleReset = () => {
    if (confirm('Are you sure you want to reset? All progress will be lost!')) {
      resetGame();
    }
  };

  // User display name
  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Commander';
  const userAvatar = user?.user_metadata?.avatar_url;

  return (
    <>
      {/* Desktop Header */}
      <div className="hidden lg:flex items-center justify-between gap-4 flex-wrap">
        {/* Logo & Stats */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center text-base font-bold shadow-[0_0_12px_rgba(0,255,242,0.2)]">
              IX
            </div>
            <div>
              <h1 className="text-sm font-bold text-brand neon-glow-cyan tracking-wider">INDUSTRIAX</h1>
              <p className="text-[10px] text-muted-label -mt-0.5">Factory Dominion</p>
            </div>
          </div>

          <div className="stat-badge-separator" />

          <div className="flex items-center gap-4 text-xs">
            {/* Money */}
            <Tooltip>
              <TooltipTrigger asChild>
                <div className={`stat-badge stat-badge-money bg-card rounded-lg px-3 py-1.5 border border-brand/20 cursor-default ${moneyGlow ? 'money-glow' : ''}`}>
                  <span className="text-muted-label inline-flex items-center gap-1"><GameIcon ui="money" size={14} /></span>
                  <span className="text-success font-mono font-bold text-sm">${formatNumber(money)}</span>
                  {pendingPayout > 0 && !payoutConfig.autoCollect && (
                    <button onClick={collectPayout} className="ml-2 animate-pulse inline-flex items-center gap-1 bg-success/40 hover:bg-success/50 text-success text-[10px] px-1.5 py-0.5 rounded-md border border-success/30 transition-colors">
                      <GameIcon ui="money" size={12} className="inline-flex" /> ${formatNumber(pendingPayout)}
                    </button>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="w-64 bg-card border-brand/30 p-0 overflow-hidden">
                <div className="bg-gradient-to-r from-green-900/30 to-emerald-900/20 px-3 py-2 border-b border-brand/20">
                  <p className="text-xs font-bold text-success inline-flex items-center gap-1"><GameIcon ui="money" size={14} className="inline-flex" /> Financial Overview</p>
                </div>
                <div className="px-3 py-2 space-y-1.5">
                  <div className="flex justify-between text-xs"><span className="text-subtle">Current Balance</span><span className="text-success font-mono font-bold">${formatNumber(money)}</span></div>
                  {pendingPayout > 0 && <div className="flex justify-between text-xs"><span className="text-subtle">Pending Payout</span><span className="text-warning font-mono">${formatNumber(pendingPayout)}</span></div>}
                  <div className="flex justify-between text-xs"><span className="text-subtle">Total Earned</span><span className="text-success font-mono">${formatNumber(totalMoneyEarned)}</span></div>
                </div>
              </TooltipContent>
            </Tooltip>

            {/* Power */}
            <div className={`stat-badge stat-badge-power bg-card rounded-lg px-3 py-1.5 border border-brand/20 cursor-default ${powerGrid.overload ? 'warning-pulse' : ''}`}>
              <span className="text-muted-label inline-flex items-center gap-1"><GameIcon ui="power" size={14} /></span>
              <span className={`text-sm ${powerPercent >= 80 ? 'text-warning' : powerPercent >= 50 ? 'text-domain' : 'text-danger'}`}>
                {formatNumber(powerGrid.totalProduction)}MW
              </span>
              <span className="text-muted-label"> / </span>
              <span className="text-subtle text-sm">{formatNumber(powerGrid.totalConsumption)}MW</span>
              <span className={`ml-1.5 inline-block w-2 h-2 rounded-full ${
                factoryEfficiency >= 0.8 ? 'bg-success shadow-[0_0_6px_rgba(74,222,128,0.6)]'
                : factoryEfficiency >= 0.5 ? 'bg-warning shadow-[0_0_6px_rgba(250,204,21,0.6)]'
                : 'bg-danger shadow-[0_0_6px_rgba(248,113,113,0.6)]'
              } ${activeBuildings.length > 0 ? 'animate-pulse' : ''}`} />
            </div>

            <div className="stat-badge-separator" />

            {/* Research Points */}
            <div className="stat-badge stat-badge-rp bg-card rounded-lg px-3 py-1.5 border border-brand/20 cursor-default">
              <span className="text-muted-label inline-flex items-center gap-1"><GameIcon ui="researchPoints" size={14} /></span>
              <span className="text-research font-mono text-sm">{formatNumber(researchPoints)} RP</span>
            </div>

            {/* Corporation Points */}
            <div className="stat-badge stat-badge-cp bg-card rounded-lg px-3 py-1.5 border border-brand/20 cursor-default">
              <span className="text-muted-label inline-flex items-center gap-1"><GameIcon ui="corporationPoints" size={14} /></span>
              <span className="text-premium font-mono text-sm">{prestigeState.corporationPoints} CP</span>
            </div>
          </div>
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-2">
          {/* Power bar */}
          <div className="w-24 h-2 bg-muted-label rounded-full overflow-hidden">
            <div className={`h-full transition-all duration-500 ${powerPercent >= 80 ? 'bg-success' : powerPercent >= 50 ? 'bg-warning' : 'bg-danger'}`} style={{ width: `${powerPercent}%` }} />
          </div>

          {/* Speed controls */}
          <div className="flex items-center bg-card rounded-lg border border-brand/20 overflow-hidden">
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={togglePause} aria-label={paused ? "Resume game" : "Pause game"}>
              {paused ? <Play className="w-3 h-3 text-success" /> : <Pause className="w-3 h-3 text-warning" />}
            </Button>
            {SPEED_OPTIONS.map(speed => (
              <Button key={speed} variant="ghost" size="sm" className={`h-7 px-2 text-xs ${gameSpeed === speed ? 'text-brand bg-brand/20' : 'text-muted-label'}`} onClick={() => setGameSpeed(speed)}>
                {speed}x
              </Button>
            ))}
          </div>

          {/* Tick counter */}
          <div className="text-[10px] text-muted-label font-mono">Tick: {formatNumber(gameTick)}</div>

          {/* Config source indicator */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 cursor-default ${
                isUsingSupabase
                  ? 'border-success/50 text-success bg-success/20'
                  : 'border-warning/50 text-warning bg-amber-900/20'
              }`}>
                {isUsingSupabase ? <Wifi className="w-2.5 h-2.5 mr-0.5" /> : <WifiOff className="w-2.5 h-2.5 mr-0.5" />}
                {isUsingSupabase ? 'Live' : 'Local'}
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="bg-card border-brand/30">
              <p className="text-xs font-medium">{isUsingSupabase ? 'Supabase Connected' : 'Using Local Config'}</p>
              <p className="text-[10px] text-subtle mt-0.5">Game data source</p>
              <Button variant="ghost" size="sm" className="h-6 text-[10px] mt-1 w-full" onClick={reloadConfig}>
                <RefreshCw className="w-2.5 h-2.5 mr-1" /> Refresh Config
              </Button>
            </TooltipContent>
          </Tooltip>

          {/* Notifications */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 relative" aria-label="Notifications">
                <Bell className="w-3.5 h-3.5 text-subtle" />
                {unreadNotifications > 0 && (
                  <span className={`absolute -top-0.5 -right-0.5 h-4 rounded-full text-[8px] text-white flex items-center justify-center px-1 bg-brand`}>
                    {unreadNotifications > 9 ? '9+' : unreadNotifications}
                  </span>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="w-80 max-h-60 overflow-y-auto game-scrollbar bg-card border-brand/30">
              {notifications.length === 0 ? (
                <p className="text-xs text-muted-label">No notifications</p>
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-2 pb-1.5 border-b border-muted-label">
                    <Bell className="w-3 h-3 text-subtle" />
                    <span className="text-[10px] font-semibold text-subtle">{unreadNotifications} New</span>
                  </div>
                  {notifications.slice(0, 10).map(n => (
                    <div key={n.id} className={`text-xs py-1 border-b border-muted-label last:border-0 ${
                      n.type === 'success' ? 'text-success' : n.type === 'warning' ? 'text-warning' : n.type === 'error' ? 'text-danger' : 'text-subtle'
                    }`}>{n.message}</div>
                  ))}
                </>
              )}
            </TooltipContent>
          </Tooltip>

          {/* Active events */}
          {activeEvents.length > 0 && (
            <div className="flex items-center gap-1">
              {activeEvents.map(e => (
                <Tooltip key={e.id}>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="text-[10px] border-domain/50 text-domain bg-domain/20 px-1.5 py-0 neon-pulse">
                      <GameIcon icon={e.icon} size={12} className="inline-flex" /> {e.remaining <= 50 ? `${e.remaining}t` : e.name}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="bg-card border-brand/30">
                    <p className="text-xs font-medium text-domain">{e.name}</p>
                    <p className="text-[10px] text-subtle mt-0.5">{e.description}</p>
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          )}

          {/* Weather */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${
                weather.current === 'clear' ? 'border-muted-label text-muted-label bg-muted-label/20' : 'border-brand/50 text-brand bg-brand/20'
              }`}>
                <GameIcon icon={WEATHER_DEFS[weather.current]?.icon} size={12} className="inline-flex" /> {WEATHER_DEFS[weather.current]?.name}
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="bg-card border-brand/30">
              <p className="text-xs font-medium text-brand">{WEATHER_DEFS[weather.current]?.name}</p>
              <p className="text-[10px] text-subtle mt-0.5">{WEATHER_DEFS[weather.current]?.description}</p>
            </TooltipContent>
          </Tooltip>

          {/* Auto-save indicator */}
          <div className="flex items-center gap-1 text-[10px] opacity-40">
            <Check className="w-3 h-3 text-muted-label" />
            <span className="text-muted-label">Saved</span>
          </div>

          {/* Cloud save button */}
          {user && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={handleCloudSave}
                  disabled={cloudSyncStatus === 'saving'}
                >
                  {cloudSyncStatus === 'saving' ? <Loader2 className="w-3 h-3 animate-spin" />
                  : cloudSyncStatus === 'success' ? <Cloud className="w-3 h-3 text-success" />
                  : cloudSyncStatus === 'error' ? <CloudOff className="w-3 h-3 text-danger" />
                  : <Cloud className="w-3 h-3 text-subtle" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="bg-card border-brand/30">
                <p className="text-xs">Save to Cloud</p>
              </TooltipContent>
            </Tooltip>
          )}

          {/* Export save */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-label hover:text-brand" onClick={handleExport}>
                <Download className="w-3 h-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="bg-card border-brand/30"><p className="text-xs">Export Save</p></TooltipContent>
          </Tooltip>

          {/* Import save */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-label hover:text-brand" onClick={() => { setImportString(''); setImportError(''); setImportDialogOpen(true); }}>
                <Upload className="w-3 h-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="bg-card border-brand/30"><p className="text-xs">Import Save</p></TooltipContent>
          </Tooltip>

          {/* Reset */}
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-label" onClick={handleReset}>
            <RotateCcw className="w-3 h-3" />
          </Button>

          {/* Auth button */}
          {authLoading ? (
            <Loader2 className="w-4 h-4 text-muted-label animate-spin" />
          ) : user ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setAuthMenuOpen(!authMenuOpen)}
                  className="flex items-center gap-1.5 bg-card rounded-lg px-2 py-1 border border-brand/20 hover:border-brand/30 transition-colors cursor-pointer"
                >
                  {userAvatar ? (
                    <img src={userAvatar} alt="" className="w-5 h-5 rounded-full" />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center text-[9px] font-bold">
                      {userName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className="text-[10px] text-subtle max-w-[80px] truncate">{userName}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="w-56 bg-card border-brand/30 p-0 overflow-hidden">
                <div className="bg-gradient-to-r from-cyan-900/30 to-teal-900/20 px-3 py-2 border-b border-brand/20">
                  <p className="text-xs font-bold text-brand">{userName}</p>
                  <p className="text-[10px] text-subtle">{user.email}</p>
                </div>
                <div className="p-2 space-y-1">
                  <Button variant="ghost" size="sm" className="w-full justify-start h-7 text-xs" onClick={handleCloudSave}>
                    <Cloud className="w-3 h-3 mr-1.5" /> Save to Cloud
                  </Button>
                  <Button variant="ghost" size="sm" className="w-full justify-start h-7 text-xs" onClick={handleCloudLoad}>
                    <Download className="w-3 h-3 mr-1.5" /> Load from Cloud
                  </Button>
                  <Button variant="ghost" size="sm" className="w-full justify-start h-7 text-xs" onClick={reloadConfig}>
                    <RefreshCw className="w-3 h-3 mr-1.5" /> Reload Config
                  </Button>
                  <div className="border-t border-brand/20 my-1" />
                  <Button variant="ghost" size="sm" className="w-full justify-start h-7 text-xs text-danger hover:text-danger" onClick={signOut}>
                    <LogOut className="w-3 h-3 mr-1.5" /> Sign Out
                  </Button>
                </div>
              </TooltipContent>
            </Tooltip>
          ) : (
            <Button variant="ghost" size="sm" className="h-7 px-3 text-xs text-brand hover:text-brand border border-brand/30 hover:border-brand/30 rounded-lg" onClick={signInWithGoogle}>
              <LogIn className="w-3 h-3 mr-1" /> Sign In
            </Button>
          )}
        </div>
      </div>

      {/* Mobile Header */}
      <div className="flex lg:hidden flex-col gap-1">
        {/* Row 1: Logo + compact stats + auth */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="w-7 h-7 rounded-md bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center text-[10px] font-bold flex-shrink-0">IX</div>
            <span className="text-[11px] font-bold text-brand tracking-wider truncate">INDUSTRIAX</span>
          </div>
          <div className="flex items-center gap-1 text-[10px] flex-shrink-0">
            <span className="text-success font-mono font-bold">${formatNumber(money)}</span>
            {pendingPayout > 0 && !payoutConfig.autoCollect && (
              <button onClick={collectPayout} className="animate-pulse inline-flex items-center bg-success/40 text-success text-[9px] px-1 py-0 rounded border border-success/30">
                <GameIcon ui="money" size={12} className="inline-flex" />${formatNumber(pendingPayout)}
              </button>
            )}
            <span className="text-muted-label">|</span>
            <span className={powerPercent >= 80 ? 'text-warning' : powerPercent >= 50 ? 'text-domain' : 'text-danger'}>
              <GameIcon ui="power" size={12} className="inline-flex" />{formatNumber(powerGrid.totalProduction)}/{formatNumber(powerGrid.totalConsumption)}
            </span>
            <span className="text-muted-label">|</span>
            <span className="text-research font-mono inline-flex items-center gap-0.5"><GameIcon ui="researchPoints" size={12} className="inline-flex" />{formatNumber(researchPoints)}</span>
          </div>
        </div>

        {/* Row 2: Speed controls + actions + auth */}
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center bg-card rounded-md border border-brand/20 overflow-hidden">
            <Button variant="ghost" size="sm" className="h-6 px-1.5" onClick={togglePause}>
              {paused ? <Play className="w-2.5 h-2.5 text-success" /> : <Pause className="w-2.5 h-2.5 text-warning" />}
            </Button>
            {SPEED_OPTIONS.map(speed => (
              <Button key={speed} variant="ghost" size="sm" className={`h-6 px-1.5 text-[9px] ${gameSpeed === speed ? 'text-brand bg-brand/20' : 'text-muted-label'}`} onClick={() => setGameSpeed(speed)}>
                {speed}x
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-1">
            {/* Config source */}
            <Badge variant="outline" className={`text-[8px] px-1 py-0 ${isUsingSupabase ? 'border-success/50 text-success' : 'border-warning/50 text-warning'}`}>
              {isUsingSupabase ? 'Live' : 'Local'}
            </Badge>

            {/* Cloud save */}
            {user && (
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={handleCloudSave} disabled={cloudSyncStatus === 'saving'}>
                {cloudSyncStatus === 'saving' ? <Loader2 className="w-3 h-3 animate-spin" />
                : <Cloud className="w-3 h-3 text-subtle" />}
              </Button>
            )}

            {/* Auth */}
            {authLoading ? (
              <Loader2 className="w-3 h-3 text-muted-label animate-spin" />
            ) : user ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button onClick={() => setAuthMenuOpen(!authMenuOpen)} className="w-6 h-6 rounded-full bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center text-[9px] font-bold">
                    {userName.charAt(0).toUpperCase()}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="w-48 bg-card border-brand/30 p-2">
                  <p className="text-xs font-medium text-brand mb-1">{userName}</p>
                  <div className="space-y-1">
                    <Button variant="ghost" size="sm" className="w-full justify-start h-6 text-[10px]" onClick={handleCloudSave}><Cloud className="w-2.5 h-2.5 mr-1" /> Save</Button>
                    <Button variant="ghost" size="sm" className="w-full justify-start h-6 text-[10px]" onClick={handleCloudLoad}><Download className="w-2.5 h-2.5 mr-1" /> Load</Button>
                    <Button variant="ghost" size="sm" className="w-full justify-start h-6 text-[10px] text-danger" onClick={signOut}><LogOut className="w-2.5 h-2.5 mr-1" /> Sign Out</Button>
                  </div>
                </TooltipContent>
              </Tooltip>
            ) : (
              <Button variant="ghost" size="sm" className="h-6 px-2 text-[9px] text-brand" onClick={signInWithGoogle}>
                <LogIn className="w-2.5 h-2.5 mr-0.5" /> Sign In
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Export Dialog */}
      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent className="bg-card border-brand/30">
          <DialogHeader>
            <DialogTitle className="text-brand">Export Save</DialogTitle>
          </DialogHeader>
          <Textarea
            value={exportString}
            readOnly
            className="font-mono text-xs bg-muted-label/50 min-h-[120px]"
            onClick={(e) => (e.target as HTMLTextAreaElement).select()}
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={async () => {
              await navigator.clipboard.writeText(exportString);
              setCopiedToClipboard(true);
              setTimeout(() => setCopiedToClipboard(false), 2000);
            }} className="flex-1">
              {copiedToClipboard ? <><Check className="w-3 h-3 mr-1" /> Copied!</> : 'Copy to Clipboard'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Import Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="bg-card border-brand/30">
          <DialogHeader>
            <DialogTitle className="text-brand">Import Save</DialogTitle>
          </DialogHeader>
          <Textarea
            value={importString}
            onChange={(e) => setImportString(e.target.value)}
            placeholder="Paste your save string here..."
            className="font-mono text-xs bg-muted-label/50 min-h-[120px]"
          />
          {importError && <p className="text-xs text-danger">{importError}</p>}
          <Button size="sm" onClick={handleImportConfirm} className="w-full">Import Save</Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
