'use client';

import { useState, useCallback, useEffect } from 'react';
import { useGameStore, formatNumber } from '@/lib/game/store';
import { useSettingsStore, NumberFormat, AnimationSpeed, SpeedLimit, BottomNavMode, QuickAccessShortcut, DEFAULT_QUICK_ACCESS_SHORTCUTS } from '@/lib/game/settingsStore';
import { soundEngine } from '@/lib/game/soundEngine';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Settings,
  Coffee,
  Heart,
  ExternalLink,
  Volume2,
  VolumeX,
  Monitor,
  Save,
  Download,
  Upload,
  Trash2,
  RotateCcw,
  Info,
  Volume1,
  Factory,
  Cog,
  AlertTriangle,
  MousePointerClick,
  FileText,
  HardDrive,
  Clock,
  ChevronDown,
  ChevronUp,
  Play,
  Navigation,
  Move,
  GripVertical,
  Plus,
  Eye,
  EyeOff,
  LayoutGrid,
  List,
} from 'lucide-react';

import { ICON_MAP } from '@/components/game/BottomNavigationBar';
import { GameIcon } from '@/components/game/shared/GameIcon';

// Collapsible section component
function SettingsSection({
  title,
  icon,
  children,
  defaultOpen = true,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="game-card rounded-xl bg-card border border-border overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-800/20 transition-colors"
      >
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="text-sm font-semibold text-gray-200">{title}</h3>
        </div>
        {open ? (
          <ChevronUp className="w-4 h-4 text-gray-500" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-500" />
        )}
      </button>
        {open && (
          <div
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-4 border-t border-gray-800/50 pt-3">
              {children}
            </div>
          </div>
        )}
    </div>
  );
}

// Setting row with label + control
function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-200">{label}</p>
        {description && (
          <p className="text-[10px] text-gray-500 mt-0.5">{description}</p>
        )}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

// Slider with value display
function LabeledSlider({
  value,
  onValueChange,
  min,
  max,
  step = 1,
  unit = '',
}: {
  value: number;
  onValueChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
}) {
  return (
    <div className="flex items-center gap-3 w-40">
      <Slider
        value={[value]}
        onValueChange={([v]) => onValueChange(v)}
        min={min}
        max={max}
        step={step}
        className="flex-1"
      />
      <span className="text-xs font-mono text-gray-400 w-10 text-right">
        {value}{unit}
      </span>
    </div>
  );
}

export function SettingsPanel() {
  const store = useGameStore();
  const settings = useSettingsStore();

  // Sound preview state
  const [lastPreviewSound, setLastPreviewSound] = useState<string | null>(null);

  // Clear/Reset confirmation state
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [resetDoubleConfirm, setResetDoubleConfirm] = useState(false);

  // Sync settings to sound engine on mount and when they change
  useEffect(() => {
    soundEngine.setMasterVolume(settings.masterVolume);
  }, [settings.masterVolume]);

  useEffect(() => {
    soundEngine.setCategoryVolume('building', settings.soundCategories.building);
  }, [settings.soundCategories.building]);

  useEffect(() => {
    soundEngine.setCategoryVolume('production', settings.soundCategories.production);
  }, [settings.soundCategories.production]);

  useEffect(() => {
    soundEngine.setCategoryVolume('events', settings.soundCategories.events);
  }, [settings.soundCategories.events]);

  useEffect(() => {
    soundEngine.setCategoryVolume('ui', settings.soundCategories.ui);
  }, [settings.soundCategories.ui]);

  useEffect(() => {
    soundEngine.setEnabled(settings.soundEnabled);
  }, [settings.soundEnabled]);

  // Detect prefers-reduced-motion
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mq.matches && !settings.reducedMotion) {
      settings.setReducedMotion(true);
    }
  }, []);

  // Preview sound
  const previewSound = useCallback((soundName: string, category: string) => {
    soundEngine.init();
    soundEngine.play(soundName as 'buildingPlaced', category);
    setLastPreviewSound(soundName);
    setTimeout(() => setLastPreviewSound(null), 500);
  }, []);

  // Export save
  const handleExport = useCallback(() => {
    soundEngine.init();
    soundEngine.play('buttonClick', 'ui');
    const saveStr = store.exportSave();
    navigator.clipboard.writeText(saveStr).catch(() => {});
  }, [store]);

  // Import save
  const [importText, setImportText] = useState('');
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importError, setImportError] = useState('');

  const handleImport = useCallback(() => {
    if (!importText.trim()) {
      setImportError('Please paste a save string.');
      return;
    }
    const success = store.importSave(importText.trim());
    if (success) {
      setImportDialogOpen(false);
      setImportText('');
      setImportError('');
      soundEngine.init();
      soundEngine.play('buttonClick', 'ui');
    } else {
      setImportError('Invalid save data. Please check and try again.');
      soundEngine.init();
      soundEngine.play('error', 'ui');
    }
  }, [store, importText]);

  // Clear save
  const handleClearSave = useCallback(() => {
    localStorage.removeItem('factory-dominion');
    setClearConfirmOpen(false);
    soundEngine.init();
    soundEngine.play('buttonClick', 'ui');
  }, []);

  // Reset game
  const handleResetGame = useCallback(() => {
    if (!resetDoubleConfirm) {
      setResetDoubleConfirm(true);
      return;
    }
    store.resetGame();
    setResetConfirmOpen(false);
    setResetDoubleConfirm(false);
    soundEngine.init();
    soundEngine.play('buttonClick', 'ui');
  }, [store, resetDoubleConfirm]);

  // Play time calculation
  const playTimeTicks = store.stats.playTime;
  const playTimeSeconds = Math.floor(playTimeTicks);
  const playTimeMinutes = Math.floor(playTimeSeconds / 60);
  const playTimeHours = Math.floor(playTimeMinutes / 60);
  const playTimeDisplay = playTimeHours > 0
    ? `${playTimeHours}h ${playTimeMinutes % 60}m`
    : playTimeMinutes > 0
      ? `${playTimeMinutes}m ${playTimeSeconds % 60}s`
      : `${playTimeSeconds}s`;

  // Save file size estimate
  const saveSizeEstimate = (() => {
    try {
      const data = localStorage.getItem('factory-dominion');
      if (data) {
        const bytes = new Blob([data]).size;
        if (bytes > 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${bytes} B`;
      }
    } catch {
      // ignore
    }
    return '~1 KB';
  })();

  // Game version
  const gameVersion = '1.2.0';

  // ── Buy Me a Coffee URL (update with your actual profile) ──
  const BUYMEACOFFEE_URL = 'https://buymeacoffee.com/YOUR_USERNAME';

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      {/* HEADER */}
      <div>
        <h2 className="text-xl font-bold text-gray-400 tracking-wide flex items-center gap-2 neon-glow-cyan">
          <Settings className="w-5 h-5" />
          Settings
        </h2>
        <p className="text-xs text-gray-500 mt-0.5">Configure your Factory Dominion experience</p>
      </div>

      {/* ====== GAME SETTINGS ====== */}
      <SettingsSection
        title="Game Settings"
        icon={<Cog className="w-4 h-4 text-cyan-400" />}
      >
        {/* Auto-save toggle */}
        <SettingRow
          label="Auto-Save"
          description="Automatically save your progress"
        >
          <Switch
            checked={settings.autoSave}
            onCheckedChange={settings.setAutoSave}
          />
        </SettingRow>

        {/* Auto-save interval */}
        {settings.autoSave && (
          <SettingRow
            label="Auto-Save Interval"
            description="How often to auto-save (10s-120s)"
          >
            <LabeledSlider
              value={settings.autoSaveInterval}
              onValueChange={settings.setAutoSaveInterval}
              min={10}
              max={120}
              step={5}
              unit="s"
            />
          </SettingRow>
        )}

        {/* Speed limit */}
        <SettingRow
          label="Speed Limit"
          description="Maximum game speed allowed"
        >
          <Select
            value={String(settings.speedLimit)}
            onValueChange={(v) => settings.setSpeedLimit(Number(v) as SpeedLimit)}
          >
            <SelectTrigger className="w-32 h-8 text-xs bg-[#0a0e17] border-gray-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-card border-gray-700">
              <SelectItem value="1" className="text-xs">1x Only</SelectItem>
              <SelectItem value="5" className="text-xs">Max 5x</SelectItem>
              <SelectItem value="10" className="text-xs">Max 10x</SelectItem>
              <SelectItem value="0" className="text-xs">Unlimited</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>

        {/* Number format */}
        <SettingRow
          label="Number Format"
          description="How large numbers are displayed"
        >
          <Select
            value={settings.numberFormat}
            onValueChange={(v) => settings.setNumberFormat(v as NumberFormat)}
          >
            <SelectTrigger className="w-32 h-8 text-xs bg-[#0a0e17] border-gray-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-card border-gray-700">
              <SelectItem value="standard" className="text-xs">Standard (1.5K)</SelectItem>
              <SelectItem value="scientific" className="text-xs">Scientific (1.5e3)</SelectItem>
              <SelectItem value="compact" className="text-xs">Compact (1.5k)</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>

        {/* Notification filters */}
        <div>
          <p className="text-xs text-gray-200 mb-2">Notification Filters</p>
          <p className="text-[10px] text-gray-500 mb-3">Toggle which notification types appear as toasts</p>
          <div className="grid grid-cols-2 gap-2">
            {([
              { key: 'success' as const, label: 'Success', color: 'text-green-400', icon: 'lucide:check-circle' },
              { key: 'warning' as const, label: 'Warning', color: 'text-yellow-400', icon: 'gi:hazard-sign' },
              { key: 'error' as const, label: 'Error', color: 'text-red-400', icon: 'gi:cross-mark' },
              { key: 'info' as const, label: 'Info', color: 'text-cyan-400', icon: 'gi:info' },
            ]).map(({ key, label, color, icon }) => (
              <div key={key} className="flex items-center justify-between bg-[#0a0e17] rounded-lg px-3 py-2">
                <span className={`text-xs ${color} inline-flex items-center gap-1`}><GameIcon icon={icon} size={14} className="inline" /> {label}</span>
                <Switch
                  checked={settings.notificationFilters[key]}
                  onCheckedChange={(v) => settings.setNotificationFilter(key, v)}
                />
              </div>
            ))}
          </div>
        </div>
      </SettingsSection>

      {/* ====== SOUND SETTINGS ====== */}
      <SettingsSection
        title="Sound Settings"
        icon={<Volume2 className="w-4 h-4 text-purple-400" />}
      >
        {/* Sound enabled toggle */}
        <SettingRow
          label="Sound Effects"
          description="Enable or disable all game sounds"
        >
          <div className="flex items-center gap-2">
            <Switch
              checked={settings.soundEnabled}
              onCheckedChange={(v) => {
                settings.setSoundEnabled(v);
                if (v) {
                  soundEngine.init();
                  soundEngine.play('buttonClick', 'ui');
                }
              }}
            />
            {settings.soundEnabled ? (
              <Volume2 className="w-4 h-4 text-purple-400" />
            ) : (
              <VolumeX className="w-4 h-4 text-gray-500" />
            )}
          </div>
        </SettingRow>

        {/* Master volume */}
        <SettingRow
          label="Master Volume"
          description="Overall sound volume"
        >
          <LabeledSlider
            value={settings.masterVolume}
            onValueChange={settings.setMasterVolume}
            min={0}
            max={100}
            step={5}
            unit="%"
          />
        </SettingRow>

        {/* Category volumes */}
        <div>
          <p className="text-xs text-gray-200 mb-2">Category Volumes</p>
          <div className="space-y-3">
            {([
              { key: 'building' as const, label: 'Building', icon: <Factory className="w-3 h-3" />, preview: 'buildingPlaced' },
              { key: 'production' as const, label: 'Production', icon: <Cog className="w-3 h-3" />, preview: 'resourceProduced' },
              { key: 'events' as const, label: 'Events', icon: <AlertTriangle className="w-3 h-3" />, preview: 'eventTriggered' },
              { key: 'ui' as const, label: 'UI', icon: <MousePointerClick className="w-3 h-3" />, preview: 'buttonClick' },
            ]).map(({ key, label, icon, preview }) => (
              <div key={key} className="flex items-center justify-between bg-[#0a0e17] rounded-lg px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-gray-500">{icon}</span>
                  <span className="text-xs text-gray-300">{label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Slider
                    value={[settings.soundCategories[key]]}
                    onValueChange={([v]) => settings.setSoundCategoryVolume(key, v)}
                    min={0}
                    max={100}
                    step={5}
                    className="w-24"
                  />
                  <span className="text-xs font-mono text-gray-400 w-8 text-right">
                    {settings.soundCategories[key]}%
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={`h-6 w-6 p-0 ${lastPreviewSound === preview ? 'text-purple-400' : 'text-gray-500 hover:text-purple-400'}`}
                    onClick={() => previewSound(preview, key)}
                    title={`Preview ${label} sound`}
                  >
                    <Play className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Mute all */}
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs border-red-800/50 text-red-400 hover:bg-red-900/30 hover:border-red-600"
            onClick={() => {
              settings.muteAll();
              soundEngine.setEnabled(false);
            }}
          >
            <VolumeX className="w-3 h-3 mr-1" />
            Mute All
          </Button>
        </div>
      </SettingsSection>

      {/* ====== DISPLAY SETTINGS ====== */}
      <SettingsSection
        title="Display Settings"
        icon={<Monitor className="w-4 h-4 text-green-400" />}
      >
        {/* Floating numbers */}
        <SettingRow
          label="Floating Numbers"
          description="Show resource production popups"
        >
          <Switch
            checked={settings.floatingNumbers}
            onCheckedChange={settings.setFloatingNumbers}
          />
        </SettingRow>

        {/* Toast notifications */}
        <SettingRow
          label="Toast Notifications"
          description="Show notification toasts in the corner"
        >
          <Switch
            checked={settings.toastNotifications}
            onCheckedChange={settings.setToastNotifications}
          />
        </SettingRow>

        {/* Scan line effect */}
        <SettingRow
          label="Scan Line Effect"
          description="CRT-style scan line overlay"
        >
          <Switch
            checked={settings.scanLineEffect}
            onCheckedChange={settings.setScanLineEffect}
          />
        </SettingRow>

        {/* Background grid */}
        <SettingRow
          label="Background Grid"
          description="Show grid pattern in the background"
        >
          <Switch
            checked={settings.backgroundGrid}
            onCheckedChange={settings.setBackgroundGrid}
          />
        </SettingRow>

        {/* Animation speed */}
        <SettingRow
          label="Animation Speed"
          description="Speed of UI animations"
        >
          <Select
            value={settings.animationSpeed}
            onValueChange={(v) => settings.setAnimationSpeed(v as AnimationSpeed)}
          >
            <SelectTrigger className="w-32 h-8 text-xs bg-[#0a0e17] border-gray-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-card border-gray-700">
              <SelectItem value="slow" className="text-xs">Slow</SelectItem>
              <SelectItem value="normal" className="text-xs">Normal</SelectItem>
              <SelectItem value="fast" className="text-xs">Fast</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>

        {/* Reduced motion */}
        <SettingRow
          label="Reduced Motion"
          description="Disable animations for accessibility"
        >
          <Switch
            checked={settings.reducedMotion}
            onCheckedChange={settings.setReducedMotion}
          />
        </SettingRow>
      </SettingsSection>

      {/* ====== NAVIGATION & QUICK ACCESS ====== */}
      <SettingsSection
        title="Navigation & Quick Access"
        icon={<Navigation className="w-4 h-4 text-cyan-400" />}
      >
        {/* Bottom Navigation Mode */}
        <SettingRow
          label="Bottom Navigation Mode"
          description="Controls how the bottom nav bar appears on mobile"
        >
          <Select
            value={settings.bottomNavMode}
            onValueChange={(v) => settings.setBottomNavMode(v as BottomNavMode)}
          >
            <SelectTrigger className="w-36 h-8 text-xs bg-[#0a0e17] border-gray-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-card border-gray-700">
              <SelectItem value="compact" className="text-xs">
                <div className="flex items-center gap-2">
                  <LayoutGrid className="w-3 h-3" />
                  Compact (Icons + Labels)
                </div>
              </SelectItem>
              <SelectItem value="quick" className="text-xs">
                <div className="flex items-center gap-2">
                  <List className="w-3 h-3" />
                  Quick (Icons Only)
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>

        {/* FAB Toggle */}
        <SettingRow
          label="Floating Action Button"
          description="Quick access shortcut menu (mobile only)"
        >
          <Switch
            checked={settings.fabEnabled}
            onCheckedChange={settings.setFABEnabled}
          />
        </SettingRow>

        {/* Max Shortcuts Slider */}
        <SettingRow
          label="Max Quick Access Shortcuts"
          description={`Show up to ${settings.maxQuickAccessShortcuts} shortcuts in the FAB menu`}
        >
          <LabeledSlider
            value={settings.maxQuickAccessShortcuts}
            onValueChange={settings.setMaxQuickAccessShortcuts}
            min={4}
            max={12}
            step={1}
          />
        </SettingRow>

        {/* Shortcut List - reorderable */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-gray-200">Quick Access Shortcuts</p>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px] text-gray-500 hover:text-cyan-400"
              onClick={() => settings.resetQuickAccessShortcuts()}
            >
              <RotateCcw className="w-3 h-3 mr-1" />
              Reset
            </Button>
          </div>
          <div className="space-y-1">
            {settings.quickAccessShortcuts.map((shortcut, index) => {
              const IconComponent = ICON_MAP[shortcut.icon];
              return (
                <div
                  key={shortcut.id}
                  className="flex items-center gap-2 bg-[#0a0e17] rounded-lg px-3 py-2 group"
                >
                  <GripVertical className="w-3 h-3 text-gray-600 cursor-grab" />
                  {IconComponent && <IconComponent className={`w-3.5 h-3.5 ${shortcut.color}`} />}
                  <span className="text-xs text-gray-300 flex-1">{shortcut.label}</span>
                  <span className="text-[9px] text-gray-600 font-mono">{shortcut.action}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => settings.removeQuickAccessShortcut(shortcut.id)}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      </SettingsSection>

      {/* ====== SAVE MANAGEMENT ====== */}
      <SettingsSection
        title="Save Management"
        icon={<Save className="w-4 h-4 text-amber-400" />}
        defaultOpen={true}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Export save */}
          <Button
            variant="outline"
            size="sm"
            className="h-10 text-xs border-cyan-800/50 text-cyan-400 hover:bg-cyan-900/30 hover:border-cyan-500 justify-start"
            onClick={handleExport}
          >
            <Download className="w-4 h-4 mr-2" />
            Export Save to Clipboard
          </Button>

          {/* Import save */}
          <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-10 text-xs border-amber-800/50 text-amber-400 hover:bg-amber-900/30 hover:border-amber-500 justify-start"
              >
                <Upload className="w-4 h-4 mr-2" />
                Import Save
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-cyan-900/30 text-gray-100 max-w-md p-4">
              <DialogHeader>
                <DialogTitle className="text-amber-400 flex items-center gap-2 text-sm">
                  <Upload className="w-4 h-4" /> Import Save
                </DialogTitle>
                <DialogDescription className="text-gray-400 text-xs">
                  Paste your save data below. This will overwrite your current game!
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <textarea
                  value={importText}
                  onChange={(e) => { setImportText(e.target.value); setImportError(''); }}
                  placeholder="Paste your save string here..."
                  className="w-full bg-[#0a0e17] border border-cyan-900/20 rounded-lg p-3 text-xs font-mono text-gray-300 min-h-24 max-h-36 overflow-y-auto game-scrollbar placeholder:text-gray-600 focus:outline-none focus:border-cyan-500/50"
                />
                {importError && (
                  <p className="text-xs text-red-400">{importError}</p>
                )}
                <div className="flex gap-2">
                  <Button
                    onClick={handleImport}
                    className="flex-1 bg-amber-600 hover:bg-amber-700 text-white h-8 text-xs"
                  >
                    <Upload className="w-3 h-3 mr-1" /> Import
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => { setImportDialogOpen(false); setImportError(''); }}
                    className="border-gray-700 text-gray-400 h-8 text-xs"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Clear save */}
          <Dialog open={clearConfirmOpen} onOpenChange={setClearConfirmOpen}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-10 text-xs border-orange-800/50 text-orange-400 hover:bg-orange-900/30 hover:border-orange-500 justify-start"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Clear Save Data
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-orange-900/30 text-gray-100 max-w-sm p-4">
              <DialogHeader>
                <DialogTitle className="text-orange-400 text-sm">Clear Save Data?</DialogTitle>
                <DialogDescription className="text-gray-400 text-xs">
                  This will remove your saved game from this browser. You cannot undo this action. Make sure to export your save first if you want to keep it.
                </DialogDescription>
              </DialogHeader>
              <div className="flex gap-2 mt-2">
                <Button
                  onClick={handleClearSave}
                  className="flex-1 bg-orange-600 hover:bg-orange-700 text-white h-8 text-xs"
                >
                  <Trash2 className="w-3 h-3 mr-1" /> Clear Save
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setClearConfirmOpen(false)}
                  className="border-gray-700 text-gray-400 h-8 text-xs"
                >
                  Cancel
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Reset game */}
          <Dialog open={resetConfirmOpen} onOpenChange={(open) => {
            setResetConfirmOpen(open);
            if (!open) setResetDoubleConfirm(false);
          }}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-10 text-xs border-red-800/50 text-red-400 hover:bg-red-900/30 hover:border-red-500 justify-start"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Reset Game
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-red-900/30 text-gray-100 max-w-sm p-4">
              <DialogHeader>
                <DialogTitle className="text-red-400 text-sm">
                  {resetDoubleConfirm ? <><GameIcon icon="gi:hazard-sign" size={16} className="inline" /> FINAL CONFIRMATION</> : 'Reset Game?'}
                </DialogTitle>
                <DialogDescription className="text-gray-400 text-xs">
                  {resetDoubleConfirm
                    ? 'ALL progress will be permanently lost. There is no way to recover your factory. Are you absolutely sure?'
                    : 'This will reset all game progress and start from the beginning. This action cannot be undone!'}
                </DialogDescription>
              </DialogHeader>
              <div className="flex gap-2 mt-2">
                <Button
                  onClick={handleResetGame}
                  className={`flex-1 h-8 text-xs ${
                    resetDoubleConfirm
                      ? 'bg-red-600 hover:bg-red-700 text-white'
                      : 'bg-red-800/50 hover:bg-red-700 text-red-300'
                  }`}
                >
                  <RotateCcw className="w-3 h-3 mr-1" />
                  {resetDoubleConfirm ? 'YES, DELETE EVERYTHING' : 'Reset Game'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => { setResetConfirmOpen(false); setResetDoubleConfirm(false); }}
                  className="border-gray-700 text-gray-400 h-8 text-xs"
                >
                  Cancel
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </SettingsSection>

      {/* ====== SUPPORT THE DEVELOPER ====== */}
      <SettingsSection
        title="Support the Developer"
        icon={<Coffee className="w-4 h-4 text-amber-400" />}
        defaultOpen={true}
      >
        <div className="bg-[#0a0e17] rounded-lg p-4 border border-amber-900/20">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Coffee className="w-4.5 h-4.5 text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-300 leading-relaxed">
                Factory Dominion is a free, open-source passion project built with love.
                If you're enjoying the game, a small coffee helps keep the servers running and fuels new features!
              </p>
              <a
                href={BUYMEACOFFEE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 mt-3 px-4 py-2 rounded-lg
                  bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500
                  text-white text-xs font-semibold
                  shadow-[0_0_16px_rgba(245,158,11,0.15)] hover:shadow-[0_0_20px_rgba(245,158,11,0.25)]
                  transition-all duration-200 group"
              >
                <Coffee className="w-3.5 h-3.5 group-hover:scale-110 transition-transform duration-200" />
                Buy me a coffee
                <ExternalLink className="w-3 h-3 opacity-60" />
              </a>
            </div>
          </div>
        </div>
      </SettingsSection>

      {/* ====== ABOUT ====== */}
      <SettingsSection
        title="About"
        icon={<Info className="w-4 h-4 text-gray-400" />}
        defaultOpen={true}
      >
        <div className="grid grid-cols-2 gap-3">
          {/* Game version */}
          <div className="bg-[#0a0e17] rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <FileText className="w-3 h-3 text-gray-500" />
              <span className="text-[10px] text-gray-500">Version</span>
            </div>
            <p className="text-sm font-mono text-gray-200">v{gameVersion}</p>
          </div>

          {/* Total play time */}
          <div className="bg-[#0a0e17] rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-3 h-3 text-gray-500" />
              <span className="text-[10px] text-gray-500">Play Time</span>
            </div>
            <p className="text-sm font-mono text-gray-200">{playTimeDisplay}</p>
          </div>

          {/* Save file size */}
          <div className="bg-[#0a0e17] rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <HardDrive className="w-3 h-3 text-gray-500" />
              <span className="text-[10px] text-gray-500">Save Size</span>
            </div>
            <p className="text-sm font-mono text-gray-200">{saveSizeEstimate}</p>
          </div>

          {/* Total ticks */}
          <div className="bg-[#0a0e17] rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <Volume1 className="w-3 h-3 text-gray-500" />
              <span className="text-[10px] text-gray-500">Game Ticks</span>
            </div>
            <p className="text-sm font-mono text-gray-200">{formatNumber(store.gameTick)}</p>
          </div>
        </div>

        {/* Credits */}
        <div className="bg-[#0a0e17] rounded-lg p-3 mt-1">
          <p className="text-xs text-gray-400 text-center">
            <span className="text-cyan-400 font-bold">Factory Dominion</span>: Automated Empire
          </p>
          <p className="text-[10px] text-gray-500 text-center mt-1">
            An idle factory simulation game built with Next.js, TypeScript & Web Audio API
          </p>
          <p className="text-[10px] text-gray-600 text-center mt-1">
            All sounds are synthesized in real-time — no audio files used
          </p>
        </div>
      </SettingsSection>

      {/* ====== CHANGELOG ====== */}
      <SettingsSection
        title="Changelog"
        icon={<FileText className="w-4 h-4 text-teal-400" />}
        defaultOpen={false}
      >
        <div className="space-y-3">
          {/* v1.2.0 */}
          <div className="bg-[#0a0e17] rounded-lg p-3 border border-teal-900/20">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-teal-400 font-mono">v1.2.0</span>
                <span className="text-[9px] text-gray-600">Latest</span>
              </div>
              <span className="text-[9px] text-gray-600">Mar 2025</span>
            </div>
            <ul className="space-y-1">
              <li className="text-[10px] text-gray-400 flex items-start gap-1.5">
                <span className="text-green-500 mt-0.5">•</span>
                Economy rebalance — all factory margins are now positive
              </li>
              <li className="text-[10px] text-gray-400 flex items-start gap-1.5">
                <span className="text-green-500 mt-0.5">•</span>
                Endgame buildings converted to passive generators (money, RP, CP)
              </li>
              <li className="text-[10px] text-gray-400 flex items-start gap-1.5">
                <span className="text-yellow-500 mt-0.5">•</span>
                Fixed duplicate quest ID bug causing console errors
              </li>
            </ul>
          </div>

          {/* v1.1.0 */}
          <div className="bg-[#0a0e17] rounded-lg p-3 border border-gray-800/30">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-gray-300 font-mono">v1.1.0</span>
              <span className="text-[9px] text-gray-600">Feb 2025</span>
            </div>
            <ul className="space-y-1">
              <li className="text-[10px] text-gray-400 flex items-start gap-1.5">
                <span className="text-cyan-500 mt-0.5">•</span>
                Navigation overhaul — 25 tabs reorganized into 7 categories
              </li>
              <li className="text-[10px] text-gray-400 flex items-start gap-1.5">
                <span className="text-cyan-500 mt-0.5">•</span>
                Shared UI components (PanelStatCard, tier color system)
              </li>
              <li className="text-[10px] text-gray-400 flex items-start gap-1.5">
                <span className="text-cyan-500 mt-0.5">•</span>
                Mobile nav improved — all tabs accessible in 2 taps
              </li>
            </ul>
          </div>

          {/* v1.0.0 */}
          <div className="bg-[#0a0e17] rounded-lg p-3 border border-gray-800/30">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-gray-300 font-mono">v1.0.0</span>
              <span className="text-[9px] text-gray-600">Jan 2025</span>
            </div>
            <ul className="space-y-1">
              <li className="text-[10px] text-gray-400 flex items-start gap-1.5">
                <span className="text-purple-500 mt-0.5">•</span>
                Initial release — 65 buildings, 56 resources
              </li>
              <li className="text-[10px] text-gray-400 flex items-start gap-1.5">
                <span className="text-purple-500 mt-0.5">•</span>
                Full production chains from T0 to T4
              </li>
              <li className="text-[10px] text-gray-400 flex items-start gap-1.5">
                <span className="text-purple-500 mt-0.5">•</span>
                Market, research, quests, workers, and prestige systems
              </li>
            </ul>
          </div>
        </div>
      </SettingsSection>
    </div>
  );
}
