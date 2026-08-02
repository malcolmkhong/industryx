---
title: "Initiate GitHub OAuth login for admin"
description: "Verify that the GitHub login button initiates the OAuth flow."
intent: "Admins must be able to initiate authentication via GitHub to access the backend management console."
criticality: high
scenario: standard
flow: "Authentication & Bootstrap"
verification: "Assert that the button enters a loading state. We cannot verify the external redirect."
---

**Setup**: Navigate to the /admin/login page.

**Intent**: Admins must be able to initiate authentication via GitHub to access the backend management console.

**Steps**:
1. click: click the "Sign in with GitHub" button in the login card
2. click: click the "Sign in with GitHub" button in the login card

**Verification**:
1. assert: text "Connecting..." on the GitHub sign-in button

**Expected Result**: The button changes to a loading state and attempts to redirect to GitHub.
