---
title: "Sell resources on the market"
description: "Verify that a player can sell a resource on the market."
intent: "Players must be able to sell their produced resources on the global market to generate money for further expansion and upgrades."
criticality: high
scenario: standard
flow: "Market"
verification: "Assert that the money balance increases and the Iron Ingot count decreases."
---

**Setup**: Navigate to the /game/market page as user-2 (who has 100 Iron Ingot).

**Intent**: Players must be able to sell their produced resources on the global market to generate money for further expansion and upgrades.

**Steps**:
1. click: click the "Iron Ingot" resource card in the market table area
2. click: click the "SELL" mode tab in the trade controls area
3. click: click the "100x" quantity button in the trade controls area
4. click: click the "Sell" button in the trade controls area

**Verification**:
1. assert: text "$890,200" is not visible in the money balance badge
2. assert: text "0" in the "You Hold" stat card for Iron Ingot

**Expected Result**: The resource is sold, money increases, and the resource count decreases.
