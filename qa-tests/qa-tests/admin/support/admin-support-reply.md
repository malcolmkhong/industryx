---
title: "Reply to support ticket"
description: "Verify that an admin can reply to a support ticket."
intent: "Admins must be able to communicate with players through support tickets to gather more information or provide assistance."
criticality: high
scenario: standard
flow: "Admin - Player Management"
verification: "Assert that the message \"We are looking into this for you.\" is visible in the message history."
---

**Setup**: Navigate to the /admin/support page.

**Intent**: Admins must be able to communicate with players through support tickets to gather more information or provide assistance.

**Steps**:
1. click: click the "Missing daily reward" ticket in the tickets list sidebar
2. type: type "We are looking into this for you." in the reply input field
3. click: click the "Send reply" button next to the reply input field

**Verification**:
1. assert: text "We are looking into this for you." in the ticket message history area

**Expected Result**: The reply is added to the ticket's message history.
