'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw, Send, CheckCircle, XCircle, MessageCircle } from 'lucide-react';

interface Ticket {
  id: string;
  user_id: string;
  subject: string;
  status: 'open' | 'accepted' | 'resolved';
  accepted_by: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

interface Message {
  id: string;
  sender_type: 'player' | 'admin';
  message: string;
  created_at: string;
}

const statusBadge: Record<string, string> = {
  open: 'bg-danger/10 text-danger border-danger/20',
  accepted: 'bg-warning/60/10 text-warning border-warning/60/20',
  resolved: 'bg-success/10 text-success/60 border-success/20',
};

export default function SupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState('');
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [counts, setCounts] = useState({ open: 0, accepted: 0, resolved: 0, total: 0 });
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/support/tickets');
      if (res.ok) {
        const data = await res.json();
        setTickets(data.data || []);
        setCounts(data.counts || { open: 0, accepted: 0, resolved: 0, total: 0 });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  const openTicket = async (ticket: Ticket) => {
    setSelectedTicket(ticket);
    try {
      const res = await fetch(`/api/admin/support/tickets/${ticket.id}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.data?.messages || []);
      }
    } catch {}
  };

  const doAction = async (action: 'accept' | 'resolve') => {
    if (!selectedTicket) return;
    setSending(true);
    try {
      const res = await fetch(`/api/admin/support/tickets/${selectedTicket.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        await fetchTickets();
        const updated = { ...selectedTicket, status: action === 'accept' ? 'accepted' as const : 'resolved' as const };
        setSelectedTicket(updated);
        await openTicket(updated);
      }
    } finally {
      setSending(false);
    }
  };

  const sendReply = async () => {
    if (!reply.trim() || !selectedTicket) return;
    setSending(true);
    try {
      const res = await fetch(`/api/admin/support/tickets/${selectedTicket.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: reply.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setMessages((prev) => [...prev, data.data]);
        setReply('');
      }
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    const el = messagesEndRef.current;
    el?.scrollIntoView({ behavior: 'smooth' });
  });

  const filtered = filter === 'all' ? tickets : tickets.filter((t) => t.status === filter);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-muted-label/20 border-t-warning/60 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">Support Tickets</h2>
          <p className="text-sm text-muted-label mt-1">Player support tickets and chat</p>
        </div>
        <button type="button" onClick={fetchTickets} className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-muted-label hover:text-white bg-background/60/50 hover:bg-background/40/50 rounded-lg transition-colors">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {[
          { label: 'Open', value: counts.open, filter: 'open', color: 'text-danger' },
          { label: 'Accepted', value: counts.accepted, filter: 'accepted', color: 'text-warning' },
          { label: 'Resolved', value: counts.resolved, filter: 'resolved', color: 'text-success/60' },
          { label: 'Total', value: counts.total, filter: 'all', color: 'text-domain/80' },
        ].map((c) => (
          <button type="button" key={c.label} onClick={() => { setFilter(c.filter); setSelectedTicket(null); }}
            className={`border rounded-xl p-3 text-left transition-colors ${filter === c.filter ? 'border-muted-label/20 bg-background/60/50' : 'border-muted-label/40 bg-background/80/50 hover:bg-background/60/30'}`}>
            <p className={`text-lg font-bold ${c.color}`}>{c.value}</p>
            <p className="text-xs text-muted-label">{c.label}</p>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1 space-y-2 max-h-[70vh] overflow-y-auto pr-1">
          {filtered.length === 0 ? (
            <div className="text-center py-8"><p className="text-sm text-muted-label">No tickets</p></div>
          ) : (
            filtered.map((t) => (
              <button key={t.id} type="button" onClick={() => openTicket(t)}
                className={`w-full text-left p-3 rounded-xl border transition-colors ${selectedTicket?.id === t.id ? 'border-warning/60/40 bg-warning/60/5' : 'border-muted-label/40 hover:border-muted-label/30 bg-background/80/50'}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-white truncate flex-1">{t.subject}</span>
                  <span className={`inline-flex text-[10px] font-semibold px-1.5 py-0.5 rounded border ml-2 shrink-0 ${statusBadge[t.status]}`}>{t.status}</span>
                </div>
                <p className="text-xs text-muted-label/80">{t.user_id.slice(0, 8)}... · {new Date(t.created_at).toLocaleDateString()}</p>
              </button>
            ))
          )}
        </div>

        <div className="lg:col-span-2 border border-muted-label/40 rounded-xl flex flex-col max-h-[70vh]">
          {selectedTicket ? (
            <>
              <div className="flex items-center justify-between px-4 py-3 border-b border-muted-label/40 shrink-0">
                <div>
                  <h3 className="text-sm font-semibold text-white">{selectedTicket.subject}</h3>
                  <p className="text-xs text-muted-label">User: {selectedTicket.user_id.slice(0, 12)}...</p>
                </div>
                <div className="flex items-center gap-2">
                  {selectedTicket.status === 'open' && (
                    <button type="button" onClick={() => doAction('accept')} disabled={sending}
                      className="flex items-center gap-1 px-3 py-1 text-xs font-medium bg-warning/70 hover:bg-warning/80 disabled:bg-background/40 text-white rounded-lg transition-colors">
                      <CheckCircle className="w-3.5 h-3.5" /> Accept
                    </button>
                  )}
                  {(selectedTicket.status === 'open' || selectedTicket.status === 'accepted') && (
                    <button type="button" onClick={() => doAction('resolve')} disabled={sending}
                      className="flex items-center gap-1 px-3 py-1 text-xs font-medium bg-success/80 hover:bg-success/60 disabled:bg-background/40 text-white rounded-lg transition-colors">
                      <XCircle className="w-3.5 h-3.5" /> Resolve
                    </button>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
                {messages.map((m) => (
                  <div key={m.id} className={`flex ${m.sender_type === 'admin' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] px-3 py-2 rounded-xl text-sm ${
                      m.sender_type === 'admin'
                        ? 'bg-warning/70/20 text-warning/30 border border-warning/60/20'
                        : 'bg-background/60 text-subtle border border-muted-label/30'
                    }`}>
                      <p className="text-[10px] text-muted-label mb-0.5">{m.sender_type === 'admin' ? 'Admin' : 'Player'}</p>
                      <p>{m.message}</p>
                      <p className="text-[10px] text-muted-label mt-1">{new Date(m.created_at).toLocaleTimeString()}</p>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {selectedTicket.status !== 'resolved' && (
                <div className="p-3 border-t border-muted-label/40 shrink-0">
                  <div className="flex items-center gap-2">
                    <label htmlFor="support-reply" className="sr-only">Reply to ticket</label>
                    <input
                      id="support-reply"
                      name="reply"
                      aria-label="Reply to ticket"
                      autoComplete="off"
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') sendReply(); }}
                      placeholder="Type a reply..."
                      className="flex-1 px-3 py-2 bg-background/60 border border-muted-label/30 rounded-lg text-sm text-white placeholder-muted-label focus:outline-none focus:border-warning/60/50" />
                    <button type="button" onClick={sendReply} disabled={sending || !reply.trim()}
                      aria-label="Send reply"
                      className="p-2 bg-warning/70 hover:bg-warning/80 disabled:bg-background/40 text-white rounded-lg transition-colors">
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center">
              <MessageCircle className="w-10 h-10 text-muted-label/80 mb-3" />
              <p className="text-sm text-muted-label">Select a ticket to view</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
