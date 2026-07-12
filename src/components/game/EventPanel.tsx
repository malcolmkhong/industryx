'use client';

import { useState } from 'react';
import { useGameStore, formatNumber } from '@/lib/game/state/store';
import type { EventEffect } from '@/lib/game/shared/types/types';
import { useShallow } from 'zustand/react/shallow';
import { motion } from 'framer-motion';
import { RESOURCE_META, EVENT_TEMPLATES } from '@/lib/game/config/configCache';
import { useConfigVersion } from '@/components/providers/GameConfigProvider';
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

/**
 * Map an event's affected subsystems to a small icon + color. Used by the
 * Active Events cards to show at a glance which area of the factory the
 * event touches (power, production, research, transport, market, etc.).
 *
 * The keys here correspond to the `EventEffect.type` union defined in
 * `src/lib/game/types.ts` — NOT `GameEvent.type` (which is freeform text
 * from the Supabase event_templates.type column and is not enumerated).
 * We aggregate across all effects of an event, so a single event that
 * affects multiple subsystems shows one badge per subsystem.
 */
const EFFECT_CATEGORY: Record<EventEffect['type'], { Icon: typeof Zap; className: string; label: string }> = {
  productionMultiplier:   { Icon: Factory,        className: 'text-brand',    label: 'Production' },
  powerMultiplier:       { Icon: Zap,            className: 'text-warning',  label: 'Power' },
  marketPriceMultiplier: { Icon: Globe,          className: 'text-premium',  label: 'Market' },
  transportSpeed:        { Icon: Truck,          className: 'text-domain',   label: 'Transport' },
  researchSpeed:         { Icon: FlaskConical,   className: 'text-research', label: 'Research' },
};

/**
 * Aggregate the unique categories affected by an event. Returns the
 * categories in the same order as the EFFECT_CATEGORY map (a stable
 * ordering makes the UI predictable). Events with no recognised effects
 * return an empty array so the caller can hide the badge row.
 */
type EffectLike = { type: string };
function eventCategories(effects: EffectLike[]): Array<{ Icon: typeof Zap; className: string; label: string; key: string }> {
  const seen = new Set<string>();
  const out: Array<{ Icon: typeof Zap; className: string; label: string; key: string }> = [];
  for (const key of Object.keys(EFFECT_CATEGORY) as Array<EventEffect['type']>) {
    if (effects.some((e) => e.type === key) && !seen.has(key)) {
      seen.add(key);
      out.push({ key, ...EFFECT_CATEGORY[key] });
    }
  }
  return out;
}

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
  useConfigVersion();
  const store = useGameStore(useShallow((s) => ({ activeEvents: s.activeEvents, eventLog: s.eventLog })));
  const [showFullHistory, setShowFullHistory] = useState(false);

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
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-sm font-bold text-subtle">{event.name}</h4>
                          {DIRECTION_ICONS[direction]}
                          {eventCategories(event.effects as EffectLike[]).map((cat) => {
                            const CatIcon = cat.Icon;
                            return (
                              <Badge
                                key={cat.key}
                                variant="outline"
                                className={`text-[10px] ${cat.className} border-current/30 flex items-center gap-1`}
                                data-testid="event-category-badge"
                                data-category={cat.key}
                                title={`Affects ${cat.label}`}
                              >
                                <CatIcon className="w-2.5 h-2.5" aria-hidden="true" />
                                {cat.label}
                              </Badge>
                            );
                          })}
                        </div>
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
                          {typeof effect.value === 'number' && Math.abs(effect.value) >= 10 && (
                            <span className="ml-1 text-[9px] text-muted-label font-mono">
                              ({formatNumber(effect.value)}x)
                            </span>
                          )}
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
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-subtle" />
              <h3 className="text-sm font-semibold text-subtle">Event History</h3>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowFullHistory((v) => !v)}
              className="text-[10px] h-6 px-2 text-muted-label hover:text-subtle"
              data-testid="toggle-full-history"
            >
              {showFullHistory ? 'Show recent (20)' : `Show all (${store.eventLog.length})`}
            </Button>
          </div>
          <div className="space-y-1 max-h-60 overflow-y-auto game-scrollbar scroll-fade">
            {(showFullHistory ? store.eventLog.slice().reverse() : store.eventLog.slice(-20).reverse()).map((event, i) => (
              <div key={`${event.id}-${i}`} className="flex items-center gap-2 text-[11px] text-muted-label py-1 border-b border-muted-label/50">
                <span className="text-sm">{event.icon}</span>
                <span>{event.name}</span>
                <span className="ml-auto text-[9px] text-muted-label">{formatRemaining(event.remaining)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upcoming Event Catalogue — SSOT of all configured events from the
          configCache. Lets the player plan around predictable patterns. */}
      {EVENT_TEMPLATES.length > 0 && (
        <div className="game-card rounded-xl bg-card p-4 border border-border">
          <div className="flex items-center gap-2 mb-3">
            <GameIcon icon="game-icons:scroll-quill" size={16} className="text-muted-label" />
            <h3 className="text-sm font-semibold text-muted-label">Upcoming Event Catalogue</h3>
            <Badge variant="outline" className="text-[9px] text-muted-label border-muted-label/40">
              {EVENT_TEMPLATES.length} total
            </Badge>
          </div>
          <ul className="space-y-1">
            {EVENT_TEMPLATES.map((entry) => {
              // EVENT_TEMPLATES effects are untyped (Record<string, unknown>[]).
              // Try to aggregate typed categories; fall back to showing a
              // generic "Event" badge when effects are unknown.
              const categories = eventCategories(
                (entry.effects ?? []) as EffectLike[],
              );
              return (
                <li
                  key={`${entry.type}-${entry.name}`}
                  className="flex items-center gap-2 text-xs px-2 py-1.5 rounded-lg hover:bg-background/60/30 transition-colors"
                  data-testid="event-catalogue-entry"
                  data-type={entry.type}
                >
                  <span className="w-6 h-6 rounded flex items-center justify-center bg-background/60 shrink-0">
                    <GameIcon icon={entry.icon || 'game-icons:scroll-quill'} size={14} />
                  </span>
                  <span className="flex-1 text-subtle">{entry.name}</span>
                  {categories.length > 0 ? (
                    <span className="flex flex-wrap gap-1 justify-end">
                      {categories.map((cat) => {
                        const CatIcon = cat.Icon;
                        return (
                          <span
                            key={cat.key}
                            className={`inline-flex items-center gap-1 text-[9px] uppercase tracking-wider ${cat.className}`}
                            data-category={cat.key}
                          >
                            <CatIcon className="w-2.5 h-2.5" aria-hidden="true" />
                            {cat.label}
                          </span>
                        );
                      })}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[9px] uppercase tracking-wider text-muted-label">
                      <Activity className="w-2.5 h-2.5" aria-hidden="true" />
                      Event
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
