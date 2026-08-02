---
title: "Buy resources from the market"
description: "Verify that a player can buy a resource from the market."
intent: "Players must be able to buy resources from the market to supply their factories when internal production is insufficient."
criticality: high
scenario: standard
flow: "Market"
verification: "Assert that the money balance decreases and the Coal count increases."
---

**Setup**: Navigate to the /game/market page as user-1.

**Intent**: Players must be able to buy resources from the market to supply their factories when internal production is insufficient.

**Steps**:
1. click: click the "Coal" resource card in the market table area
2. click: click the "BUY" mode tab in the trade controls area
3. click: click the "10x" quantity button in the trade controls area
4. click: click the "Buy" button in the trade controls area

**Verification**:
1. assert: text "$15,400" is not visible in the money balance badge
2. assert: text "10" in the "You Hold" stat card for Coal

**Expected Result**: The resource is purchased, money decreases, and the resource count increases.
