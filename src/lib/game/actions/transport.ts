import type { TransportType, TransportLine, ResourceType } from "../types";
import { TRANSPORT_DEFS } from "../configCache";
import { generateId } from "../utils/generateId";
import { formatNumber } from "../utils/formatNumber";
import { getBalance } from "../balanceConfig";
import { soundEngine } from "../soundEngine";
import { buildMultipliers } from "../productionCalculator";

// Inline: translate server technical error → user-friendly text.
function friendlyTransportError(serverError: string | undefined): string {
  const e = serverError ?? "";
  if (e.includes("Transport type") && e.includes("not found in config"))
    return "That transport type is not available.";
  if (e.includes("Source building") && e.includes("not found"))
    return "Source building no longer exists.";
  if (e.includes("Destination building") && e.includes("not found"))
    return "Destination building no longer exists.";
  if (e.includes("Transport line") && e.includes("not found"))
    return "Transport line no longer exists.";
  if (e.includes("Not enough money for transport"))
    return "Not enough money to build transport.";
  if (e.includes("Not enough money to upgrade"))
    return "Not enough money to upgrade transport.";
  return e || "Transport action could not be completed. Please try again.";
}

type SetFn = (
  partial: Record<string, unknown> | ((state: any) => Record<string, unknown>),
) => void;
type GetFn = () => any;

export function createTransportActions(set: SetFn, get: GetFn) {
  return {
    buildTransportLine: async (
      type: TransportType,
      from: string,
      to: string,
      resource: ResourceType,
    ) => {
      const state = get();
      const def = TRANSPORT_DEFS[type];
      if (!def) return;

      const localCost = def.baseCost.reduce(
        (sum, c) => sum + (c.resource === "money" ? c.amount : 0),
        0,
      );

      // Phase 6: server-authoritative transport line build. Server validates
      // buildings, transport type, money, and returns authoritative post-build
      // state with the new line, money, and stats.
      const validation = await import("../actionValidator").then((m) =>
        m.validateActionWithServer(
          "transport",
          {
            transportType: type,
            fromBuildingId: from,
            toBuildingId: to,
            resource,
          },
          generateId(),
        ),
      );
      if (!validation.approved) {
        soundEngine.play("error", "ui");
        // eslint-disable-next-line no-console
        console.error(
          `[buildTransportLine] server rejected: ${validation.error}`,
        );
        get().addNotification("error", friendlyTransportError(validation.error));
        return;
      }

      // Apply server-authoritative state. Fallback to local if server omits.
      const corrected = validation.correctedState;
      const serverLines = corrected?.transportLines as unknown[] as
        TransportLine[] | undefined;
      const serverMoney = corrected?.money ?? state.money - localCost;
      const cache = buildMultipliers(state);
      const transportBonus = cache.transportThroughputBonus;

      if (serverLines && serverLines.length > 0) {
        const newLine = serverLines[serverLines.length - 1];
        // Re-apply transport bonus locally (server doesn't apply research
        // multipliers in current scope decision). This keeps display parity.
        const withBonus: TransportLine = {
          ...newLine,
          throughput: newLine.throughput * (1 + transportBonus),
        };
        set({
          money: serverMoney,
          transportLines: [...state.transportLines, withBonus],
          stats: {
            ...state.stats,
            transportLinesBuilt:
              (corrected?.stats as { transportLinesBuilt?: number })
                ?.transportLinesBuilt ?? state.stats.transportLinesBuilt + 1,
          },
        });
      } else {
        // Local fallback (server returned no correctedState)
        const line: TransportLine = {
          id: generateId(),
          type,
          level: 1,
          fromBuilding: from,
          toBuilding: to,
          carriesResource: resource,
          throughput: def.baseThroughput * (1 + transportBonus),
          maxThroughput: def.baseThroughput * 3,
          active: true,
        };
        set({
          money: state.money - localCost,
          transportLines: [...state.transportLines, line],
          stats: {
            ...state.stats,
            transportLinesBuilt: state.stats.transportLinesBuilt + 1,
          },
        });
      }
      soundEngine.play("buildingPlaced", "building");
      get().addNotification(
        "success",
        `Built ${def.name} for $${formatNumber(localCost)}`,
      );
      get().updateQuestProgress("transport", 1);
    },

    upgradeTransportLine: async (id: string) => {
      const state = get();
      const line = state.transportLines.find((l) => l.id === id);
      if (!line) return;

      const def = TRANSPORT_DEFS[line.type];
      const localCost = Math.floor(
        def.baseCost.reduce(
          (sum, c) => sum + (c.resource === "money" ? c.amount : 0),
          0,
        ) * Math.pow(getBalance().transport.upgradeCostExponent, line.level),
      );

      // Phase 6: server-authoritative upgrade. Server computes scaled cost
      // from current level and new throughput; returns authoritative
      // post-upgrade state.
      const validation = await import("../actionValidator").then((m) =>
        m.validateActionWithServer(
          "upgrade_transport_line",
          { lineId: id },
          generateId(),
        ),
      );
      if (!validation.approved) {
        // eslint-disable-next-line no-console
        console.error(
          `[upgradeTransportLine] server rejected: ${validation.error}`,
        );
        get().addNotification("error", friendlyTransportError(validation.error));
        return;
      }

      const corrected = validation.correctedState;
      const serverLines = corrected?.transportLines as unknown[] as
        TransportLine[] | undefined;
      const serverMoney = corrected?.money ?? state.money - localCost;
      const cache = buildMultipliers(state);
      const transportBonus = cache.transportThroughputBonus;

      if (serverLines) {
        set({
          money: serverMoney,
          transportLines: state.transportLines.map((l) => {
            const fromServer = serverLines.find((sl) => sl.id === l.id);
            if (!fromServer) return l;
            return {
              ...fromServer,
              // Re-apply research bonus locally for display
              throughput: fromServer.throughput * (1 + transportBonus),
            };
          }),
        });
      } else {
        // Local fallback
        set({
          money: state.money - localCost,
          transportLines: state.transportLines.map((l) =>
            l.id === id
              ? {
                  ...l,
                  level: l.level + 1,
                  throughput: Math.min(
                    l.maxThroughput,
                    def.baseThroughput *
                      Math.pow(def.upgradeMultiplier, l.level) *
                      (1 + transportBonus),
                  ),
                }
              : l,
          ),
        });
      }
    },

    toggleTransportLine: (id: string) => {
      const state = get();
      set({
        transportLines: state.transportLines.map((l) =>
          l.id === id ? { ...l, active: !l.active } : l,
        ),
      });
    },
  };
}
