---
title: "Save and rename factory blueprint"
description: "Save the current factory layout as a blueprint and then rename it."
intent: "Players should be able to capture their current factory configuration as a blueprint and customize its name for better organization and future reference."
criticality: high
scenario: standard
flow: "Factories"
verification: "Verify the blueprint card displays the new name \"Optimized Iron Line\"."
---

**Setup**: Navigate to the Blueprints page by clicking "Blueprints" in the "System" section of the sidebar. Ensure you have at least one building in your factory.

**Intent**: Players should be able to capture their current factory configuration as a blueprint and customize its name for better organization and future reference.

**Steps**:
1. assert: text "Blueprints" as a page heading
2. click: the "Save" button in the Save Current Layout section
3. click: the "Rename blueprint" icon button on the newly saved blueprint card
4. type: "Optimized Iron Line" into the "Rename value" input on the blueprint card in edit mode
5. click: the "Confirm rename" icon button on the blueprint card in edit mode

**Verification**:
1. assert: text "Optimized Iron Line" on the blueprint card in the Saved Blueprints list

**Expected Result**: The blueprint is saved with an auto-generated name and then successfully renamed to a custom value.
