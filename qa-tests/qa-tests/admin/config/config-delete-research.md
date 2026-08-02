---
title: "Delete research configuration"
description: "Verify that an admin can delete a research entry."
intent: "Admins must be able to remove configuration entries that are no longer needed or were created in error."
criticality: high
scenario: standard
flow: "Admin - Configuration"
verification: "Assert that the success message \"Row deleted successfully\" is visible and \"Basic Mining\" is no longer in the table."
---

**Setup**: Navigate to the /admin/config page and select the "Research" table.

**Intent**: Admins must be able to remove configuration entries that are no longer needed or were created in error.

**Steps**:
1. type: type "Basic Mining" in the search input field
2. hover: hover over the "Basic Mining" row in the research table
3. click: click the "Delete row" button in the actions column of the Basic Mining row
4. assert: assert: text "Delete Row" is visible in the confirmation dialog header
5. click: click the "Delete" button in the confirmation dialog footer

**Verification**:
1. assert: text "Row deleted successfully" in the success notification area
2. type: type "Basic Mining" in the search input field
3. assert: text "No rows match your search." in the table area

**Expected Result**: The research entry is removed from the table.
