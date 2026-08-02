---
title: "Adjust sound volume settings"
description: "Adjust master and category sound volumes and verify the values are updated."
intent: "Adjusting sound volume sliders should update the game's audio configuration, allowing players to customize their auditory experience."
criticality: low
scenario: standard
flow: "Dashboard"
verification: "Verify the volume percentage text updates."
---

**Setup**: Navigate to the Settings page.

**Intent**: Adjusting sound volume sliders should update the game's audio configuration, allowing players to customize their auditory experience.

**Steps**:
1. drag: the "Master Volume" slider in the Sound Settings section
2. drag: the "Building" category volume slider in the Sound Settings section

**Verification**:
1. assert: text "50%" (or whatever value was dragged to) next to the Master Volume slider

**Expected Result**: The volume sliders update and the percentage values reflect the new positions.
