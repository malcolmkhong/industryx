---
title: "Filter market by sector"
description: "Verify that the market sector filters work."
intent: "Players need to filter the market by sector (e.g., \"Raw Minerals\", \"Components\") to quickly find and trade specific categories of resources."
criticality: mid
scenario: standard
flow: "Market"
verification: "Assert that \"Iron Ore\" is no longer visible and \"Iron Ingot\" is visible."
---

**Setup**: Navigate to the /game/market page.

**Intent**: Players need to filter the market by sector (e.g., "Raw Minerals", "Components") to quickly find and trade specific categories of resources.

**Steps**:
1. click: click the "Raw Minerals" sector filter button in the market filters area
2. assert: assert: text "Iron Ore" is visible in the market list area
3. click: click the "Basic Materials" sector filter button in the market filters area

**Verification**:
1. assert: text "Iron Ore" is not visible in the market list area
2. assert: text "Iron Ingot" in the market list area row

**Expected Result**: The market list only displays resources from the selected sector.
