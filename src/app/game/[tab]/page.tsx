'use client';

import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';
import { GameTab } from '@/lib/game/types';

function DynamicPanelFallback() {
  if (typeof window === 'undefined') return null;
  return (
    <div
      className="flex items-center justify-center h-64"
      style={{ minHeight: '400px' }}
    >
      <div className="flex flex-col items-center gap-2">
        <div className="w-8 h-8 border-2 border-brand/30 border-t-brand rounded-full animate-spin" />
        <span className="text-[10px] text-muted-label uppercase tracking-wider">Loading panel</span>
      </div>
    </div>
  );
}

// Each panel is code-split so the first navigation fetches only what's needed;
// subsequent visits hit the browser cache.
const AIAdvisorPanel = dynamic(() => import('@/components/game/AIAdvisorPanel').then(m => m.default), { loading: () => <DynamicPanelFallback /> });
const ResourcePanel = dynamic(() => import('@/components/game/ResourcePanel').then(m => ({ default: m.ResourcePanel })), { loading: () => <DynamicPanelFallback /> });
const FactoryPanel = dynamic(() => import('@/components/game/FactoryPanel').then(m => ({ default: m.FactoryPanel })), { loading: () => <DynamicPanelFallback /> });
const TransportPanel = dynamic(() => import('@/components/game/TransportPanel').then(m => ({ default: m.TransportPanel })), { loading: () => <DynamicPanelFallback /> });
const PowerPanel = dynamic(() => import('@/components/game/PowerPanel').then(m => ({ default: m.PowerPanel })), { loading: () => <DynamicPanelFallback /> });
const MarketPanel = dynamic(() => import('@/components/game/MarketPanel').then(m => ({ default: m.MarketPanel })), { loading: () => <DynamicPanelFallback /> });
const ResearchPanel = dynamic(() => import('@/components/game/ResearchPanel').then(m => ({ default: m.ResearchPanel })), { loading: () => <DynamicPanelFallback /> });
const WorkerPanel = dynamic(() => import('@/components/game/WorkerPanel').then(m => ({ default: m.WorkerPanel })), { loading: () => <DynamicPanelFallback /> });
const ContractPanel = dynamic(() => import('@/components/game/ContractPanel').then(m => ({ default: m.ContractPanel })), { loading: () => <DynamicPanelFallback /> });
const AutomationPanel = dynamic(() => import('@/components/game/AutomationPanel').then(m => ({ default: m.AutomationPanel })), { loading: () => <DynamicPanelFallback /> });
const PrestigePanel = dynamic(() => import('@/components/game/PrestigePanel').then(m => ({ default: m.PrestigePanel })), { loading: () => <DynamicPanelFallback /> });
const EventPanel = dynamic(() => import('@/components/game/EventPanel').then(m => ({ default: m.EventPanel })), { loading: () => <DynamicPanelFallback /> });
const BlueprintPanel = dynamic(() => import('@/components/game/BlueprintPanel').then(m => ({ default: m.BlueprintPanel })), { loading: () => <DynamicPanelFallback /> });
const OnboardingPanel = dynamic(() => import('@/components/game/OnboardingPanel').then(m => ({ default: m.OnboardingPanel })), { loading: () => <DynamicPanelFallback /> });
const AchievementPanel = dynamic(() => import('@/components/game/AchievementPanel').then(m => ({ default: m.AchievementPanel })), { loading: () => <DynamicPanelFallback /> });
const MegaProjectPanel = dynamic(() => import('@/components/game/MegaProjectPanel').then(m => ({ default: m.MegaProjectPanel })), { loading: () => <DynamicPanelFallback /> });
const SettingsPanel = dynamic(() => import('@/components/game/SettingsPanel').then(m => ({ default: m.SettingsPanel })), { loading: () => <DynamicPanelFallback /> });
const StatisticsPanel = dynamic(() => import('@/components/game/StatisticsPanel').then(m => m.default), { loading: () => <DynamicPanelFallback /> });
const FactoryMapPanel = dynamic(() => import('@/components/game/FactoryMapPanel').then(m => m.default), { loading: () => <DynamicPanelFallback /> });
const LeaderboardPanel = dynamic(() => import('@/components/game/LeaderboardPanel').then(m => m.default), { loading: () => <DynamicPanelFallback /> });
const DailyRewardsPanel = dynamic(() => import('@/components/game/DailyRewardsPanel').then(m => m.default), { loading: () => <DynamicPanelFallback /> });
const QuestPanel = dynamic(() => import('@/components/game/QuestPanel').then(m => ({ default: m.QuestPanel })), { loading: () => <DynamicPanelFallback /> });
const NotificationCenterPanel = dynamic(() => import('@/components/game/NotificationCenterPanel').then(m => ({ default: m.NotificationCenterPanel })), { loading: () => <DynamicPanelFallback /> });
const PayoutPanel = dynamic(() => import('@/components/game/PayoutPanel').then(m => ({ default: m.PayoutPanel })), { loading: () => <DynamicPanelFallback /> });
const DroneDeliveryPanel = dynamic(() => import('@/components/game/DroneDeliveryPanel').then(m => m.default), { loading: () => <DynamicPanelFallback /> });
const TradingPostPanel = dynamic(() => import('@/components/game/TradingPostPanel').then(m => ({ default: m.TradingPostPanel })), { loading: () => <DynamicPanelFallback /> });
const StoragePanel = dynamic(() => import('@/components/game/StoragePanel').then(m => ({ default: m.StoragePanel })), { loading: () => <DynamicPanelFallback /> });
const GlobalResourceMonitorPanel = dynamic(() => import('@/components/game/GlobalResourceMonitorPanel').then(m => m.default), { loading: () => <DynamicPanelFallback /> });
import { DashboardPanel } from '@/components/game/DashboardPanel';

// Returns the panel component for a given GameTab. Pure mapping — keep in sync
// with the GameTab union in src/lib/game/types.ts.
function renderPanel(tab: GameTab) {
  switch (tab) {
    case 'dashboard': return <DashboardPanel />;
    case 'advisor': return <AIAdvisorPanel />;
    case 'factoryMap': return <FactoryMapPanel />;
    case 'resourceMonitor': return <GlobalResourceMonitorPanel />;
    case 'resources': return <ResourcePanel />;
    case 'factories': return <FactoryPanel />;
    case 'storage': return <StoragePanel />;
    case 'transport': return <TransportPanel />;
    case 'power': return <PowerPanel />;
    case 'market': return <MarketPanel />;
    case 'research': return <ResearchPanel />;
    case 'workers': return <WorkerPanel />;
    case 'contracts': return <ContractPanel />;
    case 'automation': return <AutomationPanel />;
    case 'prestige': return <PrestigePanel />;
    case 'events': return <EventPanel />;
    case 'megaprojects': return <MegaProjectPanel />;
    case 'statistics': return <StatisticsPanel />;
    case 'blueprints': return <BlueprintPanel />;
    case 'guide': return <OnboardingPanel />;
    case 'achievements': return <AchievementPanel />;
    case 'leaderboard': return <LeaderboardPanel />;
    case 'dailyRewards': return <DailyRewardsPanel />;
    case 'payouts': return <PayoutPanel />;
    case 'droneDelivery': return <DroneDeliveryPanel />;
    case 'tradePost': return <TradingPostPanel />;
    case 'quests': return <QuestPanel />;
    case 'notifications': return <NotificationCenterPanel />;
    case 'settings': return <SettingsPanel />;
    default: return <DashboardPanel />;
  }
}

const VALID_TABS = new Set<GameTab>([
  'dashboard', 'advisor', 'factoryMap', 'resourceMonitor', 'resources',
  'factories', 'storage', 'transport', 'power', 'market', 'research',
  'workers', 'contracts', 'automation', 'prestige', 'events', 'megaprojects',
  'statistics', 'blueprints', 'guide', 'achievements', 'leaderboard',
  'dailyRewards', 'payouts', 'droneDelivery', 'tradePost', 'quests',
  'notifications', 'settings',
]);

export default function GameTabPage() {
  const params = useParams<{ tab: string }>();
  const rawTab = params?.tab ?? 'dashboard';
  const tab = (VALID_TABS.has(rawTab as GameTab) ? rawTab : 'dashboard') as GameTab;

  // `key` forces the panel subtree to remount on tab change, so animations and
  // component-local state (e.g. localStorage-bound panel state) reset cleanly.
  return <div key={tab} className="game-content-appear">{renderPanel(tab)}</div>;
}