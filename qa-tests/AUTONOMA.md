---
app_name: "Industry X"
app_description: "An industrial-themed idle/management game where players build factories, manage resources, research technologies, and trade on a dynamic global market."
core_flows:
  - feature: "Authentication & Bootstrap"
    description: "The core lifecycle of the application, including session resolution, device binding, and account merging."
    mission: "Ensure users are correctly identified and their game state is safely synchronized across devices."
    core: true
    coreReason: "Without correct authentication and state hydration, the player cannot access their progress or interact with any game features."
  - feature: "Dashboard"
    description: "Central command hub showing empire health, economic trends, and active objectives."
    mission: "Provide a real-time, high-level overview of the industrial empire's performance and bottlenecks."
    core: true
    coreReason: "It is the primary landing page and the main surface for monitoring the entire game loop."
  - feature: "Extraction (Resources)"
    description: "The foundation of the economy, managing raw material extraction buildings across multiple tiers."
    mission: "Extract raw materials efficiently while managing power consumption and storage limits."
    core: true
    coreReason: "Resource extraction is the fundamental start of all production chains; without it, nothing else can be built or produced."
  - feature: "Factories"
    description: "Processing facilities that transform raw materials into complex components across 5 tiers."
    mission: "Manage production throughput and efficiency to supply higher-tier projects and market demands."
    core: true
    coreReason: "Factories represent the primary gameplay progression and the main method of generating value."
  - feature: "Market"
    description: "A dynamic, supply-and-demand driven global market with fluctuating prices and news influences."
    mission: "Buy and sell resources at optimal prices to maximize profit and acquire necessary inputs."
    core: true
    coreReason: "The market is the main source of money and the way players balance their resource needs."
  - feature: "Research"
    description: "Technology tree for unlocking new buildings, logistics, and permanent production bonuses."
    mission: "Strategically allocate Research Points to progress through the industrial tiers."
    core: false
  - feature: "Transport & Logistics"
    description: "Managing routes and transport lines to connect producers to consumers."
    mission: "Ensure a seamless flow of materials between buildings with zero throughput bottlenecks."
    core: false
  - feature: "Power Grid"
    description: "Management of energy production and distribution across the empire."
    mission: "Maintain a stable energy supply that exceeds the total demand of all active industrial buildings."
    core: false
  - feature: "Workers"
    description: "Managing the workforce to staff and operate buildings."
    mission: "Optimize worker allocation to maximize production efficiency."
    core: false
  - feature: "Storage"
    description: "Management of resource stockpiles and warehouse capacities."
    mission: "Provide sufficient capacity to prevent production stalls due to full storage."
    core: false
  - feature: "Automation"
    description: "AI-powered automation of building upgrades and management."
    mission: "Reduce manual management overhead through strategic AI unlocks."
    core: false
  - feature: "Prestige & Expansion"
    description: "Resetting progress for permanent multipliers and expanding to new territories."
    mission: "Scale the empire to global proportions through strategic resets."
    core: false
  - feature: "Waitlist"
    description: "Operational gateway for new users when the system is at maximum capacity."
    mission: "Gracefully manage user overflow and prevent infrastructure overload."
    core: false
  - feature: "Admin - Configuration"
    description: "Direct management of game configuration tables (resources, buildings, research)."
    mission: "Provide a secure interface for live-tuning game balance and content."
    core: false
  - feature: "Admin - Player Management"
    description: "Moderation tools for searching, inspecting, and managing player accounts."
    mission: "Enable admins to investigate issues and maintain game integrity through moderation actions."
    core: false
  - feature: "Admin - Economy & Market"
    description: "Monitoring and control of global economy and market health."
    mission: "Ensure economic stability and identify fraudulent or anomalous trading patterns."
    core: false
  - feature: "Admin - System Monitoring"
    description: "Real-time infrastructure health and capacity metrics."
    mission: "Monitor system performance to ensure game stability for all users."
    core: false
  - feature: "Quests & Achievements"
    description: "Short-term objectives and long-term milestones providing rewards."
    mission: "Drive player engagement through directed goals and meaningful rewards."
    core: false
  - feature: "Daily Rewards & Events"
    description: "Timed bonuses and global game events that affect production or prices."
    mission: "Encourage consistent play and provide dynamic variety to the gameplay loop."
    core: false
  - feature: "Leaderboards & Social"
    description: "Global player rankings based on empire score and wealth."
    mission: "Foster competition and social engagement through ranked industrial comparison."
    core: false
feature_count: 30
pages:
  - page: "/"
    description: "Automatic redirect to the game dashboard."
  - page: "/game/dashboard"
    description: "Central command hub for the industrial empire."
  - page: "/game/resources"
    description: "Resource extraction management (Basic, Advanced, Specialized mining)."
  - page: "/game/factories"
    description: "Processing facilities management across 5 industrial tiers."
  - page: "/game/market"
    description: "Dynamic global market for resource trading and news."
  - page: "/game/research"
    description: "Technology tree and research queue for unlocking upgrades."
  - page: "/game/transport"
    description: "Logistics and transport route management with interactive map."
  - page: "/game/power"
    description: "Power grid management and energy production."
  - page: "/game/storage"
    description: "Warehouse capacity management and resource stockpiles."
  - page: "/game/workers"
    description: "Workforce allocation and efficiency management."
  - page: "/game/automation"
    description: "AI automation unlocks for industrial processes."
  - page: "/game/prestige"
    description: "Global expansion and prestige resets."
  - page: "/game/statistics"
    description: "Detailed analytics and historical charts for empire performance."
  - page: "/game/settings"
    description: "User preferences, account management, and UI settings."
  - page: "/waitlist"
    description: "User overflow management when server capacity is reached."
  - page: "/admin/login"
    description: "Secure entry point for administrative access."
  - page: "/admin"
    description: "Admin dashboard showing live system and player stats."
  - page: "/admin/config"
    description: "CRUD interface for direct database configuration table management."
  - page: "/admin/players"
    description: "Player directory with search, filtering, and bulk actions."
  - page: "/admin/players/[id]"
    description: "Individual player profile deep-dive and moderation tools."
  - page: "/admin/investigations"
    description: "Anti-cheat management and report resolution."
  - page: "/admin/market"
    description: "Global market control and resource registry."
  - page: "/admin/monitoring"
    description: "Real-time system health and capacity metrics."
  - page: "/admin/support"
    description: "Player support ticket management system."
---

# Industry X Knowledge Base

## Application Description
Industry X is a high-fidelity industrial management game. It combines idle game mechanics with deep economic simulation, logistics management, and a technology progression tree. Players start from basic raw material extraction and progress through increasingly complex industrial tiers, culminating in global mega-projects and prestige-based expansion. The game features a real-time, player-influenced global market, a detailed power grid simulation, and a complex logistics layer for resource transportation.

## User Roles
- **Player:** The primary user who builds, manages, and expands their industrial empire.
- **Admin/Moderator:** Internal users who manage game configuration, investigate cheating, handle support tickets, and monitor system health.

## Entry Point
The application automatically directs users from the root `/` to `/game/dashboard`. If the user is not authenticated or the system is at capacity, the `AuthOrchestrator` (within `GameShell`) handles the redirection or renders the `Waitlist` or `Bootstrap` screens.

## Navigation Structure
The game uses a **Sidebar** (Desktop) and **Bottom Navigation Bar** (Mobile) for tab-based navigation.
- **Overview:** Dashboard, AI Advisor, Factory Map, Resource Monitor, Guide.
- **Production:** Extraction, Factories, Production Chains, Storage, Power Grid, Workers.
- **Logistics:** Transport, Market, Contracts, Drones, Trade Post.
- **Progression:** Research, Automation, Expand (Prestige), Mega Projects.
- **Rewards:** Quests, Achievements, Daily Rewards, Leaderboard, Events.
- **Finance:** Payouts, Alerts (Notifications).
- **System:** Statistics, Blueprints, Settings.

The **Admin Panel** (accessed via `/admin`) has its own internal navigation for Moderation, Economy, and System Management.

## Core Flows

### Authentication & Bootstrap
Managed by the `AuthOrchestratorProvider`, this flow is the "hard gate" to the game. It handles OAuth sign-ins (Google, GitHub), device binding, and complex account merging (e.g., merging a guest account's progress into a newly linked social account).

### Industrial Production Loop
1. **Extraction:** Building mines and pumps to generate raw materials (Iron, Coal, Oil, etc.).
2. **Logistics:** Creating transport routes to move raw materials to factories.
3. **Processing:** Transforming materials into components (Steel, Plastics, Electronics) using multi-tier factories.
4. **Power Management:** Ensuring the ever-growing demand for electricity is met by various power plants.

### Economic Loop
1. **Market Trading:** Buying low and selling high on the global market to fund expansion.
2. **Contracts & Payouts:** Completing specific resource requests for large lump-sum rewards.
3. **Optimization:** Using the AI Advisor and Statistics to find and fix efficiency gaps.

## UI Patterns
- **Panels:** The game is organized into discrete panels that are dynamically swapped within the `/game/[tab]` route.
- **Modals:** Used for account settings, offline earning summaries, and confirmations.
- **Floating Numbers:** Visual feedback for resource and money accumulation.
- **Real-time Updates:** Charts, gauges, and production bars update live based on server-authoritative ticks.
- **Admin Data Grids:** Standardized tables with search, sort, and CRUD modals for configuration.

## Preferences & Settings
- **UI Settings:** Theme (implicit), reduced motion, and navigation preferences.
- **Game Settings:** Notification toggles, auto-save triggers, and unit formatting.
- **Account:** Identity linking, data export, and account deletion.
