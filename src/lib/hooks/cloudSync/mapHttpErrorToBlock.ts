// ============================================
// Cloud Sync — Map HTTP Errors to Block State
// ============================================
//
// Pure utility that maps an HTTP response (status + parsed body) to
// the appropriate CloudBlockState or a simple error string. Extracted
// from the inline 400/401/403/409 response handling in saveToCloud
// and loadFromCloud.
// ============================================

import type { CloudBlockState } from './types';

interface ErrorMapping {
  blocked: CloudBlockState;
  userMessage: string;
}

/**
 * Map a failed save response to a CloudBlockState + user-facing message.
 * Returns null if the response status doesn't warrant a block.
 */
export function mapSaveErrorToBlock(
  status: number,
  body: Record<string, unknown>
): ErrorMapping | null {
  if (status === 400) {
    if (body.code === 'VALIDATION_FAILED') {
      return {
        blocked: {
          isBlocked: true,
          reason:
            (body.violations as string[] | undefined)?.join(', ') ||
            'Save validation failed — your game state may have been modified incorrectly.',
          code: 'VALIDATION_FAILED',
          detectedAt: Date.now(),
        },
        userMessage: `Save rejected: ${(body.violations as string[] | undefined)?.join(', ') || 'validation failed'}`,
      };
    }
    if (body.code === 'CHECKSUM_MISMATCH') {
      return {
        blocked: {
          isBlocked: true,
          reason:
            'Your game data checksum does not match the server. This may indicate data corruption or tampering.',
          code: 'VALIDATION_FAILED',
          detectedAt: Date.now(),
        },
        userMessage: 'Checksum mismatch — please reload from server',
      };
    }
    if (body.code === 'ACCOUNT_LOCKED') {
      const reason = (body.reason as string | undefined) || 'Account locked for suspicious activity';
      return {
        blocked: { isBlocked: true, reason, code: 'ACCOUNT_LOCKED', detectedAt: Date.now() },
        userMessage: reason,
      };
    }
  }

  if (status === 401) {
    return {
      blocked: {
        isBlocked: true,
        reason: 'Your session has expired. Please sign in again to continue cloud sync.',
        code: 'SESSION_EXPIRED',
        detectedAt: Date.now(),
      },
      userMessage: 'Session expired. Please sign in again.',
    };
  }

  if (status === 403) {
    if (body.code === 'ACCOUNT_LOCKED') {
      const reason = (body.reason as string | undefined) || 'Account locked for suspicious activity';
      return {
        blocked: { isBlocked: true, reason, code: 'ACCOUNT_LOCKED', detectedAt: Date.now() },
        userMessage: reason,
      };
    }
    return {
      blocked: {
        isBlocked: true,
        reason: 'Access denied — you do not have permission to use cloud sync.',
        code: 'ACCESS_DENIED',
        detectedAt: Date.now(),
      },
      userMessage: 'Access denied.',
    };
  }

  return null;
}

/**
 * Map a failed load response to a CloudBlockState + user-facing message.
 */
export function mapLoadErrorToBlock(
  status: number,
  body: Record<string, unknown>
): ErrorMapping | null {
  if (status === 401) {
    return {
      blocked: {
        isBlocked: true,
        reason: 'Your session has expired. Please sign in again to continue cloud sync.',
        code: 'SESSION_EXPIRED',
        detectedAt: Date.now(),
      },
      userMessage: 'Session expired. Please sign in again.',
    };
  }
  if (status === 403) {
    if (body.code === 'ACCOUNT_LOCKED') {
      const reason = (body.reason as string | undefined) || 'Account locked for suspicious activity';
      return {
        blocked: { isBlocked: true, reason, code: 'ACCOUNT_LOCKED', detectedAt: Date.now() },
        userMessage: reason,
      };
    }
    return {
      blocked: {
        isBlocked: true,
        reason: 'Access denied — you do not have permission to use cloud sync.',
        code: 'ACCESS_DENIED',
        detectedAt: Date.now(),
      },
      userMessage: 'Access denied.',
    };
  }
  return null;
}
