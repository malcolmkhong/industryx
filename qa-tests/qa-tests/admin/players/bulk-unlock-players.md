---
title: "Bulk unlock player accounts"
description: "Select multiple locked players and perform a bulk unlock action."
intent: "Admins can efficiently restore access to multiple accounts by performing bulk unlock actions, streamlining the resolution of mass lock events."
criticality: high
scenario: standard
flow: "Admin - Player Management"
verification: "Verify the status badges for the selected players change to 'Active'."
---

**Setup**: Navigate to the Admin Players page. Ensure there are at least two locked players in the list.

**Intent**: Admins can efficiently restore access to multiple accounts by performing bulk unlock actions, streamlining the resolution of mass lock events.

**Steps**:
1. click: the checkbox for the first locked player row in the player table
2. click: the checkbox for the second locked player row in the player table
3. click: the "Unlock" button in the bulk action bar

**Verification**:
1. assert: text "Active" in the Status column for the first selected player
2. assert: text "Active" in the Status column for the second selected player

**Expected Result**: The selected players are unlocked, and their status badges update to 'Active'.
