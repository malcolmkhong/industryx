---
title: "Import factory blueprint"
description: "Import a blueprint using a share code and verify it appears in the list."
intent: "The import functionality allows players to load factory layouts shared by others, enabling them to quickly adopt optimized production strategies."
criticality: high
scenario: standard
flow: "Factories"
verification: "Verify the imported blueprint appears in the Saved Blueprints list."
---

**Setup**: Navigate to the Blueprints page.

**Intent**: The import functionality allows players to load factory layouts shared by others, enabling them to quickly adopt optimized production strategies.

**Steps**:
1. click: the "Import" button in the page header section
2. type: "eyJiIjpbeyJ0IjoiaXJvbl9taW5lIiwiYyI6MX1dLCJ0IjpbXSwidyI6W10sIm4iOiJJbXBvcnRlZCBMYXlvdXQifQ==" into the "Import blueprint code" input in the Import Blueprint section
3. click: the "Download" icon button (Import) in the Import Blueprint section

**Verification**:
1. assert: text "Imported Layout" on the blueprint card in the Saved Blueprints list

**Expected Result**: The blueprint is successfully imported and added to the Saved Blueprints list.
