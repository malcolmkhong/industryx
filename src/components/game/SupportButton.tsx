'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { MessageCircle, X, Plus, Send, ChevronLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface Ticket {
  id: string;
  subject: string;
  status: 'open' | 'accepted' | 'resolved';
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

const statusColors: Record<string, string> = {
  open: 'bg-red-500/10 text-red-400 border-red-500/20',
  accepted: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  resolved: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
};

export function SupportButton() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'list' | 'new' | 'chat'>('list');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const supabase = createClient();

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/support/tickets');
      if (res.ok) {
        const data = await res.json();
        setTickets(data.data || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) fetchTickets();
  }, [open, fetchTickets]);

  const openChat = async (ticket: Ticket) => {
    setSelectedTicket(ticket);
    setView('chat');
    try {
      const res = await fetch(`/api/support/tickets/${ticket.id}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.data?.messages || []);
      }
    } catch {}
  };

  const sendMessage = async () => {
    if (!message.trim() || !selectedTicket) return;
    setSending(true);
    try {
      const res = await fetch(`/api/support/tickets/${selectedTicket.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: message.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setMessages((prev) => [...prev, data.data]);
        setMessage('');
      }
    } finally {
      setSending(false);
    }
  };

  const createTicket = async () => {
    if (!subject.trim() || !message.trim()) return;
    setSending(true);
    try {
      const res = await fetch('/api/support/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: subject.trim(), message: message.trim() }),
      });
      if (res.ok) {
        setSubject('');
        setMessage('');
        setView('list');
        await fetchTickets();
      }
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    const el = messagesEndRef.current;
    el?.scrollIntoView({ behavior: 'smooth' });
  });

  useEffect(() => {
    if (!open) {
      setView('list');
      setSelectedTicket(null);
      setMessages([]);
    }
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium text-zinc-400 hover:text-amber-400 hover:bg-amber-500/10 border border-transparent hover:border-amber-500/20 transition-colors"
      >
        <MessageCircle className="w-4 h-4 flex-shrink-0" />
        <span className="truncate">Support</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center pointer-events-none">
          <button type="button" className="absolute inset-0 bg-black/60 cursor-default" onClick={() => setOpen(false)} aria-label="Close panel" />
          <div className="relative w-full sm:w-[400px] max-h-[600px] bg-zinc-900 border border-zinc-700 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col pointer-events-auto m-0 sm:m-4">
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
              <div className="flex items-center gap-2">
                {view === 'chat' && (
                  <button type="button" onClick={() => { setView('list'); setSelectedTicket(null); }} className="text-zinc-500 hover:text-white">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                )}
                <h3 className="text-sm font-semibold text-white">
                  {view === 'list' ? 'Support' : view === 'new' ? 'New Ticket' : selectedTicket?.subject}
                </h3>
              </div>
              <div className="flex items-center gap-1">
                {view === 'list' && (
                  <button type="button" onClick={() => setView('new')} className="p-1 text-zinc-400 hover:text-white rounded">
                    <Plus className="w-4 h-4" />
                  </button>
                )}
                <button type="button" onClick={() => setOpen(false)} className="p-1 text-zinc-500 hover:text-white rounded">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 min-h-0">
              {view === 'list' && (
                <>
                  {loading ? (
                    <div className="flex justify-center py-8"><div className="w-5 h-5 border-2 border-zinc-600 border-t-amber-500 rounded-full animate-spin" /></div>
                  ) : tickets.length === 0 ? (
                    <div className="text-center py-8">
                      <MessageCircle className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
                      <p className="text-sm text-zinc-400">No tickets yet</p>
                      <p className="text-xs text-zinc-600 mt-1">Create a new ticket for help</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {tickets.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => openChat(t)}
                          className="w-full text-left p-3 rounded-xl border border-zinc-800 hover:border-zinc-700 bg-zinc-900/50 hover:bg-zinc-800/50 transition-colors"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium text-white truncate">{t.subject}</span>
                            <span className={`inline-flex text-[10px] font-semibold px-1.5 py-0.5 rounded border ${statusColors[t.status]}`}>
                              {t.status}
                            </span>
                          </div>
                          <p className="text-xs text-zinc-500">{new Date(t.created_at).toLocaleDateString()}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}

              {view === 'new' && (
                <div className="space-y-3">
                  <input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Subject..."
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500/50"
                  />
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Describe your issue..."
                    rows={4}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500/50 resize-none"
                  />
                  <button
                    type="button"
                    onClick={createTicket}
                    disabled={sending || !subject.trim() || !message.trim()}
                    className="w-full py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-zinc-700 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    {sending ? 'Sending...' : 'Submit Ticket'}
                  </button>
                </div>
              )}

              {view === 'chat' && (
                <div className="space-y-3">
                  {selectedTicket && (
                    <div className={`inline-flex text-xs font-semibold px-2 py-0.5 rounded border ${statusColors[selectedTicket.status]}`}>
                      {selectedTicket.status}
                    </div>
                  )}
                  {messages.map((m) => (
                    <div key={m.id} className={`flex ${m.sender_type === 'player' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] px-3 py-2 rounded-xl text-sm ${
                        m.sender_type === 'player'
                          ? 'bg-amber-600/20 text-amber-100 border border-amber-500/20'
                          : 'bg-zinc-800 text-zinc-200 border border-zinc-700'
                      }`}>
                        <p>{m.message}</p>
                        <p className="text-[10px] text-zinc-500 mt-1">{new Date(m.created_at).toLocaleTimeString()}</p>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {view === 'chat' && selectedTicket?.status !== 'resolved' && (
              <div className="p-3 border-t border-zinc-800 shrink-0">
                <div className="flex items-center gap-2">
                  <input
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') sendMessage(); }}
                    placeholder="Type a message..."
                    className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500/50"
                  />
                  <button
                    type="button"
                    onClick={sendMessage}
                    disabled={sending || !message.trim()}
                    className="p-2 bg-amber-600 hover:bg-amber-700 disabled:bg-zinc-700 text-white rounded-lg transition-colors"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
