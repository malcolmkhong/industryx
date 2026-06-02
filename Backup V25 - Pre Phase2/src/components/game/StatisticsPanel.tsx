'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { useGameStore, formatNumber } from '@/lib/game/store';
import { RESOURCE_META } from '@/lib/game/data';
import { ResourceType } from '@/lib/game/types';
import { BarChart3, TrendingUp, TrendingDown, Minus, Zap, DollarSign, Activity } from 'lucide-react';
import { GameIcon } from '@/components/game/shared/GameIcon';

type TimeRange = 50 | 100 | 200;

function formatShortNumber(n: number): string {
  if (n >= 1e12) return (n / 1e12).toFixed(1) + 'T';
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toFixed(0);
}

function formatTimeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

// SVG Line Chart component
function LineChart({
  data,
  width,
  height,
  color,
  label,
  yLabel,
}: {
  data: number[];
  width: number;
  height: number;
  color: string;
  label: string;
  yLabel?: string;
}) {
  if (data.length < 2) {
    return (
      <div className="flex items-center justify-center text-gray-500 text-xs w-full" style={{ height }}>
        Not enough data yet
      </div>
    );
  }

  const padding = { top: 10, right: 10, bottom: 20, left: 50 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const minVal = Math.min(...data);
  const maxVal = Math.max(...data);
  const range = maxVal - minVal || 1;

  const points = data.map((val, i) => ({
    x: padding.left + (i / (data.length - 1)) * chartW,
    y: padding.top + chartH - ((val - minVal) / range) * chartH,
  }));

  const pathD = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');

  // Grid lines
  const gridLines = 4;
  const gridYs = Array.from({ length: gridLines + 1 }, (_, i) => {
    const y = padding.top + (i / gridLines) * chartH;
    const val = maxVal - (i / gridLines) * range;
    return { y, val };
  });

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" className="w-full h-auto overflow-visible" role="img" aria-label={`${label} line chart`} tabIndex={0}>
      {/* Grid lines */}
      {gridYs.map(({ y, val }, i) => (
        <g key={i}>
          <line
            x1={padding.left}
            y1={y}
            x2={width - padding.right}
            y2={y}
            stroke="#1e293b"
            strokeWidth={1}
          />
          <text
            x={padding.left - 5}
            y={y + 4}
            textAnchor="end"
            fill="#64748b"
            fontSize={9}
            fontFamily="monospace"
          >
            {formatShortNumber(val)}
          </text>
        </g>
      ))}
      {/* Y-axis label */}
      {yLabel && (
        <text
          x={5}
          y={height / 2}
          textAnchor="middle"
          fill="#475569"
          fontSize={9}
          fontFamily="monospace"
          transform={`rotate(-90, 5, ${height / 2})`}
        >
          {yLabel}
        </text>
      )}
      {/* Line */}
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Glow effect */}
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth={4}
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity={0.2}
      />
      {/* Label */}
      <text
        x={width / 2}
        y={height - 2}
        textAnchor="middle"
        fill="#94a3b8"
        fontSize={9}
      >
        {label}
      </text>
    </svg>
  );
}

// SVG Area Chart for power
function AreaChart({
  productionData,
  consumptionData,
  width,
  height,
}: {
  productionData: number[];
  consumptionData: number[];
  width: number;
  height: number;
}) {
  if (productionData.length < 2) {
    return (
      <div className="flex items-center justify-center text-gray-500 text-xs w-full" style={{ height }}>
        Not enough data yet
      </div>
    );
  }

  const padding = { top: 10, right: 10, bottom: 20, left: 50 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const allValues = [...productionData, ...consumptionData];
  const minVal = 0;
  const maxVal = Math.max(...allValues) * 1.1 || 1;
  const range = maxVal - minVal;

  const makePoints = (data: number[]) =>
    data.map((val, i) => ({
      x: padding.left + (i / (data.length - 1)) * chartW,
      y: padding.top + chartH - ((val - minVal) / range) * chartH,
    }));

  const prodPoints = makePoints(productionData);
  const consPoints = makePoints(consumptionData);

  const makePathD = (pts: { x: number; y: number }[]) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

  const makeAreaD = (pts: { x: number; y: number }[]) => {
    const line = makePathD(pts);
    return `${line} L ${pts[pts.length - 1].x.toFixed(1)} ${padding.top + chartH} L ${pts[0].x.toFixed(1)} ${padding.top + chartH} Z`;
  };

  const gridLines = 4;
  const gridYs = Array.from({ length: gridLines + 1 }, (_, i) => {
    const y = padding.top + (i / gridLines) * chartH;
    const val = maxVal - (i / gridLines) * range;
    return { y, val };
  });

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" className="w-full h-auto overflow-visible" role="img" aria-label="Power grid production and consumption area chart" tabIndex={0}>
      {/* Grid lines */}
      {gridYs.map(({ y, val }, i) => (
        <g key={i}>
          <line
            x1={padding.left}
            y1={y}
            x2={width - padding.right}
            y2={y}
            stroke="#1e293b"
            strokeWidth={1}
          />
          <text
            x={padding.left - 5}
            y={y + 4}
            textAnchor="end"
            fill="#64748b"
            fontSize={9}
            fontFamily="monospace"
          >
            {formatShortNumber(val)}MW
          </text>
        </g>
      ))}
      {/* Production area */}
      <path d={makeAreaD(prodPoints)} fill="#22d3ee" opacity={0.15} />
      <path d={makePathD(prodPoints)} fill="none" stroke="#22d3ee" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {/* Consumption area */}
      <path d={makeAreaD(consPoints)} fill="#f97316" opacity={0.1} />
      <path d={makePathD(consPoints)} fill="none" stroke="#f97316" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" strokeDasharray="4 2" />
      {/* Legend */}
      <rect x={padding.left + 10} y={padding.top} width={8} height={8} fill="#22d3ee" rx={1} />
      <text x={padding.left + 22} y={padding.top + 8} fill="#94a3b8" fontSize={9}>Production</text>
      <rect x={padding.left + 90} y={padding.top} width={8} height={8} fill="#f97316" rx={1} />
      <text x={padding.left + 102} y={padding.top + 8} fill="#94a3b8" fontSize={9}>Consumption</text>
      <text x={width / 2} y={height - 2} textAnchor="middle" fill="#94a3b8" fontSize={9}>Power Grid Over Time</text>
    </svg>
  );
}

// Efficiency line chart
function EfficiencyChart({
  data,
  width,
  height,
}: {
  data: number[];
  width: number;
  height: number;
}) {
  if (data.length < 2) {
    return (
      <div className="flex items-center justify-center text-gray-500 text-xs w-full" style={{ height }}>
        Not enough data yet
      </div>
    );
  }

  const padding = { top: 10, right: 10, bottom: 20, left: 50 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const minVal = 0;
  const maxVal = 100;
  const range = maxVal - minVal;

  const points = data.map((val, i) => ({
    x: padding.left + (i / (data.length - 1)) * chartW,
    y: padding.top + chartH - ((val - minVal) / range) * chartH,
  }));

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaD = `${pathD} L ${points[points.length - 1].x.toFixed(1)} ${padding.top + chartH} L ${points[0].x.toFixed(1)} ${padding.top + chartH} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" className="w-full h-auto overflow-visible" role="img" aria-label="Power efficiency over time line chart" tabIndex={0}>
      {/* Threshold line at 80% */}
      <line
        x1={padding.left}
        y1={padding.top + chartH * 0.2}
        x2={width - padding.right}
        y2={padding.top + chartH * 0.2}
        stroke="#22c55e"
        strokeWidth={1}
        strokeDasharray="4 4"
        opacity={0.5}
      />
      <text x={width - padding.right + 2} y={padding.top + chartH * 0.2 + 4} fill="#22c55e" fontSize={8} opacity={0.7}>80%</text>
      {/* Threshold line at 50% */}
      <line
        x1={padding.left}
        y1={padding.top + chartH * 0.5}
        x2={width - padding.right}
        y2={padding.top + chartH * 0.5}
        stroke="#eab308"
        strokeWidth={1}
        strokeDasharray="4 4"
        opacity={0.5}
      />
      {/* Grid */}
      {[0, 25, 50, 75, 100].map((val) => {
        const y = padding.top + chartH - ((val - minVal) / range) * chartH;
        return (
          <g key={val}>
            <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="#1e293b" strokeWidth={1} />
            <text x={padding.left - 5} y={y + 4} textAnchor="end" fill="#64748b" fontSize={9} fontFamily="monospace">{val}%</text>
          </g>
        );
      })}
      {/* Area */}
      <path d={areaD} fill="#14b8a6" opacity={0.15} />
      {/* Line */}
      <path d={pathD} fill="none" stroke="#14b8a6" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <path d={pathD} fill="none" stroke="#14b8a6" strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" opacity={0.2} />
      <text x={width / 2} y={height - 2} textAnchor="middle" fill="#94a3b8" fontSize={9}>Power Efficiency Over Time</text>
    </svg>
  );
}

export default function StatisticsPanel() {
  const [timeRange, setTimeRange] = useState<TimeRange>(100);
  const store = useGameStore();

  // Responsive chart width
  const containerRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(600);

  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setChartWidth(Math.max(300, containerRef.current.offsetWidth - 40));
      }
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  const history = useMemo(() => {
    return store.productionHistory.slice(-timeRange);
  }, [store.productionHistory, timeRange]);

  // Get top 5 resources by current amount for production chart
  const topResources = useMemo(() => {
    const entries = (Object.entries(store.resources) as [ResourceType, number][])
      .filter(([, val]) => val > 0)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([key]) => key);
    return entries;
  }, [store.resources]);

  // Calculate rate of change for each resource
  const resourceRates = useMemo(() => {
    if (history.length < 2) return {} as Record<ResourceType, number>;
    const rates: Record<string, number> = {};
    const latest = history[history.length - 1];
    const earlier = history[Math.max(0, history.length - 5)];
    const tickSpan = latest.timestamp - earlier.timestamp || 1;
    (Object.keys(latest.resources) as ResourceType[]).forEach((res) => {
      const diff = latest.resources[res] - earlier.resources[res];
      rates[res] = (diff / tickSpan) * 1000; // per second
    });
    return rates;
  }, [history]);

  // Chart data preparations
  const moneyData = useMemo(() => history.map(h => h.money), [history]);
  const powerProdData = useMemo(() => history.map(h => h.powerProduction), [history]);
  const powerConsData = useMemo(() => history.map(h => h.powerConsumption), [history]);
  const efficiencyData = useMemo(() => {
    return history.map(h => {
      if (h.powerConsumption === 0) return h.powerProduction > 0 ? 100 : 0;
      return Math.min(100, (h.powerProduction / h.powerConsumption) * 100);
    });
  }, [history]);

  // Resource trend calculation
  const getResourceTrend = (res: ResourceType): 'up' | 'down' | 'stable' => {
    if (history.length < 3) return 'stable';
    const recent = history.slice(-3);
    const vals = recent.map(h => h.resources[res] ?? 0);
    if (vals[2] > vals[0] * 1.05) return 'up';
    if (vals[2] < vals[0] * 0.95) return 'down';
    return 'stable';
  };

  const chartHeight = 200;

  return (
    <div ref={containerRef} className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-cyan-400 flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Factory Analytics
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">Track your empire&apos;s performance over time</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Range:</span>
          {([50, 100, 200] as TimeRange[]).map(r => (
            <button
              key={r}
              onClick={() => setTimeRange(r)}
              aria-pressed={timeRange === r}
              className={`px-2.5 py-1 text-xs rounded-md border ${
                timeRange === r
                  ? 'bg-cyan-900/30 border-cyan-500/50 text-cyan-400'
                  : 'border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-300'
              }`}
            >
              Last {r}
            </button>
          ))}
        </div>
      </div>

      {/* Data points info */}
      <div className="flex items-center gap-3 text-[10px] text-gray-500">
        <span>{history.length} data points</span>
        {history.length > 0 && (
          <>
            <span>|</span>
            <span>From: {formatTimeAgo(history[0].timestamp)}</span>
            <span>|</span>
            <span>To: {formatTimeAgo(history[history.length - 1].timestamp)}</span>
          </>
        )}
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Money Chart */}
        <div className="bg-[#0a0e17] rounded-lg border border-cyan-900/20 p-4">
          <h3 className="text-sm font-semibold text-green-400 flex items-center gap-1.5 mb-3">
            <DollarSign className="w-4 h-4" />
            Money Accumulation
          </h3>
          <div className="overflow-x-auto">
            <LineChart
              data={moneyData}
              width={chartWidth}
              height={chartHeight}
              color="#4ade80"
              label="Money over time"
              yLabel="$"
            />
          </div>
        </div>

        {/* Power Chart */}
        <div className="bg-[#0a0e17] rounded-lg border border-cyan-900/20 p-4">
          <h3 className="text-sm font-semibold text-yellow-400 flex items-center gap-1.5 mb-3">
            <Zap className="w-4 h-4" />
            Power Grid
          </h3>
          <div className="overflow-x-auto">
            <AreaChart
              productionData={powerProdData}
              consumptionData={powerConsData}
              width={chartWidth}
              height={chartHeight}
            />
          </div>
        </div>

        {/* Efficiency Chart */}
        <div className="bg-[#0a0e17] rounded-lg border border-cyan-900/20 p-4">
          <h3 className="text-sm font-semibold text-teal-400 flex items-center gap-1.5 mb-3">
            <Activity className="w-4 h-4" />
            Efficiency Timeline
          </h3>
          <div className="overflow-x-auto">
            <EfficiencyChart
              data={efficiencyData}
              width={chartWidth}
              height={chartHeight}
            />
          </div>
        </div>

        {/* Top Resource Production Chart */}
        <div className="bg-[#0a0e17] rounded-lg border border-cyan-900/20 p-4">
          <h3 className="text-sm font-semibold text-cyan-400 flex items-center gap-1.5 mb-3">
            <TrendingUp className="w-4 h-4" />
            Top Resources Over Time
          </h3>
          <div className="overflow-x-auto">
            {history.length < 2 ? (
              <div className="flex items-center justify-center text-gray-500 text-xs w-full" style={{ height: chartHeight }}>
                Not enough data yet
              </div>
            ) : (
              <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="xMidYMid meet" className="w-full h-auto overflow-visible" role="img" aria-label="Top resources over time line chart" tabIndex={0}>
                {(() => {
                  const padding = { top: 10, right: 10, bottom: 20, left: 50 };
                  const cW = chartWidth - padding.left - padding.right;
                  const cH = chartHeight - padding.top - padding.bottom;

                  // Find global max across all top resources
                  let globalMax = 0;
                  topResources.forEach(res => {
                    history.forEach(h => {
                      const val = h.resources[res] ?? 0;
                      if (val > globalMax) globalMax = val;
                    });
                  });
                  if (globalMax === 0) globalMax = 1;

                  // Grid
                  const gridLines = 4;
                  return (
                    <>
                      {Array.from({ length: gridLines + 1 }, (_, i) => {
                        const y = padding.top + (i / gridLines) * cH;
                        const val = globalMax - (i / gridLines) * globalMax;
                        return (
                          <g key={i}>
                            <line x1={padding.left} y1={y} x2={chartWidth - padding.right} y2={y} stroke="#1e293b" strokeWidth={1} />
                            <text x={padding.left - 5} y={y + 4} textAnchor="end" fill="#64748b" fontSize={9} fontFamily="monospace">
                              {formatShortNumber(val)}
                            </text>
                          </g>
                        );
                      })}
                      {topResources.map((res, rIdx) => {
                        const color = RESOURCE_META[res].color;
                        const data = history.map(h => h.resources[res] ?? 0);
                        const points = data.map((val, i) => ({
                          x: padding.left + (i / (data.length - 1)) * cW,
                          y: padding.top + cH - ((val) / globalMax) * cH,
                        }));
                        const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
                        return (
                          <g key={res}>
                            <path d={pathD} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" opacity={0.8 + rIdx * 0.05} />
                            {/* Label */}
                            <circle cx={chartWidth - padding.right - 5} cy={padding.top + 10 + rIdx * 14} r={3} fill={color} />
                            <text x={chartWidth - padding.right - 12} y={padding.top + 13 + rIdx * 14} textAnchor="end" fill={color} fontSize={9}>
                              {RESOURCE_META[res].name}
                            </text>
                          </g>
                        );
                      })}
                      <text x={chartWidth / 2} y={chartHeight - 2} textAnchor="middle" fill="#94a3b8" fontSize={9}>Resource Levels Over Time</text>
                    </>
                  );
                })()}
              </svg>
            )}
          </div>
        </div>
      </div>

      {/* Resource Summary Table */}
      <div className="bg-[#0a0e17] rounded-lg border border-cyan-900/20 p-4">
        <h3 className="text-sm font-semibold text-cyan-400 mb-3">Resource Summary</h3>
        <div className="max-h-96 overflow-y-auto game-scrollbar">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left py-2 px-2 text-gray-500 font-medium">Resource</th>
                <th className="text-right py-2 px-2 text-gray-500 font-medium">Current</th>
                <th className="text-right py-2 px-2 text-gray-500 font-medium">Capacity</th>
                <th className="text-right py-2 px-2 text-gray-500 font-medium">Rate/s</th>
                <th className="text-center py-2 px-2 text-gray-500 font-medium">Trend</th>
              </tr>
            </thead>
            <tbody>
              {(Object.entries(store.resources) as [ResourceType, number][]).map(([res, amount]) => {
                const meta = RESOURCE_META[res];
                if (!meta) return null;
                const rate = resourceRates[res] ?? 0;
                const trend = getResourceTrend(res);
                const capacity = store.resourceCapacity[res];
                const fillPercent = capacity > 0 ? (amount / capacity) * 100 : 0;
                const showRow = amount > 0 || rate !== 0;

                if (!showRow) return null;

                return (
                  <tr key={res} className="border-b border-gray-800/50 hover:bg-gray-800/20">
                    <td className="py-1.5 px-2">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: meta.color }} />
                        <span className="text-gray-300"><GameIcon icon={meta.icon} size={14} className="inline-flex" /> {meta.name}</span>
                      </div>
                    </td>
                    <td className="py-1.5 px-2 text-right font-mono text-gray-300">{formatNumber(amount)}</td>
                    <td className="py-1.5 px-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <div className="w-12 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              fillPercent >= 80 ? 'bg-red-500' : fillPercent >= 50 ? 'bg-yellow-500' : 'bg-cyan-500'
                            }`}
                            style={{ width: `${Math.min(100, fillPercent)}%` }}
                          />
                        </div>
                        <span className="text-gray-500 font-mono text-[10px]">{formatNumber(capacity)}</span>
                      </div>
                    </td>
                    <td className="py-1.5 px-2 text-right font-mono">
                      <span className={rate > 0 ? 'text-green-400' : rate < 0 ? 'text-red-400' : 'text-gray-500'}>
                        {rate > 0 ? '+' : ''}{rate.toFixed(2)}
                      </span>
                    </td>
                    <td className="py-1.5 px-2 text-center">
                      {trend === 'up' && <TrendingUp className="w-3.5 h-3.5 text-green-400 inline" />}
                      {trend === 'down' && <TrendingDown className="w-3.5 h-3.5 text-red-400 inline" />}
                      {trend === 'stable' && <Minus className="w-3.5 h-3.5 text-gray-500 inline" />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-[#0a0e17] rounded-lg border border-cyan-900/20 p-3">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">Current Money</p>
          <p className="text-sm font-bold text-green-400 font-mono">${formatNumber(store.money)}</p>
        </div>
        <div className="bg-[#0a0e17] rounded-lg border border-cyan-900/20 p-3">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">Total Earned</p>
          <p className="text-sm font-bold text-emerald-400 font-mono">${formatNumber(store.totalMoneyEarned)}</p>
        </div>
        <div className="bg-[#0a0e17] rounded-lg border border-cyan-900/20 p-3">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">Power Efficiency</p>
          <p className={`text-sm font-bold font-mono ${
            store.powerGrid.efficiency >= 0.8 ? 'text-green-400' :
            store.powerGrid.efficiency >= 0.5 ? 'text-yellow-400' : 'text-red-400'
          }`}>
            {(store.powerGrid.efficiency * 100).toFixed(1)}%
          </p>
        </div>
        <div className="bg-[#0a0e17] rounded-lg border border-cyan-900/20 p-3">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">Peak Efficiency</p>
          <p className="text-sm font-bold text-teal-400 font-mono">{(store.stats.peakEfficiency * 100).toFixed(1)}%</p>
        </div>
      </div>
    </div>
  );
}
