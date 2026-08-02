---
title: "Search configuration tables"
description: "Verify that the search functionality works for configuration tables."
intent: "Admins need to quickly find specific configuration entries in large tables using the search bar."
criticality: mid
scenario: standard
flow: "Admin - Configuration"
verification: "Assert that \"Iron Ore\" is no longer visible and \"Coal\" is visible."
---

**Setup**: Navigate to the /admin/config page and select the "Resources" table.

**Intent**: Admins need to quickly find specific configuration entries in large tables using the search bar.

**Steps**:
1. type: type "Iron" in the search input field
2. assert: assert: text "Iron Ore" is visible in the resources table
3. assert: assert: text "Iron Ingot" is visible in the resources table
4. type: type "Coal" in the search input field

**Verification**:
1. assert: text "Coal" in the resources table row

**Expected Result**: The table only displays rows that match the search query.
