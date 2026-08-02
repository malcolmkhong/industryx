---
title: "Build a Tier 1 Smelter"
description: "Verify that a player can build a Smelter from the Tier 1 factory list."
intent: "Players must be able to build manufacturing structures to process raw materials into higher-tier resources, progressing their industrial empire."
criticality: high
scenario: standard
flow: "Factories"
verification: "Assert that a Smelter appears in the \"Active Factories\" list for Tier 1."
---

**Setup**: Navigate to the /game/factories page as user-1.

**Intent**: Players must be able to build manufacturing structures to process raw materials into higher-tier resources, progressing their industrial empire.

**Steps**:
1. click: click the "T1 — Basic Processing" tab in the tier tab selector
2. click: click the "Build" button for "Smelter" on the Smelter build card

**Verification**:
1. assert: text "Smelter" in the active factories list for Tier 1
2. assert: text "Lv.1" in the Smelter row in the active factories list

**Expected Result**: A new Smelter is built and appears in the active factories list.
