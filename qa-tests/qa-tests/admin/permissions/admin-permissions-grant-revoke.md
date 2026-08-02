---
title: "Grant and revoke admin permissions"
description: "Verify that an admin can grant and revoke permissions for another admin user."
intent: "Admins must be able to manage granular access control for other admin users by granting or revoking specific permissions."
criticality: high
scenario: standard
flow: "Admin - Player Management"
verification: "Assert that the \"Grant\" button is visible again for the manage_market permission."
---

**Setup**: Navigate to the /admin/permissions page.

**Intent**: Admins must be able to manage granular access control for other admin users by granting or revoking specific permissions.

**Steps**:
1. type: type "admin-2" in the Admin User ID input field
2. click: click the "Load" button next to the user ID input field
3. assert: assert: text "Permissions for admin-2" is visible in the permissions list header area
4. click: click the "Grant" button for the "manage_market" permission in the permissions list row for manage_market
5. assert: assert: text "Revoke" is visible for the "manage_market" permission in the manage_market row
6. click: click the "Revoke" button for the "manage_market" permission in the manage_market row

**Verification**:
1. assert: text "Grant" in the manage_market row area

**Expected Result**: The permission is successfully toggled and the UI reflects the change.
