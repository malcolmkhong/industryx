---
title: "Start and verify MegaProject resources"
description: "Start a MegaProject and manually verify resources to ensure progress."
intent: "Starting a MegaProject and clicking 'Verify Resources' should confirm that the player holds the necessary materials to continue construction, ensuring the project doesn't remain paused."
criticality: high
scenario: standard
flow: "Progression"
verification: "Verify the project status is 'BUILDING' and not 'PAUSED'."
---

**Setup**: Navigate to the MegaProjects page. Ensure you have an unlocked project and sufficient resources for its first stage.

**Intent**: Starting a MegaProject and clicking 'Verify Resources' should confirm that the player holds the necessary materials to continue construction, ensuring the project doesn't remain paused.

**Steps**:
1. click: the "Begin Space Elevator" button (or similar) on the Space Elevator project card
2. click: the "Verify Resources" button on the Space Elevator project card

**Verification**:
1. assert: text "BUILDING" on the Space Elevator project card badge

**Expected Result**: The project starts and the resource verification step is completed.
