'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useGameStore } from '@/lib/game/store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Bell, Check, CheckCheck, Trash2, Filter } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { GameIcon } from '@/components/game/shared/GameIcon';

type NotificationFilter = 'all' | 'success' | 'warning' | 'error' | 'info';

const typeColors = {
  success: { border: 'border-l-green-500', bg: 'bg-success/10', text: 'text-success', icon: 'lucide:check' },
  warning: { border: 'border-l-yellow-500', bg: 'bg-yellow-900/10', text: 'text-yellow-400', icon: 'lucide:alert-triangle' },
  error: { border: 'border-l-red-500', bg: 'bg-red-900/10', text: 'text-red-400', icon: 'lucide:x' },
  info: { border: 'border-l-cyan-500', bg: 'bg-cyan-900/10', text: 'text-cyan-400', icon: 'lucide:info' },
};

interface NotificationItemProps {
  id: string;
  type: 'success' | 'warning' | 'error' | 'info';
  message: string;
  gameTick: number;
  read: boolean;
  onMarkRead: (id: string) => void;
}

const MemoizedNotificationItem = React.memo(function MemoizedNotificationItem({
  id,
  type,
  message,
  gameTick,
  read,
  onMarkRead,
}: NotificationItemProps) {
  const tc = typeColors[type];
  return (
    <motion.div
      onClick={() => {
        if (!read) {
          onMarkRead(id);
        }
      }}
      className={`rounded-lg border-l-2 ${tc.border} ${tc.bg} border border-gray-800/50 p-3 flex items-start gap-3 hover:bg-opacity-20 cursor-pointer ${
        !read ? 'bg-opacity-30' : 'bg-opacity-10'
      }`}
    >
      <div className={`w-6 h-6 rounded-full ${tc.bg} flex items-center justify-center text-xs ${tc.text} flex-shrink-0`}>
        <GameIcon icon={tc.icon} size={12} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-xs ${read ? 'text-gray-500' : 'text-gray-200'}`}>
          {message}
        </p>
        <p className="text-[9px] text-gray-600 mt-1">
          Tick {gameTick}
          {!read && <span className="ml-2 inline-block w-1.5 h-1.5 rounded-full bg-cyan-400 pulse-dot" />}
        </p>
      </div>
      {!read && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onMarkRead(id);
          }}
          className="flex-shrink-0 w-5 h-5 rounded flex items-center justify-center text-gray-600 hover:text-cyan-400 transition-colors"
          title="Mark as read"
        >
          <Check className="w-3 h-3" />
        </button>
      )}
    </motion.div>
  );
});

export function NotificationCenterPanel() {
  const store = useGameStore();
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const listRef = useRef<HTMLDivElement>(null);

  const notifications = useMemo(() => {
    let filtered = [...store.notifications];
    if (filter !== 'all') {
      filtered = filtered.filter(n => n.type === filter);
    }
    return filtered.reverse(); // newest first
  }, [store.notifications, filter]);

  const unreadCount = store.notifications.filter(n => !n.read).length;
  const successCount = store.notifications.filter(n => n.type === 'success').length;
  const warningCount = store.notifications.filter(n => n.type === 'warning').length;
  const errorCount = store.notifications.filter(n => n.type === 'error').length;
  const infoCount = store.notifications.filter(n => n.type === 'info').length;

  const filters: { id: NotificationFilter; label: string; count: number; color: string }[] = [
    { id: 'all', label: 'All', count: store.notifications.length, color: 'text-gray-400' },
    { id: 'success', label: 'Success', count: successCount, color: 'text-success' },
    { id: 'warning', label: 'Warning', count: warningCount, color: 'text-yellow-400' },
    { id: 'error', label: 'Error', count: errorCount, color: 'text-red-400' },
    { id: 'info', label: 'Info', count: infoCount, color: 'text-cyan-400' },
  ];

  // Auto-scroll to top when filter changes
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = 0;
    }
  }, [filter]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-cyan-400 flex items-center gap-2">
          <Bell className="w-5 h-5" /> Notification Center
        </h2>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-[10px] border-cyan-800 text-cyan-400 hover:bg-cyan-900/30"
                onClick={() => store.markAllNotificationsRead()}
              >
                <CheckCheck className="w-3 h-3 mr-1" /> Mark All Read
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-[10px] border-red-900/50 text-red-400 hover:bg-red-900/30"
                onClick={() => store.clearNotifications()}
              >
                <Trash2 className="w-3 h-3 mr-1" /> Clear All
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-2">
        <div className="bg-card/50 border border-success/30 rounded-lg p-3 text-center">
          <div className="text-lg font-bold text-success">{successCount}</div>
          <div className="text-[9px] text-gray-500">Success</div>
        </div>
        <div className="bg-card/50 border border-yellow-900/30 rounded-lg p-3 text-center">
          <div className="text-lg font-bold text-yellow-400">{warningCount}</div>
          <div className="text-[9px] text-gray-500">Warnings</div>
        </div>
        <div className="bg-card/50 border border-red-900/30 rounded-lg p-3 text-center">
          <div className="text-lg font-bold text-red-400">{errorCount}</div>
          <div className="text-[9px] text-gray-500">Errors</div>
        </div>
        <div className="bg-card/50 border border-cyan-900/30 rounded-lg p-3 text-center">
          <div className="text-lg font-bold text-cyan-400">{infoCount}</div>
          <div className="text-[9px] text-gray-500">Info</div>
        </div>
      </div>

      {/* Unread badge */}
      {unreadCount > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 bg-cyan-900/10 border border-cyan-800/30 rounded-lg">
          <span className="inline-block w-2 h-2 rounded-full bg-cyan-400 pulse-dot" />
          <span className="text-xs text-cyan-300">{unreadCount} unread notification{unreadCount !== 1 ? 's' : ''}</span>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex items-center gap-1 overflow-x-auto">
        <Filter className="w-3.5 h-3.5 text-gray-600 mr-1 flex-shrink-0" />
        {filters.map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`text-[10px] px-2.5 py-1.5 rounded-lg border whitespace-nowrap ${
              filter === f.id
                ? `border-cyan-700 bg-cyan-900/20 ${f.color}`
                : 'border-gray-800 text-gray-500 hover:border-gray-700 hover:text-gray-400'
            }`}
          >
            {f.label} <span className="text-gray-600">({f.count})</span>
          </button>
        ))}
      </div>

      {/* Notification list */}
      <div ref={listRef} className="space-y-1.5 max-h-[500px] overflow-y-auto game-scrollbar scroll-fade">
        <AnimatePresence mode="popLayout">
          {notifications.map(notification => (
            <MemoizedNotificationItem
              key={notification.id}
              id={notification.id}
              type={notification.type}
              message={notification.message}
              gameTick={notification.gameTick}
              read={notification.read}
              onMarkRead={store.markNotificationRead}
            />
          ))}
        </AnimatePresence>

        {notifications.length === 0 && (
          <div className="text-center py-12">
            <Bell className="w-12 h-12 text-gray-700 mx-auto mb-3" />
            <p className="text-sm text-gray-500">No notifications</p>
            <p className="text-[10px] text-gray-600 mt-1">
              {filter === 'all' ? 'Notifications will appear as you play the game' : `No ${filter} notifications found`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
