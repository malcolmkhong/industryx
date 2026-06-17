'use client';

import { useState, useEffect, useCallback } from 'react';
import { Shield, Plus, X } from 'lucide-react';

interface PermissionState {
  granted: string[];
  available: string[];
}

export default function PermissionsPage() {
  const [userId, setUserId] = useState('');
  const [perms, setPerms] = useState<PermissionState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState('');

  const fetchPermissions = useCallback(async () => {
    if (!userId.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/permissions/${userId.trim()}`);
      if (res.ok) {
        setPerms(await res.json());
      } else {
        setError('Failed to load permissions');
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const togglePermission = async (perm: string) => {
    if (!userId.trim() || saving) return;
    const isGranted = perms?.granted.includes(perm);
    setSaving(perm);
    try {
      const res = await fetch(`/api/admin/permissions/${userId.trim()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permission: perm, action: isGranted ? 'revoke' : 'grant' }),
      });
      if (res.ok) {
        await fetchPermissions();
      }
    } catch {
      setError('Failed to update permission');
    } finally {
      setSaving('');
    }
  };

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">Permissions</h2>
          <p className="text-sm text-muted-label mt-1">Granular access control per admin user</p>
        </div>
      </div>

      <div className="border border-muted-label/40 rounded-xl p-4 mb-6 bg-background/80/50">
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label htmlFor="admin-user-id" className="text-xs text-muted-label mb-1 block">Admin User ID</label>
            <input
              id="admin-user-id"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="UUID of admin user..."
              className="w-full px-3 py-2 bg-background/60 border border-muted-label/30 rounded-lg text-xs text-white placeholder-muted-label font-mono focus:outline-none focus:border-warning/60/50"
            />
          </div>
          <button
            type="button"
            onClick={fetchPermissions}
            disabled={loading}
            className="px-4 py-2 bg-warning/70 hover:bg-warning/80 disabled:bg-background/40 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {loading ? 'Loading...' : 'Load'}
          </button>
        </div>
        {error && <p className="text-xs text-danger mt-2">{error}</p>}
      </div>

      {perms && (
        <div className="border border-muted-label/40 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-muted-label/40 bg-background/80/50">
            <h3 className="text-sm font-semibold text-white">Permissions for {userId.slice(0, 12)}...</h3>
            <p className="text-xs text-muted-label mt-0.5">
              Click to grant or revoke individual permissions
            </p>
          </div>
          <div className="divide-y divide-background/60/60">
            {perms.available.map((perm) => {
              const isGranted = perms.granted.includes(perm);
              return (
                <button
                  key={perm}
                  type="button"
                  onClick={() => togglePermission(perm)}
                  disabled={saving === perm}
                  className={`w-full flex items-center justify-between px-4 py-3 text-sm transition-colors ${
                    isGranted
                      ? 'bg-success/5 hover:bg-success/10'
                      : 'hover:bg-background/60/30'
                  } disabled:opacity-50`}
                >
                  <div className="flex items-center gap-3">
                    <Shield className={`w-4 h-4 ${isGranted ? 'text-success' : 'text-muted-label/80'}`} />
                    <span className={isGranted ? 'text-white font-medium' : 'text-muted-label'}>
                      {perm.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {saving === perm && (
                      <div className="w-4 h-4 border-2 border-muted-label/10 border-t-warning/50 rounded-full animate-spin" />
                    )}
                    {isGranted ? (
                      <span className="text-xs text-success flex items-center gap-1">
                        <X className="w-3.5 h-3.5" /> Revoke
                      </span>
                    ) : (
                      <span className="text-xs text-muted-label flex items-center gap-1">
                        <Plus className="w-3.5 h-3.5" /> Grant
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {!perms && !loading && !userId && (
        <div className="flex flex-col items-center justify-center py-16">
          <Shield className="w-10 h-10 text-muted-label/80 mb-4" />
          <p className="text-sm text-muted-label">Enter an admin user UUID above to manage permissions</p>
        </div>
      )}
    </>
  );
}
