require('fs').readFileSync('.env','utf8').split('\n').filter(l=>l&&!l.startsWith('#')).forEach(l=>{
  const [k,...v]=l.split('='); process.env[k.trim()]=v.join('=').trim();
});

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const HDR = {
  Authorization: `Bearer ${SERVICE_KEY}`,
  apikey: SERVICE_KEY,
  'Content-Type': 'application/json',
};

async function jget(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: HDR });
  return r.ok ? r.json() : { error: await r.text() };
}

(async () => {
  const candidateTables = [
    'profiles', 'player_progress', 'server_game_state', 'guest_identities',
    'buildings', 'resources', 'game_config', 'research',
    'admin_actions', 'player_actions', 'admin_users',
  ];

  console.log('=== TABLE EXISTENCE ===');
  const present = {};
  for (const t of candidateTables) {
    const r = await jget(`${t}?select=*&limit=0`);
    if (!r.error) {
      // Get count
      const rc = await fetch(`${SUPABASE_URL}/rest/v1/${t}?select=*&limit=1`, {
        headers: { ...HDR, Prefer: 'count=exact' }
      });
      const cr = rc.headers.get('content-range');
      const total = cr ? cr.split('/').pop() : '?';
      present[t] = total;
    } else {
      present[t] = 'MISSING';
    }
    console.log(`${t}: ${present[t]}`);
  }

  const presentTables = Object.entries(present).filter(([_,v]) => v !== 'MISSING').map(([k]) => k);
  if (!presentTables.length) {
    console.log('NO TABLES FOUND'); process.exit(1);
  }

  console.log('\n=== profiles SAMPLE (5 rows) ===');
  const prof = await jget('profiles?limit=5');
  console.log(JSON.stringify(Array.isArray(prof) ? prof.slice(0,5).map(p => ({
    id: p.id, user_id: p.user_id, username: p.username,
    device_fingerprint: p.device_fingerprint, created_at: p.created_at,
  })) : prof, null, 2));

  console.log('\n=== player_progress SAMPLE (5 rows) ===');
  const pp = await jget('player_progress?limit=5');
  console.log(JSON.stringify(Array.isArray(pp) ? pp.slice(0,5) : pp, null, 2));

  console.log('\n=== server_game_state SAMPLE (5 rows) ===');
  const sgs = await jget('server_game_state?limit=5');
  console.log(JSON.stringify(Array.isArray(sgs) ? sgs.slice(0,5) : sgs, null, 2));

  console.log('\n=== guest_identities SAMPLE (5 rows) ===');
  const gi = await jget('guest_identities?limit=5');
  console.log(JSON.stringify(Array.isArray(gi) ? gi.slice(0,5) : gi, null, 2));

  if (presentTables.includes('game_config')) {
    console.log('\n=== game_config SAMPLE ===');
    const gc = await jget('game_config?limit=5');
    console.log(JSON.stringify(Array.isArray(gc) ? gc.slice(0,3) : gc, null, 2));
  }
})();
