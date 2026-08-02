---
title: "Toggle resource auto-sell"
description: "Verify that a player can toggle auto-sell for a resource."
intent: "Players should be able to automate the selling of resources when storage is near capacity to prevent production stalls and maintain a steady income."
criticality: mid
scenario: standard
flow: "Market"
verification: "Assert that the \"AUTO\" badge appears on the Iron Ore card in the market list."
---

**Setup**: Navigate to the /game/market page.

**Intent**: Players should be able to automate the selling of resources when storage is near capacity to prevent production stalls and maintain a steady income.

**Steps**:
1. click: click the "Iron Ore" resource card in the market table area
2. click: click the "AUTO" toggle button in the selected resource detail area

**Verification**:
1. assert: text "AUTO" on the Iron Ore resource card in the market list
2. refresh: refresh the page
3. assert: text "AUTO" on the Iron Ore resource card in the market list

**Expected Result**: The auto-sell state is toggled and the UI reflects the change.
