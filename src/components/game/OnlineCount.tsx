'use client';

import { useOnlinePresence } from '@/lib/hooks/useOnlinePresence';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Users, Wifi, WifiOff } from 'lucide-react';

interface OnlineCountProps {
  /** Compact mode for mobile headers */
  compact?: boolean;
}

export function OnlineCount({ compact = false }: OnlineCountProps) {
  const { onlineCount, loggedInCount, isConnected } = useOnlinePresence();

  // Not connected yet — show subtle offline indicator
  if (!isConnected) {
    if (compact) {
      return (
        <Badge variant="outline" className="text-[8px] px-1 py-0 border-gray-700 text-gray-600">
          <WifiOff className="w-2 h-2 mr-0.5" />
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-gray-700 text-gray-600">
        <WifiOff className="w-2.5 h-2.5 mr-1" />
        --
      </Badge>
    );
  }

  if (compact) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className="text-[8px] px-1 py-0 border-success/50 text-success bg-success/20 cursor-default">
            <Users className="w-2 h-2 mr-0.5" />
            {onlineCount}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="bg-card border-cyan-900/30">
          <p className="text-xs font-medium text-success">
            {onlineCount} online ({loggedInCount} logged in)
          </p>
          <p className="text-[10px] text-gray-400 mt-0.5">Real-time visitor count</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          className="text-[10px] px-1.5 py-0 cursor-default border-success/50 text-success bg-success/20"
        >
          <Users className="w-2.5 h-2.5 mr-1" />
          {onlineCount} online
          {loggedInCount > 0 && (
            <span className="ml-1 text-success/70">({loggedInCount} logged in)</span>
          )}
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="bg-card border-cyan-900/30 w-56">
        <div className="flex items-center gap-2 mb-1.5">
          <Wifi className="w-3.5 h-3.5 text-success" />
          <p className="text-xs font-semibold text-success">Live Presence</p>
        </div>
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-gray-400">Visitors online</span>
            <span className="text-white font-mono font-bold">{onlineCount}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-400">Logged in</span>
            <span className="text-cyan-400 font-mono">{loggedInCount}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-400">Anonymous</span>
            <span className="text-gray-300 font-mono">{onlineCount - loggedInCount}</span>
          </div>
        </div>
        <p className="text-[10px] text-gray-500 mt-1.5 pt-1.5 border-t border-gray-800">
          Updated in real-time via Supabase Presence
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
