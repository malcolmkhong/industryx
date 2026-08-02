---
title: "Upgrade resource storage capacity"
description: "Upgrade storage capacity for a specific resource and verify the increase."
intent: "Upgrading a resource's storage should increase its maximum capacity and update its storage level, allowing the player to stockpile more materials for large projects."
criticality: high
scenario: standard
flow: "Storage"
verification: "Verify the storage level is LV1 and the capacity has increased."
---

**Setup**: Navigate to the Storage page by clicking "Storage" in the "Production" section of the sidebar. Ensure you have enough money (e.g., $15,400).

**Intent**: Upgrading a resource's storage should increase its maximum capacity and update its storage level, allowing the player to stockpile more materials for large projects.

**Steps**:
1. click: the "Tier 1 — Basic" tier header in the storage overview list
2. click: the "Iron Ore" resource row in the Tier 1 list
3. click: the "+1 Level ($100)" button in the Iron Ore detail section

**Verification**:
1. assert: text "LV1" in the Iron Ore detail section badge
2. assert: text "750" (or similar increased capacity from 500) in the Iron Ore detail section capacity display

**Expected Result**: The storage level increases, capacity is updated, and money is deducted.
