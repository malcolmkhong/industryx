---
title: "View investigation details modal"
description: "Verify that an admin can view the full details of an investigation."
intent: "Admins need to see the full context of an investigation, including the detection type, severity, and description, to make an informed decision."
criticality: mid
scenario: standard
flow: "Admin - Investigations"
verification: "Assert that the modal is closed and the investigations table is visible."
---

**Setup**: Navigate to the /admin/investigations page.

**Intent**: Admins need to see the full context of an investigation, including the detection type, severity, and description, to make an informed decision.

**Steps**:
1. click: click the "View" button for the investigation on "user-4" in the investigations table row for user-4
2. assert: assert: text "Investigation Detail" is visible in the modal header
3. click: click the "Close details" button in the modal header

**Verification**:
1. assert: text "Cheat Investigations" as a page heading

**Expected Result**: A modal appears showing the full details of the selected investigation.
