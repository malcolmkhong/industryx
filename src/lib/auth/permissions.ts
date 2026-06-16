import { createServiceRoleClient } from '@/lib/supabase/server';

const VALID_PERMISSIONS = [
  'view_players',
  'lock_players',
  'edit_config',
  'manage_admins',
  'view_audit',
  'manage_market',
  'manage_investigations',
  'view_economy',
] as const;

export type Permission = (typeof VALID_PERMISSIONS)[number];

export function getValidPermissions(): readonly string[] {
  return VALID_PERMISSIONS;
}

export async function getUserPermissions(userId: string): Promise<Permission[]> {
  const supabase = createServiceRoleClient();
  if (!supabase) return [];

  const { data } = await supabase
    .from('admin_permissions')
    .select('permission')
    .eq('admin_user_id', userId);

  return (data || []).map((r) => r.permission as Permission);
}

export async function hasPermission(userId: string, permission: Permission): Promise<boolean> {
  const supabase = createServiceRoleClient();
  if (!supabase) return false;

  const { count, error } = await supabase
    .from('admin_permissions')
    .select('*', { count: 'exact', head: true })
    .eq('admin_user_id', userId)
    .eq('permission', permission);

  return !error && (count ?? 0) > 0;
}

export async function grantPermission(
  adminUserId: string,
  permission: Permission,
  grantedBy: string,
): Promise<boolean> {
  const supabase = createServiceRoleClient();
  if (!supabase) return false;

  const { error } = await supabase.from('admin_permissions').upsert({
    admin_user_id: adminUserId,
    permission,
    granted_by: grantedBy,
  });

  return !error;
}

export async function revokePermission(
  adminUserId: string,
  permission: Permission,
): Promise<boolean> {
  const supabase = createServiceRoleClient();
  if (!supabase) return false;

  const { error } = await supabase
    .from('admin_permissions')
    .delete()
    .eq('admin_user_id', adminUserId)
    .eq('permission', permission);

  return !error;
}
