---
title: "Copy shareable permissions link"
description: "Verify that the \"Copy shareable link\" button works."
intent: "Admins should be able to easily share a direct link to a specific admin's permissions page with other moderators."
criticality: low
scenario: standard
flow: "Admin - Player Management"
verification: "Assert that no error message is displayed after clicking. (Note: clipboard content cannot be asserted)."
---

**Setup**: Navigate to the /admin/permissions page.

**Intent**: Admins should be able to easily share a direct link to a specific admin's permissions page with other moderators.

**Steps**:
1. type: type "admin-2" in the Admin User ID input field
2. click: click the "Copy shareable link" button next to the Load button

**Verification**:
1. assert: text "Permissions" as a page heading

**Expected Result**: The shareable link is copied to the clipboard.
