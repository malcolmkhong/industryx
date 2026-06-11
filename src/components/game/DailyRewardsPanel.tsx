'use client';

import { useGameStore, formatNumber } from '@/lib/game/store';
import { RESOURCE_META, getStreakMultiplier } from '@/lib/game/configCache';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Gift, Flame, Lock, Check, Sparkles, Trophy, Calendar, TrendingUp } from 'lucide-react';
import { useReducedMotion } from '@/components/game/shared/useReducedMotion';
import { GameIcon } from '@/components/game/shared/GameIcon';

export default function DailyRewardsPanel() {
  const store = useGameStore();
  const { loginStreak, claimDailyReward } = store;
  const prefersReducedMotion = useReducedMotion();

  const currentDay = ((loginStreak.currentStreak - 1) % 7) + 1;
  const multiplier = getStreakMultiplier(loginStreak.currentStreak);

  const getRewardIcon = (type: string, isJackpot: boolean) => {
    if (isJackpot) return <GameIcon icon="gi:slot-machine" size={24} />;
    switch (type) {
      case 'money': return <GameIcon icon="gi:money-stack" size={24} />;
      case 'researchPoints': return <GameIcon icon="gi:erlenmeyer" size={24} />;
      case 'resources': return <GameIcon icon="gi:cardboard-box" size={24} />;
      case 'corporationPoints': return <GameIcon icon="gi:trophy" size={24} />;
      default: return <GameIcon icon="gi:present" size={24} />;
    }
  };

  const getRewardDescription = (reward: typeof loginStreak.weeklyRewards[0]) => {
    const isJackpot = reward.day === 7;
    switch (reward.type) {
      case 'money':
        return isJackpot ? `$${formatNumber(reward.amount)} + $2,000` : `$${formatNumber(reward.amount)}`;
      case 'researchPoints':
        return `${reward.amount} RP`;
      case 'resources':
        return reward.resource ? `${reward.amount} ${RESOURCE_META[reward.resource]?.name ?? reward.resource}` : `${reward.amount} Resources`;
      case 'corporationPoints':
        return `${reward.amount} CP${isJackpot ? ' + $2,000' : ''}`;
      default:
        return '???';
    }
  };

  const getStreakColor = () => {
    if (loginStreak.currentStreak >= 7) return 'text-fuchsia-400';
    if (loginStreak.currentStreak >= 5) return 'text-orange-400';
    if (loginStreak.currentStreak >= 3) return 'text-yellow-400';
    return 'text-gray-400';
  };

  const nextDayLogin = loginStreak.currentStreak + 1;
  const nextDayOfWeek = ((nextDayLogin - 1) % 7) + 1;
  const nextReward = loginStreak.weeklyRewards.find(r => r.day === nextDayOfWeek);
  const nextRewardDesc = nextReward ? getRewardDescription(nextReward) : 'Day 1 Reward';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center shadow-[0_0_12px_rgba(236,72,153,0.3)]">
          <Gift className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-pink-400 tracking-wider neon-glow-cyan">DAILY REWARDS</h2>
          <p className="text-xs text-gray-500">Log in daily for streak bonuses!</p>
        </div>
      </div>

      {/* Streak Counter */}
      <div className="bg-card border border-pink-900/30 rounded-xl p-4 flex flex-col sm:flex-row items-center gap-4">
        <div className="flex items-center gap-3">
          <div className={`text-3xl ${getStreakColor()} transition-colors`}>
            <GameIcon icon="gi:flame" size={28} className="inline" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className={`text-2xl font-bold ${getStreakColor()}`}>
                {loginStreak.currentStreak}
              </span>
              <span className="text-gray-400 text-sm">Day Streak!</span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <TrendingUp className="w-3 h-3 text-pink-400" />
              <span className="text-xs text-pink-400">
                {multiplier > 1 ? `${multiplier}x Streak Bonus!` : 'Keep going for bonus!'}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4 sm:ml-auto">
          <div className="text-center px-3">
            <div className="text-xs text-gray-500">Longest</div>
            <div className="text-sm font-bold text-amber-400">{loginStreak.longestStreak} <GameIcon icon="gi:flame" size={14} className="inline" /></div>
          </div>
          <div className="w-px h-8 bg-gray-800" />
          <div className="text-center px-3">
            <div className="text-xs text-gray-500">Total Logins</div>
            <div className="text-sm font-bold text-gray-300">{loginStreak.totalLogins}</div>
          </div>
          <div className="w-px h-8 bg-gray-800" />
          <div className="text-center px-3">
            <div className="text-xs text-gray-500">Multiplier</div>
            <div className={`text-sm font-bold ${multiplier > 1 ? 'text-pink-400' : 'text-gray-400'}`}>
              {multiplier}x
            </div>
          </div>
        </div>
      </div>

      {/* Streak Progress Bar */}
      <div className="bg-card border border-pink-900/20 rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-400">Weekly Progress</span>
          <span className="text-xs text-pink-400">Day {currentDay} of 7</span>
        </div>
        <div className="flex gap-1">
          {Array.from({ length: 7 }, (_, i) => {
            const day = i + 1;
            const isCompleted = loginStreak.weeklyRewards.find(r => r.day === day)?.claimed;
            const isCurrent = day === currentDay;
            return (
              <div
                key={day}
                className={`flex-1 h-2 rounded-full transition-all ${
                  isCompleted ? 'bg-pink-500' :
                  isCurrent ? `bg-pink-400/60${prefersReducedMotion ? '' : ' animate-pulse'}` :
                  'bg-gray-800'
                }`}
              />
            );
          })}
        </div>
        <div className="flex gap-1 mt-1">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="flex-1 text-center text-[9px] text-gray-400">
              {i + 1}
            </div>
          ))}
        </div>
      </div>

      {/* 7 Day Reward Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
        {loginStreak.weeklyRewards.map((reward) => {
          const isJackpot = reward.day === 7;
          const isToday = reward.day === currentDay;
          const isClaimed = reward.claimed;
          const isPast = reward.day < currentDay;
          const isFuture = reward.day > currentDay;

          return (
            <div
              key={reward.day}
              className={`
                relative rounded-xl p-3
                ${isJackpot && !isClaimed
                  ? 'bg-gradient-to-br from-amber-900/40 via-yellow-900/30 to-amber-900/40 border-2 border-amber-500/50 shadow-[0_0_20px_rgba(245,158,11,0.2)]'
                  : isToday && !isClaimed
                    ? 'bg-card border-2 border-pink-500/60 shadow-[0_0_16px_rgba(236,72,153,0.25)]'
                    : isClaimed
                      ? 'bg-[#0a0e17] border border-success/30 opacity-60'
                      : 'bg-card border border-gray-800'
                }
              `}
            >
              {/* Day Number */}
              <div className="flex items-center justify-between mb-2">
                <span className={`text-[10px] font-bold ${isJackpot ? 'text-amber-400' : isToday ? 'text-pink-400' : 'text-gray-500'}`}>
                  DAY {reward.day}
                </span>
                {isClaimed && (
                  <div className="w-5 h-5 rounded-full bg-success/50 flex items-center justify-center">
                    <Check className="w-3 h-3 text-success" />
                  </div>
                )}
                {isToday && !isClaimed && (
                  <Badge className="bg-pink-600 text-white text-[8px] h-4 px-1">
                    TODAY
                  </Badge>
                )}
                {isJackpot && !isClaimed && (
                  <Sparkles className="w-4 h-4 text-amber-400" />
                )}
              </div>

              {/* Reward Icon */}
              <div className="flex justify-center my-2">
                <span className="text-2xl">
                  {getRewardIcon(reward.type, isJackpot)}
                </span>
              </div>

              {/* Reward Description */}
              <div className={`text-center text-xs font-medium mb-2 ${
                isClaimed ? 'text-success/60 line-through' :
                isJackpot ? 'text-amber-300' :
                isToday ? 'text-pink-300' :
                isFuture ? 'text-gray-600' :
                'text-gray-400'
              }`}>
                {isFuture ? '???' : getRewardDescription(reward)}
              </div>

              {/* JACKPOT label */}
              {isJackpot && (
                <div className="text-center mb-2">
                  <span className="text-[9px] font-bold text-amber-400 tracking-wider bg-amber-900/30 px-2 py-0.5 rounded">
                    <GameIcon icon="gi:sparkles" size={16} className="inline" /> JACKPOT <GameIcon icon="gi:sparkles" size={16} className="inline" />
                  </span>
                </div>
              )}

              {/* Claim Button */}
              {isToday && !isClaimed && (
                <Button
                  onClick={() => claimDailyReward(reward.day)}
                  className={`w-full bg-pink-600 hover:bg-pink-500 text-white text-xs h-8${prefersReducedMotion ? '' : ' animate-pulse'}`}
                >
                  CLAIM
                </Button>
              )}
              {isClaimed && (
                <div className="w-full h-8 flex items-center justify-center text-[10px] text-success/50 font-medium">
                  Claimed ✓
                </div>
              )}
              {isFuture && (
                <div className="w-full h-8 flex items-center justify-center">
                  <Lock className="w-3 h-3 text-gray-700" />
                </div>
              )}
              {isPast && !isClaimed && !isToday && (
                <div className="w-full h-8 flex items-center justify-center text-[10px] text-gray-600">
                  Missed
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* No rewards generated yet */}
      {loginStreak.weeklyRewards.length === 0 && (
        <div className="bg-card border border-gray-800 rounded-xl p-8 text-center">
          <Calendar className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">Start your streak by logging in tomorrow!</p>
          <p className="text-gray-600 text-xs mt-1">Daily rewards will appear here.</p>
        </div>
      )}

      {/* Streak Multiplier Info */}
      <div className="bg-card border border-pink-900/20 rounded-xl p-4">
        <h3 className="text-sm font-bold text-pink-400 mb-3 flex items-center gap-2">
          <Flame className="w-4 h-4" />
          Streak Bonuses
        </h3>
        <div className="grid grid-cols-3 gap-3">
          <div className={`rounded-lg p-3 text-center border ${loginStreak.currentStreak >= 3 ? 'border-yellow-600/40 bg-yellow-900/10' : 'border-gray-800'}`}>
            <div className="text-lg font-bold text-yellow-400">1.5x</div>
            <div className="text-[10px] text-gray-400 mt-0.5">3+ Days</div>
            {loginStreak.currentStreak >= 3 && (
              <div className="text-[9px] text-yellow-500 mt-1">✓ Active</div>
            )}
          </div>
          <div className={`rounded-lg p-3 text-center border ${loginStreak.currentStreak >= 5 ? 'border-orange-600/40 bg-orange-900/10' : 'border-gray-800'}`}>
            <div className="text-lg font-bold text-orange-400">2x</div>
            <div className="text-[10px] text-gray-400 mt-0.5">5+ Days</div>
            {loginStreak.currentStreak >= 5 && (
              <div className="text-[9px] text-orange-500 mt-1">✓ Active</div>
            )}
          </div>
          <div className={`rounded-lg p-3 text-center border ${loginStreak.currentStreak >= 7 ? 'border-fuchsia-600/40 bg-fuchsia-900/10' : 'border-gray-800'}`}>
            <div className="text-lg font-bold text-fuchsia-400">3x</div>
            <div className="text-[10px] text-gray-400 mt-0.5">7+ Days</div>
            {loginStreak.currentStreak >= 7 && (
              <div className="text-[9px] text-fuchsia-500 mt-1">✓ Active</div>
            )}
          </div>
        </div>
      </div>

      {/* Come Back Message */}
      <div className="bg-card border border-cyan-900/20 rounded-xl p-4 text-center">
        <p className="text-sm text-gray-400">
          <GameIcon icon="gi:present" size={14} className="inline" /> Come back tomorrow for <span className="text-pink-400 font-medium">Day {nextDayOfWeek}</span> reward!
        </p>
        <p className="text-xs text-gray-600 mt-1">
          {nextRewardDesc}
          {loginStreak.currentStreak >= 2 && ` • Keep your ${loginStreak.currentStreak}-day streak alive!`}
        </p>
      </div>
    </div>
  );
}
