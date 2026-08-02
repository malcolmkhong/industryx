---
title: "Start multiple MegaProjects"
description: "Start two different MegaProjects and verify their resources."
intent: "Players should be able to initiate multiple MegaProjects simultaneously, provided they meet the unlock requirements for each, allowing for parallel endgame progression."
criticality: high
scenario: standard
flow: "Progression"
verification: "Verify both project cards show an active status badge."
---

**Setup**: Navigate to the MegaProjects page. Ensure you have at least two unlocked projects.

**Intent**: Players should be able to initiate multiple MegaProjects simultaneously, provided they meet the unlock requirements for each, allowing for parallel endgame progression.

**Steps**:
1. click: the "Begin Space Elevator" button (or similar) on the Space Elevator project card
2. click: the "Begin Quantum Internet" button (or similar) on the Quantum Internet project card

**Verification**:
1. assert: text "BUILDING" or "PAUSED" on the Space Elevator project card badge
2. assert: text "BUILDING" or "PAUSED" on the Quantum Internet project card badge

**Expected Result**: Both projects are started and their resource requirements are displayed.
