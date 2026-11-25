// src/cf/auth/session.ts
// Session lifecycle and request authentication: requireAuth / requireRole /
// requireActor for API handlers, plus getMe, logout, and logoutAll.

import {
  DB,
  jwtSecretHex,
  verifyJwt,
  revokeSession,
  revokeAllSessions,
  bumpTokenVersion,
  audit,
  publicUserFromRow,
  DecodedJwt,
  RequireAuthResult,
  AuthUser,
} from './lib';

/**
 * Verify that a request carries a valid session token and that the account is
 * still active. Returns the decoded token with the *current* role/email from the
 * database, so role changes take effect without waiting for token expiry.
 */
export async function requireAuth(
  _ctx: ExecutionContext,
  token: string | null,
  _ip?: string,
): Promise<RequireAuthResult> {
  if (!token) return { ok: false, status: 401, json: { success: false, message: 'Not authenticated' } };

  const decoded = await verifyJwt(token, jwtSecretHex());
  if (!decoded) {
    return { ok: false, status: 401, json: { success: false, message: 'Session expired or invalid' } };
  }

  const db = DB();
  if (!db) return { ok: false, status: 500, json: { success: false, message: 'Database unavailable' } };

  const row = (await db
    .prepare(
      `SELECT id, name, email, phone, role, department, status, email_verified_at,
              token_version, access_revoked_at, deleted_at
       FROM users WHERE id = ?`,
    )
    .bind(decoded.sub)
    .first()) as any;

  if (!row || row.deleted_at) {
    return { ok: false, status: 401, json: { success: false, message: 'User not found or deactivated' } };
  }
  if (row.access_revoked_at) {
    return { ok: false, status: 403, json: { success: false, message: 'Access to this account has been revoked' } };
  }
  if (row.status && row.status !== 'active') {
    return { ok: false, status: 403, json: { success: false, message: 'Account is not active' } };
  }
  if (typeof decoded.tv === 'number' && decoded.tv !== Number(row.token_version || 0)) {
    return { ok: false, status: 401, json: { success: false, message: 'Session revoked. Please sign in again.' } };
  }

  return {
    ok: true,
    user: { ...decoded, role: row.role, email: row.email },
  };
}

/** requireAuth + a role allow-list. */
export async function requireRole(
  ctx: ExecutionContext,
  token: string | null,
  roles: string[],
  ip?: string,
): Promise<RequireAuthResult> {
  const result = await requireAuth(ctx, token, ip);
  if (!result.ok) return result;
  if (!roles.includes(result.user!.role)) {
    return {
      ok: false,
      status: 403,
      json: { success: false, message: `Role '${result.user!.role}' is not authorized for this action` },
    };
  }
  return result;
}

/** Convenience wrapper returning the acting user (or null). */
export async function requireActor(
  ctx: ExecutionContext,
  token?: string | null,
  ip?: string,
): Promise<AuthUser | null> {
  const bearer = token ?? bearerFromContext(ctx);
  const result = await requireAuth(ctx, bearer ?? null, ip);
  if (!result.ok || !result.user) return null;
  return {
    id: result.user.sub,
    email: result.user.email,
    role: result.user.role,
  };
}

function bearerFromContext(ctx: ExecutionContext): string | null {
  const header = ctx.request?.headers?.get('authorization') || '';
  if (!header.toLowerCase().startsWith('bearer ')) return null;
  return header.slice(7).trim() || null;
}

// ---------------------------------------------------------------------------
// Profile + sign-out
// ---------------------------------------------------------------------------

export async function getMe(_ctx: ExecutionContext, token: string | null, ip?: string) {
  const result = await requireAuth(_ctx, token, ip);
  if (!result.ok) return { status: result.status, json: result.json };

  const row = (await DB()
    .prepare(
      `SELECT id, name, email, phone, role, department, date_of_birth, sex, blood_group,
              email_verified_at, status, created_at, updated_at, deleted_at
       FROM users WHERE id = ?`,
    )
    .bind(result.user!.sub)
    .first()) as any;

  if (!row || row.deleted_at) {
    return { status: 401, json: { success: false, message: 'User not found or deactivated' } };
  }
  return { status: 200, json: { success: true, data: publicUserFromRow(row) } };
}

export async function logout(
  ctx: ExecutionContext,
  actor?: AuthUser,
  ip?: string,
  token?: string | null,
) {
  if (token) {
    const decoded = await verifyJwt(token, jwtSecretHex());
    if (decoded?.sid) await revokeSession(decoded.sid, decoded.sub);
  }
  if (actor) await audit(ctx, 'user_logout', actor, actor.id, 'user', undefined, ip);
  return { status: 200, json: { success: true, message: 'Signed out' } };
}

export async function logoutAll(ctx: ExecutionContext, token: string | null, ip?: string) {
  const result = await requireAuth(ctx, token, ip);
  if (!result.ok) return { status: result.status, json: result.json };

  await bumpTokenVersion(result.user!.sub);
  await revokeAllSessions(result.user!.sub);
  await audit(ctx, 'user_logout_all', { id: result.user!.sub, email: result.user!.email, role: result.user!.role }, result.user!.sub, 'user', {}, ip);
  return { status: 200, json: { success: true, message: 'All sessions revoked. Please sign in again.' } };
}

export function asAuthUser(decoded: DecodedJwt): AuthUser {
  return { id: decoded.sub, email: decoded.email, role: decoded.role };
}
