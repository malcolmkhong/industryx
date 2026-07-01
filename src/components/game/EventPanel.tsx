'use client';

import { useGameStore, formatNumber } from '@/lib/game/store';
import { useShallow } from 'zustand/react/shallow';
import { motion } from 'framer-motion';
import { RESOURCE_META, EVENT_TEMPLATES } from '@/lib/game/configCache';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatRemaining, formatDuration } from '@/lib/utils/time';
import {
  AlertTriangle, Clock, Zap, TrendingUp, TrendingDown,
  Factory, FlaskConical, Truck, Shield, Activity, Globe, ArrowUp, ArrowDown, Minus
} from 'lucide-react';
import { GameIcon } from '@/components/icons';

const DIRECTION_COLORS: Record<string, string> = {
  up: 'border-success/80/50 bg-success/20/10',
  down: 'border-danger/80/50 bg-danger/20/10',
  mixed: 'border-warning/50 bg-warning/10',
};

const DIRECTION_ICONS: Record<string, React.ReactNode> = {
  up: <ArrowUp className="w-3 h-3 text-success" />,
  down: <ArrowDown className="w-3 h-3 text-danger" />,
  mixed: <Minus className="w-3 h-3 text-warning" />,
};

function getEventDirection(effects: { type: string; value: number }[]): 'up' | 'down' | 'mixed' {
  const marketEffects = effects.filter(e => e.type === 'marketPriceMultiplier');
  if (marketEffects.length === 0) return 'mixed';
  const allUp = marketEffects.every(e => e.value > 1);
  const allDown = marketEffects.every(e => e.value < 1);
  if (allUp) return 'up';
  if (allDown) return 'down';
  return 'mixed';
}

function getPercent(value: number): string {
  const pct = ((value - 1) * 100).toFixed(0);
  return value > 1 ? `+${pct}%` : `${pct}%`;
}

export function EventPanel() {
  const store = useGameStore(useShallow((s) => ({ activeEvents: s.activeEvents, eventLog: s.eventLog })));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-domain neon-glow-cyan tracking-wide">World Events</h2>
          <p className="text-xs text-muted-label mt-0.5">Dynamic events that change the game world</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-domain/50 text-domain bg-domain/20 text-xs">
            <AlertTriangle className="w-3 h-3 mr-1" />
            {store.activeEvents.length} active
          </Badge>
        </div>
      </div>

      <div className="game-card rounded-xl bg-card p-4 border border-domain/30">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="w-4 h-4 text-domain neon-pulse" />
          <h3 className="text-sm font-semibold text-domain">Active Events</h3>
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
              const direction = getEventDirection(event.effects as { type: string; value: number }[]);
              const colorClass = DIRECTION_COLORS[direction] || 'border-muted-label/50 bg-muted-label/10';

              return (
                <div key={event.id} className={`rounded-xl p-4 border ${colorClass}`}>
                  <motion.div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div className="text-2xl">{event.icon}</div>
                      <div>
                        <h4 className="text-sm font-bold text-subtle">{event.name}</h4>
                        <p className="text-xs text-subtle mt-0.5">{event.description}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 mb-3">
                    {event.effects.map((effect, i) => {
                      const isUp = effect.value > 1;
                      const resourceName = effect.target ? RESOURCE_META[effect.target]?.name : null;
                      return (
                        <Badge
                          key={`${effect.target}-${i}`}
                          variant="outline"
                          className={`text-[10px] ${isUp ? 'border-success/50 text-success' : 'border-danger/50 text-danger'}`}
                        >
                          {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          {' '}
                          {resourceName || effect.target || 'Market'}
                          {' '}
                          {getPercent(effect.value as number)}
                        </Badge>
                      );
                    })}
                  </div>

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
                        className={`h-full rounded-full transition-all ${timePct < 25 ? 'bg-danger neon-pulse' : 'bg-domain'}`}
                        style={{ width: `${timePct}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-subtle font-mono whitespace-nowrap">
                      {formatRemaining(event.remaining)} / {formatDuration(event.duration)}
                    </span>
                  </div>
                  </motion.div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {store.eventLog.length > 0 && (
        <div className="game-card rounded-xl bg-card p-4 border border-border">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-subtle" />
            <h3 className="text-sm font-semibold text-subtle">Event History</h3>
          </div>
          <div className="space-y-1 max-h-60 overflow-y-auto game-scrollbar scroll-fade">
            {store.eventLog.slice(-20).reverse().map((event, i) => (
              <div key={`${event.id}-${i}`} className="flex items-center gap-2 text-[11px] text-muted-label py-1 border-b border-muted-label/50">
                <span className="text-sm">{event.icon}</span>
                <span>{event.name}</span>
                <span className="ml-auto text-[9px] text-muted-label">{formatRemaining(event.remaining)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
