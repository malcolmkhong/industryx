---
title: "Sort storage by stock level"
description: "Sort the storage overview by stock level and verify the order."
intent: "Sorting by stock level helps players identify which resources they have in abundance and which are running low, facilitating better production planning."
criticality: low
scenario: standard
flow: "Storage"
verification: "Verify the resource with the highest stock is at the top of its tier group."
---

**Setup**: Navigate to the Storage page. Ensure the controls panel is expanded and the Overview mode is active.

**Intent**: Sorting by stock level helps players identify which resources they have in abundance and which are running low, facilitating better production planning.

**Steps**:
1. click: the "Stock" button in the Sort Mode tabs in the controls panel
2. click: the "Tier 1 — Basic" tier header in the storage overview list

**Verification**:
1. assert: text "500" (or highest stock value) in the first resource row of the expanded tier group

**Expected Result**: The resources are reordered based on the amount currently in stock.
