import type { TransportType, TransportLine, ResourceType } from "../../shared/types/types";
import { TRANSPORT_DEFS } from "../../config/configCache";
import { generateId } from "../../shared/utils/generateId";
import { formatNumber } from "../../shared/utils/formatNumber";
import { soundEngine } from "../../audio/soundEngine";
import { buildMultipliers } from "../../production/productionCalculator";
import type { SetFn, GetFn } from "./_actionTypes";

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
      const validation = await import("../../actions/client/actionValidator").then((m) =>
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
        console.error(
          `[buildTransportLine] server rejected: ${validation.error}`,
        );
        get().addNotification("error", friendlyTransportError(validation.error));
        return;
      }

      const corrected = validation.correctedState;
      const serverLines = corrected?.transportLines as TransportLine[] | undefined;
      if (!corrected || !serverLines || typeof corrected.money !== "number") {
        soundEngine.play("error", "ui");
        get().addNotification(
          "error",
          "Transport build could not be confirmed by server. Please retry.",
        );
        return;
      }
      const serverMoney = corrected.money;
      const cache = buildMultipliers(state);
      const transportBonus = cache.transportThroughputBonus;

      const newLine = serverLines[serverLines.length - 1];
      if (!newLine) {
        soundEngine.play("error", "ui");
        get().addNotification(
          "error",
          "Transport build could not be confirmed by server. Please retry.",
        );
        return;
      }
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
            (corrected.stats as { transportLinesBuilt?: number } | undefined)
              ?.transportLinesBuilt ?? state.stats.transportLinesBuilt,
        },
      });
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

      // Phase 6: server-authoritative upgrade. Server computes scaled cost
      // from current level and new throughput; returns authoritative
      // post-upgrade state.
      const validation = await import("../../actions/client/actionValidator").then((m) =>
        m.validateActionWithServer(
          "upgrade_transport_line",
          { lineId: id },
          generateId(),
        ),
      );
      if (!validation.approved) {
        console.error(
          `[upgradeTransportLine] server rejected: ${validation.error}`,
        );
        get().addNotification("error", friendlyTransportError(validation.error));
        return;
      }

      const corrected = validation.correctedState;
      const serverLines = corrected?.transportLines as TransportLine[] | undefined;
      if (!corrected || !serverLines || typeof corrected.money !== "number") {
        soundEngine.play("error", "ui");
        get().addNotification(
          "error",
          "Transport upgrade could not be confirmed by server. Please retry.",
        );
        return;
      }
      const serverMoney = corrected.money;
      const cache = buildMultipliers(state);
      const transportBonus = cache.transportThroughputBonus;

      set({
        money: serverMoney,
        transportLines: state.transportLines.map((l) => {
          const fromServer = serverLines.find((sl) => sl.id === l.id);
          if (!fromServer) return l;
          return {
            ...fromServer,
            throughput: fromServer.throughput * (1 + transportBonus),
          };
        }),
      });
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
