---
title: "Activate multiple automation systems"
description: "Activate two different automation systems and verify both are running."
intent: "Players should be able to activate multiple automation systems simultaneously as long as they have the required CP and research for each."
criticality: high
scenario: standard
flow: "Automation"
verification: "Verify both cards show 'Active' and the header count is 2."
---

**Setup**: Navigate to the Automation page. Ensure you have enough CP and research for at least two automation systems.

**Intent**: Players should be able to activate multiple automation systems simultaneously as long as they have the required CP and research for each.

**Steps**:
1. click: the "Activate (1,000 CP)" button on the Auto Smelter Upgrades card
2. click: the "Activate (500 CP)" button (or similar) on another available automation card

**Verification**:
1. assert: text "2/7 active" (or similar) in the Automation Systems header badge

**Expected Result**: Both automation systems are activated and the active count in the header reflects the change.
