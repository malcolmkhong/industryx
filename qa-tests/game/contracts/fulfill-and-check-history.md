---
title: "Fulfill contract and verify history log"
description: "Fulfill a contract and verify it moves to the history log."
intent: "Fulfilling a contract should transition it from the active state to the completed state, making it visible in the history log for record-keeping."
criticality: high
scenario: standard
flow: "Market"
verification: "Verify the contract is listed as 'Done' in the history."
---

**Setup**: Navigate to the Contracts page. Ensure you have sufficient resources for a T0 contract.

**Intent**: Fulfilling a contract should transition it from the active state to the completed state, making it visible in the history log for record-keeping.

**Steps**:
1. click: the "Fulfill Contract" button on an active T0 contract card
2. click: the "Contract History" button in the history section

**Verification**:
1. assert: text "Done" next to the contract name in the history list

**Expected Result**: The contract is removed from the active list and appears in the history log with a 'Done' status.
