"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AdminNavigationTree } from "@/components/admin/AdminNavigationTree";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { CommandPalette } from "@/components/admin/CommandPalette";
import { Toaster } from "sonner";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  // Phase 2 (admin login fix): the auth check runs once on mount.
  // Both branches (user found or not) MUST call setLoading(false) so the
  // loading state resolves and the protected children unmount / the
  // router redirects. Previously, the unauthenticated branch called
  // `router.replace('/admin/login')` but never set loading to false —
  // users stuck on the spinner forever.
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth
      .getUser()
      .then(({ data: { user } }) => {
        if (!user) {
          router.replace("/admin/login");
          return;
        }
        setLoading(false);
      })
      .catch((err) => {
        // Auth service unavailable — fail-closed to the login page so
        // the user can retry rather than being stuck on the spinner.
        console.error("[AdminLayout] getUser failed:", err);
        router.replace("/admin/login");
      })
      .finally(() => {
        // Belt-and-braces: if neither branch above fired (e.g. a race
        // or a future code path), unblock the UI by forcing a state
        // resolution. The redirect or setLoading(false) above will
        // win the race; this just guarantees no permanent spinner.
        setLoading((prev) => (prev ? false : prev));
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
