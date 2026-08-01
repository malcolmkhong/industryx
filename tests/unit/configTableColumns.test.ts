import { describe, expect, it } from "vitest";
import { CONFIG_TABLE_COLUMNS } from "@/lib/db/types";

describe("action config table column contracts", () => {
  it("uses the research schema's prerequisite field instead of automation-only requires_research", () => {
    const researchColumns = CONFIG_TABLE_COLUMNS.game_config_research.split(",");

    expect(researchColumns).toContain("prerequisites");
    expect(researchColumns).not.toContain("requires_research");
  });
});
