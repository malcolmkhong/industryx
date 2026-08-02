---
title: "Switch storage panel view modes"
description: "Switch between Overview, Chains, and Alerts view modes in the storage panel."
intent: "Players should be able to toggle between different data visualizations (Overview, Production Chains, and Alerts) to effectively manage their empire's logistics and identify bottlenecks."
criticality: mid
scenario: standard
flow: "Storage"
verification: "Verify the Alerts view is displayed."
---

**Setup**: Navigate to the Storage page. Ensure the controls panel is expanded.

**Intent**: Players should be able to toggle between different data visualizations (Overview, Production Chains, and Alerts) to effectively manage their empire's logistics and identify bottlenecks.

**Steps**:
1. click: the "Chains" button in the View Mode tabs in the controls panel
2. assert: text "BLOCKED" or "ACTIVE" in the production chains list
3. click: the "Alerts" button in the View Mode tabs in the controls panel

**Verification**:
1. assert: text "No Storage Alerts" or an alert list in the storage panel content area

**Expected Result**: The storage panel content updates to reflect the selected view mode.
