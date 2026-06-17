'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { LogOut, User } from 'lucide-react';

export function AdminHeader() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) {
        setEmail(user.email);
      }
    });
  }, []);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/admin/login');
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
            <span className="text-xs font-medium truncate max-w-[160px]">{email}</span>
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
