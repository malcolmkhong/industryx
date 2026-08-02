---
title: "Filter contracts by tier"
description: "Filter active contracts by tier and verify only matching contracts are shown."
intent: "Selecting a tier filter should restrict the visible active contracts to only those that match the selected tier, improving the player's ability to manage specific mission types."
criticality: mid
scenario: standard
flow: "Market"
verification: "Verify that only Tier 1 contracts are visible in the list."
---

**Setup**: Navigate to the Contracts page. Ensure there are active contracts across multiple tiers (e.g., T0 and T1).

**Intent**: Selecting a tier filter should restrict the visible active contracts to only those that match the selected tier, improving the player's ability to manage specific mission types.

**Steps**:
1. click: the "T0" filter button in the Tier Filter section
2. assert: text "Tier 0: Basic" as a tier group heading in the active contracts list
3. click: the "T1" filter button in the Tier Filter section

**Verification**:
1. assert: text "Tier 1: Advanced" as a tier group heading in the active contracts list
2. assert: text "Tier 0: Basic" in the active contracts list

**Expected Result**: The contract list updates to only show contracts belonging to the selected tier.
