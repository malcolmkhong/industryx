---
title: "Edit market resource parameters"
description: "Verify that an admin can edit an existing market resource."
intent: "Admins must be able to tune market parameters like base price and elasticity to maintain economic stability and respond to player behavior."
criticality: high
scenario: standard
flow: "Admin - Economy & Market"
verification: "Assert that the new base price \"15.00\" is reflected in the table for iron_ore."
---

**Setup**: Navigate to the /admin/market page.

**Intent**: Admins must be able to tune market parameters like base price and elasticity to maintain economic stability and respond to player behavior.

**Steps**:
1. click: click the "Edit iron_ore" button in the market control table row for iron_ore
2. type: type "15" in the Base Price input field in the modal
3. drag: drag the "Elasticity" slider to a new value in the modal
4. click: click the "Save Changes" button in the modal footer

**Verification**:
1. assert: text "15.00" in the Base column for the iron_ore row

**Expected Result**: The resource's base price and elasticity are updated.
