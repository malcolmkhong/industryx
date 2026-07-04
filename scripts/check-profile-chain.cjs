require('fs').readFileSync('.env','utf8').split('\n').filter(l=>l&&!l.startsWith('#')).forEach(l=>{
  const [k,...v]=l.split('='); process.env[k.trim()]=v.join('=').trim();
});
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SK = process.env.SUPABASE_SERVICE_ROLE_KEY;
const HDR = { Authorization: `Bearer ${SK}`, apikey: SK, 'Content-Type':'application/json' };

async function sg(path) {
  const r = await fetch(`${URL}/rest/v1/${path}`, { headers: HDR });
  return r.ok ? r.json() : { error: await r.text() };
}
async function count(table, select='*') {
  const r = await fetch(`${URL}/rest/v1/${table}?select=${select}&limit=1`, {
    headers: { ...HDR, Prefer: 'count=exact' }
  });
  const cr = r.headers.get('content-range');
  return cr ? cr.split('/').pop() : '?';
}

(async () => {
  console.log('=== TABLE COUNTS ===');
  for (const t of ['profiles','player_progress','server_game_state','guest_identities','admin_users','admin_actions','player_actions']) {
    console.log(`${t}: ${await count(t)}`);
  }

  // 1. ALL profiles
  const allProf = await sg('profiles?select=id,display_name,device_fingerprint,is_guest,linked_account_id,last_active,session_count,created_at,season_id&order=created_at&limit=200');
  console.log(`\n=== ALL PROFILES (${Array.isArray(allProf)?allProf.length:'ERR'}) ===`);
  if (Array.isArray(allProf)) {
    // headers
    console.log('KEYS:', Object.keys(allProf[0] || {}).join(','));
    allProf.forEach(p => console.log(JSON.stringify(p)));
  } else {
    console.log(allProf);
  }

  // 2. ALL guest_identities
  console.log('\n=== ALL GUEST IDENTITIES ===');
  const allGI = await sg('guest_identities?select=*&limit=200');
  console.log(JSON.stringify(allGI, null, 2));

  // 3. ALL player_progress (just user_id + last_tick_at)
  const allPP = await sg('player_progress?select=user_id,last_tick_at&display_name,research_points&order=last_tick_at.desc&limit=200');
  console.log('\n=== player_progress (user_id + last_tick_at) ===');
  console.log(JSON.stringify(allPP, null, 2));

  // 4. ALL server_game_state
  const allSGS = await sg('server_game_state?select=user_id,money,total_ticks,last_saved_at,game_speed&order=last_saved_at.desc&limit=200');
  console.log('\n=== server_game_state ===');
  console.log(JSON.stringify(allSGS, null, 2));

  // 5. COVERAGE MATRIX
  console.log('\n=== COVERAGE ===');
  const progIds = new Set((Array.isArray(allPP) ? allPP : []).map(p => p.user_id));
  const sgsIds = new Set((Array.isArray(allSGS) ? allSGS : []).map(s => s.user_id));
  const giForUser = new Map();
  (Array.isArray(allGI) ? allGI : []).forEach(g => giForUser.set(g.user_id, g));
  const adminIds = new Set();
  {
    const a = await sg('admin_users?select=user_id,role&limit=50');
    if (Array.isArray(a)) a.forEach(x => adminIds.add(x.user_id));
  }

  if (Array.isArray(allProf)) {
    allProf.forEach(p => {
      const flags = [
        progIds.has(p.id) ? '✓PP' : '·PP',
        sgsIds.has(p.id) ? '✓SGS' : '·SGS',
        giForUser.has(p.id) ? '✓GI' : '·GI',
        adminIds.has(p.id) ? '✓ADMIN' : '',
        p.is_guest ? 'GUEST' : 'AUTH',
      ].filter(Boolean).join(' ');
      const fp = p.device_fingerprint ? p.device_fingerprint.slice(0,12) : 'no-fp';
      console.log(`${p.id.slice(0,8)} ${p.created_at.slice(0,10)} ${fp} ${flags.padEnd(28)} ${p.display_name||''}`);
    });
  }

  // Auth users via admin API
  console.log('\n=== AUTH USERS COUNT ===');
  const au = await fetch(`${URL}/auth/v1/admin/users?page=1&per_page=1`, {
    headers: HDR
  });
  console.log('Auth admin status:', au.status);
  const aTxt = await au.text();
  console.log(aTxt.slice(0, 500));
})();
