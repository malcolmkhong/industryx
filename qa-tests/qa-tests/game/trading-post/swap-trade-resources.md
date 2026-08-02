---
title: "Swap trade resources"
description: "Swap the give and receive resources and verify the exchange interface updates."
intent: "The swap button allows players to quickly reverse their trade direction, facilitating easier comparison of exchange rates."
criticality: low
scenario: standard
flow: "Market"
verification: "Verify the trade appears in the history with the swapped resources."
---

**Setup**: Navigate to the Trading Post page. Set 'Iron Ore' as give and 'Coal' as receive.

**Intent**: The swap button allows players to quickly reverse their trade direction, facilitating easier comparison of exchange rates.

**Steps**:
1. click: the "Swap give and receive resources" icon button between the Give and Receive sections
2. assert: text "Coal" in the Give resource dropdown trigger
3. assert: text "Iron Ore" in the Receive resource dropdown trigger
4. click: the "Execute Trade" button below the exchange interface

**Verification**:
1. assert: text "Coal" as the give resource in the first row of the Recent Trades list

**Expected Result**: The give and receive resources are swapped, and the receive amount is recalculated.
