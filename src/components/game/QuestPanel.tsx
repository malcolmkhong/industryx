'use client';

import { useGameStore, formatNumber } from '@/lib/game/store';
import { RESOURCE_META } from '@/lib/game/data';
import { motion } from 'framer-motion';

export function QuestPanel() {
  const store = useGameStore();
  const quests = store.quests;
  
  const tutorialQuests = quests.filter(q => q.category === 'tutorial');
  const dailyQuests = quests.filter(q => q.category === 'daily');
  const challengeQuests = quests.filter(q => q.category === 'challenge');
  
  const completedCount = quests.filter(q => q.completed).length;
  const claimedCount = quests.filter(q => q.claimed).length;
  const totalCount = quests.length;
  
  const renderQuest = (quest: typeof quests[0]) => {
    const allStepsComplete = quest.steps.every(s => s.completed);
    const progress = quest.steps.length > 0 
      ? quest.steps.reduce((sum, s) => sum + Math.min(1, s.current / Math.max(1, s.target)), 0) / quest.steps.length 
      : 0;
    
    return (
      <motion.div
        key={quest.id}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={`rounded-lg border p-4 transition-all ${
          quest.claimed 
            ? 'border-gray-800 bg-gray-900/30 opacity-50' 
            : allStepsComplete 
              ? 'border-green-500/30 bg-green-900/10' 
              : 'border-cyan-900/30 bg-[#111827]/50'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">{quest.emoji}</span>
            <div>
              <h4 className={`text-sm font-semibold ${quest.claimed ? 'text-gray-500 line-through' : allStepsComplete ? 'text-green-400' : 'text-gray-200'}`}>
                {quest.name}
              </h4>
              <p className="text-[11px] text-gray-500 mt-0.5">{quest.description}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 flex-shrink-0">
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
                    className={`h-full rounded-full transition-all duration-500 ${step.completed ? 'bg-green-500' : 'bg-cyan-500'}`}
                    style={{ width: `${stepProgress * 100}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        
        {/* Rewards */}
        <div className="mt-2.5 flex items-center gap-2 text-[10px]">
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
        <div className="space-y-2">
          {questsList.map(quest => renderQuest(quest))}
        </div>
      </div>
    );
  };
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-cyan-400 flex items-center gap-2">
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
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-[#111827]/50 border border-cyan-900/30 rounded-lg p-3 text-center">
          <div className="text-xl mb-1">📚</div>
          <div className="text-lg font-bold text-cyan-400">{tutorialQuests.filter(q => q.completed).length}</div>
          <div className="text-[10px] text-gray-500">Tutorial</div>
        </div>
        <div className="bg-[#111827]/50 border border-amber-900/30 rounded-lg p-3 text-center">
          <div className="text-xl mb-1">📅</div>
          <div className="text-lg font-bold text-amber-400">{dailyQuests.filter(q => q.completed).length}</div>
          <div className="text-[10px] text-gray-500">Daily</div>
        </div>
        <div className="bg-[#111827]/50 border border-rose-900/30 rounded-lg p-3 text-center">
          <div className="text-xl mb-1">🏆</div>
          <div className="text-lg font-bold text-rose-400">{challengeQuests.filter(q => q.completed).length}</div>
          <div className="text-[10px] text-gray-500">Challenge</div>
        </div>
      </div>
      
      {/* Quest sections */}
      {renderSection('Tutorial', '📚', tutorialQuests, 'text-cyan-400')}
      {renderSection('Daily Quests', '📅', dailyQuests, 'text-amber-400')}
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
