import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { GameIcon } from '@/components/game/shared/GameIcon';
import { formatNumber } from '@/lib/game/store';
import { RESOURCE_META } from '@/lib/game/configCache';
import type { OfflineProgressData } from '@/lib/hooks/page/useOfflineProgressCheck';

interface OfflineEarningsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  offlineData: OfflineProgressData | null;
  onCollect: () => void;
}

function formatAwayDuration(ticksElapsed: number): string {
  if (ticksElapsed >= 3600) return `${(ticksElapsed / 3600).toFixed(1)} hours`;
  if (ticksElapsed >= 60) return `${Math.floor(ticksElapsed / 60)} minutes`;
  return `${ticksElapsed} seconds`;
}

export function OfflineEarningsDialog({
  open,
  onOpenChange,
  offlineData,
  onCollect,
}: OfflineEarningsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-cyan-900/30 text-subtle max-w-md w-[calc(100%-1rem)] p-5">
        <DialogHeader>
          <DialogTitle className="text-cyan-400 flex items-center gap-2 text-lg">
            <span className="text-2xl">👋</span> Welcome Back!
          </DialogTitle>
          <DialogDescription className="text-subtle text-sm mt-1">
            {offlineData && (
              <>
                You were away for{' '}
                <span className="text-cyan-300 font-bold">
                  {formatAwayDuration(offlineData.ticksElapsed)}
                </span>
                . During that time:
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {offlineData && (
          <div className="space-y-3 mt-2">
            {offlineData.money > 0 && (
              <div className="bg-[#0a0e17] rounded-lg p-3 border border-success/30">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-subtle">Money Earned</span>
                  <span className="text-sm text-success font-mono font-bold">
                    +${formatNumber(offlineData.money)}
                  </span>
                </div>
              </div>
            )}

            <div className="bg-[#0a0e17] rounded-lg p-3 border border-cyan-900/30 max-h-48 overflow-y-auto game-scrollbar">
              <div className="text-[10px] text-muted-label mb-2 uppercase tracking-wider">Resources Produced</div>
              <div className="space-y-1">
                {(Object.entries(offlineData.resources) as [string, number][])
                  .filter(([, amount]) => amount > 0)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 8)
                  .map(([resource, amount]) => {
                    const meta = RESOURCE_META[resource as keyof typeof RESOURCE_META];
                    return (
                      <div key={resource} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm inline-flex items-center">
                            <GameIcon icon={meta?.icon} size={16} />
                          </span>
                          <span className="text-subtle">{meta?.name ?? resource}</span>
                        </div>
                        <span className="text-cyan-400 font-mono">+{formatNumber(amount)}</span>
                      </div>
                    );
                  })}
                {(Object.entries(offlineData.resources) as [string, number][])
                  .filter(([, amount]) => amount > 0).length === 0 && (
                    <div className="text-xs text-muted-label text-center py-2">No resources produced</div>
                  )}
              </div>
            </div>

            <p className="text-[10px] text-muted-label text-center">
              Offline production runs at 50% efficiency (capped at 10 hours)
            </p>

            <Button
              className="w-full bg-cyan-600 hover:bg-cyan-700 text-white min-h-[44px]"
              onClick={onCollect}
              disabled={!offlineData}
            >
              Collect Earnings
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
