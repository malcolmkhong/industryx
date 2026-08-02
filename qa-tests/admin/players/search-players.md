---
title: "Search for players in admin table"
description: "Search for a player by display name and verify the results."
intent: "Admins must be able to quickly find specific players using their display name, email, or user ID to perform moderation actions or investigate issues."
criticality: high
scenario: standard
flow: "Admin - Player Management"
verification: "Verify the table shows the player 'SteelTycoon'."
---

**Setup**: Navigate to the Admin Players page at /admin/players.

**Intent**: Admins must be able to quickly find specific players using their display name, email, or user ID to perform moderation actions or investigate issues.

**Steps**:
1. type: "SteelTycoon" into the "Search players" input in the search bar section
2. click: the "Search" button next to the search input

**Verification**:
1. assert: text "SteelTycoon" in the Player column of the table

**Expected Result**: The player table filters to show only the player matching the search query.
