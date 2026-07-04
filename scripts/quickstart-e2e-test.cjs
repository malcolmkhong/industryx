require('fs').readFileSync('.env','utf8').split('\n').filter(l=>l&&!l.startsWith('#')).forEach(l=>{
  const [k,...v]=l.split('='); process.env[k.trim()]=v.join('=').trim();
});
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SK = process.env.SUPABASE_SERVICE_ROLE_KEY;
const HDR = { Authorization: `Bearer ${SK}`, apikey: SK, 'Content-Type': 'application/json' };

(async () => {
  console.log('=== QUICKSTART E2E TEST ===\n');

  // Need server to be running; check by hitting quickstart endpoint.
  // Browser-like call with deviceId + fingerprint.
  const deviceId1 = 'qs-test-device-' + Date.now();
  const fp1 = 'qs-test-fp-' + Date.now();

  console.log('1. First visit (fresh deviceId, fresh fingerprint):');
  const res1 = await fetch('http://localhost:3000/api/auth/quickstart', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId: deviceId1, fingerprint: fp1 }),
  });
  const body1 = await res1.json();
  console.log(`   status=${res1.status} body=${JSON.stringify(body1)}`);
  if (res1.status !== 200) { console.log('FAIL'); process.exit(1); }
  if (body1.source !== 'fresh') { console.log(`FAIL: source=${body1.source}, expected fresh`); process.exit(1); }
  const userId1 = body1.userId;

  console.log('\n2. Same device, second visit:');
  const res2 = await fetch('http://localhost:3000/api/auth/quickstart', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId: deviceId1, fingerprint: fp1 }),
  });
  const body2 = await res2.json();
  console.log(`   status=${res2.status} body=${JSON.stringify(body2)}`);
  if (body2.source !== 'deviceId' || body2.userId !== userId1) {
    console.log(`FAIL: same deviceId should match same user; got source=${body2.source}`);
    process.exit(1);
  }

  console.log('\n3. localStorage cleared (new deviceId, same fingerprint):');
  const deviceId2 = 'qs-test-device-fresh-' + Date.now();
  const res3 = await fetch('http://localhost:3000/api/auth/quickstart', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId: deviceId2, fingerprint: fp1 }),
  });
  const body3 = await res3.json();
  console.log(`   status=${res3.status} body=${JSON.stringify(body3)}`);
  if (body3.source !== 'fingerprint' || body3.userId !== userId1) {
    console.log(`FAIL: fingerprint fallback should match; got source=${body3.source}`);
    process.exit(1);
  }

  console.log('\n4. Altogether new visitor (new deviceId + new fingerprint):');
  const res4 = await fetch('http://localhost:3000/api/auth/quickstart', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId: 'qs-fresh-' + Date.now(), fingerprint: 'qs-newfp-' + Date.now() }),
  });
  const body4 = await res4.json();
  console.log(`   status=${res4.status} body=${JSON.stringify(body4)}`);
  if (body4.source !== 'fresh' || body4.userId === userId1) {
    console.log(`FAIL: should create new user; got source=${body4.source}`);
    process.exit(1);
  }
  const userId4 = body4.userId;

  console.log('\n5. Validation: missing fingerprint rejected:');
  const res5 = await fetch('http://localhost:3000/api/auth/quickstart', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId: 'no-fp' }),
  });
  console.log(`   status=${res5.status}`);
  if (res5.status !== 400) { console.log('FAIL: should reject missing fingerprint'); process.exit(1); }

  console.log('\n6. Validation: missing deviceId rejected:');
  const res6 = await fetch('http://localhost:3000/api/auth/quickstart', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fingerprint: 'x' }),
  });
  console.log(`   status=${res6.status}`);
  if (res6.status !== 400) { console.log('FAIL: should reject missing deviceId'); process.exit(1); }

  console.log('\n7. Cleanup test users:');
  for (const uid of [userId1, userId4]) {
    const r = await fetch(`${URL}/auth/v1/admin/users/${uid}`, {
      method: 'DELETE', headers: HDR,
    });
    console.log(`   delete ${uid}: ${r.status}`);
  }

  console.log('\n✅ ALL QUICKSTART SCENARIOS PASSED');
})();
