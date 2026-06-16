'use client';

import { LifeBuoy, MessageSquare } from 'lucide-react';

export default function SupportPage() {
  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">Support</h2>
          <p className="text-sm text-zinc-400 mt-1">Player tickets, appeals, and user requests</p>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-16 h-16 rounded-2xl bg-zinc-800/50 border border-zinc-700 flex items-center justify-center mb-6">
          <LifeBuoy className="w-8 h-8 text-zinc-500" />
        </div>
        <h3 className="text-lg font-semibold text-white mb-2">Support System</h3>
        <p className="text-sm text-zinc-400 max-w-md text-center mb-2">
          The support ticket system is planned for Phase 2D.
        </p>
        <p className="text-xs text-zinc-600 max-w-md text-center">
          Features will include: ticket intake form, email integration, player appeals,
          account recovery requests, and admin notification workflow.
        </p>
        <div className="mt-8 p-4 rounded-xl border border-zinc-800 bg-zinc-900/50 max-w-md w-full">
          <div className="flex items-start gap-3">
            <MessageSquare className="w-4 h-4 text-zinc-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-zinc-400 mb-2">
                In the meantime, player issues can be managed through:
              </p>
              <ul className="text-xs text-zinc-500 space-y-1">
                <li>• Player Detail → Lock/Unlock accounts</li>
                <li>• Investigations → Review cheat reports</li>
                <li>• Admin Audit → Track admin actions</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
