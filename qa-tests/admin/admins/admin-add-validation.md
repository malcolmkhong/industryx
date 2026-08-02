---
title: "Add admin form validation"
description: "Verify validation when adding a new admin with invalid data."
intent: "The add admin form must validate input formats to prevent database errors and ensure data integrity."
criticality: mid
scenario: standard
flow: "Admin - Player Management"
verification: "Assert that an error message \"Invalid UUID format\" or similar is displayed."
---

**Setup**: Navigate to the /admin/admins page.

**Intent**: The add admin form must validate input formats to prevent database errors and ensure data integrity.

**Steps**:
1. click: click the "Add Admin" button in the page header
2. type: type "invalid-uuid" in the User UUID input field in the modal
3. type: type "not-an-email" in the Email input field in the modal
4. click: click the "Add Admin" button in the modal footer

**Verification**:
1. assert: text "Invalid UUID format" in the error notification area in the modal

**Expected Result**: Error messages are displayed for invalid UUID or email formats.
