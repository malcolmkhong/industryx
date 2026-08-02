---
title: "Edit building configuration"
description: "Verify that an admin can edit an existing building configuration."
intent: "Admins must be able to tune game balance by modifying building costs and other parameters in the configuration."
criticality: high
scenario: standard
flow: "Admin - Configuration"
verification: "Assert that the success message \"Row updated successfully\" is visible and the new cost is reflected."
---

**Setup**: Navigate to the /admin/config page and select the "Buildings" table.

**Intent**: Admins must be able to tune game balance by modifying building costs and other parameters in the configuration.

**Steps**:
1. type: type "Iron Mine" in the search input field
2. hover: hover over the "Iron Mine" row in the buildings table
3. click: click the "Edit row" button in the actions column of the Iron Mine row
4. type: type "{\"money\":150}" in the baseCost JSON textarea in the modal
5. click: click the "Save Changes" button in the modal footer

**Verification**:
1. assert: text "Row updated successfully" in the success notification area
2. type: type "Iron Mine" in the search input field
3. assert: text "{\"money\":150}" in the baseCost column of the Iron Mine row

**Expected Result**: The building's cost is updated in the table.
