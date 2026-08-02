---
title: "Manage and reset quick access shortcuts"
description: "Remove a quick access shortcut and then reset the list to default."
intent: "Players can customize their quick access shortcuts by removing unwanted ones, and can easily revert to the default configuration using the reset button."
criticality: low
scenario: standard
flow: "Dashboard"
verification: "Verify the removed shortcut is back in the list."
---

**Setup**: Navigate to the Settings page.

**Intent**: Players can customize their quick access shortcuts by removing unwanted ones, and can easily revert to the default configuration using the reset button.

**Steps**:
1. click: the "Trash" icon button next to the first shortcut in the Quick Access Shortcuts list
2. click: the "Reset" button in the Quick Access Shortcuts section header

**Verification**:
1. assert: text "Dashboard" (or whatever the first default shortcut is) in the Quick Access Shortcuts list

**Expected Result**: The shortcut is removed, and then the entire list is restored to its default state after clicking reset.
