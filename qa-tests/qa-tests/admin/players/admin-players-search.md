---
title: "Search players by display name"
description: "Verify that the player directory can be searched by display name."
intent: "Admins need to quickly find specific players by their display name or email to perform moderation actions or investigate issues."
criticality: high
scenario: standard
flow: "Admin - Player Management"
verification: "Assert that \"SteelTycoon\" is visible in the players table."
---

**Setup**: Navigate to the /admin/players page.

**Intent**: Admins need to quickly find specific players by their display name or email to perform moderation actions or investigate issues.

**Steps**:
1. type: type "SteelTycoon" in the search input field
2. click: click the "Search" button next to the search input field

**Verification**:
1. assert: text "SteelTycoon" in the players table row

**Expected Result**: The table only displays players that match the search query.
