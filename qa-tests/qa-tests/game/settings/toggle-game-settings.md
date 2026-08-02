---
title: "Toggle and persist game settings"
description: "Toggle various game settings and verify they persist after a refresh."
intent: "Toggling game settings like Auto-Save and Floating Numbers should update the application's configuration and persist the changes across sessions."
criticality: mid
scenario: standard
flow: "Dashboard"
verification: "Verify the switches retain their new states after refresh."
---

**Setup**: Navigate to the Settings page by clicking "Settings" in the "System" section of the sidebar.

**Intent**: Toggling game settings like Auto-Save and Floating Numbers should update the application's configuration and persist the changes across sessions.

**Steps**:
1. assert: text "Settings" as a page heading
2. click: the "Auto-Save" switch in the Game Settings section
3. click: the "Floating Numbers" switch in the Display Settings section
4. refresh: refresh the page

**Verification**:
1. assert: the "Auto-Save" switch in the Game Settings section
2. assert: the "Floating Numbers" switch in the Display Settings section

**Expected Result**: The settings are updated and remain in their new state after the page is reloaded.
