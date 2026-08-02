---
title: "Extraction to Factory Expansion Journey"
description: "Verifies the core loop of extracting resources, selling them for profit, and using that profit to build processing factories."
intent: "Verifies that the output of Extraction (Iron Ore) can be converted into currency via the Market, and that currency is correctly recognized by the Factory system to enable building Tier 1 facilities. This tests the fundamental economic and production integration."
criticality: critical
scenario: standard
flow: "Industrial Production Loop"
verification: "Navigate to the Factories page and verify the Smelter is active and producing."
---

**Setup**: The user starts on the Dashboard and navigates to the Extraction page.

**Intent**: Verifies that the output of Extraction (Iron Ore) can be converted into currency via the Market, and that currency is correctly recognized by the Factory system to enable building Tier 1 facilities. This tests the fundamental economic and production integration.

**Steps**:
1. assert: text "Resource Extraction" as a page heading as a page heading
2. click: the "Build" button for "Iron Mine" in the "Basic Mining" tab in the Basic Mining tab of the Resource Extraction panel
3. assert: text "1" in the "Active" count for "Iron Mine" on the Iron Mine card in the Resource Extraction panel
4. click: the "Market" tab in the sidebar in the sidebar navigation
5. click: the "Iron Ore" resource card in the market list in the market resource list
6. click: the "MAX" button in the trade controls in the trade controls panel
7. click: the "Sell" button in the trade controls in the trade controls panel
8. click: the "Factories" tab in the sidebar in the sidebar navigation
9. click: the "Build" button for "Smelter" in the "T1 — Basic Processing" tab in the T1 tab of the Processing Factories panel

**Verification**:
1. assert: text "Processing Factories" as a page heading as a page heading
2. assert: text "1" in the "Active" count for "Smelter" on the Smelter card in the Processing Factories panel
3. assert: text "+1.0/s" for "Iron Ingot" production on the Smelter card in the Processing Factories panel

**Expected Result**: The player successfully builds a mine, sells its output, and uses the proceeds to build a factory, completing the first stage of industrialization.
