'use client';

import { useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function WaitlistForm() {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('submitting');
    setMessage('');
    try {
      const res = await fetch('/api/platform/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name: name || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Submission failed');
      setStatus('success');
      const pos = data.position;
      const days = data.estimated_wait_days;
      setMessage(
        pos
          ? `You're #${pos} in line${days ? `, estimated wait ${days} days` : ''}. We'll email you when capacity opens.`
          : "You're on the list. We'll email you when capacity opens."
      );
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Something went wrong');
    }
  }

  if (status === 'success') {
    return (
      <div className="flex flex-col items-center text-center py-8">
        <CheckCircle2 className="w-12 h-12 text-success mb-3" />
        <p className="text-white font-medium">{message}</p>
        <p className="text-muted-label text-xs mt-2">Check your inbox for confirmation.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="waitlist-email" className="text-subtle">
          Email Address <span className="text-danger">*</span>
        </Label>
        <Input
          id="waitlist-email"
          type="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={status === 'submitting'}
          autoComplete="email"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="waitlist-name" className="text-subtle">
          Name <span className="text-muted-label/80 text-xs">(optional)</span>
        </Label>
        <Input
          id="waitlist-name"
          type="text"
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={status === 'submitting'}
          autoComplete="name"
        />
      </div>
      <Button
        type="submit"
        disabled={status === 'submitting'}
        className="w-full bg-research/80 hover:bg-research text-white"
      >
        {status === 'submitting' ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Joining…
          </>
        ) : (
          'Join Waitlist'
        )}
      </Button>
      {status === 'error' && (
        <p className="text-xs text-danger text-center">{message}</p>
      )}
    </form>
  );
}
