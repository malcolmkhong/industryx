require('fs').readFileSync('.env','utf8').split('\n').filter(l=>l&&!l.startsWith('#')).forEach(l=>{
  const [k,...v]=l.split('='); process.env[k.trim()]=v.join('=').trim();
});
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SK = process.env.SUPABASE_SERVICE_ROLE_KEY;
const HDR = { Authorization: `Bearer ${SK}`, apikey: SK };
async function sg(p, opts={}) {
  const r = await fetch(`${URL}/rest/v1/${p}`, { ...opts, headers: { ...HDR, ...(opts.headers||{}) } });
  return r.ok ? r.json() : { error: await r.text() };
}
async function count(t) {
  const r = await fetch(`${URL}/rest/v1/${t}?select=*&limit=1`, {
    headers: { ...HDR, Prefer: 'count=exact' }
  });
  const cr = r.headers.get('content-range');
  return cr ? cr.split('/').pop() : '?';
}

(async () => {
  console.log('=== PRE-DELETE INVENTORY ===\n');
  console.log('Table counts:');
  for (const t of ['auth.users','profiles','guest_identities','server_game_state','player_progress','player_actions','merge_receipts','merge_audit_log','pending_link_operations','admin_users','admin_actions']) {
    if (t === 'auth.users') {
      const r = await fetch(`${URL}/auth/v1/admin/users?per_page=1`, { headers: HDR });
      const t2 = await r.text();
      const m = t2.match(/"total":(\d+)/);
      console.log(`auth.users: ${m?.[1] ?? '?'}`);
      continue;
    }
    console.log(`${t}: ${await count(t)}`);
  }

  // Profile classification
  console.log('\n=== PROFILE BREAKDOWN ===');
  const allProf = await sg('profiles?select=id,is_guest,last_active&display_name');
  console.log(`Total profiles: ${allProf.length}`);
  
  const progIds = new Set((await sg('player_progress?select=user_id')).map(p => p.user_id));
  const sgsIds = new Set((await sg('server_game_state?select=user_id')).map(s => s.user_id));
  const giIds = new Set((await sg('guest_identities?select=user_id')).map(g => g.user_id));

  const ghost = [];      // no game data at all
  const minimal = [];    // has SGS but no PP/GI
  const fullPlayer = []; // has SGS+PP+GI or has any 2

  allProf.forEach(p => {
    const has = (progIds.has(p.id)?1:0) + (sgsIds.has(p.id)?1:0) + (giIds.has(p.id)?1:0);
    if (has === 0) ghost.push(p);
    else if (has >= 2) fullPlayer.push(p);
    else minimal.push(p);
  });

  console.log(`GHOST (no game data, will DELETE): ${ghost.length}`);
  console.log(`MINIMAL (partial, will review): ${minimal.length}`);
  console.log(`FULL PLAYERS (keep): ${fullPlayer.length}`);

  // Check ghost profiles - any auth.users with identities we should keep?
  console.log('\n=== GHOST PROFILE IDS (will DELETE) ===');
  ghost.slice(0,10).forEach(p => console.log(`  ${p.id.slice(0,8)}... ${p.display_name || 'no-name'} is_guest=${p.is_guest}`));
  if (ghost.length > 10) console.log(`  ... +${ghost.length-10} more`);

  // detail on minimal - which have only SGS but no PP, no GI?
  console.log('\n=== MINIMAL (just server_game_state, no PP/GI) ===');
  minimal.slice(0,10).forEach(p => console.log(`  ${p.id.slice(0,8)} ${p.last_active?.slice(0,10) || 'n/a'}`));

  // Admin user check - which profiles MUST NOT be deleted?
  const adminUsers = await sg('admin_users?select=user_id,role');
  console.log(`\n=== ADMIN USERS (will keep) === ${adminUsers.length}`);
  adminUsers.forEach(a => console.log(`  ${a.user_id.slice(0,8)} role=${a.role}`));

  // is_localhost false → I am not real test → likely all of this is dev test junk
  console.log('\n=== RECENT ACTIVITY ===');
  const recentPA = await sg('player_actions?select=user_id,action_type,created_at&order=created_at.desc&limit=5');
  console.log('Last 5 player_actions:');
  recentPA.forEach(a => console.log(`  ${a.created_at.slice(0,16)} ${a.action_type} user=${a.user_id.slice(0,8)}`));
})();
