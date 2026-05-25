'use client';

import { useGameStore, formatNumber } from '@/lib/game/store';
import { WEATHER_DEFS } from '@/lib/game/data';
import { GameItemTooltip } from '@/components/game/GameItemTooltip';
import { motion } from 'framer-motion';
import { Pin, PinOff, Clock } from 'lucide-react';

export function QuestPanel() {
  const store = useGameStore();
  const quests = store.quests;
  
  const tutorialQuests = quests.filter(q => q.category === 'tutorial');
  const dailyQuests = quests.filter(q => q.category === 'daily');
  const weeklyQuests = quests.filter(q => q.category === 'weekly');
  const challengeQuests = quests.filter(q => q.category === 'challenge');
  
  const completedCount = quests.filter(q => q.completed).length;
  const claimedCount = quests.filter(q => q.claimed).length;
  const totalCount = quests.length;

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'tutorial': return 'text-cyan-400 border-cyan-800/40 bg-cyan-900/20';
      case 'daily': return 'text-amber-400 border-amber-800/40 bg-amber-900/20';
      case 'weekly': return 'text-teal-400 border-teal-800/40 bg-teal-900/20';
      case 'challenge': return 'text-rose-400 border-rose-800/40 bg-rose-900/20';
      default: return 'text-gray-400 border-gray-800/40 bg-gray-900/20';
    }
  };

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case 'tutorial': return '📚 Tutorial';
      case 'daily': return '📅 Daily';
      case 'weekly': return '📆 Weekly';
      case 'challenge': return '🏆 Challenge';
      default: return category;
    }
  };

  const formatTimeRemaining = (ticks: number) => {
    if (ticks <= 0) return 'Expired';
    if (ticks < 60) return `${ticks} ticks`;
    const minutes = Math.floor(ticks / 60);
    if (minutes < 60) return `~${minutes}m`;
    const hours = Math.floor(minutes / 60);
    return `~${hours}h ${minutes % 60}m`;
  };

  const renderQuest = (quest: typeof quests[0]) => {
    const allStepsComplete = quest.steps.every(s => s.completed);
    const progress = quest.steps.length > 0 
      ? quest.steps.reduce((sum, s) => sum + Math.min(1, s.current / Math.max(1, s.target)), 0) / quest.steps.length 
      : 0;
    const isTracked = store.trackedQuest === quest.id;

    // Build tooltip details
    const tooltipDetails = [
      { label: 'Type', value: quest.type.toUpperCase(), color: 'text-cyan-300' },
      { label: 'Category', value: quest.category, color: getCategoryColor(quest.category).split(' ')[0] },
    ];

    // Add reward breakdown
    if (quest.reward.money > 0) {
      tooltipDetails.push({ label: 'Money Reward', value: `$${formatNumber(quest.reward.money)}`, color: 'text-green-400' });
    }
    if (quest.reward.researchPoints && quest.reward.researchPoints > 0) {
      tooltipDetails.push({ label: 'RP Reward', value: `${quest.reward.researchPoints}`, color: 'text-purple-400' });
    }
    if (quest.reward.corporationPoints && quest.reward.corporationPoints > 0) {
      tooltipDetails.push({ label: 'CP Reward', value: `${quest.reward.corporationPoints}`, color: 'text-fuchsia-400' });
    }

    // Add step progress details
    quest.steps.forEach((step, i) => {
      tooltipDetails.push({
        label: `Step ${i + 1}`,
        value: `${Math.min(step.current, step.target)}/${step.target} ${step.completed ? '✓' : ''}`,
        color: step.completed ? 'text-green-400' : 'text-gray-300',
      });
    });

    // Add expiration info for daily/weekly quests
    if (quest.expiresAt && quest.expiresAt > 0) {
      const remaining = quest.expiresAt - store.gameTick;
      tooltipDetails.push({
        label: 'Time Remaining',
        value: formatTimeRemaining(Math.max(0, remaining)),
        color: remaining > 100 ? 'text-cyan-300' : remaining > 30 ? 'text-amber-400' : 'text-red-400',
      });
    }

    return (
      <motion.div
        key={quest.id}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={`quest-card-hover rounded-xl border p-4 transition-all ${
          quest.claimed 
            ? 'border-gray-800 bg-gray-900/30 opacity-50' 
            : allStepsComplete 
              ? 'border-green-500/30 bg-green-900/10' 
              : isTracked
                ? 'border-cyan-400/40 bg-cyan-900/10'
                : 'border-cyan-900/30 bg-[#111827]/50'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <GameItemTooltip
              name={quest.name}
              emoji={quest.emoji}
              description={quest.description}
              category={getCategoryLabel(quest.category)}
              details={tooltipDetails}
              side="right"
              disabled={quest.claimed}
            >
              <div className="flex items-center gap-2 cursor-help min-w-0">
                <span className="text-xl flex-shrink-0">{quest.emoji}</span>
                <div className="min-w-0">
                  <h4 className={`text-sm font-semibold truncate ${
                    quest.claimed ? 'text-gray-500 line-through' 
                    : allStepsComplete ? 'text-green-400' 
                    : isTracked ? 'text-cyan-300'
                    : 'text-gray-200'
                  }`}>
                    {quest.name}
                  </h4>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded border ${getCategoryColor(quest.category)}`}>
                      {quest.category.toUpperCase()}
                    </span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded border ${
                      quest.type === 'build' ? 'text-amber-400 border-amber-800/40 bg-amber-900/20' :
                      quest.type === 'sell' ? 'text-green-400 border-green-800/40 bg-green-900/20' :
                      quest.type === 'research' ? 'text-purple-400 border-purple-800/40 bg-purple-900/20' :
                      quest.type === 'earn' ? 'text-yellow-400 border-yellow-800/40 bg-yellow-900/20' :
                      quest.type === 'produce' ? 'text-cyan-400 border-cyan-800/40 bg-cyan-900/20' :
                      'text-rose-400 border-rose-800/40 bg-rose-900/20'
                    }`}>
                      {quest.type.toUpperCase()}
                    </span>
                    {/* Expiration indicator for daily/weekly */}
                    {quest.expiresAt && quest.expiresAt > 0 && !quest.claimed && (
                      <span className="flex items-center gap-0.5 text-[9px] text-amber-400">
                        <Clock className="w-2.5 h-2.5" />
                        {formatTimeRemaining(Math.max(0, quest.expiresAt - store.gameTick))}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-1">{quest.description}</p>
                </div>
              </div>
            </GameItemTooltip>
          </div>
          
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* Track/Pin button */}
            {!quest.claimed && (
              <button
                onClick={() => store.setTrackedQuest(isTracked ? null : quest.id)}
                className={`p-1.5 rounded-lg transition-all ${
                  isTracked 
                    ? 'bg-cyan-900/40 text-cyan-400 border border-cyan-500/40 hover:bg-cyan-900/60' 
                    : 'bg-gray-800/50 text-gray-500 border border-gray-700/50 hover:text-gray-300 hover:bg-gray-800'
                }`}
                title={isTracked ? 'Untrack quest' : 'Track quest on dashboard'}
              >
                {isTracked ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
              </button>
            )}

            {quest.claimed ? (
              <span className="text-[10px] text-gray-600 bg-gray-800 px-2 py-1 rounded">CLAIMED</span>
            ) : allStepsComplete ? (
              <button
                onClick={() => store.claimQuestReward(quest.id)}
                className="text-[11px] font-bold text-green-400 bg-green-900/30 border border-green-500/30 px-3 py-1.5 rounded-lg hover:bg-green-900/50 transition-colors neon-breathe"
              >
                CLAIM 🎁
              </button>
            ) : (
              <span className="text-[10px] text-cyan-400 bg-cyan-900/20 px-2 py-1 rounded">
                {Math.round(progress * 100)}%
              </span>
            )}
          </div>
        </div>
        
        {/* Steps progress */}
        <div className="mt-3 space-y-1.5">
          {quest.steps.map((step, i) => {
            const stepProgress = Math.min(1, step.current / Math.max(1, step.target));
            return (
              <div key={i} className="space-y-1">
                <div className="flex justify-between text-[10px]">
                  <span className={step.completed ? 'text-green-400' : 'text-gray-400'}>{step.description}</span>
                  <span className={step.completed ? 'text-green-400' : 'text-gray-500'}>
                    {Math.min(step.current, step.target)}/{step.target}
                  </span>
                </div>
                <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all duration-500 progress-bar-shimmer ${
                      step.completed ? 'bg-green-500' : isTracked ? 'bg-cyan-400' : 'bg-cyan-500'
                    }`}
                    style={{ width: `${stepProgress * 100}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        
        {/* Rewards */}
        <div className="mt-3 flex items-center gap-2 text-[10px] pt-2 border-t border-gray-800/50">
          <span className="text-gray-600">Rewards:</span>
          {quest.reward.money > 0 && <span className="text-green-400">💰 ${formatNumber(quest.reward.money)}</span>}
          {quest.reward.researchPoints && quest.reward.researchPoints > 0 && <span className="text-purple-400">🔬 {quest.reward.researchPoints} RP</span>}
          {quest.reward.corporationPoints && quest.reward.corporationPoints > 0 && <span className="text-fuchsia-400">🏢 {quest.reward.corporationPoints} CP</span>}
        </div>
      </motion.div>
    );
  };
  
  const renderSection = (title: string, emoji: string, questsList: typeof quests, color: string) => {
    if (questsList.length === 0) return null;
    return (
      <div className="space-y-3">
        <h3 className={`text-sm font-bold ${color} flex items-center gap-2`}>
          <span>{emoji}</span> {title}
          <span className="text-gray-600 text-[10px] font-normal">
            {questsList.filter(q => q.completed).length}/{questsList.length}
          </span>
        </h3>
        <div className="space-y-2.5">
          {questsList.map(quest => renderQuest(quest))}
        </div>
      </div>
    );
  };
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-cyan-400 flex items-center gap-2 neon-glow-cyan">
          📜 Quest Board
        </h2>
        <div className="flex items-center gap-2 text-[10px]">
          <span className="text-gray-400">{claimedCount}/{totalCount} Completed</span>
          <div className="w-20 h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div 
              className="h-full bg-green-500 rounded-full transition-all"
              style={{ width: `${totalCount > 0 ? (claimedCount / totalCount) * 100 : 0}%` }}
            />
          </div>
        </div>
      </div>
      
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-[#111827]/50 border border-cyan-900/30 rounded-xl p-3 text-center">
          <div className="text-xl mb-1">📚</div>
          <div className="text-lg font-bold text-cyan-400">{tutorialQuests.filter(q => q.completed).length}</div>
          <div className="text-[10px] text-gray-500">Tutorial</div>
        </div>
        <div className="bg-[#111827]/50 border border-amber-900/30 rounded-xl p-3 text-center">
          <div className="text-xl mb-1">📅</div>
          <div className="text-lg font-bold text-amber-400">{dailyQuests.filter(q => q.completed).length}</div>
          <div className="text-[10px] text-gray-500">Daily</div>
        </div>
        <div className="bg-[#111827]/50 border border-teal-900/30 rounded-xl p-3 text-center">
          <div className="text-xl mb-1">📆</div>
          <div className="text-lg font-bold text-teal-400">{weeklyQuests.filter(q => q.completed).length}</div>
          <div className="text-[10px] text-gray-500">Weekly</div>
        </div>
        <div className="bg-[#111827]/50 border border-rose-900/30 rounded-xl p-3 text-center">
          <div className="text-xl mb-1">🏆</div>
          <div className="text-lg font-bold text-rose-400">{challengeQuests.filter(q => q.completed).length}</div>
          <div className="text-[10px] text-gray-500">Challenge</div>
        </div>
      </div>

      {/* Tracked Quest Indicator */}
      {store.trackedQuest && (() => {
        const trackedQuestData = quests.find(q => q.id === store.trackedQuest);
        if (!trackedQuestData || trackedQuestData.claimed) return null;
        const tProgress = trackedQuestData.steps.length > 0 
          ? trackedQuestData.steps.reduce((sum, s) => sum + Math.min(1, s.current / Math.max(1, s.target)), 0) / trackedQuestData.steps.length 
          : 0;
        return (
          <div className="bg-gradient-to-r from-cyan-900/20 to-teal-900/10 border border-cyan-500/30 rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Pin className="w-3.5 h-3.5 text-cyan-400" />
                <span className="text-[10px] text-cyan-400 uppercase tracking-wider font-semibold">Tracked Quest</span>
              </div>
              <button
                onClick={() => store.setTrackedQuest(null)}
                className="text-gray-500 hover:text-gray-300 text-[10px] p-1 rounded hover:bg-gray-800/50 transition-colors"
              >
                ✕
              </button>
            </div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">{trackedQuestData.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-200 font-medium truncate">{trackedQuestData.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-cyan-400 rounded-full transition-all"
                      style={{ width: `${tProgress * 100}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-cyan-400 font-mono">{Math.round(tProgress * 100)}%</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 text-[10px]">
              {trackedQuestData.reward.money > 0 && <span className="text-green-400">💰 ${formatNumber(trackedQuestData.reward.money)}</span>}
              {trackedQuestData.reward.researchPoints && trackedQuestData.reward.researchPoints > 0 && <span className="text-purple-400">🔬 {trackedQuestData.reward.researchPoints} RP</span>}
              {trackedQuestData.reward.corporationPoints && trackedQuestData.reward.corporationPoints > 0 && <span className="text-fuchsia-400">🏢 {trackedQuestData.reward.corporationPoints} CP</span>}
            </div>
          </div>
        );
      })()}
      
      {/* Quest sections */}
      {renderSection('Tutorial', '📚', tutorialQuests, 'text-cyan-400')}
      {renderSection('Daily Quests', '📅', dailyQuests, 'text-amber-400')}
      {renderSection('Weekly Quests', '📆', weeklyQuests, 'text-teal-400')}
      {renderSection('Challenges', '🏆', challengeQuests, 'text-rose-400')}
      
      {quests.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <div className="text-4xl mb-3">📜</div>
          <p>No quests available yet. Start building to unlock quests!</p>
        </div>
      )}
    </div>
  );
}
