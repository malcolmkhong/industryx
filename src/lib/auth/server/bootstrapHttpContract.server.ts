/**
 * Canonical HTTP representation of a bootstrap service result.
 *
 * `/api/auth/bootstrap` is the producer of this contract. Compatibility
 * routes may embed the exact body under `bootstrap`, but must never recreate
 * a second outcome mapping of their own.
 */

import type { BootstrapResponseBody } from "@/lib/auth/orchestrator/types";
import type { BootstrapResult } from "./bootstrapService.server";

export interface BootstrapHttpContract {
  status: number;
  body: BootstrapResponseBody;
}

export function bootstrapResultToHttpContract(
  result: BootstrapResult,
): BootstrapHttpContract {
  switch (result.kind) {
    case "ready": {
      const ready = result.ready;
      return {
        status: 200,
        body: {
          code: "BOOTSTRAP_READY",
          userId: ready.userId,
          isGuest: ready.isGuest,
          isNewUser: ready.isNewUser,
          source: ready.source,
          hasGameState: ready.hasGameState,
          needsStateLoad: ready.needsStateLoad,
          gameState: ready.gameState as unknown as Record<string, unknown>,
          archiveReceiptId: ready.archiveReceiptId ?? null,
          archivedGuestId: ready.archivedGuestId ?? null,
        },
      };
    }
    case "conflict":
      return {
        status: 409,
        body: {
          code: result.conflict.reason,
          conflictReason: result.conflict.reason,
          survivingUserId: result.conflict.survivingUserId ?? null,
          archivedGuestId: result.conflict.archivedGuestId ?? null,
        },
      };
    case "recovery_required":
      return stateRecoveryRequiredBootstrapContract();
    case "invalid_request":
      return invalidBootstrapRequestContract();
    case "unavailable":
      return result.reason === "rate_limited"
        ? rateLimitedBootstrapContract()
        : bootstrapUnavailableContract();
    case "internal_error":
      return internalBootstrapErrorContract();
    default: {
      const exhaustive: never = result;
      void exhaustive;
      return internalBootstrapErrorContract();
    }
  }
}

export function invalidBootstrapRequestContract(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  message?: string,
): BootstrapHttpContract {
  return {
    status: 400,
    body: {
      code: "INVALID_BOOTSTRAP_REQUEST",
    },
  };
}

export function invalidSessionBootstrapContract(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  message?: string,
): BootstrapHttpContract {
  return {
    status: 401,
    body: {
      code: "INVALID_SESSION",
    },
  };
}

export function stateRecoveryRequiredBootstrapContract(): BootstrapHttpContract {
  return {
    status: 422,
    body: {
      code: "STATE_RECOVERY_REQUIRED",
    },
  };
}

export function rateLimitedBootstrapContract(): BootstrapHttpContract {
  return {
    status: 429,
    body: {
      code: "BOOTSTRAP_RATE_LIMITED",
    },
  };
}

export function bootstrapUnavailableContract(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  message?: string,
): BootstrapHttpContract {
  return {
    status: 503,
    body: {
      code: "BOOTSTRAP_UNAVAILABLE",
    },
  };
}

export function internalBootstrapErrorContract(): BootstrapHttpContract {
  return {
    status: 500,
    body: {
      code: "INTERNAL_BOOTSTRAP_ERROR",
    },
  };
}
