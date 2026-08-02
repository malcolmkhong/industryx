---
title: "Research Progression Journey"
description: "Verifies the progression from accumulating research points to unlocking and starting a new technology."
intent: "Verifies that Research Points (RP) accumulated from game state are correctly usable in the Research Lab to start a technology (Smelting), and that the research state persists and reflects progress. This tests the progression gate between Tier 0 and Tier 1."
criticality: critical
scenario: standard
flow: "Industrial Production Loop"
verification: "Verify that Smelting is now the Active Research and showing progress."
---

**Setup**: The user starts on the Dashboard with 120 Research Points (from user-1 data) and navigates to the Research page.

**Intent**: Verifies that Research Points (RP) accumulated from game state are correctly usable in the Research Lab to start a technology (Smelting), and that the research state persists and reflects progress. This tests the progression gate between Tier 0 and Tier 1.

**Steps**:
1. assert: text "Research Lab" as a page heading as a page heading
2. assert: text "120 RP" in the research points badge in the research lab header
3. assert: the "Start (150 RP)" button for "Smelting" is disabled (cannot afford) on the Smelting research card in the Energy category
4. click: the "Dashboard" tab in the sidebar in the sidebar navigation
5. assert: text "120" in the Research Points stat card in the dashboard overview stats
6. click: the "Research" tab in the sidebar after some time (simulating RP gain) in the sidebar navigation
7. click: the "Start (150 RP)" button for "Smelting" (assuming RP has reached 150) on the Smelting research card in the Energy category

**Verification**:
1. assert: text "Smelting" in the Active Research card in the Active Research section of the Research Lab
2. assert: text "Active" badge on the Smelting card on the Smelting research card in the Energy category
3. assert: the research progress bar is visible in the Active Research section of the Research Lab

**Expected Result**: The player successfully starts the Smelting research after accumulating enough research points, unlocking the next tier of production.
