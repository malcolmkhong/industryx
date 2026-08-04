'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { AdminNavigationTree } from '@/components/admin/AdminNavigationTree';
import { AdminHeader } from '@/components/admin/AdminHeader';
import { CommandPalette } from '@/components/admin/CommandPalette';
import { Toaster } from 'sonner';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  // Task 8: dropped `pathname` from useEffect deps. The proxy already
  // gates /admin page loads with a Supabase session check + admin
  // allowlist — running the same check client-side on every navigation
  // is wasteful and re-triggers the loading spinner unnecessarily. The
  // one-time getUser() call below only runs on first mount of the layout
  // (auth-gated subtrees re-mount via key=pathname in app-router).
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.replace('/admin/login');
        return;
      }
      setLoading(false);
    });
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-muted-label/20 border-t-brand/60 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AdminNavigationTree />
      <div className="pl-0 lg:pl-60 transition-all duration-200">
        <AdminHeader />
        <main className="p-6">{children}</main>
      </div>
      <Toaster position="bottom-right" theme="dark" />
      <CommandPalette />
    </div>
  );
}
