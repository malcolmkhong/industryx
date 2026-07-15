'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Zap,
  ShieldOff,
  Plus,
  Pencil,
  Trash2,
  AlertTriangle,
  Loader2,
  CircleAlert,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface MarketResource {
  resource: string;
  price: number | null;
  basePrice: number | null;
  changePercent: string | null;
  circuitBreaker: { active?: boolean; triggered_at?: string; cooldown_ticks?: number } | null;
  sector: string | null;
  elasticity: number | null;
  isTradable: boolean | null;
  inMarket: boolean;
}

interface MarketNewsEntry {
  id: string;
  title: string;
  description?: string;
  severity?: string;
  gameTick?: number;
  category?: string;
}

interface MarketState {
  tick: number;
  volatility: number | null;
  updatedAt: string;
  news: MarketNewsEntry[];
  circuitBreakers: Record<string, unknown>;
}

interface MarketData {
  state: MarketState | null;
  resources: MarketResource[];
}

interface FormState {
  resource_id: string;
  base_price: string;
  sector: string;
  elasticity: number;
  is_tradable: boolean;
}

const SECTORS = [
  { value: 'raw_minerals', label: 'Raw Minerals' },
  { value: 'raw_organic', label: 'Raw Organic' },
  { value: 'basic_materials', label: 'Basic Materials' },
  { value: 'components', label: 'Components' },
  { value: 'advanced', label: 'Advanced' },
  { value: 'high_tech', label: 'High Tech' },
  { value: 'endgame', label: 'Endgame' },
  { value: 'agriculture', label: 'Agriculture' },
] as const;

const EMPTY_FORM: FormState = {
  resource_id: '',
  base_price: '',
  sector: 'raw_minerals',
  elasticity: 0.4,
  is_tradable: true,
};

function formatPrice(n: number | null): string {
  if (n == null) return '—';
  return n >= 1 ? n.toFixed(2) : n.toFixed(4);
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

function formatElasticity(e: number | null): string {
  if (e == null) return '—';
  return e.toFixed(2);
}

function elasticLabel(e: number | null): { label: string; color: string } {
  if (e == null) return { label: 'unknown', color: 'text-muted-label' };
  if (e >= 0.8) return { label: 'Very elastic', color: 'text-warning' };
  if (e >= 0.5) return { label: 'Elastic', color: 'text-brand' };
  if (e >= 0.3) return { label: 'Moderate', color: 'text-subtle' };
  return { label: 'Inelastic', color: 'text-success' };
}

export default function MarketPage() {
  const [data, setData] = useState<MarketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MarketResource | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<MarketResource | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchMarket = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/market/overview');
      if (res.ok) setData(await res.json());
    } catch (err) {
      console.error('Failed to fetch market data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMarket();
  }, [fetchMarket]);

  const clearBreakers = async () => {
    setClearing(true);
    try {
      await fetch('/api/admin/market/overview', { method: 'POST' });
      await fetchMarket();
    } finally {
      setClearing(false);
    }
  };

  // ─── Create / Edit handlers ──────────────────────────────────────────────
  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setDialogOpen(true);
  };

  const openEdit = (r: MarketResource) => {
    setEditing(r);
    setForm({
      resource_id: r.resource,
      base_price: r.basePrice != null ? String(r.basePrice) : '',
      sector: r.sector ?? 'raw_minerals',
      elasticity: r.elasticity ?? 0.4,
      is_tradable: r.isTradable ?? true,
    });
    setFormError(null);
    setDialogOpen(true);
  };

  const closeDialog = () => {
    if (submitting) return;
    setDialogOpen(false);
    setEditing(null);
    setFormError(null);
  };

  const submitForm = async () => {
    setFormError(null);
    const trimmedId = form.resource_id.trim();
    if (!/^[a-z][a-z0-9-]{0,49}$/.test(trimmedId)) {
      setFormError('Resource ID must be kebab-case (a-z, 0-9, hyphen), 1–50 chars.');
      return;
    }
    const basePriceNum = Number(form.base_price);
    if (!Number.isFinite(basePriceNum) || basePriceNum <= 0 || basePriceNum > 1e9) {
      setFormError('Base price must be a positive number ≤ 1,000,000,000.');
      return;
    }

    setSubmitting(true);
    try {
      const method = editing ? 'PUT' : 'POST';
      const res = await fetch('/api/admin/market/resources', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resource_id: trimmedId,
          base_price: basePriceNum,
          sector: form.sector,
          elasticity: form.elasticity,
          is_tradable: form.is_tradable,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError((body as { error?: string }).error ?? `Request failed (${res.status})`);
        return;
      }
      setDialogOpen(false);
      setEditing(null);
      await fetchMarket();
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/admin/market/resources/${encodeURIComponent(deleteConfirm.resource)}`,
        { method: 'DELETE' },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError((body as { error?: string }).error ?? `Delete failed (${res.status})`);
        return;
      }
      setDeleteConfirm(null);
      await fetchMarket();
    } finally {
      setDeleting(false);
    }
  };

  // ─── Derived data ────────────────────────────────────────────────────────
  const breakeActiveCount = useMemo(
    () => data?.resources.filter((r) => r.circuitBreaker?.active).length ?? 0,
    [data],
  );

  const newCount = useMemo(
    () => data?.resources.filter((r) => !r.inMarket).length ?? 0,
    [data],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-muted-label/20 border-t-warning/60 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">Market Control</h2>
          <p className="text-sm text-muted-label mt-1">
            Global market state, prices, circuit breakers, and resource registry
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {breakeActiveCount > 0 && (
            <Button
              type="button"
              onClick={clearBreakers}
              disabled={clearing}
              variant="outline"
              size="sm"
              className="text-warning border-warning/40 hover:bg-warning/10"
            >
              <ShieldOff className="w-3.5 h-3.5 mr-1.5" />
              {clearing ? 'Clearing...' : `Clear ${breakeActiveCount} breaker${breakeActiveCount > 1 ? 's' : ''}`}
            </Button>
          )}
          <Button
            type="button"
            onClick={openCreate}
            size="sm"
            className="bg-research/80 hover:bg-research text-white border-0"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Create Resource
          </Button>
          <Button
            type="button"
            onClick={fetchMarket}
            variant="outline"
            size="sm"
            className="text-muted-label"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Status bar */}
      {data?.state && (
        <div className="flex items-center gap-4 flex-wrap mb-3 text-xs text-muted-label">
          <span>Tick #{data.state.tick}</span>
          {data.state.volatility != null && (
            <span>Volatility: {data.state.volatility.toFixed(2)}</span>
          )}
          <span>Updated: {formatTime(data.state.updatedAt)}</span>
          {data.state.news.length > 0 && <span>{data.state.news.length} news headlines</span>}
          {newCount > 0 && (
            <Badge variant="outline" className="border-brand/40 text-brand">
              {newCount} resource{newCount > 1 ? 's' : ''} pending first tick
            </Badge>
          )}
        </div>
      )}

      {/* Resource table */}
      {data?.resources && data.resources.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-muted-label/40">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-muted-label/40">
                <th scope="col" className="text-left px-4 py-2.5 text-xs font-semibold text-muted-label">Resource</th>
                <th scope="col" className="text-left px-4 py-2.5 text-xs font-semibold text-muted-label hidden lg:table-cell">Sector</th>
                <th scope="col" className="text-right px-4 py-2.5 text-xs font-semibold text-muted-label">Price</th>
                <th scope="col" className="text-right px-4 py-2.5 text-xs font-semibold text-muted-label hidden sm:table-cell">Base</th>
                <th scope="col" className="text-right px-4 py-2.5 text-xs font-semibold text-muted-label hidden md:table-cell">Elasticity</th>
                <th scope="col" className="text-right px-4 py-2.5 text-xs font-semibold text-muted-label">Change</th>
                <th scope="col" className="text-left px-4 py-2.5 text-xs font-semibold text-muted-label hidden md:table-cell">Breaker</th>
                <th scope="col" className="text-left px-4 py-2.5 text-xs font-semibold text-muted-label hidden sm:table-cell">Tradable</th>
                <th scope="col" className="text-right px-4 py-2.5 text-xs font-semibold text-muted-label">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.resources.map((r) => {
                const change = r.changePercent ? parseFloat(r.changePercent) : 0;
                const elast = elasticLabel(r.elasticity);
                return (
                  <tr
                    key={r.resource}
                    className="border-b border-muted-label/20 last:border-0 hover:bg-background/30"
                  >
                    <td className="px-4 py-2 text-white font-medium">
                      <div className="flex items-center gap-2">
                        {r.resource}
                        {!r.inMarket && (
                          <Badge variant="outline" className="border-brand/30 text-brand text-[10px]">
                            new
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-muted-label text-xs hidden lg:table-cell capitalize">
                      {r.sector?.replace(/_/g, ' ') ?? '—'}
                    </td>
                    <td className="px-4 py-2 text-right text-white font-mono">
                      {formatPrice(r.price)}
                    </td>
                    <td className="px-4 py-2 text-right text-muted-label font-mono hidden sm:table-cell">
                      {formatPrice(r.basePrice)}
                    </td>
                    <td className="px-4 py-2 text-right hidden md:table-cell">
                      <span className={`font-mono text-xs ${elast.color}`}>
                        {formatElasticity(r.elasticity)}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      {r.price != null && change !== 0 ? (
                        <span
                          className={`inline-flex items-center gap-1 font-mono text-xs ${
                            change > 0 ? 'text-success' : 'text-danger'
                          }`}
                        >
                          {change > 0 ? (
                            <TrendingUp className="w-3 h-3" />
                          ) : (
                            <TrendingDown className="w-3 h-3" />
                          )}
                          {change > 0 ? '+' : ''}
                          {change.toFixed(1)}%
                        </span>
                      ) : r.price == null ? (
                        <span className="text-muted-label/60 text-xs">—</span>
                      ) : (
                        <span className="text-muted-label/80 text-xs">0%</span>
                      )}
                    </td>
                    <td className="px-4 py-2 hidden md:table-cell">
                      {r.circuitBreaker?.active ? (
                        <Badge className="bg-warning/15 text-warning border-warning/40">
                          <Zap className="w-3 h-3 mr-1" />
                          Active
                        </Badge>
                      ) : (
                        <span className="text-muted-label/60 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 hidden sm:table-cell">
                      {r.isTradable == null ? (
                        <span className="text-muted-label/60 text-xs">—</span>
                      ) : r.isTradable ? (
                        <Badge className="bg-success/10 text-success border-success/30">
                          tradable
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-label border-muted-label/30">
                          off
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="inline-flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(r)}
                          className="h-7 px-2 text-muted-label hover:text-white"
                          aria-label={`Edit ${r.resource}`}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteConfirm(r)}
                          className="h-7 px-2 text-muted-label hover:text-danger"
                          aria-label={`Delete ${r.resource}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 rounded-xl border border-dashed border-muted-label/30">
          <TrendingUp className="w-10 h-10 text-muted-label/60 mb-4" />
          <p className="text-sm text-muted-label">No resources configured</p>
          <p className="text-xs text-muted-label mt-1">
            Click <span className="text-research">Create Resource</span> to add the first one
          </p>
        </div>
      )}

      {/* Recent market news */}
      {data?.state?.news && data.state.news.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-subtle mb-3">Recent Market News</h3>
          <div className="space-y-2">
            {data.state.news.slice(0, 8).map((entry) => (
              <div
                key={entry.id}
                className="flex items-start gap-3 p-3 rounded-lg border border-muted-label/30 bg-background/40"
              >
                <span className="text-xs text-subtle/80">{entry.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Create / Edit Dialog ────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={(open) => (open ? null : closeDialog())}>
        <DialogContent className="bg-card border-brand/30 max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing ? `Edit Resource: ${editing.resource}` : 'Create New Resource'}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? 'Update price, sector, elasticity, or tradable status. Changes apply on the next market tick (≤ 60s).'
                : 'Add a new resource to the economy. It will appear in the Trade Market on the next tick.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="resource_id" className="text-xs font-semibold text-muted-label">
                Resource ID
              </Label>
              <Input
                id="resource_id"
                value={form.resource_id}
                onChange={(e) => setForm({ ...form, resource_id: e.target.value })}
                disabled={!!editing}
                placeholder="kebab-case-id"
                className="font-mono"
                autoComplete="off"
                spellCheck={false}
              />
              {editing ? (
                <p className="text-[10px] text-muted-label/80">
                  Resource ID is immutable. Delete and re-create to rename.
                </p>
              ) : (
                <p className="text-[10px] text-muted-label/80">
                  Lowercase letters, digits, hyphens. 1–50 chars.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="base_price" className="text-xs font-semibold text-muted-label">
                Base Price
              </Label>
              <Input
                id="base_price"
                type="number"
                step="0.01"
                min="0"
                value={form.base_price}
                onChange={(e) => setForm({ ...form, base_price: e.target.value })}
                placeholder="0.00"
                className="font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sector" className="text-xs font-semibold text-muted-label">
                Sector
              </Label>
              <Select
                value={form.sector}
                onValueChange={(v) => setForm({ ...form, sector: v })}
              >
                <SelectTrigger id="sector">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SECTORS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-label/80">
                Determines correlation behavior with related resources.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="elasticity" className="text-xs font-semibold text-muted-label">
                  Elasticity
                </Label>
                <span className={`text-xs font-mono ${elasticLabel(form.elasticity).color}`}>
                  {form.elasticity.toFixed(2)} — {elasticLabel(form.elasticity).label}
                </span>
              </div>
              <Slider
                id="elasticity"
                min={0}
                max={1.5}
                step={0.05}
                value={[form.elasticity]}
                onValueChange={([v]) => setForm({ ...form, elasticity: v ?? 0.4 })}
              />
              <p className="text-[10px] text-muted-label/80">
                How much price responds to supply/demand. 0 = fixed, 1.5 = wildly speculative.
              </p>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-muted-label/30 px-3 py-2">
              <div>
                <Label htmlFor="is_tradable" className="text-xs font-semibold text-subtle">
                  Tradable
                </Label>
                <p className="text-[10px] text-muted-label/80">
                  Players can buy/sell at the Trading Post
                </p>
              </div>
              <Switch
                id="is_tradable"
                checked={form.is_tradable}
                onCheckedChange={(v) => setForm({ ...form, is_tradable: v })}
              />
            </div>

            {formError && (
              <div className="flex items-start gap-2 p-3 rounded-lg border border-danger/40 bg-danger/10 text-xs text-danger">
                <CircleAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>{formError}</span>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={closeDialog}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={submitForm}
              disabled={submitting}
              className="bg-research/80 hover:bg-research text-white"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Saving...
                </>
              ) : editing ? (
                'Save Changes'
              ) : (
                'Create Resource'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete confirmation ───────────────────────────────────────────── */}
      <Dialog
        open={!!deleteConfirm}
        onOpenChange={(open) => !open && !deleting && setDeleteConfirm(null)}
      >
        <DialogContent className="bg-card border-danger/40 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-danger flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Delete Resource
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{' '}
              <span className="font-mono text-white">{deleteConfirm?.resource}</span>?
              This cannot be undone. Resources with trade history will be blocked
              (set <code className="text-[10px]">is_tradable=false</code> to retire instead).
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteConfirm(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={confirmDelete}
              disabled={deleting}
              className="bg-danger hover:bg-danger/90 text-white"
            >
              {deleting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete Permanently'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
