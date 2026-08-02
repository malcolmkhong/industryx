---
title: "Lock player account"
description: "Verify that an admin can lock a player's account with a reason."
intent: "Admins must be able to lock player accounts to prevent further gameplay when cheating or other policy violations are suspected."
criticality: high
scenario: standard
flow: "Admin - Player Management"
verification: "Assert that the success message \"Account locked successfully\" is visible and the status badge shows \"Locked\"."
---

**Setup**: Navigate to the /admin/players/user-1 page.

**Intent**: Admins must be able to lock player accounts to prevent further gameplay when cheating or other policy violations are suspected.

**Steps**:
1. click: click the "Lock Account" button in the player header card area
2. type: type "Suspected speed hacking" in the Reason input field in the modal
3. click: click the "Lock Account" button in the modal footer

**Verification**:
1. assert: text "Account locked successfully" in the success notification area
2. assert: text "Locked" in the status badge in the header card
3. assert: text "Suspected speed hacking" in the lock reason area

**Expected Result**: The account status changes to "Locked" and the reason is displayed.
