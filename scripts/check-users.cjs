/**
 * Check all users — device IDs, fingerprints, gameplay data
 * Run: node scripts/check-users.cjs
 *
 * Schema:
 *   profiles.id = auth.users.id = server_game_state.user_id = guest_identities.user_id
 *   profiles.device_fingerprint (backup link)
 *   guest_identities has device_id, fingerprint, is_primary, claimed_at, superseded_by
 */

const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const env = fs.readFileSync(".env", "utf8");
const getEnv = (k) =>
  (env.match(new RegExp(k + "=(.+)")) || ["", ""])[1].trim();

const SB_URL = getEnv("NEXT_PUBLIC_SUPABASE_URL");
const SB_SERVICE_KEY = getEnv("SUPABASE_SERVICE_ROLE_KEY");

const sb = createClient(SB_URL, SB_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  console.log("Fetching data from Supabase...\n");

  // 1. Profiles (id = auth.users.id)
  const { data: profiles, error: pe } = await sb
    .from("profiles")
    .select("id, display_name, is_guest, device_fingerprint, created_at")
    .order("created_at");
  if (pe) {
    console.error("Profiles error:", pe);
    return;
  }

  // 2. Server game states
  const { data: gs, error: gse } = await sb
    .from("server_game_state")
    .select(
      "user_id, money, total_money_earned, game_tick, game_speed, buildings_count, is_locked, last_saved_at, created_at",
    )
    .order("created_at");
  if (gse) {
    console.error("Game state error:", gse);
    return;
  }

  // 3. Guest identities
  const { data: ids, error: ide } = await sb
    .from("guest_identities")
    .select(
      "user_id, device_id, fingerprint, is_primary, claimed_at, superseded_by, created_at",
    )
    .order("created_at");
  if (ide) {
    console.error("Identities error:", ide);
    return;
  }

  // 4. Auth users (provider info)
  const { data: auth, error: ae } = await sb
    .from("auth.users")
    .select("id, email, providers, is_anonymous, last_sign_in_at")
    .order("created_at");
  if (ae) {
    console.error("Auth error:", ae);
  }

  // Build maps
  const gsMap = new Map((gs ?? []).map((g) => [g.user_id, g]));
  const authMap = new Map((auth ?? []).map((a) => [a.id, a]));
  const idMap = new Map();
  for (const id of ids ?? []) {
    if (!idMap.has(id.user_id)) idMap.set(id.user_id, []);
    idMap.get(id.user_id).push(id);
  }

  console.log("═".repeat(80));
  console.log(`USER AUDIT (${profiles?.length ?? 0} profiles)`);
  console.log("═".repeat(80));

  for (const p of profiles ?? []) {
    const g = gsMap.get(p.id);
    const a = authMap.get(p.id);
    const userIds = idMap.get(p.id) ?? [];

    const hasGame = g && (Number(g.money) > 0 || Number(g.game_tick) > 0);

    console.log(`\n▸ ${p.display_name ?? "(no name)"}`);
    console.log(`  Auth/Profile ID: ${p.id}`);
    console.log(`  Email: ${a?.email ?? "N/A"}`);
    console.log(`  Provider: ${a?.providers ?? "N/A"}`);
    console.log(`  is_anonymous: ${a?.is_anonymous ?? false}`);
    console.log(`  is_guest: ${p.is_guest}`);
    console.log(
      `  device_fingerprint (profiles): ${p.device_fingerprint ? p.device_fingerprint.substring(0, 25) + "..." : "null"}`,
    );
    console.log(`  Created: ${p.created_at}`);

    console.log(`\n  GUEST IDENTITIES (${userIds.length}):`);
    if (userIds.length === 0) {
      console.log(`    (none)`);
    } else {
      for (const id of userIds) {
        const flag = id.superseded_by
          ? " ⚠️ SUPERSEDED"
          : id.is_primary
            ? " ✅ PRIMARY"
            : "";
        console.log(`    device_id: ${id.device_id ?? "null"}${flag}`);
        console.log(
          `    fingerprint: ${id.fingerprint ? id.fingerprint.substring(0, 25) + "..." : "null"}`,
        );
        console.log(`    claimed_at: ${id.claimed_at ?? "NOT CLAIMED"}`);
        console.log(`    superseded_by: ${id.superseded_by ?? "-"}`);
        console.log("");
      }
    }

    console.log(`  GAMEPLAY:`);
    if (!g) {
      console.log(`    ❌ NO server_game_state`);
    } else {
      const money = Number(g.money ?? 0);
      const tick = Number(g.game_tick ?? 0);
      const bldg = Number(g.buildings_count ?? 0);
      const status = money > 0 || tick > 0 ? "✅ HAS DATA" : "⚠️  EMPTY";
      console.log(
        `    money: ${money} | tick: ${tick} | buildings: ${bldg} | ${status}`,
      );
      console.log(
        `    speed: ${g.game_speed ?? "N/A"} | locked: ${g.is_locked ?? false}`,
      );
      console.log(`    last_saved: ${g.last_saved_at ?? "never"}`);
    }

    console.log("─".repeat(80));
  }

  // Summary
  const totalGame = (gs ?? []).filter(
    (g) => Number(g.money) > 0 || Number(g.game_tick) > 0,
  ).length;
  const totalLocked = (gs ?? []).filter((g) => g.is_locked).length;
  const totalGuest = (profiles ?? []).filter((p) => p.is_guest).length;
  const totalSuperseded = (ids ?? []).filter((id) => id.superseded_by).length;
  const totalPrimary = (ids ?? []).filter(
    (id) => id.is_primary && !id.superseded_by,
  ).length;

  console.log(`\nSUMMARY:`);
  console.log(`  Total profiles:          ${profiles?.length ?? 0}`);
  console.log(`  With gameplay data:       ${totalGame}`);
  console.log(`  Locked accounts:         ${totalLocked}`);
  console.log(`  Guest accounts:          ${totalGuest}`);
  console.log(`  Identity records:        ${ids?.length ?? 0}`);
  console.log(`  Primary identities:      ${totalPrimary}`);
  console.log(`  Superseded identities:   ${totalSuperseded}`);
  console.log(`  Auth users:             ${auth?.length ?? 0}`);
}

main().catch((e) => {
  console.error("Fatal:", e.message);
  process.exit(1);
});
