'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { AdminNavigationTree } from '@/components/admin/AdminNavigationTree';
import { AdminHeader } from '@/components/admin/AdminHeader';
import { Toaster } from 'sonner';

const AUTH_ROUTES = ['/admin/login', '/admin/forbidden', '/admin/auth'];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (AUTH_ROUTES.some((r) => pathname.startsWith(r))) {
      setLoading(false);
      return;
    }

    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.replace('/admin/login');
        return;
      }
      setLoading(false);
    });
  }, [router, pathname]);

  if (AUTH_ROUTES.some((r) => pathname.startsWith(r))) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-zinc-600 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      <AdminNavigationTree />
      <div className="pl-[240px] transition-all duration-200">
        <AdminHeader />
        <main className="p-6">{children}</main>
      </div>
      <Toaster position="bottom-right" theme="dark" />
    </div>
  );
}
