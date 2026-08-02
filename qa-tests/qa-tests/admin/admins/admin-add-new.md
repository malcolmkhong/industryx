---
title: "Add a new admin user"
description: "Verify that a super admin can add a new admin user."
intent: "Super admins must be able to grant administrative access to other users by providing their Supabase Auth UUID and email."
criticality: high
scenario: standard
flow: "Admin - Player Management"
verification: "Assert that the success message \"Admin added successfully\" is visible and the new email appears in the table."
---

**Setup**: Navigate to the /admin/admins page.

**Intent**: Super admins must be able to grant administrative access to other users by providing their Supabase Auth UUID and email.

**Steps**:
1. click: click the "Add Admin" button in the page header
2. type: type "550e8400-e29b-41d4-a716-446655440000" in the User UUID input field in the modal
3. type: type "new-admin@example.com" in the Email input field in the modal
4. click: click the "Add Admin" button in the modal footer

**Verification**:
1. assert: text "Admin added successfully" in the success notification area
2. assert: text "new-admin@example.com" in the admin users table

**Expected Result**: The new admin is added to the list and a success message is displayed.
