"use client";

import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface HistoryPoint {
  resource_id: string;
  base_price: number;
  market_phase: string | null;
  game_tick: number | null;
  recorded_at: string;
}

interface MarketPriceChartProps {
  resourceId: string;
  hours?: number;
  width?: number;
  height?: number;
  className?: string;
}

const SVG_PADDING = { top: 12, right: 8, bottom: 18, left: 32 };

function formatTimeShort(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diffMin = (now - d.getTime()) / 60000;
  if (diffMin < 60) return `${Math.max(1, Math.floor(diffMin))}m`;
  if (diffMin < 1440) return `${Math.floor(diffMin / 60)}h`;
  return `${Math.floor(diffMin / 1440)}d`;
}

export function MarketPriceChart({
  resourceId,
  hours = 24,
  width = 400,
  height = 100,
  className = "",
}: MarketPriceChartProps) {
  const [points, setPoints] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/game/market-history?resource=${encodeURIComponent(resourceId)}&hours=${hours}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (!cancelled) setPoints((data.history ?? []) as HistoryPoint[]);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [resourceId, hours]);

  if (loading) {
    return (
      <div
        className={`flex items-center justify-center text-xs text-muted-label ${className}`}
        style={{ height }}
      >
        Loading price history...
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={`flex items-center justify-center text-xs text-danger ${className}`}
        style={{ height }}
      >
        Could not load price history
      </div>
    );
  }

  if (points.length < 2) {
    return (
      <div
        className={`flex items-center justify-center text-xs text-muted-label ${className}`}
        style={{ height }}
      >
        No trades yet — chart will appear after first trade
      </div>
    );
  }

  const prices = points.map((p) => Number(p.base_price) || 0);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const range = maxPrice - minPrice || 1;

  const chartW = width - SVG_PADDING.left - SVG_PADDING.right;
  const chartH = height - SVG_PADDING.top - SVG_PADDING.bottom;
  const stepX = chartW / Math.max(1, points.length - 1);

  const path = points
    .map((p, i) => {
      const x = SVG_PADDING.left + i * stepX;
      const y = SVG_PADDING.top + chartH - ((Number(p.base_price) - minPrice) / range) * chartH;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const areaPath = `${path} L${(SVG_PADDING.left + (points.length - 1) * stepX).toFixed(1)},${(SVG_PADDING.top + chartH).toFixed(1)} L${SVG_PADDING.left.toFixed(1)},${(SVG_PADDING.top + chartH).toFixed(1)} Z`;

  const first = prices[0];
  const last = prices[prices.length - 1];
  const delta = last - first;
  const pct = first > 0 ? (delta / first) * 100 : 0;
  const trendUp = delta > 0;
  const trendFlat = delta === 0;

  const TrendIcon = trendFlat ? Minus : trendUp ? TrendingUp : TrendingDown;
  const trendColor = trendFlat
    ? "text-subtle"
    : trendUp
      ? "text-success"
      : "text-danger";

  return (
    <div className={className}>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-subtle">
          {hours}h price history ({points.length} trades)
        </span>
        <span className={`flex items-center gap-1 ${trendColor} font-mono`}>
          <TrendIcon className="w-3 h-3" />
          {delta >= 0 ? "+" : ""}
          {delta.toFixed(2)} ({pct >= 0 ? "+" : ""}
          {pct.toFixed(1)}%)
        </span>
      </div>
      <svg
        width={width}
        height={height}
        className="bg-muted-label/30 rounded border border-brand/20"
        viewBox={`0 0 ${width} ${height}`}
      >
        <path d={areaPath} fill="url(#priceGradient)" opacity={0.3} />
        <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" className={trendColor} />
        <defs>
          <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.4" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <text
          x={SVG_PADDING.left - 4}
          y={SVG_PADDING.top + 4}
          textAnchor="end"
          fontSize="9"
          fill="#9ca3af"
        >
          {maxPrice.toFixed(1)}
        </text>
        <text
          x={SVG_PADDING.left - 4}
          y={SVG_PADDING.top + chartH}
          textAnchor="end"
          fontSize="9"
          fill="#9ca3af"
        >
          {minPrice.toFixed(1)}
        </text>
        {points.length > 0 && (
          <>
            <text
              x={SVG_PADDING.left}
              y={height - 4}
              textAnchor="start"
              fontSize="9"
              fill="#6b7280"
            >
              {formatTimeShort(points[0].recorded_at)}
            </text>
            <text
              x={width - SVG_PADDING.right}
              y={height - 4}
              textAnchor="end"
              fontSize="9"
              fill="#6b7280"
            >
              {formatTimeShort(points[points.length - 1].recorded_at)}
            </text>
          </>
        )}
      </svg>
    </div>
  );
}
