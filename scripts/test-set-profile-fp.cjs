require('fs').readFileSync('.env','utf8').split('\n').filter(l=>l&&!l.startsWith('#')).forEach(l=>{
  const [k,...v]=l.split('='); process.env[k.trim()]=v.join('=').trim();
});
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SK = process.env.SUPABASE_SERVICE_ROLE_KEY;
const HDR = { Authorization: `Bearer ${SK}`, apikey: SK, 'Content-Type': 'application/json' };

const INITIAL_FP = 'initial_fp_via_trigger';
const UPDATED_FP = 'updated_fp_via_register_device';

(async () => {
  console.log('=== OAUTH-STYLE FINGERPRINT UPDATE TEST ===\n');

  // 1. Create user with initial fingerprint (simulates anon signup with quickstart)
  const createRes = await fetch(`${URL}/auth/v1/admin/users`, {
    method: 'POST', headers: HDR,
    body: JSON.stringify({
      email: `oauth-test-${Date.now()}@test.industryx.game`,
      email_confirm: true,
      user_metadata: {
        fingerprint: INITIAL_FP,
        device_id: 'device_1',
        is_anonymous: false,
      },
    }),
  });
  const created = await createRes.json();
  const userId = created.id;
  console.log('1. Created user, initial FP via trigger:', INITIAL_FP);

  await new Promise(r => setTimeout(r, 300));

  // 2. Read initial profile
  let p = await fetch(`${URL}/rest/v1/profiles?id=eq.${userId}&select=device_fingerprint`, { headers: HDR });
  let initial = (await p.json())[0];
  console.log('2. Profile after trigger:', initial.device_fingerprint);
  if (initial.device_fingerprint !== INITIAL_FP) {
    console.log('   ❌ FAIL — trigger did not set initial FP');
    cleanup(); process.exit(1);
  }

  // 3. Simulate register-device update — write a NEW fingerprint via REST
  //    (We can't actually call the route without a user session, but the helper
  //    setProfileFingerprint() does this exact same UPDATE.)
  const updateRes = await fetch(`${URL}/rest/v1/profiles?id=eq.${userId}`, {
    method: 'PATCH', headers: HDR,
    body: JSON.stringify({ device_fingerprint: UPDATED_FP }),
  });
  console.log('3. Simulated register-device UPDATE:', updateRes.status);

  // 4. Read updated profile
  p = await fetch(`${URL}/rest/v1/profiles?id=eq.${userId}&select=device_fingerprint`, { headers: HDR });
  let updated = (await p.json())[0];
  console.log('4. Profile after register-device:', updated.device_fingerprint);
  if (updated.device_fingerprint === UPDATED_FP) {
    console.log('   ✅ PASS — fingerprint updated via PATCH (same SQL as setProfileFingerprint)');
  } else {
    console.log(`   ❌ FAIL — expected ${UPDATED_FP}, got ${updated.device_fingerprint}`);
    cleanup(); process.exit(1);
  }

  // 5. Cleanup
  async function cleanup() {
    await fetch(`${URL}/auth/v1/admin/users/${userId}`, { method: 'DELETE', headers: HDR });
  }
  await cleanup();
  console.log('\nCleaned up.');
  process.exit(0);
})();
