---
title: "Clear market circuit breakers"
description: "Verify that an admin can clear active circuit breakers."
intent: "Admins must be able to manually clear market circuit breakers to restore trading when a price spike has been addressed or deemed acceptable."
criticality: mid
scenario: standard
flow: "Admin - Economy & Market"
verification: "Assert that the \"Clear breaker\" button is no longer visible."
---

**Setup**: Navigate to the /admin/market page. (Assume at least one breaker is active for this test).

**Intent**: Admins must be able to manually clear market circuit breakers to restore trading when a price spike has been addressed or deemed acceptable.

**Steps**:
1. click: click the "Clear breaker" button in the page header area
2. click: click the "Refresh" button in the page header area

**Verification**:
1. assert: text "Clear breaker" is not visible in the page header area

**Expected Result**: The circuit breakers are cleared and the "Clear breaker" button disappears.
