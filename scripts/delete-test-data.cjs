require('fs').readFileSync('.env','utf8').split('\n').filter(l=>l&&!l.startsWith('#')).forEach(l=>{
  const [k,...v]=l.split('='); process.env[k.trim()]=v.join('=').trim();
});
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SK = process.env.SUPABASE_SERVICE_ROLE_KEY;
const HDR = { Authorization: `Bearer ${SK}`, apikey: SK, 'Content-Type': 'application/json' };

async function del(p) {
  const r = await fetch(`${URL}/rest/v1/${p}`, { method: 'DELETE', headers: HDR });
  // DELETE response may be empty body; treat 2xx as success, 404 as no rows
  return r.ok || r.status === 404;
}
async function sel(p) {
  const r = await fetch(`${URL}/rest/v1/${p}`, { headers: HDR });
  if (!r.ok) return [];
  const txt = await r.text();
  return txt ? JSON.parse(txt) : [];
}
async function delAuth(uid) {
  const r = await fetch(`${URL}/auth/v1/admin/users/${uid}`, { method: 'DELETE', headers: HDR });
  return { ok: r.ok, status: r.status };
}

(async () => {
  console.log('Loading profile classification...');
  const allProf = await sel('profiles?select=id,is_guest,last_active&display_name');
  const progIds = new Set((await sel('player_progress?select=user_id')).map(p => p.user_id));
  const sgsIds = new Set((await sel('server_game_state?select=user_id')).map(s => s.user_id));
  const giIds = new Set((await sel('guest_identities?select=user_id')).map(g => g.user_id));
  const adminIds = new Set((await sel('admin_users?select=user_id')).map(a => a.user_id));

  const targets = [];
  for (const p of allProf) {
    if (adminIds.has(p.id)) continue;
    const has = (progIds.has(p.id) ? 1 : 0) + (sgsIds.has(p.id) ? 1 : 0) + (giIds.has(p.id) ? 1 : 0);
    if (has <= 1) targets.push(p); // ghost (0) + minimal (1=SGS only)
  }

  console.log(`Deleting ${targets.length} profiles\n`);

  const stats = { pa: 0, pp: 0, sgs: 0, gi: 0, prof: 0, auth_ok: 0, auth_404: 0, auth_fail: 0 };

  for (const p of targets) {
    const uid = p.id;
    if (await del(`player_actions?user_id=eq.${uid}`)) stats.pa++;
    if (await del(`player_progress?user_id=eq.${uid}`)) stats.pp++;
    if (await del(`server_game_state?user_id=eq.${uid}`)) stats.sgs++;
    if (await del(`guest_identities?user_id=eq.${uid}`)) stats.gi++;
    if (await del(`profiles?id=eq.${uid}`)) stats.prof++;

    const a = await delAuth(uid);
    if (a.ok || a.status === 204) stats.auth_ok++;
    else if (a.status === 404) stats.auth_404++;
    else stats.auth_fail++;

    if ((stats.prof & 0xf) === 0) console.log(`  ${stats.prof}/${targets.length} done`);
  }

  console.log('\n=== DONE ===');
  console.log(JSON.stringify(stats, null, 2));

  // Verify
  console.log('\n=== POST-DELETE ===');
  console.log('profiles left:', (await sel('profiles?select=id')).length);
  console.log('SGS left:', (await sel('server_game_state?select=user_id')).length);
  console.log('PP left:', (await sel('player_progress?select=user_id')).length);
  console.log('GI left:', (await sel('guest_identities?select=user_id')).length);
})();
