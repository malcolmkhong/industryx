'use client';

import { useGameStore, formatNumber } from '@/lib/game/store';
import { motion } from 'framer-motion';
import { EVENT_TEMPLATES, RESOURCE_META } from '@/lib/game/configCache';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertTriangle, Clock, Zap, TrendingUp, TrendingDown,
  Factory, FlaskConical, Truck, Shield, Activity, Globe
} from 'lucide-react';
import { GameIcon } from '@/components/game/shared/GameIcon';

const EVENT_COLORS: Record<string, string> = {
  oilCrisis: 'border-amber-600/50 bg-amber-900/10',
  energyShortage: 'border-yellow-600/50 bg-yellow-900/10',
  aiRevolution: 'border-purple-600/50 bg-purple-900/10',
  economicBoom: 'border-success/50 bg-success/10',
  naturalDisaster: 'border-danger/50 bg-danger/10',
  techBreakthrough: 'border-cyan-600/50 bg-cyan-900/10',
  tradeWar: 'border-orange-600/50 bg-orange-900/10',
  greenInitiative: 'border-success/50 bg-success/10',
  spaceRace: 'border-violet-600/50 bg-violet-900/10',
  marketCrash: 'border-danger/50 bg-danger/10',
};

const EFFECT_ICONS: Record<string, React.ReactNode> = {
  productionMultiplier: <Factory className="w-3 h-3" />,
  powerMultiplier: <Zap className="w-3 h-3" />,
  marketPriceMultiplier: <TrendingUp className="w-3 h-3" />,
  transportSpeed: <Truck className="w-3 h-3" />,
  researchSpeed: <FlaskConical className="w-3 h-3" />,
};

export function EventPanel() {
  const store = useGameStore();

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-orange-400 neon-glow-cyan tracking-wide">World Events</h2>
          <p className="text-xs text-muted-label mt-0.5">Dynamic events that change the game world</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-orange-500/50 text-orange-400 bg-orange-900/20 text-xs">
            <AlertTriangle className="w-3 h-3 mr-1" />
            {store.activeEvents.length} active
          </Badge>
        </div>
      </div>

      {/* Active Events */}
      <div className="game-card rounded-xl bg-card p-4 border border-orange-900/30">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="w-4 h-4 text-orange-400 neon-pulse" />
          <h3 className="text-sm font-semibold text-orange-400">Active Events</h3>
        </div>
        {store.activeEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-label">
            <Shield className="w-8 h-8 mb-2 opacity-50" />
            <p className="text-sm">No active events. Check back later!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {store.activeEvents.map(event => {
              const timePct = (event.remaining / event.duration) * 100;
              const colorClass = EVENT_COLORS[event.type] || 'border-muted-label/50 bg-muted-label/10';

              return (
                <div key={event.id} className={`rounded-xl p-4 border ${colorClass}`}>
                  <motion.div
                  >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div className="text-3xl neon-pulse"><GameIcon icon={event.icon} size={32} className="inline-flex" /></div>
                      <div>
                        <h4 className="text-sm font-bold text-gray-200">{event.name}</h4>
                        <p className="text-xs text-subtle mt-0.5">{event.description}</p>
                      </div>
                    </div>
                  </div>

                  {/* Effects */}
                  <div className="flex flex-wrap gap-2 mb-3">
                    {event.effects.map((effect, i) => (
                      <Badge
                        key={i}
                        variant="outline"
                        className={`text-[10px] ${
                          effect.value > 1
                            ? 'border-success text-success'
                            : 'border-danger text-danger'
                        }`}
                      >
                        {EFFECT_ICONS[effect.type] || <Zap className="w-3 h-3" />}
                        {' '}
                        {effect.type === 'productionMultiplier' ? 'Production' :
                         effect.type === 'powerMultiplier' ? 'Power ×' :
                         effect.type === 'marketPriceMultiplier' ? `Market ${effect.target ? RESOURCE_META[effect.target]?.name : ''}` :
                         effect.type === 'transportSpeed' ? 'Transport' :
                         effect.type === 'researchSpeed' ? 'Research' : effect.type}
                        {' '}{effect.value > 1 ? '+' : ''}{((effect.value - 1) * 100).toFixed(0)}%
                      </Badge>
                    ))}
                  </div>

                  {/* Timer */}
                  <div className="flex items-center gap-3">
                    <Clock className="w-3.5 h-3.5 text-muted-label" />
                    <div
                      className="flex-1 h-2 bg-muted-label rounded-full overflow-hidden"
                      role="progressbar"
                      aria-valuenow={Math.round(timePct)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${event.name} time remaining`}
                    >
                      <div
                        className={`h-full rounded-full transition-all ${
                          timePct < 25 ? 'bg-danger neon-pulse' : 'bg-orange-500'
                        }`}
                        style={{ width: `${timePct}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-subtle font-mono whitespace-nowrap">
                      {formatNumber(event.remaining)} / {formatNumber(event.duration)} ticks
                    </span>
                  </div>
                  </motion.div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Event Catalog */}
      <div className="game-card rounded-xl bg-card p-4 border border-border">
        <div className="flex items-center gap-2 mb-3">
          <Globe className="w-4 h-4 text-subtle" />
          <h3 className="text-sm font-semibold text-subtle">Possible Events</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {EVENT_TEMPLATES.map((template, i) => {
            const isActive = store.activeEvents.some(e => e.type === template.type);
            return (
              <div
                key={i}
                className={`rounded-lg p-3 border ${
                  isActive
                    ? EVENT_COLORS[template.type] || 'border-muted-label/50 bg-muted-label/10'
                    : 'border-muted-label bg-[#0a0e17]'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <GameIcon icon={template.icon} size={16} className="inline-flex" />
                  <span className="text-xs font-medium text-gray-200">{template.name}</span>
                  {isActive && (
                    <Badge className="text-[8px] bg-orange-900/20 text-orange-400 border-0 ml-auto">ACTIVE</Badge>
                  )}
                </div>
                <p className="text-[10px] text-subtle line-clamp-2">{template.description}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <Clock className="w-2.5 h-2.5 text-muted-label" />
                  <span className="text-[9px] text-muted-label">{template.duration} ticks duration</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Event Log */}
      {store.eventLog.length > 0 && (
        <div className="game-card rounded-xl bg-card p-4 border border-border">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-subtle" />
            <h3 className="text-sm font-semibold text-subtle">Event History</h3>
          </div>
          <div className="space-y-1 max-h-60 overflow-y-auto game-scrollbar scroll-fade">
            {store.eventLog.slice(-20).reverse().map((event, i) => (
              <div key={i} className="flex items-center gap-2 text-[11px] text-muted-label py-1 border-b border-muted-label/50">
                <GameIcon icon={event.icon} size={14} className="inline-flex" />
                <span>{event.name}</span>
                <span className="ml-auto text-[9px] text-muted-label">Tick {event.remaining}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
