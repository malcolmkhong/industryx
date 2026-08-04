/**
 * Autonoma test-data — singleton global state factories.
 *
 * `server_market_state`, `server_weather_state` are singletons: at
 * most one live row exists. The factories insert side-by-side and
 * share the existing row when both concurrent runs collide.
 *
 * `global_weather_schedule` and `global_market_event_schedule` have a
 * text `id` PK; per-run salt avoids collisions.
 *
 * `app_config` is a key/value table; per-run key suffix avoids
 * collisions.
 */

import { defineFactory } from "@autonoma-ai/sdk";
import { z } from "zod";

import { ref, requireDb, rid } from "./helpers";

// ─── server_market_state ────────────────────────────────────────────────

export const serverMarketStateFactory = defineFactory({
  inputSchema: z.object({
    _alias: z.string().optional(),
    tick: z.number().default(4520),
    volatility: z.number().default(0.15),
    prices: z.record(z.string(), z.number()).default({}),
    basePrices: z.record(z.string(), z.number()).default({}),
    news: z.array(z.unknown()).default([]),
  }),
  refSchema: z.object({ id: z.number() }),
  create: async (data) => {
    const supabase = requireDb();
    try {
      const { data: row, error } = await supabase
        .from("server_market_state")
        .insert({
          id: 2,
          tick: data.tick,
          volatility: data.volatility,
          prices: data.prices,
          base_prices: data.basePrices,
          news: data.news,
        })
        .select("id")
        .single();
      if (error) throw error;
      return ref({ id: row.id });
    } catch {
      const { data: existing } = await supabase
        .from("server_market_state")
        .select("id")
        .eq("id", 2)
        .maybeSingle();
      return ref({ id: existing?.id ?? 2 });
    }
  },
  teardown: async () => {
    // See IMPLEMENTATION.md: never delete the global singleton.
  },
});

// ─── server_weather_state ───────────────────────────────────────────────

export const serverWeatherStateFactory = defineFactory({
  inputSchema: z.object({
    _alias: z.string().optional(),
    currentWeatherId: z.string(),
    intensity: z.number().default(0.0),
    nextChangeAt: z.string(),
  }),
  refSchema: z.object({ id: z.number(), current_weather: z.string() }),
  create: async (data) => {
    const supabase = requireDb();
    const nowIso = new Date().toISOString();
    try {
      const { data: row, error } = await supabase
        .from("server_weather_state")
        .insert({
          id: 2,
          current_weather: data.currentWeatherId,
          intensity: data.intensity,
          started_at: nowIso,
          next_change_at: data.nextChangeAt,
        })
        .select("id,current_weather")
        .single();
      if (error) throw error;
      return ref({ id: row.id, current_weather: row.current_weather });
    } catch {
      const { data: existing } = await supabase
        .from("server_weather_state")
        .select("id,current_weather")
        .eq("id", 2)
        .maybeSingle();
      return ref({
        id: existing?.id ?? 2,
        current_weather: existing?.current_weather ?? data.currentWeatherId,
      });
    }
  },
  teardown: async () => {
    // See IMPLEMENTATION.md.
  },
});

// ─── app_config — PK = key text; per-run suffix ───────────────────────

export const appConfigFactory = defineFactory({
  inputSchema: z.object({
    _alias: z.string().optional(),
    key: z.string(),
    value: z.unknown(),
  }),
  refSchema: z.object({ id: z.string(), key: z.string() }),
  create: async (data, ctx) => {
    const supabase = requireDb();
    const key = rid(ctx, `app-${data.key}`);
    const { data: row, error } = await supabase
      .from("app_config")
      .upsert({ key, value: data.value as never }, { onConflict: "key" })
      .select("key")
      .single();
    if (error) throw new Error(`[autonoma] app_config: ${error.message}`);
    return ref({ id: row.key, key: row.key });
  },
  teardown: async (record) => {
    const supabase = requireDb();
    await supabase.from("app_config").delete().eq("key", record.key);
  },
});

// ─── global_weather_schedule — text id PK ──────────────────────────────

export const globalWeatherScheduleFactory = defineFactory({
  inputSchema: z.object({
    _alias: z.string().optional(),
    minDurationSeconds: z.number().default(1800),
    maxDurationSeconds: z.number().default(3600),
    minIntensity: z.number().default(0.0),
    maxIntensity: z.number().default(1.0),
  }),
  refSchema: z.object({ id: z.string() }),
  create: async (data) => {
    const supabase = requireDb();
    const id = "global";
    const max = Math.min(data.maxDurationSeconds, 3600);
    const min = Math.max(data.minDurationSeconds, 1800);
    const { data: row, error } = await supabase
      .from("global_weather_schedule")
      .upsert(
        {
          id,
          min_duration_seconds: min,
          max_duration_seconds: Math.max(max, min),
          min_intensity: data.minIntensity,
          max_intensity: data.maxIntensity,
        },
        { onConflict: "id" },
      )
      .select("id")
      .single();
    if (error)
      throw new Error(`[autonoma] global_weather_schedule: ${error.message}`);
    return ref({ id: row.id });
  },
  teardown: async (record) => {
    const supabase = requireDb();
    await supabase.from("global_weather_schedule").delete().eq("id", record.id);
  },
});

// ─── global_market_event_schedule — text id PK ────────────────────────

export const globalMarketEventScheduleFactory = defineFactory({
  inputSchema: z.object({
    _alias: z.string().optional(),
    checkIntervalSeconds: z.number().default(60),
    triggerChance: z.number().default(0.5),
    cooldownSeconds: z.number().default(3600),
  }),
  refSchema: z.object({ id: z.string() }),
  create: async (data) => {
    const supabase = requireDb();
    const id = "global";
    const { data: row, error } = await supabase
      .from("global_market_event_schedule")
      .upsert(
        {
          id,
          check_interval_seconds: data.checkIntervalSeconds,
          trigger_chance: data.triggerChance,
          max_active_events: 1,
          cooldown_seconds: data.cooldownSeconds,
        },
        { onConflict: "id" },
      )
      .select("id")
      .single();
    if (error)
      throw new Error(
        `[autonoma] global_market_event_schedule: ${error.message}`,
      );
    return ref({ id: row.id });
  },
  teardown: async (record) => {
    const supabase = requireDb();
    await supabase
      .from("global_market_event_schedule")
      .delete()
      .eq("id", record.id);
  },
});
