require('fs').readFileSync('.env','utf8').split('\n').filter(l=>l&&!l.startsWith('#')).forEach(l=>{
  const [k,...v]=l.split('='); process.env[k.trim()]=v.join('=').trim();
});
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SK = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function probe(table, cols = '*') {
  const r = await fetch(`${URL}/rest/v1/${table}?select=${cols}&limit=1`, {
    headers: { Authorization: `Bearer ${SK}`, apikey: SK }
  });
  const t = await r.text();
  return { ok: r.ok, status: r.status, body: t.slice(0, 300) };
}

(async () => {
  for (const t of ['profiles', 'player_progress', 'server_game_state', 'guest_identities', 'admin_users']) {
    console.log(`\n=== ${t} *all cols 1 row ===`);
    const r = await probe(t);
    if (r.ok) {
      const j = JSON.parse(r.body);
      if (Array.isArray(j) && j[0]) console.log(Object.keys(j[0]).join(', '));
      else console.log('empty array');
    } else {
      console.log(r.status, r.body);
    }
  }
})();
