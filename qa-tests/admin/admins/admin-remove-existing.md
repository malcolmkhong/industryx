---
title: "Remove an admin user"
description: "Verify that a super admin can remove an existing admin user."
intent: "Super admins must be able to revoke administrative access from users when it is no longer required."
criticality: high
scenario: standard
flow: "Admin - Player Management"
verification: "Assert that the success message \"Admin removed successfully\" is visible and \"Moderator 7\" is no longer in the table."
---

**Setup**: Navigate to the /admin/admins page.

**Intent**: Super admins must be able to revoke administrative access from users when it is no longer required.

**Steps**:
1. click: click the "Remove" button for "Moderator 7" in the admin users table
2. assert: assert: text "Remove Admin" is visible in the confirmation modal header
3. click: click the "Remove" button in the confirmation modal footer

**Verification**:
1. assert: text "Admin removed successfully" in the success notification area
2. refresh: refresh the page
3. assert: text "Moderator 7" is not visible in the admin users table

**Expected Result**: The admin is removed from the list after confirmation.
