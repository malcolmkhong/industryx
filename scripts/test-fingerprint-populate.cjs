require('fs').readFileSync('.env','utf8').split('\n').filter(l=>l&&!l.startsWith('#')).forEach(l=>{
  const [k,...v]=l.split('='); process.env[k.trim()]=v.join('=').trim();
});
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SK = process.env.SUPABASE_SERVICE_ROLE_KEY;
const HDR = { Authorization: `Bearer ${SK}`, apikey: SK, 'Content-Type': 'application/json' };

const TEST_FP = 'test_fp_' + Date.now();
const TEST_EMAIL = `fp-test-${Date.now()}@test.industryx.game`;

(async () => {
  console.log('=== FINGERPRINT POPULATE TEST ===');
  console.log('Test fingerprint:', TEST_FP);

  // 1. Create anon user with fingerprint in user_metadata
  const createRes = await fetch(`${URL}/auth/v1/admin/users`, {
    method: 'POST', headers: HDR,
    body: JSON.stringify({
      email: TEST_EMAIL,
      email_confirm: true,
      user_metadata: {
        fingerprint: TEST_FP,
        device_id: 'device_test_' + Date.now(),
        is_anonymous: true,
      },
    }),
  });
  const created = await createRes.json();
  if (!created.id) {
    console.log('FAIL: createUser error:', JSON.stringify(created));
    process.exit(1);
  }
  const userId = created.id;
  console.log('Created user:', userId);

  // Give the trigger a beat (Postgres triggers are synchronous but we wait briefly
  // for the read-after-write to be observable).
  await new Promise(r => setTimeout(r, 500));

  // 2. Read profile, check device_fingerprint
  const profileRes = await fetch(`${URL}/rest/v1/profiles?id=eq.${userId}&select=id,is_guest,device_fingerprint,display_name`, { headers: HDR });
  const profiles = await profileRes.json();
  console.log('Profile result:', JSON.stringify(profiles, null, 2));

  const profile = profiles[0];
  if (!profile) {
    console.log('FAIL: no profile row created');
    cleanup(userId);
    process.exit(1);
  }

  if (profile.device_fingerprint === TEST_FP) {
    console.log('✅ PASS — trigger wrote fingerprint to profiles.device_fingerprint');
  } else {
    console.log(`❌ FAIL — expected ${TEST_FP}, got ${profile.device_fingerprint}`);
  }

  // 3. Cleanup
  await fetch(`${URL}/auth/v1/admin/users/${userId}`, { method: 'DELETE', headers: HDR });
  console.log('Cleaned up.');
  process.exit(profile.device_fingerprint === TEST_FP ? 0 : 1);
})();
