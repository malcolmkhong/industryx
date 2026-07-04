/**
 * Check all users in Supabase — device IDs, fingerprints, and gameplay data
 *
 * Run: node scripts/check-users.mjs
 */

import { createClient } from '@supabase/supabase-js';

const SB_URL = 'https://wkkzqtseqwcyyyezroqq.supabase.co';
const SB_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6OiJzdXBhYmFzZSIsInJlZiI6Indra3pxdHNlcXdjeXl5ZXpyb3FxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDY4OTQ0NSwiZXhwIjoyMDk2MjY1NDQ1fQ.jcMZzKMLwWlXIynvGCOSmj9Ap4L3lCWSa5wojFEwmWc';

const supabase = createClient(SB_URL, SB_SERVICE_KEY);

async function main() {
  console.log('Fetching all profiles...\n');

  // 1. Get all profiles (user metadata)
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('user_id, display_name, created_at, updated_at, is_guest, avatar_url')
    .order('created_at');

  if (profilesError) {
    console.error('Error fetching profiles:', profilesError);
    return;
  }

  console.log(`Found ${profiles?.length ?? 0} profiles\n`);
  console.log('═'.repeat(80));

  // 2. Get all server_game_state (gameplay data)
  const { data: gameStates, error: gsError } = await supabase
    .from('server_game_state')
    .select('user_id, money, total_money_earned, game_tick, game_speed, buildings_count, is_locked, last_saved_at, created_at')
    .order('created_at');

  if (gsError) {
    console.error('Error fetching game states:', gsError);
    return;
  }

  // 3. Get all guest_identities (device/fingerprint mapping)
  const { data: identities, error: idError } = await supabase
    .from('guest_identities')
    .select('user_id, device_id, fingerprint, fingerprint_hash, is_primary, claimed_at, last_used_at, created_at, superseded_by')
    .order('created_at');

  if (idError) {
    console.error('Error fetching identities:', idError);
    return;
  }

  // 4. Get auth.users data (provider info)
  const { data: authUsers, error: authError } = await supabase
    .from('auth.users')
    .select('id, email, created_at, last_sign_in_at, providers, is_anonymous, email_confirmed_at, aud')
    .order('created_at');

  if (authError) {
    console.error('Error fetching auth users:', authError);
  }

  // Build lookup maps
  const gsMap = new Map((gameStates ?? []).map(gs => [gs.user_id, gs]));
  const idMap = new Map();
  for (const id of (identities ?? [])) {
    if (!idMap.has(id.user_id)) idMap.set(id.user_id, []);
    idMap.get(id.user_id).push(id);
  }
  const authMap = new Map((authUsers ?? []).map(u => [u.id, u]));

  console.log(`\nPROFILES (${profiles?.length ?? 0}):`);
  console.log('─'.repeat(80));

  for (const profile of (profiles ?? [])) {
    const gs = gsMap.get(profile.user_id);
    const ids = idMap.get(profile.user_id) ?? [];
    const auth = authMap.get(profile.user_id);

    const hasGameData = gs && (gs.money > 0 || gs.game_tick > 0 || gs.buildings_count > 0);

    console.log(`\n▸ User: ${profile.display_name ?? '(no display name)'}`);
    console.log(`  User ID: ${profile.user_id}`);
    console.log(`  Email: ${auth?.email ?? 'N/A'}`);
    console.log(`  Provider: ${auth?.providers ?? 'N/A'}`);
    console.log(`  Is Guest: ${profile.is_guest ?? false}`);
    console.log(`  Profile Created: ${profile.created_at}`);

    console.log(`\n  DEVICE / FINGERPRINT:`);
    if (ids.length === 0) {
      console.log(`    No guest_identities record`);
    } else {
      for (const id of ids) {
        const status = id.superseded_by ? ' (SUPERSEDED)' : id.is_primary ? ' (PRIMARY)' : '';
        console.log(`    device_id: ${id.device_id ?? 'N/A'}${status}`);
        console.log(`    fingerprint: ${id.fingerprint?.substring(0, 20) ?? 'N/A'}...`);
        console.log(`    fingerprint_hash: ${id.fingerprint_hash?.substring(0, 20) ?? 'N/A'}...`);
        console.log(`    claimed_at: ${id.claimed_at ?? 'not claimed'}`);
        console.log(`    last_used_at: ${id.last_used_at ?? 'N/A'}`);
        console.log(`    superseded_by: ${id.superseded_by ?? 'N/A'}`);
        console.log('');
      }
    }

    console.log(`  GAMEPLAY DATA:`);
    if (!gs) {
      console.log(`    No server_game_state record`);
    } else {
      console.log(`    money: ${gs.money ?? 0}`);
      console.log(`    total_money_earned: ${gs.total_money_earned ?? 0}`);
      console.log(`    game_tick: ${gs.game_tick ?? 0}`);
      console.log(`    game_speed: ${gs.game_speed ?? 'N/A'}`);
      console.log(`    buildings_count: ${gs.buildings_count ?? 0}`);
      console.log(`    is_locked: ${gs.is_locked ?? false}`);
      console.log(`    last_saved_at: ${gs.last_saved_at ?? 'N/A'}`);
      console.log(`    has_gameplay_data: ${hasGameData ? 'YES ✅' : 'NO ❌ (just initialized)'}`);
    }

    console.log('─'.repeat(80));
  }

  // Summary
  const totalWithGameData = (gameStates ?? []).filter(gs => gs.money > 0 || gs.game_tick > 0).length;
  const totalLocked = (gameStates ?? []).filter(gs => gs.is_locked).length;
  const totalGuests = (profiles ?? []).filter(p => p.is_guest).length;

  console.log(`\nSUMMARY:`);
  console.log(`  Total profiles: ${profiles?.length ?? 0}`);
  console.log(`  Total with gameplay data (money>0 or tick>0): ${totalWithGameData}`);
  console.log(`  Total locked accounts: ${totalLocked}`);
  console.log(`  Total guest accounts: ${totalGuests}`);
  console.log(`  Total guest_identities records: ${identities?.length ?? 0}`);
  console.log(`  Total auth.users: ${authUsers?.length ?? 0}`);
}

main().catch(console.error);
