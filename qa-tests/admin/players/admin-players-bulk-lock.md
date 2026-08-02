---
title: "Bulk lock players"
description: "Verify that an admin can bulk lock multiple players."
intent: "Admins must be able to perform bulk moderation actions, such as locking multiple accounts simultaneously, to respond to widespread issues or botting."
criticality: high
scenario: standard
flow: "Admin - Player Management"
verification: "Assert that the bulk action result message is visible and both players show the \"Locked\" status."
---

**Setup**: Navigate to the /admin/players page.

**Intent**: Admins must be able to perform bulk moderation actions, such as locking multiple accounts simultaneously, to respond to widespread issues or botting.

**Steps**:
1. click: click the checkbox for "SteelTycoon" in the players table row for user-1
2. click: click the checkbox for "OilBaron" in the players table row for user-2
3. assert: assert: text "2 players selected" is visible in the bulk action bar
4. click: click the "Lock" button in the bulk action bar

**Verification**:
1. assert: text "Locked 2/2" in the bulk action result area
2. assert: text "Locked" in the status column for SteelTycoon row
3. assert: text "Locked" in the status column for OilBaron row

**Expected Result**: The selected players are locked and a success message is displayed.
