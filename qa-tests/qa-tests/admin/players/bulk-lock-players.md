---
title: "Bulk lock player accounts"
description: "Select multiple players and perform a bulk lock action."
intent: "Admins can perform bulk moderation actions like locking multiple accounts simultaneously to efficiently handle large-scale issues or policy violations."
criticality: high
scenario: standard
flow: "Admin - Player Management"
verification: "Verify the status badges for the selected players change to 'Locked'."
---

**Setup**: Navigate to the Admin Players page. Ensure there are at least two active players in the list.

**Intent**: Admins can perform bulk moderation actions like locking multiple accounts simultaneously to efficiently handle large-scale issues or policy violations.

**Steps**:
1. click: the checkbox for the first player row in the player table
2. click: the checkbox for the second player row in the player table
3. click: the "Lock" button in the bulk action bar

**Verification**:
1. assert: text "Locked" in the Status column for the first selected player
2. assert: text "Locked" in the Status column for the second selected player

**Expected Result**: The selected players are locked, and their status badges update to 'Locked'.
