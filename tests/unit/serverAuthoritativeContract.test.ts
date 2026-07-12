// ============================================
// tests/unit/serverAuthoritativeContract.test.ts
//
// Phase 6, action #9: server-authoritative fulfillContract. Verifies
// the server validates resource affordability (money + non-money),
// deducts required resources, applies the reward (money + RP +
// corpPoints), marks the contract as completed, and increments
// completedContracts counter + stats.contractsCompleted.
//
// Income path: totalMoneyEarned increases by the money reward.
//
// Before this fix, fulfillContract was 100% client-side. A cheater
// could just call set({contracts: [{...completed: true}]}) to "fulfill"
// any contract without paying the cost.
// ============================================

import { describe, it, expect } from "vitest";
import { validateFulfillContractAction } from "@/lib/game/production/engine/serverEngine";
import type { GameState, Contract, ContractReward } from "@/lib/game/shared/types/types";

function makeReward(overrides?: Partial<ContractReward>): ContractReward {
  return {
    money: 1000,
    researchPoints: 0,
    corporationPoints: 0,
    ...overrides,
  } as ContractReward;
}

function makeContract(overrides?: Partial<Contract>): Contract {
  return {
    id: "c1",
    name: "Iron Delivery",
    description: "Deliver 100 iron.",
    type: "delivery",
    requiredResources: [{ resource: "iron", amount: 100 }],
    timeLimit: 1000,
    timeRemaining: 500,
    reward: makeReward({ money: 1500 }),
    progress: 0,
    completed: false,
    failed: false,
    difficulty: 2,
    icon: "test:contract",
    ...overrides,
  } as Contract;
}

function makeState(overrides?: {
  money?: number;
  totalMoneyEarned?: number;
  researchPoints?: number;
  resources?: Record<string, number>;
  contracts?: Contract[];
  completedContracts?: number;
  stats?: Partial<NonNullable<GameState["stats"]>>;
}): Partial<GameState> {
  const defaultStats: NonNullable<GameState["stats"]> = {
    totalResourcesProduced: {} as Record<string, number>,
    totalResourcesSold: {} as Record<string, number>,
    peakEfficiency: 0,
    factoriesBuilt: 0,
    transportLinesBuilt: 0,
    researchCompleted: 0,
    contractsCompleted: 0,
    playTime: 0,
  };
  return {
    money: overrides?.money ?? 5000,
    totalMoneyEarned: overrides?.totalMoneyEarned ?? 5000,
    gameTick: 100,
    researchPoints: overrides?.researchPoints ?? 0,
    resources: (overrides?.resources ?? { iron: 200, copper: 100 }) as Record<
      string,
      number
    >,
    contracts: overrides?.contracts ?? [makeContract()],
    completedContracts: overrides?.completedContracts ?? 0,
    stats: { ...defaultStats, ...overrides?.stats } as NonNullable<
      GameState["stats"]
    >,
    prestigeState: {
      corporationPoints: 0,
      totalPrestiges: 0,
      megaFactoryUnlocked: false,
      bonuses: [],
    },
  };
}

describe("validateFulfillContractAction (server-authoritative)", () => {
  it("returns valid + correctedState when player has required resources", () => {
    const state = makeState({ money: 5000 });
    const result = validateFulfillContractAction("c1", state);

    expect(result.valid).toBe(true);
    expect(result.correctedState).toBeDefined();
    // Resources deducted
    const resources = result.correctedState?.resources as Record<
      string,
      number
    >;
    expect(resources.iron).toBe(100); // 200 - 100
    // Money + reward
    expect(result.correctedState?.money).toBe(5000 + 1500);
    // totalMoneyEarned increased (income path)
    expect(result.correctedState?.totalMoneyEarned).toBe(5000 + 1500);
  });

  it("marks contract as completed with progress=1", () => {
    const state = makeState();
    const result = validateFulfillContractAction("c1", state);

    const contracts = result.correctedState?.contracts as Contract[];
    expect(contracts[0].completed).toBe(true);
    expect(contracts[0].progress).toBe(1);
  });

  it("increments completedContracts and stats.contractsCompleted", () => {
    const state = makeState({
      completedContracts: 5,
      stats: { contractsCompleted: 5 } as never,
    });
    const result = validateFulfillContractAction("c1", state);

    expect(result.correctedState?.completedContracts).toBe(6);
    const stats = result.correctedState?.stats as {
      contractsCompleted: number;
    };
    expect(stats.contractsCompleted).toBe(6);
  });

  it("applies RP and corpPoints rewards", () => {
    const state = makeState({
      researchPoints: 100,
    });
    const result = validateFulfillContractAction(
      "c1",
      makeState({
        researchPoints: 100,
        contracts: [
          makeContract({
            reward: makeReward({
              money: 500,
              researchPoints: 50,
              corporationPoints: 25,
            }),
          }),
        ],
      }),
    );

    expect(result.valid).toBe(true);
    expect(result.correctedState?.researchPoints).toBe(150); // 100 + 50
    const prestige = result.correctedState?.prestigeState as {
      corporationPoints: number;
    };
    expect(prestige.corporationPoints).toBe(25);
  });

  it("deducts money from money field when contract requires money", () => {
    const state = makeState({
      money: 1000,
      contracts: [
        makeContract({
          requiredResources: [{ resource: "money", amount: 500 }],
          reward: makeReward({ money: 800 }),
        }),
      ],
    });
    const result = validateFulfillContractAction("c1", state);

    expect(result.valid).toBe(true);
    // Net money: 1000 - 500 + 800 = 1300
    expect(result.correctedState?.money).toBe(1300);
  });

  it("rejects when player cannot afford non-money resources", () => {
    const state = makeState({
      resources: { iron: 50 } as Record<string, number>, // need 100, have 50
    });
    const result = validateFulfillContractAction("c1", state);

    expect(result.valid).toBe(false);
    expect(result.error).toContain("Not enough iron");
    expect(result.correctedState).toBeUndefined();
  });

  it("rejects when player cannot afford money requirement", () => {
    const state = makeState({
      money: 100,
      contracts: [
        makeContract({
          requiredResources: [{ resource: "money", amount: 500 }],
          reward: makeReward({ money: 800 }),
        }),
      ],
    });
    const result = validateFulfillContractAction("c1", state);

    expect(result.valid).toBe(false);
    expect(result.error).toContain("Not enough money to fulfill contract");
  });

  it("rejects non-existent contractId", () => {
    const state = makeState();
    const result = validateFulfillContractAction("c999", state);

    expect(result.valid).toBe(false);
    expect(result.error).toContain('Contract "c999" not found');
  });

  it("rejects double-fulfillment (already completed)", () => {
    const state = makeState({
      contracts: [makeContract({ completed: true })],
    });
    const result = validateFulfillContractAction("c1", state);

    expect(result.valid).toBe(false);
    expect(result.error).toContain("already completed");
  });

  it("rejects fulfillment of failed contract", () => {
    const state = makeState({
      contracts: [makeContract({ failed: true })],
    });
    const result = validateFulfillContractAction("c1", state);

    expect(result.valid).toBe(false);
    expect(result.error).toContain("already failed");
  });

  it("rejects missing contractId", () => {
    const state = makeState();
    const result = validateFulfillContractAction("", state);

    expect(result.valid).toBe(false);
    expect(result.error).toContain("Missing contractId");
  });

  it("rejects contract with invalid reward (negative money)", () => {
    const state = makeState({
      contracts: [makeContract({ reward: makeReward({ money: -100 }) })],
    });
    const result = validateFulfillContractAction("c1", state);

    expect(result.valid).toBe(false);
    expect(result.error).toContain("invalid reward");
  });

  it("server reads reward from state.contracts (not client payload)", () => {
    // State has a specific reward; client payload could lie.
    const state = makeState({
      contracts: [makeContract({ reward: makeReward({ money: 99999 }) })],
    });
    const result = validateFulfillContractAction("c1", state);

    expect(result.valid).toBe(true);
    expect(result.correctedState?.money).toBe(5000 + 99999);
  });

  it("preserves other contracts' state", () => {
    const state = makeState({
      contracts: [
        makeContract(),
        makeContract({ id: "c2", completed: false, progress: 0.5 }),
      ],
    });
    const result = validateFulfillContractAction("c1", state);

    const contracts = result.correctedState?.contracts as Contract[];
    expect(contracts[0].completed).toBe(true);
    expect(contracts[1].completed).toBe(false); // unchanged
    expect(contracts[1].progress).toBe(0.5); // unchanged
  });

  it("multi-resource contract: deducts all required resources", () => {
    const state = makeState({
      resources: { iron: 100, copper: 50 } as Record<string, number>,
      contracts: [
        makeContract({
          requiredResources: [
            { resource: "iron", amount: 100 },
            { resource: "copper", amount: 50 },
          ],
          reward: makeReward({ money: 2000 }),
        }),
      ],
    });
    const result = validateFulfillContractAction("c1", state);

    expect(result.valid).toBe(true);
    const resources = result.correctedState?.resources as Record<
      string,
      number
    >;
    expect(resources.iron).toBe(0);
    expect(resources.copper).toBe(0);
    expect(result.correctedState?.money).toBe(5000 + 2000);
  });
});
