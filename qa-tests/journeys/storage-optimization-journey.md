---
title: "Storage Optimization Journey"
description: "Verifies the management of resource stockpiles and the prevention of production stalls due to full storage."
intent: "Verifies that when a resource (Coal) reaches capacity, production correctly stalls (±0/s net), and that upgrading storage capacity (Warehouse) or individual resource storage levels resolves the bottleneck. This tests the storage-production dependency."
criticality: critical
scenario: standard
flow: "Industrial Production Loop"
verification: "Verify that Coal production has resumed and the FULL badge is gone."
---

**Setup**: The user starts on the Extraction page.

**Intent**: Verifies that when a resource (Coal) reaches capacity, production correctly stalls (±0/s net), and that upgrading storage capacity (Warehouse) or individual resource storage levels resolves the bottleneck. This tests the storage-production dependency.

**Steps**:
1. assert: text "Resource Extraction" as a page heading as a page heading
2. assert: text "FULL" badge next to "Coal" in the Raw Materials inventory in the Raw Materials inventory list on the right sidebar
3. assert: text "±0/s" for "Coal" net flow (due to full storage) in the Resource Flow visualization panel
4. click: the "+50% ($100)" upgrade button for "Coal" storage on the Coal inventory card in the Raw Materials inventory list
5. click: the "Market" tab in the sidebar (to perform a second interaction) in the sidebar navigation
6. click: the "Extraction" tab in the sidebar to return and verify state in the sidebar navigation

**Verification**:
1. assert: text "+8.0/s" (or similar positive rate) for "Coal" net flow in the Resource Flow visualization panel on the Extraction page
2. assert: the "FULL" badge is no longer visible for Coal on the Coal inventory card in the Raw Materials inventory list

**Expected Result**: The player identifies a full storage bottleneck, upgrades the storage capacity, and observes production resuming.
