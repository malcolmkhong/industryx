/**
 * Admin recovery actions must remain inside the verified support domain.
 * The route is intentionally tested without a real database: the recovery
 * service owns the atomic conversion RPC and this handler owns authorization,
 * ticket ownership, and typed HTTP mapping.
 */

import { describe, expect, it, vi } from "vitest";
import { buildContext, buildRequest } from "../helpers/request";

vi.mock("@/lib/auth/admin", () => ({
  verifyAdmin: vi.fn().mockResolvedValue({ admin: { id: "admin-1", email: "admin@example.com" } }),
  withSecurityHeaders: (response: Response) => response,
}));
vi.mock("@/lib/auth/admin-route-guards", () => ({
  requireAdminWrite: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/auth/admin-helpers", () => ({
  logAdminAction: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/db/shared/supportTickets", () => ({
  getTicket: vi.fn().mockResolvedValue({ id: "ticket-1", user_id: "player-1" }),
}));
vi.mock("@/lib/db/game/stateRecovery", () => ({
  loadLatestRecoveryCaseForUser: vi.fn().mockResolvedValue({
    id: "recovery-1",
    user_id: "player-1",
    status: "manual_review_required",
    detected_schema_condition: "partial_legacy",
    evidence_sources: {},
    field_classification: {},
    recoverable_fields: {},
    unresolved_fields: [],
    approved_recovery_method: null,
    approved_by: null,
    approved_at: null,
    converted_at: null,
    created_at: "2026-07-17T00:00:00.000Z",
    updated_at: "2026-07-17T00:00:00.000Z",
  }),
}));
vi.mock("@/lib/game/state/persistence/legacyStateRecovery.server", () => ({
  approveLegacyRecoveryCase: vi.fn().mockResolvedValue({ id: "recovery-1", status: "approved" }),
  importApprovedLegacyRecovery: vi.fn(),
}));

import { POST } from "@/app/api/admin/support/tickets/[id]/recovery/route";
import { approveLegacyRecoveryCase } from "@/lib/game/state/persistence/legacyStateRecovery.server";

describe("POST /api/admin/support/tickets/[id]/recovery", () => {
  it("approves the ticket owner's recovery case only after verified admin write access", async () => {
    const response = await POST(
      buildRequest({
        method: "POST",
        url: "/api/admin/support/tickets/ticket-1/recovery",
        body: { action: "approve", method: "manual_support_review" },
      }),
      buildContext({ id: "ticket-1" }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ code: "RECOVERY_CASE_APPROVED" });
    expect(approveLegacyRecoveryCase).toHaveBeenCalledWith(
      "recovery-1",
      "admin-1",
      "manual_support_review",
    );
  });
});
