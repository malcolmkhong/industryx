---
title: "Pin and unpin quest"
description: "Pin a quest to the dashboard and then unpin it."
intent: "Players can pin a specific quest to track its progress more easily, and can unpin it when they no longer wish to focus on that objective."
criticality: mid
scenario: standard
flow: "Quests & Achievements"
verification: "Verify the Tracked Quest Indicator is no longer visible."
---

**Setup**: Navigate to the Quests page. Ensure there is at least one active quest.

**Intent**: Players can pin a specific quest to track its progress more easily, and can unpin it when they no longer wish to focus on that objective.

**Steps**:
1. click: the "Track quest on dashboard" icon button on an active quest card
2. assert: text "Tracked Quest" in the Tracked Quest Indicator section
3. click: the "Untrack quest" icon button on the same quest card

**Verification**:
1. assert: text "Tracked Quest" in the quest panel

**Expected Result**: The quest is pinned (tracked) and then successfully unpinned.
