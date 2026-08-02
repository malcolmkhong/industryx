---
title: "Execute resource trade"
description: "Execute a resource-to-resource trade and verify the exchange."
intent: "Trading one resource for another should deduct the 'give' resource, add the 'receive' resource (minus commission), and record the transaction in the server-synced trade history."
criticality: high
scenario: standard
flow: "Market"
verification: "Verify the trade appears in the Recent Trades list with a checkmark."
---

**Setup**: Navigate to the Trading Post page by clicking "Trade Post" in the "Logistics" section of the sidebar. Ensure you have enough Iron Ore (e.g., 500) to trade for Coal.

**Intent**: Trading one resource for another should deduct the 'give' resource, add the 'receive' resource (minus commission), and record the transaction in the server-synced trade history.

**Steps**:
1. assert: text "Trading Post" as a page heading
2. click: the "Give resource" dropdown trigger in the Give section
3. click: the "Iron Ore" option in the Give resource dropdown menu
4. click: the "Receive resource" dropdown trigger in the Receive section
5. click: the "Coal" option in the Receive resource dropdown menu
6. type: "100" into the "Trade amount" input in the Give section
7. click: the "Execute Trade" button below the exchange interface

**Verification**:
1. assert: text "100" and "Iron Ore" in the first row of the Recent Trades list
2. assert: text "✓" (server-validated indicator) in the first row of the Recent Trades list

**Expected Result**: The trade is executed, resources are swapped, and the trade appears in the history.
