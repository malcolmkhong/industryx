'use client';

import { formatNumber } from '@/lib/game/store';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { GameIcon } from '@/components/icons/GameIcon';
import { initialResources } from '@/lib/game/constants/initialState';
import type { ResourceType } from '@/lib/game/types';

interface OfflineEarningsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  offlineData: { resources: Record<string, number>; money: number; ticksElapsed: number } | null;
  onCollect: () => void;
}

function formatDuration(ticks: number): string {
  if (ticks < 60) return `${ticks}s`;
  if (ticks < 3600) return `${Math.floor(ticks / 60)}m ${ticks % 60}s`;
  return `${Math.floor(ticks / 3600)}h ${Math.floor((ticks % 3600) / 60)}m`;
}

export function OfflineEarningsDialog({
  open,
  onOpenChange,
  offlineData,
  onCollect,
}: OfflineEarningsDialogProps) {
  if (!offlineData) return null;

  const { resources, money, ticksElapsed } = offlineData;
  const duration = formatDuration(ticksElapsed);

  // Show resources that have a meaningful gain (> 0.01)
  const earnedResources = (Object.entries(resources) as [ResourceType, number][])
    .filter(([key, val]) => key in initialResources && val > 0.01);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GameIcon icon="gi:offline" className="size-5 text-brand" />
            Welcome Back!
          </DialogTitle>
          <DialogDescription>
            You were away for {duration}. Claim your offline earnings below.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {earnedResources.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Resources produced:</p>
              <div className="grid grid-cols-2 gap-2">
                {earnedResources.map(([key, val]) => (
                  <div
                    key={key}
                    className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm"
                  >
                    <GameIcon resource={key} className="size-4 shrink-0 text-brand" />
                    <span className="truncate text-muted-foreground">{key}</span>
                    <span className="ml-auto font-medium tabular-nums">{formatNumber(Math.floor(val))}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {money > 0 && (
            <div className="flex items-center gap-2 rounded-md bg-brand/10 border border-brand/20 px-3 py-2">
              <span className="text-sm text-brand font-medium">Money earned:</span>
              <span className="ml-auto font-semibold tabular-nums text-brand">
                ${formatNumber(Math.floor(money))}
              </span>
            </div>
          )}

          {earnedResources.length === 0 && money === 0 && (
            <p className="text-sm text-muted-foreground text-center py-2">
              No earnings while away — your factories were idle.
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
            Later
          </Button>
          <Button onClick={onCollect} className="w-full sm:w-auto bg-brand hover:bg-brand/90 text-background font-semibold">
            Collect Earnings
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
