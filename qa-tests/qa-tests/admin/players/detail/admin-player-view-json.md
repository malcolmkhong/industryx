---
title: "View full game state JSON"
description: "Verify that an admin can expand and view the full game state JSON."
intent: "Admins need to inspect the raw game state JSON to debug complex issues or verify specific building and resource counts not shown in the summary."
criticality: mid
scenario: standard
flow: "Admin - Player Management"
verification: "Assert that the JSON viewer is expanded. (Note: we check for the presence of line numbers beyond the initial 20)."
---

**Setup**: Navigate to the /admin/players/user-1 page.

**Intent**: Admins need to inspect the raw game state JSON to debug complex issues or verify specific building and resource counts not shown in the summary.

**Steps**:
1. click: click the "Game State (JSONB)" button in the game state viewer section
2. click: click the "Expand all" button at the bottom of the JSON viewer area

**Verification**:
1. assert: text "21" in the JSON viewer line numbers

**Expected Result**: The JSON viewer expands to show the full game state.
