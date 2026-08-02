---
title: "Filter quests by status"
description: "Filter quests by 'Active' and 'Done' status and verify the list updates."
intent: "Status filters allow players to quickly view their current objectives or review their past accomplishments, improving quest management."
criticality: low
scenario: standard
flow: "Quests & Achievements"
verification: "Verify that only claimed quests are visible."
---

**Setup**: Navigate to the Quests page. Ensure there are both active and claimed quests.

**Intent**: Status filters allow players to quickly view their current objectives or review their past accomplishments, improving quest management.

**Steps**:
1. click: the "Active" filter button in the Quick filter pills section
2. assert: text "CLAIMED" in the quest list
3. click: the "Done" filter button in the Quick filter pills section

**Verification**:
1. assert: text "CLAIMED" on all visible quest cards

**Expected Result**: The quest list correctly filters based on the selected status.
