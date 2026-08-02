---
title: "Create a new game resource"
description: "Verify that an admin can create a new game resource."
intent: "Admins must be able to add new game resources (e.g., \"Gold Ore\") to the configuration to expand game content."
criticality: high
scenario: standard
flow: "Admin - Configuration"
verification: "Assert that the success message \"Row created successfully\" is visible and \"Gold Ore\" appears in the table."
---

**Setup**: Navigate to the /admin/config page and select the "Resources" table.

**Intent**: Admins must be able to add new game resources (e.g., "Gold Ore") to the configuration to expand game content.

**Steps**:
1. click: click the "Add Row" button in the table header area
2. type: type "gold_ore" in the baseId input field in the modal
3. type: type "Gold Ore" in the name input field in the modal
4. type: type "1" in the tier input field in the modal
5. type: type "💰" in the icon input field in the modal
6. type: type "raw_minerals" in the category input field in the modal
7. type: type "1000" in the baseCapacity input field in the modal
8. click: click the "Create" button in the modal footer

**Verification**:
1. assert: text "Row created successfully" in the success notification area
2. type: type "Gold Ore" in the search input field
3. assert: text "Gold Ore" in the resources table row

**Expected Result**: The new resource appears in the table and the row count is updated.
