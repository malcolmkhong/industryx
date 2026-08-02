---
title: "Switch worker type in Efficiency Radar"
description: "Switch between worker types in the Efficiency Radar and verify the chart updates."
intent: "Selecting different worker types in the radar chart section should update the visual representation and the average stats displayed below it."
criticality: low
scenario: standard
flow: "Workers"
verification: "Verify the radar chart footer text updates to the newly selected type."
---

**Setup**: Navigate to the Workers page.

**Intent**: Selecting different worker types in the radar chart section should update the visual representation and the average stats displayed below it.

**Steps**:
1. click: the "Select Mechanic" icon button in the Efficiency Radar section type selector
2. assert: text "Avg stats for Mechanic workers" below the radar chart
3. click: the "Select Transport Manager" icon button in the Efficiency Radar section type selector

**Verification**:
1. assert: text "Avg stats for Transport Manager workers" below the radar chart

**Expected Result**: The radar chart and average stats update to reflect the selected worker type.
