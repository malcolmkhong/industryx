---
title: "Waitlist email validation"
description: "Verify that the waitlist form requires a valid email address."
intent: "The waitlist form must enforce email validation to ensure only valid contact information is collected."
criticality: mid
scenario: standard
flow: "Waitlist"
verification: "Assert that the form is not submitted and an error message or browser validation is triggered. Since we can't assert browser tooltips, we check that the success message is NOT present."
---

**Setup**: Navigate to the /waitlist page.

**Intent**: The waitlist form must enforce email validation to ensure only valid contact information is collected.

**Steps**:
1. type: type "invalid-email" in the Email Address input field
2. click: click the "Join Waitlist" button in the waitlist form

**Verification**:
1. assert: text "Join Waitlist" on the submit button

**Expected Result**: The browser prevents form submission or the API returns an error message for an invalid email.
