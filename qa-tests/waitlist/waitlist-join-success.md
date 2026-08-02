---
title: "Successfully join the waitlist"
description: "Verify that a user can successfully join the waitlist by providing an email and name."
intent: "When the system is at capacity, a new user can submit their email and name to join the waitlist, receiving a confirmation of their queue position."
criticality: high
scenario: standard
flow: "Waitlist"
verification: "Assert that the success message \"You're on the list. We'll email you when capacity opens.\" is visible on the page."
---

**Setup**: Navigate to the /waitlist page.

**Intent**: When the system is at capacity, a new user can submit their email and name to join the waitlist, receiving a confirmation of their queue position.

**Steps**:
1. assert: text "you@example.com" in the Email Address input field
2. type: type "tester@example.com" in the Email Address input field
3. type: type "Test User" in the Name input field
4. click: click the "Join Waitlist" button in the waitlist form

**Verification**:
1. assert: text "You're on the list. We'll email you when capacity opens." in the success message area
2. assert: text "Check your inbox for confirmation." in the success message area

**Expected Result**: The waitlist form is replaced by a success message confirming the user's position in line.
