import { NextResponse, type NextRequest } from "next/server";

import { verifyAdmin, withSecurityHeaders } from "@/lib/auth/admin";
import { logAdminAction } from "@/lib/auth/admin-helpers";
import { requireAdminWrite } from "@/lib/auth/admin-route-guards";
import { loadLatestRecoveryCaseForUser } from "@/lib/db/game/stateRecovery";
import { getTicket } from "@/lib/db/shared/supportTickets";
import {
  approveLegacyRecoveryCase,
  importApprovedLegacyRecovery,
} from "@/lib/game/state/persistence/legacyStateRecovery.server";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function response(body: Record<string, unknown>, status = 200) {
  return withSecurityHeaders(NextResponse.json(body, { status }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRecoveryMethod(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 200;
}

/**
 * Admin-only recovery metadata for one player's existing support ticket.
 * Deliberately excludes the raw original state; the recovery service is the
 * only owner allowed to validate and convert an approved reconstructed state.
 */
export async function GET(_request: Request, context: RouteContext) {
  const authResult = await verifyAdmin();
  if ("error" in authResult) return authResult.error;

  const { id } = await context.params;
  try {
    const ticket = await getTicket(id);
    if (!ticket) return response({ error: "Ticket not found", code: "SUPPORT_TICKET_NOT_FOUND" }, 404);
    if (!ticket.user_id) {
      return response(
        { error: "Ticket is not associated with a player", code: "RECOVERY_TICKET_IDENTITY_REQUIRED" },
        409,
      );
    }

    const recoveryCase = await loadLatestRecoveryCaseForUser(ticket.user_id);
    return response({ data: { recoveryCase } });
  } catch (error) {
    console.error("[Admin/Support/Recovery] Failed to load recovery case:", error);
    return response(
      { error: "Recovery service temporarily unavailable", code: "RECOVERY_SERVICE_UNAVAILABLE", retryable: true },
      503,
    );
  }
}

/**
 * The only HTTP owner for approving or converting a ticket-linked legacy
 * recovery. Both operations are authorized before entering the recovery
 * service; conversion itself stays atomic in complete_game_state_recovery.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const authResult = await verifyAdmin();
  if ("error" in authResult) return authResult.error;

  const writeError = await requireAdminWrite(authResult.admin);
  if (writeError) return writeError;

  const { id } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return response({ error: "Invalid recovery request", code: "INVALID_RECOVERY_REQUEST" }, 400);
  }
  if (!isRecord(body) || (body.action !== "approve" && body.action !== "complete")) {
    return response({ error: "Invalid recovery action", code: "INVALID_RECOVERY_ACTION" }, 400);
  }

  try {
    const ticket = await getTicket(id);
    if (!ticket) return response({ error: "Ticket not found", code: "SUPPORT_TICKET_NOT_FOUND" }, 404);
    if (!ticket.user_id) {
      return response(
        { error: "Ticket is not associated with a player", code: "RECOVERY_TICKET_IDENTITY_REQUIRED" },
        409,
      );
    }

    const recoveryCase = await loadLatestRecoveryCaseForUser(ticket.user_id);
    if (!recoveryCase) {
      return response({ error: "Recovery case not found", code: "RECOVERY_CASE_NOT_FOUND" }, 404);
    }

    if (body.action === "approve") {
      if (!isRecoveryMethod(body.method)) {
        return response({ error: "A recovery method is required", code: "INVALID_RECOVERY_METHOD" }, 400);
      }
      if (recoveryCase.status === "approved") {
        return response({ code: "OK_EXISTING", recoveryCase });
      }
      if (recoveryCase.status === "converted" || recoveryCase.status === "rejected") {
        return response(
          { error: "Recovery case is not actionable", code: "RECOVERY_CASE_NOT_ACTIONABLE" },
          409,
        );
      }

      const approved = await approveLegacyRecoveryCase(
        recoveryCase.id,
        authResult.admin.id,
        body.method.trim(),
      );
      if (!approved) {
        return response(
          { error: "Recovery case changed before approval", code: "RECOVERY_CASE_NOT_ACTIONABLE" },
          409,
        );
      }

      await logAdminAction({
        adminId: authResult.admin.id,
        actionType: "support.approve_state_recovery",
        details: { ticket_id: ticket.id, recovery_case_id: recoveryCase.id, method: body.method.trim() },
      });
      return response({ code: "RECOVERY_CASE_APPROVED", recoveryCase: approved });
    }

    if (!isRecord(body.reconstructedPayload)) {
      return response({ error: "A complete reconstructed payload is required", code: "INVALID_RECOVERY_PAYLOAD" }, 400);
    }
    const result = await importApprovedLegacyRecovery({
      caseId: recoveryCase.id,
      // Route authorization proves that this support ticket owns the case.
      access: { kind: "authenticated", userId: ticket.user_id },
      reconstructedPayload: body.reconstructedPayload,
    });

    switch (result.kind) {
      case "completed":
        await logAdminAction({
          adminId: authResult.admin.id,
          actionType: "support.complete_state_recovery",
          details: { ticket_id: ticket.id, recovery_case_id: recoveryCase.id, state_version: result.stateVersion },
        });
        return response({ code: "RECOVERY_IMPORT_COMPLETED", stateVersion: result.stateVersion });
      case "invalid_payload":
        return response({ error: "Reconstructed payload is invalid", code: "INVALID_RECOVERY_PAYLOAD" }, 422);
      case "state_conflict":
        return response({ error: "State changed before recovery", code: "STATE_VERSION_CONFLICT" }, 409);
      case "not_approved":
        return response({ error: "Recovery case is not approved", code: "RECOVERY_CASE_NOT_APPROVED" }, 409);
      case "not_found":
        return response({ error: "Recovery case not found", code: "RECOVERY_CASE_NOT_FOUND" }, 404);
      case "forbidden":
        return response({ error: "Recovery access denied", code: "RECOVERY_ACCESS_DENIED" }, 403);
      default: {
        const exhaustive: never = result;
        void exhaustive;
        return response({ error: "Recovery service temporarily unavailable", code: "RECOVERY_SERVICE_UNAVAILABLE", retryable: true }, 503);
      }
    }
  } catch (error) {
    console.error("[Admin/Support/Recovery] Recovery action failed:", error);
    return response(
      { error: "Recovery service temporarily unavailable", code: "RECOVERY_SERVICE_UNAVAILABLE", retryable: true },
      503,
    );
  }
}
