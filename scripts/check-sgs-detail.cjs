require('fs').readFileSync('.env','utf8').split('\n').filter(l=>l&&!l.startsWith('#')).forEach(l=>{
  const [k,...v]=l.split('='); process.env[k.trim()]=v.join('=').trim();
});
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SK = process.env.SUPABASE_SERVICE_ROLE_KEY;
const HDR = { Authorization: `Bearer ${SK}`, apikey: SK, 'Content-Type':'application/json' };
async function sg(p) { const r=await fetch(`${URL}/rest/v1/${p}`,{headers:HDR}); return r.ok?r.json():{error:await r.text()};}
(async () => {
  // 1) server_game_state columns
  console.log('=== server_game_state (1 row full) ===');
  const s = await sg('server_game_state?select=*&limit=1');
  console.log(JSON.stringify(s, null, 2));
  
  console.log('\n=== ALL 27 server_game_state (id, last, money) ===');
  const all = await sg('server_game_state?select=user_id,money,last_saved_at,updated_at&limit=30');
  console.log(JSON.stringify(all, null, 2));

  console.log('\n=== guest_identities FULL DETAIL ===');
  const gi = await sg('guest_identities?select=*&limit=20');
  console.log(JSON.stringify(gi, null, 2));

  console.log('\n=== player_actions (last 10) ===');
  const pa = await sg('player_actions?select=user_id,action_type,created_at&order=created_at.desc&limit=10');
  console.log(JSON.stringify(pa, null, 2));
})();
