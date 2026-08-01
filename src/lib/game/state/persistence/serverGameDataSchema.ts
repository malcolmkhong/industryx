import type { ServerGameData } from "@/lib/game/shared/types/types";

type UnknownRecord = Record<string, unknown>;

export const REQUIRED_SERVER_GAME_DATA_FIELDS = [
  "money",
  "totalMoneyEarned",
  "gameTick",
  "gameSpeed",
  "paused",
  "resources",
  "resourceCapacity",
  "buildings",
  "transportLines",
  "powerGrid",
  "researchPoints",
  "completedResearch",
  "activeResearch",
  "researchProgress",
  "researchQueue",
  "workers",
  "sectorTrends",
  "marketNews",
  "marketNarratives",
  "contracts",
  "completedContracts",
  "automationUnlocks",
  "prestigeState",
  "activeEvents",
  "eventLog",
  "stats",
  "blueprints",
  "productionHistory",
  "autoSellResources",
  "storageUpgradeLevels",
  "lastOnlineTimestamp",
  "loginStreak",
  "weather",
  "quests",
  "payoutConfig",
  "pendingPayout",
  "payoutHistory",
  "trackedQuest",
  "drones",
] as const satisfies readonly (keyof ServerGameData)[];

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRecordOfFiniteNumbers(value: unknown): value is UnknownRecord {
  return isRecord(value) && Object.values(value).every(isFiniteNumber);
}

function isArrayOfRecords(value: unknown): value is UnknownRecord[] {
  return Array.isArray(value) && value.every(isRecord);
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isValidPowerGrid(value: unknown): boolean {
  return (
    isRecord(value) &&
    isFiniteNumber(value.totalProduction) &&
    isFiniteNumber(value.totalConsumption) &&
    isFiniteNumber(value.efficiency) &&
    typeof value.overload === "boolean" &&
    isArrayOfRecords(value.plants)
  );
}

function isValidStats(value: unknown): boolean {
  return (
    isRecord(value) &&
    isRecordOfFiniteNumbers(value.totalResourcesProduced) &&
    isRecordOfFiniteNumbers(value.totalResourcesSold) &&
    [
      "peakEfficiency",
      "factoriesBuilt",
      "transportLinesBuilt",
      "researchCompleted",
      "contractsCompleted",
      "tradesCompleted",
      "playTime",
    ].every((key) => isFiniteNumber(value[key]))
  );
}

function isValidPrestigeState(value: unknown): boolean {
  return (
    isRecord(value) &&
    isFiniteNumber(value.corporationPoints) &&
    isFiniteNumber(value.totalPrestiges) &&
    typeof value.megaFactoryUnlocked === "boolean" &&
    isArrayOfRecords(value.bonuses)
  );
}

function isValidLoginStreak(value: unknown): boolean {
  return (
    isRecord(value) &&
    isFiniteNumber(value.currentStreak) &&
    isFiniteNumber(value.longestStreak) &&
    typeof value.lastLoginDate === "string" &&
    isFiniteNumber(value.totalLogins) &&
    isArrayOfRecords(value.weeklyRewards)
  );
}

function isValidWeather(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.current === "string" &&
    ["clear", "rainy", "stormy", "sunny", "foggy", "snowy"].includes(
      value.current,
    ) &&
    isFiniteNumber(value.intensity) &&
    isFiniteNumber(value.remaining) &&
    isFiniteNumber(value.nextChange)
  );
}

function isValidPayoutConfig(value: unknown): boolean {
  return (
    isRecord(value) &&
    isFiniteNumber(value.basePayoutInterval) &&
    isFiniteNumber(value.lastPayoutTick) &&
    isFiniteNumber(value.totalPayoutsReceived) &&
    typeof value.autoCollect === "boolean"
  );
}

function isValidDrones(value: unknown): boolean {
  return (
    isRecord(value) &&
    isArrayOfRecords(value.fleet) &&
    isFiniteNumber(value.completedMissions) &&
    isFiniteNumber(value.totalEarned)
  );
}

function isValidServerMarket(value: unknown): boolean {
  if (value === undefined) return true;
  return (
    isRecord(value) &&
    isArrayOfRecords(value.prices) &&
    isArrayOfRecords(value.news) &&
    isFiniteNumber(value.tick) &&
    isFiniteNumber(value.volatility)
  );
}

/** Runtime schema for the complete server-owned gameplay payload. */
export function isValidServerGameData(value: unknown): value is ServerGameData {
  if (
    !isRecord(value) ||
    !REQUIRED_SERVER_GAME_DATA_FIELDS.every((key) => key in value)
  )
    return false;

  const recordArrays = [
    "buildings",
    "transportLines",
    "workers",
    "marketNews",
    "marketNarratives",
    "contracts",
    "automationUnlocks",
    "activeEvents",
    "eventLog",
    "blueprints",
    "productionHistory",
    "quests",
    "payoutHistory",
  ];
  const finiteFields = [
    "money",
    "totalMoneyEarned",
    "gameTick",
    "gameSpeed",
    "researchPoints",
    "researchProgress",
    "completedContracts",
    "lastOnlineTimestamp",
    "pendingPayout",
  ];

  return (
    finiteFields.every((key) => isFiniteNumber(value[key])) &&
    typeof value.paused === "boolean" &&
    isRecordOfFiniteNumbers(value.resources) &&
    isRecordOfFiniteNumbers(value.resourceCapacity) &&
    isRecordOfFiniteNumbers(value.storageUpgradeLevels) &&
    recordArrays.every((key) => isArrayOfRecords(value[key])) &&
    isStringArray(value.completedResearch) &&
    isStringArray(value.researchQueue) &&
    isStringArray(value.autoSellResources) &&
    isNullableString(value.activeResearch) &&
    isNullableString(value.trackedQuest) &&
    isRecord(value.sectorTrends) &&
    Object.values(value.sectorTrends).every(
      (trend) => trend === "up" || trend === "down" || trend === "stable",
    ) &&
    isValidPowerGrid(value.powerGrid) &&
    isValidStats(value.stats) &&
    isValidPrestigeState(value.prestigeState) &&
    isValidLoginStreak(value.loginStreak) &&
    isValidWeather(value.weather) &&
    isValidPayoutConfig(value.payoutConfig) &&
    isValidDrones(value.drones) &&
    isValidServerMarket(value.serverMarket)
  );
}
