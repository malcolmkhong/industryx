/**
 * HeaderAccountMenu — Phase 5 of the UI design review.
 *
 * The account dropdown in the right-control region. Encapsulates
 * the trigger (avatar + name + guest badge) and the 5-item menu
 * (Manage Account, Save to Cloud, Load from Cloud, Reload Config,
 * Sign Out). Extracted from DesktopHeader.tsx so the orchestrator
 * reads as a composition.
 */
"use client";

import Image from "next/image";
import { Cloud, Download, LogOut, RefreshCw, User } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface HeaderAccountMenuProps {
  userName: string;
  isGuest: boolean;
  userAvatar?: string;
  userEmail?: string;
  cloudStatus: "idle" | "saving" | "success" | "error";
  isSyncing: boolean;
  onManageAccount?: () => void;
  onCloudSave: () => void;
  onCloudLoad: () => void;
  onReloadConfig: () => void;
  onSignOut: () => void;
}

export function HeaderAccountMenu({
  userName,
  isGuest,
  userAvatar,
  userEmail,
  cloudStatus,
  isSyncing,
  onManageAccount,
  onCloudSave,
  onCloudLoad,
  onReloadConfig,
  onSignOut,
}: HeaderAccountMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1.5 bg-card rounded-lg px-2 py-1 border border-brand/20 hover:border-brand/30 motion-safe:transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          aria-label={`Account menu for ${userName}${isGuest ? " (guest)" : ""}`}
          aria-haspopup="menu"
        >
          {userAvatar ? (
            <Image
              src={userAvatar}
              alt={userName}
              width={20}
              height={20}
              className="rounded-full"
            />
          ) : (
            <div
              className="w-5 h-5 rounded-full bg-linear-to-br from-brand to-success/80 flex items-center justify-center text-[9px] font-bold"
              aria-hidden="true"
            >
              {userName.charAt(0).toUpperCase()}
            </div>
          )}
          <span className="text-[10px] text-subtle max-w-20 truncate">
            {userName}
          </span>
          {isGuest && (
            <span className="text-xs px-1 py-0.5 rounded bg-warning/30 text-warning border border-warning/30 font-bold uppercase tracking-wider">
              Guest
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 bg-card border-brand/30">
        <DropdownMenuLabel className="text-xs">
          <div className="text-brand font-bold">{userName}</div>
          <div className="text-[10px] text-muted-label font-normal">
            {isGuest ? "Playing as Guest" : (userEmail ?? "Google account")}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={onManageAccount}
          className="text-xs cursor-pointer focus-visible:ring-2 focus-visible:ring-brand"
        >
          <User className="w-3 h-3 mr-2" /> Manage Account
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={onCloudSave}
          className="text-xs cursor-pointer focus-visible:ring-2 focus-visible:ring-brand"
          disabled={cloudStatus === "saving" || isSyncing}
        >
          <Cloud className="w-3 h-3 mr-2" /> Save to Cloud
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={onCloudLoad}
          className="text-xs cursor-pointer focus-visible:ring-2 focus-visible:ring-brand"
        >
          <Download className="w-3 h-3 mr-2" /> Load from Cloud
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={onReloadConfig}
          className="text-xs cursor-pointer focus-visible:ring-2 focus-visible:ring-brand"
        >
          <RefreshCw className="w-3 h-3 mr-2" /> Reload Config
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={onSignOut}
          className="text-xs cursor-pointer text-danger focus:text-danger focus-visible:ring-2 focus-visible:ring-danger"
        >
          <LogOut className="w-3 h-3 mr-2" /> Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
