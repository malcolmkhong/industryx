'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/AuthProvider';
import { LogOut, User } from 'lucide-react';

export function AdminHeader() {
  const router = useRouter();
  const { signOut } = useAuth();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) {
        setEmail(user.email);
      }
    });
  }, []);

  // Plan §21 PR 4: route sign-out through the orchestrator so the
  // sign-out-to-guest bootstrap fires (signed_out → resolving_session →
  // /api/auth/bootstrap with previousAuthUserId set). Calling
  // `supabase.auth.signOut()` directly skipped the new pipeline and
  // blocked gameplay clearing + guest re-bootstrap.
  const handleLogout = async () => {
    try {
      await signOut();
    } finally {
      router.push('/admin/login');
    }
  };

  return (
    <header className="sticky top-0 z-30 h-14 flex items-center justify-between px-4 bg-background/80 backdrop-blur-xl border-b border-muted-label/40/60">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-muted-label uppercase tracking-wider">
          Backend
        </span>
      </div>

      <div className="flex items-center gap-3">
        {email && (
          <div className="flex items-center gap-2 text-muted-label">
            <User className="w-3.5 h-3.5" />
            <span className="text-xs font-medium truncate max-w-40">{email}</span>
          </div>
        )}

        <button
          type="button"
          onClick={handleLogout}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-muted-label hover:text-white hover:bg-background/60/60 rounded-md transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Sign out</span>
        </button>
      </div>
    </header>
  );
}
