---
title: "Use storage suggestion for trade"
description: "Use a storage suggestion to set up a trade for an overflowing resource."
intent: "Storage suggestions help players manage inventory overflows by recommending trades for resources that are nearly full, preventing production stalls."
criticality: mid
scenario: standard
flow: "Market"
verification: "Verify the trade appears in the history."
---

**Setup**: Navigate to the Trading Post page. Ensure you have a resource that is nearly full (e.g., Iron Ore at 95% capacity).

**Intent**: Storage suggestions help players manage inventory overflows by recommending trades for resources that are nearly full, preventing production stalls.

**Steps**:
1. click: the "Set Trade" button on the first storage suggestion card
2. click: the "Execute Trade" button below the exchange interface

**Verification**:
1. assert: text "✓" in the first row of the Recent Trades list

**Expected Result**: The exchange interface is populated with the suggested resource and a target resource.
