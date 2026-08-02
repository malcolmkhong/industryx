---
title: "Market Volatility Response Journey"
description: "Verifies the player's ability to respond to market news and price shifts by adjusting their production and trading strategy."
intent: "Verifies the integration between Market News, Price History, and the Auto-Sell automation. The player must consume information from the news feed and use it to configure automated trading behavior. This tests the high-level economic management loop."
criticality: critical
scenario: standard
flow: "Economic Loop"
verification: "Verify that Auto-Sell is enabled for Iron Ingot."
---

**Setup**: The user starts on the Market page.

**Intent**: Verifies the integration between Market News, Price History, and the Auto-Sell automation. The player must consume information from the news feed and use it to configure automated trading behavior. This tests the high-level economic management loop.

**Steps**:
1. assert: text "Market News" as a section heading in the News tab of the Market panel
2. click: the "News" tab button in the Market panel view selector
3. assert: text "Market Boom" in the news feed (from event_templates) in the market news list
4. click: the "Market" tab button in the Market panel view selector
5. click: the "Iron Ingot" resource card in the market resource list
6. assert: text "$28.50" as the current price (from user-2 trade history data) in the selected resource detail panel
7. click: the "Buy" tab button in the trade controls panel
8. click: the "100x" quantity button in the trade controls panel
9. click: the "Buy" button in the trade controls panel
10. click: the "AUTO" toggle button in the selected resource detail panel

**Verification**:
1. assert: text "AUTO" with a green background/active state on the Iron Ingot card on the Iron Ingot card in the market list
2. assert: text "AUTO" in the selected resource detail panel in the selected resource detail panel

**Expected Result**: The player identifies a profitable opportunity via news, buys the resource, and enables auto-sell to capture future gains.
