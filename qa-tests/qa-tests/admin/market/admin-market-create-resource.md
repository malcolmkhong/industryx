---
title: "Create a new market resource"
description: "Verify that an admin can create a new market resource."
intent: "Admins must be able to add new resources to the global market to expand the game's economy and trading options."
criticality: high
scenario: standard
flow: "Admin - Economy & Market"
verification: "Assert that \"uranium\" appears in the market control table."
---

**Setup**: Navigate to the /admin/market page.

**Intent**: Admins must be able to add new resources to the global market to expand the game's economy and trading options.

**Steps**:
1. click: click the "Create Resource" button in the page header area
2. type: type "uranium" in the Resource ID input field in the modal
3. type: type "500" in the Base Price input field in the modal
4. click: click the "Sector" dropdown trigger in the modal
5. click: click the "High Tech" option in the Sector dropdown content
6. click: click the "Create Resource" button in the modal footer

**Verification**:
1. assert: text "uranium" in the market control table row

**Expected Result**: The new resource is created and appears in the market control table.
