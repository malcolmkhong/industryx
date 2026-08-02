---
title: "Delete a market resource"
description: "Verify that an admin can delete a market resource."
intent: "Admins must be able to remove resources from the market that are no longer needed or were created in error."
criticality: high
scenario: standard
flow: "Admin - Economy & Market"
verification: "Assert that \"iron_ore\" is no longer visible in the market control table."
---

**Setup**: Navigate to the /admin/market page.

**Intent**: Admins must be able to remove resources from the market that are no longer needed or were created in error.

**Steps**:
1. click: click the "Delete iron_ore" button in the market control table row for iron_ore
2. assert: assert: text "Delete Resource" is visible in the confirmation dialog header
3. click: click the "Delete Permanently" button in the confirmation dialog footer

**Verification**:
1. refresh: refresh the page
2. assert: text "iron_ore" is not visible in the market control table row area

**Expected Result**: The resource is removed from the market control table.
