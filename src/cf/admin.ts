// src/cf/admin.ts
// HTTP-facing administration API. This module is intentionally thin: it maps
// requests to the auth domain services (auth/administration.ts, auth/staff.ts,
// auth/session.ts) and adds the two-identity bootstrap flow, which verifies
// email ownership before any role is assigned.

import * as auth from './auth';
import * as emailSvc from './email';

type Ctx = ExecutionContext;

const ok = (data: any, message = 'OK', status = 200) => ({ status, json: { success: true, data, message } });
const err = (message: string, status = 400) => ({ status, json: { success: false, message } });

function uuid() {
  return 'fidus_' + crypto.randomUUID().replace(/-/g, '');
}

async function sha256Hex(input: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function token(bytes = 32) {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(bytes))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// ---------------------------------------------------------------------------
// Local authorization guards (thin wrappers over the auth domain)
// ---------------------------------------------------------------------------

async function requireStaffManager(ctx: Ctx, tokenStr: string | null, ip?: string) {
  const result = await auth.requireAuth(ctx, tokenStr, ip);
  if (!result.ok) return result;
  if (!auth.canManageStaff({ role: result.user!.role })) {
    return { ok: false, status: 403, json: { success: false, message: 'Administrator access required' } } as any;
  }
  return result;
}

async function actorFrom(ctx: Ctx, tokenStr: string | null, ip?: string) {
  const result = await auth.requireAuth(ctx, tokenStr, ip);
  if (!result.ok) return null;
  return { id: result.user!.sub, email: result.user!.email, role: result.user!.role };
}

/** Map a decoded token to the actor shape the auth services expect. */
function actorOf(user: any) {
  return { id: user.sub, email: user.email, role: user.role };
}

// ---------------------------------------------------------------------------
// Overview + directories
// ---------------------------------------------------------------------------

export async function overview(ctx: Ctx, tokenStr: string | null, ip?: string) {
  const a = await requireStaffManager(ctx, tokenStr, ip);
  if (!a.ok) return a;

  const db = auth.DB();
  const one = async (sql: string, ...params: any[]) => {
    const row = (await db.prepare(sql).bind(...params).first()) as any;
    return row?.c || 0;
  };

  return ok({
    counts: {
      totalUsers: await one(`SELECT COUNT(*) AS c FROM users WHERE deleted_at IS NULL`),
      totalPatients: await one(`SELECT COUNT(*) AS c FROM users WHERE deleted_at IS NULL AND role = 'Patient'`),
      activeStaff: await one(
        `SELECT COUNT(*) AS c FROM users WHERE deleted_at IS NULL AND role != 'Patient' AND status = 'active'`,
      ),
      activeAdministrators: await one(
        `SELECT COUNT(*) AS c FROM users WHERE role = 'System Administrator' AND status = 'active' AND access_revoked_at IS NULL AND deleted_at IS NULL`,
      ),
      pendingApplications: await one(`SELECT COUNT(*) AS c FROM staff_applications WHERE status = 'pending'`),
      pendingInvitations: await one(
        `SELECT COUNT(*) AS c FROM staff_invitations WHERE used_at IS NULL AND cancelled_at IS NULL AND datetime(expires_at) > datetime('now')`,
      ),
      acceptedInvitations: await one(`SELECT COUNT(*) AS c FROM staff_invitations WHERE used_at IS NOT NULL`),
      expiredInvitations: await one(
        `SELECT COUNT(*) AS c FROM staff_invitations WHERE used_at IS NULL AND datetime(expires_at) <= datetime('now')`,
      ),
      suspendedAccounts: await one(`SELECT COUNT(*) AS c FROM users WHERE status = 'suspended' AND deleted_at IS NULL`),
      revokedAccess: await one(
        `SELECT COUNT(*) AS c FROM users WHERE access_revoked_at IS NOT NULL AND deleted_at IS NULL`,
      ),
    },
    recentAuthEvents: auth.rows(
      await db
        .prepare(
          `SELECT id, event, actor_email, actor_role, created_at, ip FROM audit_log
           WHERE event LIKE '%login%' OR event LIKE '%password%' OR event LIKE '%verification%'
              OR event LIKE '%invitation%' OR event LIKE '%bootstrap%'
           ORDER BY created_at DESC LIMIT 20`,
        )
        .all(),
    ),
    recentAdminActivities: auth.rows(
      await db
        .prepare(
          `SELECT id, action AS event, actor_email, actor_role, target_type, target_email, created_at, outcome
           FROM admin_audit ORDER BY created_at DESC LIMIT 20`,
        )
        .all(),
    ),
  });
}

export async function listStaff(ctx: Ctx, tokenStr: string | null, ip?: string) {
  const a = await requireStaffManager(ctx, tokenStr, ip);
  if (!a.ok) return a;

  const staffRows = auth.rows(
    await auth
      .DB()
      .prepare(
        `SELECT id, name, email, phone, role, department, status, email_verified_at,
                mfa_enforced, last_login_at, created_at, updated_at, access_revoked_at
         FROM users WHERE deleted_at IS NULL AND role != 'Patient' ORDER BY created_at DESC LIMIT 500`,
      )
      .all(),
  );

  return ok({ items: staffRows });
}

export async function listInvitations(ctx: Ctx, tokenStr: string | null, ip?: string) {
  const actor = await actorFrom(ctx, tokenStr, ip);
  if (!actor) return err('Authentication required', 401);
  return auth.listStaffInvitations(ctx, actor, ip);
}

export async function listAudit(ctx: Ctx, tokenStr: string | null, ip?: string) {
  const a = await requireStaffManager(ctx, tokenStr, ip);
  if (!a.ok) return a;

  const auditRows = auth.rows(
    await auth
      .DB()
      .prepare(
        `SELECT id, event, actor_id, actor_email, actor_role, target_id, target_type, details, ip, created_at
         FROM audit_log ORDER BY created_at DESC LIMIT 200`,
      )
      .all(),
  );

  return ok({ items: auditRows });
}

// ---------------------------------------------------------------------------
// Delegated account management
// ---------------------------------------------------------------------------

export async function updateUserStatus(ctx: Ctx, tokenStr: string | null, body: any, ip?: string) {
  return withActor(ctx, tokenStr, ip, (actor, b) => auth.updateAccountStatus(ctx, actor, b, ip), body);
}

export async function assignRole(ctx: Ctx, tokenStr: string | null, body: any, ip?: string) {
  return withActor(ctx, tokenStr, ip, (actor, b) => auth.assignRole(ctx, actor, b, ip), body);
}

export async function adminResetPassword(ctx: Ctx, tokenStr: string | null, body: any, ip?: string) {
  return withActor(ctx, tokenStr, ip, (actor, b) => auth.adminInitiatePasswordReset(ctx, actor, b, ip), body);
}

export async function revokeSessions(ctx: Ctx, tokenStr: string | null, body: any, ip?: string) {
  return withActor(ctx, tokenStr, ip, (actor, b) => auth.revokeUserSessions(ctx, actor, b, ip), body);
}

/**
 * Resolve the caller once, then hand the service an authenticated actor. The
 * service layer never re-parses the token, so a single authorization decision
 * governs the whole request.
 */
async function withActor(
  ctx: Ctx,
  tokenStr: string | null,
  ip: string | undefined,
  handler: (actor: { id: string; email: string; role: string }, body: any) => Promise<any>,
  body: any,
) {
  const a = await requireStaffManager(ctx, tokenStr, ip);
  if (!a.ok) return a;
  return handler(actorOf(a.user), body);
}

// ---------------------------------------------------------------------------
// Invitations (create is already routed through auth.createStaffInvitation)
// ---------------------------------------------------------------------------

export async function resendInvitation(ctx: Ctx, tokenStr: string | null, body: any, ip?: string) {
  const actor = await actorFrom(ctx, tokenStr, ip);
  if (!actor) return err('Authentication required', 401);
  return auth.resendStaffInvitation(ctx, body, actor, ip);
}

export async function cancelInvitation(ctx: Ctx, tokenStr: string | null, body: any, ip?: string) {
  const actor = await actorFrom(ctx, tokenStr, ip);
  if (!actor) return err('Authentication required', 401);
  return auth.cancelStaffInvitation(ctx, body, actor, ip);
}

// ---------------------------------------------------------------------------
// Applications
// ---------------------------------------------------------------------------

export async function listApplications(ctx: Ctx, tokenStr: string | null, ip?: string) {
  const actor = await actorFrom(ctx, tokenStr, ip);
  if (!actor) return err('Authentication required', 401);
  return auth.listStaffApplications(ctx, actor, ip);
}

export async function approveApplication(ctx: Ctx, tokenStr: string | null, body: any, ip?: string) {
  const actor = await actorFrom(ctx, tokenStr, ip);
  if (!actor) return err('Authentication required', 401);
  return auth.approveStaffApplication(ctx, body, actor, ip);
}

export async function rejectApplication(ctx: Ctx, tokenStr: string | null, body: any, ip?: string) {
  const actor = await actorFrom(ctx, tokenStr, ip);
  if (!actor) return err('Authentication required', 401);
  return auth.rejectStaffApplication(ctx, body, actor, ip);
}

// ---------------------------------------------------------------------------
// MFA
// ---------------------------------------------------------------------------

export async function enrollMfa(ctx: Ctx, tokenStr: string | null, body: any, ip?: string) {
  return withActor(ctx, tokenStr, ip, (actor, b) => auth.adminEnrollMfa(ctx, actor, b, ip), body);
}

export async function confirmMfa(ctx: Ctx, tokenStr: string | null, body: any, ip?: string) {
  return withActor(ctx, tokenStr, ip, (actor, b) => auth.adminConfirmMfa(ctx, actor, b, ip), body);
}

export async function disableMfa(ctx: Ctx, tokenStr: string | null, body: any, ip?: string) {
  return withActor(ctx, tokenStr, ip, (actor, b) => auth.adminDisableMfa(ctx, actor, b, ip), body);
}

export async function securitySummary(ctx: Ctx, tokenStr: string | null, ip?: string) {
  return withActor(ctx, tokenStr, ip, (actor) => auth.adminSecuritySummary(ctx, actor, {}, ip), {});
}

// ---------------------------------------------------------------------------
// Bootstrap: the two designated System Administrator identities
//
// Email ownership is the only proof accepted here. A request mails a one-time
// link to the designated address; only the person who can read that mailbox can
// complete the elevation, and the role is assigned server-side.
// ---------------------------------------------------------------------------

export async function bootstrapStatus(_ctx: Ctx) {
  const admins = auth.rows(
    await auth
      .DB()
      .prepare(
        `SELECT email, role, status, email_verified_at, mfa_enforced, last_login_at
         FROM users
         WHERE lower(email) IN ('consult@fidusmedicals.space','aidomexgroup@gmail.com') AND deleted_at IS NULL`,
      )
      .all(),
  );

  return ok({ admins, bootstrapEmails: auth.BOOTSTRAP_SYSTEM_ADMINS });
}

export async function bootstrapRequest(ctx: Ctx, body: any, ip?: string) {
  const email = String(body?.email || '').trim().toLowerCase();
  if (!auth.isBootstrapSystemAdminEmail(email)) {
    return err('Email is not an authorized bootstrap System Administrator identity', 403);
  }

  const rl = auth.rateLimit(`bootstrap-request:${email}`, 3, 60 * 60 * 1000);
  if (!rl.ok) return err('A bootstrap request was already sent recently. Check that mailbox.', 429);

  const db = auth.DB();
  const user = (await db
    .prepare('SELECT id, name, email, role, status, email_verified_at FROM users WHERE lower(email) = ? AND deleted_at IS NULL')
    .bind(email)
    .first()) as any;

  if (!user) {
    return err(
      'No account exists for this address. Register with this email, verify it, then request bootstrap.',
      404,
    );
  }

  const rawToken = token(32);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  await db
    .prepare(
      `INSERT INTO admin_bootstrap_requests (id, email, user_id, token_hash, status, expires_at, created_at, ip)
       VALUES (?, ?, ?, ?, 'pending', ?, datetime('now'), ?)`,
    )
    .bind(uuid(), email, user.id, await sha256Hex(rawToken), expiresAt, ip || null)
    .run();

  const env = auth.getEnv() || {};
  const verifyUrl = `${auth.appBaseUrl()}/admin/bootstrap/verify?token=${encodeURIComponent(rawToken)}`;
  const tpl = emailSvc.adminBootstrapVerificationEmail(env, user.name || email, verifyUrl);
  const delivery = await emailSvc.sendEmail(env, {
    to: email,
    subject: tpl.subject,
    html: tpl.html,
    text: tpl.text,
    tags: [{ name: 'type', value: 'admin-bootstrap' }],
  });

  await auth.audit(ctx, 'admin_bootstrap_requested', { id: user.id, email, role: user.role }, user.id, 'user', {
    delivery_ok: delivery.ok,
  }, ip);

  return ok({ delivery }, 'If authorized, a bootstrap verification email has been sent.');
}

export async function bootstrapVerify(ctx: Ctx, body: any, ip?: string) {
  const rawToken = String(body?.token || '').trim();
  if (!rawToken) return err('token is required');

  const db = auth.DB();
  const row = (await db
    .prepare('SELECT * FROM admin_bootstrap_requests WHERE token_hash = ?')
    .bind(await sha256Hex(rawToken))
    .first()) as any;

  if (!row) return err('Invalid or expired bootstrap token', 400);
  if (row.status !== 'pending') return err('Bootstrap token has already been used or revoked', 400);
  if (new Date(row.expires_at).getTime() < Date.now()) return err('Bootstrap token has expired', 400);

  const user = (await db
    .prepare('SELECT id, name, email, role, status, deleted_at FROM users WHERE id = ?')
    .bind(row.user_id)
    .first()) as any;

  if (!user || user.deleted_at) return err('User not found', 404);
  if (!auth.isBootstrapSystemAdminEmail(user.email)) return err('Unauthorized bootstrap target', 403);

  const previousRole = user.role;
  await db
    .prepare(
      `UPDATE users SET role = 'System Administrator', status = 'active', access_revoked_at = NULL,
                       approved_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ?`,
    )
    .bind(user.id)
    .run();
  await db
    .prepare(`UPDATE admin_bootstrap_requests SET status = 'consumed', verified_at = datetime('now') WHERE id = ?`)
    .bind(row.id)
    .run();

  // New privileges invalidate anything issued under the old role.
  await auth.bumpTokenVersion(user.id);
  await auth.revokeAllSessions(user.id);

  await auth.adminAudit(
    ctx,
    { id: user.id, email: user.email, role: 'System Administrator' },
    'admin_bootstrap_verified',
    {
      target_type: 'user',
      target_id: user.id,
      target_email: user.email,
      target_name: user.name,
      previous_state: JSON.stringify({ role: previousRole }),
      new_state: JSON.stringify({ role: 'System Administrator' }),
      reason: 'email_ownership_verified',
      ip,
    },
  );

  return ok(
    { email: user.email, role: 'System Administrator' },
    'System Administrator access verified. Sign in again, then enroll MFA immediately.',
  );
}
