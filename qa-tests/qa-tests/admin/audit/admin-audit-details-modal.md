---
title: "View admin action details modal"
description: "Verify that clicking \"View\" on an admin action opens a details modal."
intent: "Admins need to see the full context and details of a moderation action, including the reason and any associated metadata."
criticality: mid
scenario: standard
flow: "Admin - Player Management"
verification: "Assert that the modal is closed and \"Action Details\" is no longer visible."
---

**Setup**: Navigate to the /admin/actions/admin page.

**Intent**: Admins need to see the full context and details of a moderation action, including the reason and any associated metadata.

**Steps**:
1. click: click the "View" button in the first row of the actions table
2. assert: assert: text "Action Details" is visible in the modal header
3. click: click the "Close details" button in the modal header

**Verification**:
1. assert: text "Admin Action Log" as a page heading

**Expected Result**: A modal appears showing the full details of the selected admin action.
