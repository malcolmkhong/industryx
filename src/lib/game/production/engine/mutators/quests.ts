// Server-authoritative quest mutations (collect payout + claim quest).
//
// Assumes validator verified: pending payout > 0, quest exists + completed +
// unclaimed + reward valid.

import { WEATHER_DEFS } from "@/lib/game/config/configCache";
import type { ServerGameData, WeatherType } from "../../../shared/types/types";

// Weather-driven reward scaling (server-authoritative).
//
// Every quest reward claim is multiplied by the current weather's
// production_multiplier from game_config_weather (mirrored into runtime
// WEATHER_DEFS). clear=1.0 (no change), sunny=1.05 (+5%), stormy=0.75
// (-25%), etc. The function is a pure mutator — the caller passes the
// authoritative state in and reads WEATHER_DEFS, which is populated by
// the same updateFromSupabase() that flows through every server handler.
//
// `round2()` floors floats to 2dp to keep wallet_transactions.amount
// reproducible; the client previews the same formula and reconciles on
// the server's corrected state.
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function applyCollectPayoutMutation(
  _input: void,
  state: Partial<ServerGameData>,
): Partial<ServerGameData> {
  const pendingPayout = state.pendingPayout ?? 0;
  const money = state.money ?? 0;
  const totalMoneyEarned = state.totalMoneyEarned ?? 0;

  return {
    money: money + pendingPayout,
    totalMoneyEarned: totalMoneyEarned + pendingPayout,
    pendingPayout: 0,
  };
}

export interface ClaimQuestMutationInput {
  questIdx: number;
}

export function applyClaimQuestMutation(
  input: ClaimQuestMutationInput,
  state: Partial<ServerGameData>,
): Partial<ServerGameData> {
  const { questIdx } = input;
  const quests = state.quests ?? [];
  const quest = quests[questIdx];
  const reward = quest.reward;

  const money = state.money ?? 0;
  const totalMoneyEarned = state.totalMoneyEarned ?? 0;
  const researchPoints = state.researchPoints ?? 0;
  const corpPoints = state.prestigeState?.corporationPoints ?? 0;

  // Weather-modified payout — read the current weather (mirrors
  // player_progress.weather.current) and apply its production multiplier
  // to both money and researchPoints. corpPoints stay flat: prestige
  // rewards shouldn't be eroded by an unlucky storm.
  const weatherKey: WeatherType = (state.weather?.current ?? "clear") as WeatherType;
  const weatherDef = WEATHER_DEFS?.[weatherKey];
  const weatherMult: number =
    weatherDef && Number.isFinite(weatherDef.productionMultiplier)
      ? weatherDef.productionMultiplier
      : 1;
  const finalMoney = round2(reward.money * weatherMult);
  const finalResearchPoints =
    reward.researchPoints != null ? round2(reward.researchPoints * weatherMult) : 0;

  const updatedQuest = { ...quest, claimed: true };
  const nextQuests = quests.map((q, i) => (i === questIdx ? updatedQuest : q));

  return {
    money: money + finalMoney,
    totalMoneyEarned: totalMoneyEarned + finalMoney,
    researchPoints: researchPoints + finalResearchPoints,
    quests: nextQuests,
    prestigeState: {
      totalPrestiges: state.prestigeState?.totalPrestiges ?? 0,
      megaFactoryUnlocked: state.prestigeState?.megaFactoryUnlocked ?? false,
      bonuses: state.prestigeState?.bonuses ?? [],
      corporationPoints: corpPoints + (reward.corporationPoints ?? 0),
    },
  };
}