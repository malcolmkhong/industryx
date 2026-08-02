---
title: "Power Management Expansion Journey"
description: "Verifies the critical dependency between industrial expansion and power grid stability."
intent: "Verifies that building new industrial facilities (Factory Tier 2) correctly impacts the Power Grid demand, and that a power deficit correctly reduces efficiency across all buildings. Then verifies that resolving the deficit restores efficiency. This tests the core resource-power-efficiency feedback loop."
criticality: critical
scenario: standard
flow: "Industrial Production Loop"
verification: "Verify that the power deficit is resolved and efficiency returns to nominal levels."
---

**Setup**: The user starts on the Factories page.

**Intent**: Verifies that building new industrial facilities (Factory Tier 2) correctly impacts the Power Grid demand, and that a power deficit correctly reduces efficiency across all buildings. Then verifies that resolving the deficit restores efficiency. This tests the core resource-power-efficiency feedback loop.

**Steps**:
1. assert: text "Processing Factories" as a page heading as a page heading
2. click: the "T2 — Advanced Manufacturing" tab button in the tier tab selector of the Processing Factories panel
3. click: the "Build" button for "Factory Tier 2" (cost $2500) on the Factory Tier 2 card in the T2 tab
4. assert: text "Power deficit!" warning badge on the factory card on the Factory Tier 2 card in the Processing Factories panel
5. assert: text "Grid overloaded!" in the Avg Efficiency stat card in the factory overview stats panel
6. click: the "Power Grid" tab in the sidebar in the sidebar navigation
7. assert: text "Power Grid Management" as a page heading as a page heading
8. click: the "Upgrade" button for the primary power source in the power production list

**Verification**:
1. assert: text "Nominal" in the Avg Efficiency stat card (or absence of deficit warning) in the factory overview stats panel on the Factories page
2. assert: text "100%" efficiency on the Factory Tier 2 card on the Factory Tier 2 card in the Processing Factories panel

**Expected Result**: The player builds a factory, observes a power deficit, and resolves it by upgrading power infrastructure, restoring full production efficiency.
