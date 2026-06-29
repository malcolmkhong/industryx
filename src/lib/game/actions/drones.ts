import type { Drone, DroneMission, ResourceType } from '../types';
import { BUILDING_DEFS } from '../configCache';
import { soundEngine } from '../soundEngine';
import { generateId } from '../utils/generateId';
import { formatNumber } from '../utils/formatNumber';
import { getBalance } from '../balanceConfig';
import { generateDroneMissionsFromState } from '../utils/saveMigration';

type SetFn = (partial: Record<string, unknown> | ((state: any) => Record<string, unknown>)) => void;
type GetFn = () => any;

export function createDroneActions(set: SetFn, get: GetFn) {
  return {
    buyDrone: () => {
      const state = get();
      const cost = 2000 * state.drones.fleet.length;
      if (state.money < cost) {
        soundEngine.play('error', 'building');
        get().addNotification('error', `Not enough money to buy drone. Need $${formatNumber(cost)}`);
        return;
      }
      const newDrone: Drone = {
        id: generateId(),
        status: 'idle',
        missionEndTick: 0,
        missionId: null,
        speedLevel: 1,
        capacityLevel: 1,
        fuelEfficiencyLevel: 1,
      };
      set({
        money: state.money - cost,
        drones: {
          ...state.drones,
          fleet: [...state.drones.fleet, newDrone],
        },
      });
      soundEngine.play('buildingPlaced', 'building');
      get().addNotification('success', `🚁 New drone purchased for $${formatNumber(cost)}`);
    },

    sendDrone: async (missionId: string, droneId: string) => {
      const state = get();
      const drone = state.drones.fleet.find(d => d.id === droneId);
      if (!drone || drone.status !== 'idle') return;

      // Generate missions to find the one with matching id
      const missions = generateDroneMissionsFromState(state);
      const mission = missions.find(m => m.id === missionId);
      if (!mission) return;

      // Calculate fuel cost with efficiency upgrade
      const fuelCost = Math.ceil(mission.fuelCost / (1 + (drone.fuelEfficiencyLevel - 1) * getBalance().drone.fuelEfficiencyUpgradeCoeff));
      if (state.money < fuelCost) {
        soundEngine.play('error', 'building');
        get().addNotification('error', `Not enough money for fuel. Need $${formatNumber(fuelCost)}`);
        return;
      }

      const validation = await import('../actionValidator').then(m =>
        m.validateActionWithServer('start_drone_mission', { missionId, droneId }, generateId())
      );
      if (!validation.approved) {
        soundEngine.play('error', 'building');
        get().addNotification('error', validation.error ?? 'Drone mission rejected by server');
        return;
      }

      // Calculate delivery time with speed upgrade
      const deliveryTicks = Math.max(10, Math.floor(mission.baseTicks / (1 + (drone.speedLevel - 1) * getBalance().drone.speedUpgradeCoeff)));

      const updatedFleet = state.drones.fleet.map(d =>
        d.id === droneId
          ? { ...d, status: 'delivering' as const, missionEndTick: state.gameTick + deliveryTicks, missionId }
          : d
      );

      set({
        money: state.money - fuelCost,
        drones: {
          ...state.drones,
          fleet: updatedFleet,
        },
      });
      soundEngine.play('buttonClick', 'building');
    },

    upgradeDrone: (droneId: string, type: 'speed' | 'capacity' | 'fuelEfficiency') => {
      const state = get();
      const drone = state.drones.fleet.find(d => d.id === droneId);
      if (!drone) return;

      const levelKey = type === 'speed' ? 'speedLevel' : type === 'capacity' ? 'capacityLevel' : 'fuelEfficiencyLevel';
      const currentLevel = drone[levelKey];
      if (currentLevel >= 5) {
        get().addNotification('warning', 'This drone upgrade is already at max level!');
        return;
      }

      const costMultiplier = type === 'speed' ? 500 : type === 'capacity' ? 800 : 600;
      const cost = costMultiplier * currentLevel;
      if (state.money < cost) {
        soundEngine.play('error', 'building');
        get().addNotification('error', `Not enough money for upgrade. Need $${formatNumber(cost)}`);
        return;
      }

      const updatedFleet = state.drones.fleet.map(d =>
        d.id === droneId
          ? { ...d, [levelKey]: currentLevel + 1 }
          : d
      );

      set({
        money: state.money - cost,
        drones: {
          ...state.drones,
          fleet: updatedFleet,
        },
      });
      soundEngine.play('buildingPlaced', 'building');
    },

    generateDroneMissions: () => {
      return generateDroneMissionsFromState(get());
    },
  };
}
