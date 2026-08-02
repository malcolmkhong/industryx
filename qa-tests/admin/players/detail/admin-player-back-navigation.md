---
title: "Navigate back to player list"
description: "Verify that the \"Back to Players\" link works."
intent: "Admins should be able to easily return to the main player list after inspecting a specific player's profile."
criticality: low
scenario: standard
flow: "Admin - Player Management"
verification: "Assert that the player directory is visible."
---

**Setup**: Navigate to the /admin/players/user-1 page.

**Intent**: Admins should be able to easily return to the main player list after inspecting a specific player's profile.

**Steps**:
1. click: click the "Back to Players" link at the top of the page
2. click: click the "Back to Players" link at the top of the page

**Verification**:
1. assert: text "Players" as a page heading

**Expected Result**: The admin is navigated back to the player directory.
