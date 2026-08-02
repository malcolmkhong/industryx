---
title: "Manage support ticket lifecycle"
description: "Verify that an admin can accept and then resolve a support ticket."
intent: "Admins must be able to manage the lifecycle of support tickets, moving them from open to accepted and finally to resolved after addressing the player's issue."
criticality: high
scenario: standard
flow: "Admin - Player Management"
verification: "Assert that the ticket status is now \"resolved\"."
---

**Setup**: Navigate to the /admin/support page.

**Intent**: Admins must be able to manage the lifecycle of support tickets, moving them from open to accepted and finally to resolved after addressing the player's issue.

**Steps**:
1. click: click the "Missing daily reward" ticket in the tickets list sidebar
2. assert: assert: text "Missing daily reward" is visible in the ticket detail header area
3. click: click the "Accept" button in the ticket detail header area
4. assert: assert: text "accepted" is visible in the ticket status badge in the header area
5. click: click the "Resolve" button in the ticket detail header area

**Verification**:
1. assert: text "resolved" in the ticket status badge in the header area

**Expected Result**: The ticket status changes to "accepted" and then to "resolved".
