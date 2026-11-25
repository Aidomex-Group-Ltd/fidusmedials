// src/cf/auth/administration.ts
// System Administrator capabilities: privileged account provisioning, MFA
// enrollment, staff account lifecycle (activate / suspend / revoke), role and
// permission assignment, admin-initiated password resets, and audit queries.
//
// Every mutating action writes to admin_audit with the before/after state.

import * as emailSvc from '../email';
import {
  DB,
  getEnv,
  appBaseUrl,
  adminAudit,
  audit,
  bumpTokenVersion,
  genId,
  issueSession,
  rateLimit,
  revokeAllSessions,
  rows as rowsOf,
  safeJsonParse,
  timingSafeEqual,
  type AuthUser,
} from './lib';
import {
  actorHasPermission,
  actorIsSystemAdmin,
  isInactive,
  permissionsForRole,
  rolePermissionsFromDb,
} from './rbac';
import { hexToBase32, otpauthUri, verifyTOTP, generateBase32Secret, base32ToHex } from './totp';
import { isValidDepartment, isValidStaffRole, isPrivilegedRole } from './staff';
import { sendPasswordResetEmailForUser } from './patient';

const json = (status: number, body: any) => ({ status, json: body });
const fail = (status: number, message: string) => json(status, { success: false, message });

function userAgent(ctx: ExecutionContext): string | undefined {
  return ctx.request?.headers?.get('user-agent') || undefined;
}

// ---------------------------------------------------------------------------
// MFA helpers
// ---------------------------------------------------------------------------

export async function isUserMfaEnrolled(userId: string): Promise<boolean> {
  try {
    const row = (await DB()
      .prepare(`SELECT 1 AS ok FROM mfa_enrollments WHERE user_id = ? AND method = 'totp' AND verified_at IS NOT NULL`)
      .bind(userId)
      .first()) as { ok: number } | undefined;
    return !!row;
  } catch {
    return false;
  }
}

async function getTotpSecretHex(userId: string): Promise<string | null> {
  const row = (await DB()
    .prepare(`SELECT secret_hex FROM mfa_enrollments WHERE user_id = ? AND method = 'totp'`)
    .bind(userId)
    .first()) as { secret_hex: string } | undefined;
  return row?.secret_hex || null;
}

async function verifyUserTotp(userId: string, code: string): Promise<boolean> {
  const secretHex = await getTotpSecretHex(userId);
  if (!secretHex || !code) return false;
  return verifyTOTP(hexToBase32(secretHex), code);
}

/** True when the account must present a TOTP code for privileged actions. */
export async function requiresMfa(user: { id: string; mfa_enforced?: number }): Promise<boolean> {
  if (getEnv()?.REQUIRED_ADMIN_MFA === '1') return true;
  return Number(user.mfa_enforced || 0) === 1 || isUserMfaEnrolled(user.id);
}

// ---------------------------------------------------------------------------
// Privileged account provisioning (email-verified bootstrap + admin-to-admin)
// ---------------------------------------------------------------------------

const ADMIN_BOOTSTRAP_TOKEN = (): string => String(getEnv()?.ADMIN_BOOTSTRAP_TOKEN || '');

/**
 * Elevate an existing, email-verified account to System Administrator.
 *
 * Guards: caller must be an active System Administrator, must present the
 * server-held bootstrap token, and must supply a TOTP code when the target
 * already has MFA enrolled. No password is ever created, transmitted, or
 * returned — the target keeps their own credentials.
 */
export async function adminBootstrap(ctx: ExecutionContext, actor: AuthUser, body: any, ip?: string) {
  if (!actor) return fail(401, "Authentication required");
    if (!actorIsSystemAdmin(actor)) {
    return fail(403, 'Only a System Administrator may provision other administrators.');
  }
  if (await requiresMfa(actor as any)) {
    const code = String(body?.actor_totp_code || '').trim();
    if (!code) return fail(400, 'This administrator account requires a TOTP code to provision another administrator.');
    if (!(await verifyUserTotp(actor.id, code))) {
      await adminAudit(ctx, actor, 'admin_provision_mfa_failed', {
        target_type: 'system',
        reason: 'invalid_actor_totp',
        ip,
        user_agent: userAgent(ctx),
      });
      return fail(401, 'The TOTP code did not match.');
    }
  }

  const email = String(body?.email || '').trim().toLowerCase();
  if (!email) return fail(400, 'A valid admin email address is required.');

  const expectedToken = ADMIN_BOOTSTRAP_TOKEN();
  if (!expectedToken) {
    await audit(ctx, 'admin_bootstrap_failed', actor, undefined, 'system', { reason: 'bootstrap_token_not_configured', email }, ip);
    return fail(503, 'Administrator provisioning is not configured on this environment yet.');
  }
  if (!timingSafeEqual(String(body?.bootstrap_token || ''), expectedToken)) {
    await audit(ctx, 'admin_bootstrap_failed', actor, undefined, 'system', { reason: 'invalid_bootstrap_token', email }, ip);
    return fail(403, 'Invalid provisioning token.');
  }

  const target = (await DB().prepare('SELECT * FROM users WHERE email = ? AND deleted_at IS NULL').bind(email).first()) as any;
  if (!target) {
    return fail(404, `No account exists for ${email}. Register and verify the email first, then retry.`);
  }
  if (!target.email_verified_at) {
    return fail(400, `That account has not verified its email yet. Complete verification first, then retry.`);
  }
  if (isInactive({ id: target.id, email: target.email, role: target.role, status: target.status, access_revoked_at: target.access_revoked_at })) {
    return fail(400, 'That account is suspended or has had access revoked. Reactivate it before provisioning admin access.');
  }

  if (target.role === 'System Administrator') {
    const token = await issueSession({ id: target.id, email: target.email, role: target.role }, ip);
    await audit(ctx, 'admin_bootstrap_reaffirmed', actor, target.id, 'user', { email }, ip);
    return json(200, {
      success: true,
      message: 'This account is already a System Administrator. A fresh session has been issued.',
      token,
      mfa_enforced: await requiresMfa(target),
    });
  }

  if (await isUserMfaEnrolled(target.id)) {
    const code = String(body?.totp_code || '').trim();
    if (!code) return fail(400, 'The target account has MFA enabled. Provide its current TOTP code.');
    if (!(await verifyUserTotp(target.id, code))) {
      await audit(ctx, 'admin_bootstrap_failed', actor, target.id, 'user', { reason: 'invalid_target_totp' }, ip);
      return fail(401, 'The TOTP code did not match.');
    }
  }

  const previousRole = target.role;
  await DB()
    .prepare(`UPDATE users SET role = 'System Administrator', updated_at = datetime('now') WHERE id = ?`)
    .bind(target.id)
    .run();
  // Privilege change invalidates the target's existing sessions.
  await bumpTokenVersion(target.id);
  await revokeAllSessions(target.id);

  await adminAudit(ctx, actor, 'admin_provisioned', {
    target_type: 'user',
    target_id: target.id,
    target_email: target.email,
    target_name: target.name,
    previous_state: JSON.stringify({ role: previousRole }),
    new_state: JSON.stringify({ role: 'System Administrator' }),
    ip,
    user_agent: userAgent(ctx),
  });
  await audit(ctx, 'admin_bootstrap_success', actor, target.id, 'user', {
    previous_role: previousRole,
    new_role: 'System Administrator',
  }, ip);

  const token = await issueSession({ id: target.id, email: target.email, role: 'System Administrator' }, ip);
  return json(200, {
    success: true,
    message: `Administrator access provisioned for ${target.email}. Their previous sessions were revoked and a fresh session was issued. Enroll MFA immediately.`,
    token,
    user: { id: target.id, name: target.name, email: target.email, role: 'System Administrator' },
    mfa_enrolled: await isUserMfaEnrolled(target.id),
  });
}

// ---------------------------------------------------------------------------
// MFA enrollment
// ---------------------------------------------------------------------------

export async function adminEnrollMfa(ctx: ExecutionContext, actor: AuthUser, body: any, ip?: string) {
  if (!actor) return fail(401, "Authentication required");
    if (!actorIsSystemAdmin(actor)) return fail(403, 'Only a System Administrator may manage MFA enrollment.');

  const targetEmail = String(body?.email || '').trim().toLowerCase();
  let targetId = actor.id;
  let targetEmailResolved = actor.email;

  if (targetEmail && targetEmail !== actor.email) {
    const target = (await DB()
      .prepare(`SELECT id, email, role FROM users WHERE email = ? AND deleted_at IS NULL`)
      .bind(targetEmail)
      .first()) as any;
    if (!target || target.role !== 'System Administrator') {
      return fail(404, 'Administrator account not found.');
    }
    // Re-enrolling someone else's device requires proof of possession of the
    // existing secret, otherwise a live session alone could hijack their MFA.
    if (await isUserMfaEnrolled(target.id)) {
      const code = String(body?.totp_code || '').trim();
      if (!code) return fail(400, 'The target administrator has MFA enabled. Provide a current TOTP code.');
      if (!(await verifyUserTotp(target.id, code))) {
        await adminAudit(ctx, actor, 'mfa_enroll_failed', {
          target_type: 'user',
          target_id: target.id,
          target_email: target.email,
          reason: 'invalid_target_totp',
          ip,
          user_agent: userAgent(ctx),
        });
        return fail(401, 'The provided TOTP code was invalid.');
      }
    }
    targetId = target.id;
    targetEmailResolved = target.email;
  }

  const existing = (await DB()
    .prepare(`SELECT id, secret_hex, verified_at FROM mfa_enrollments WHERE user_id = ? AND method = 'totp'`)
    .bind(targetId)
    .first()) as { id: string; secret_hex: string; verified_at: string | null } | undefined;

  if (existing?.verified_at) {
    const secret = hexToBase32(existing.secret_hex);
    return json(200, {
      success: true,
      message: 'MFA is already enrolled and verified for this account.',
      data: {
        enrollment_id: existing.id,
        secret,
        uri: otpauthUri(targetEmailResolved, secret),
        already_enrolled: true,
        verified: true,
      },
    });
  }

  const secret = generateBase32Secret(20); // 160-bit secret
  const enrollmentId = existing?.id || genId();

  await DB()
    .prepare(
      `INSERT INTO mfa_enrollments (id, user_id, method, secret_hex, verified_at, created_at)
       VALUES (?, ?, 'totp', ?, NULL, datetime('now'))
       ON CONFLICT(user_id, method) DO UPDATE SET secret_hex = excluded.secret_hex, verified_at = NULL`,
    )
    .bind(enrollmentId, targetId, base32ToHex(secret))
    .run();

  await adminAudit(ctx, actor, 'mfa_enroll_started', {
    target_type: 'user',
    target_id: targetId,
    target_email: targetEmailResolved,
    ip,
    user_agent: userAgent(ctx),
  });

  return json(200, {
    success: true,
    message: 'Scan the secret with an authenticator app, then submit a TOTP code to finish enrollment.',
    data: {
      enrollment_id: enrollmentId,
      secret,
      uri: otpauthUri(targetEmailResolved, secret),
      already_enrolled: false,
      verified: false,
    },
  });
}

export async function adminConfirmMfa(ctx: ExecutionContext, actor: AuthUser, body: any, ip?: string) {
  if (!actor) return fail(401, "Authentication required");
    if (!actorIsSystemAdmin(actor)) return fail(403, 'Only a System Administrator may manage MFA.');

  const enrollmentId = String(body?.enrollment_id || '').trim();
  const code = String(body?.totp_code || '').trim();
  if (!enrollmentId || !code) return fail(400, 'An enrollment id and a TOTP code are required.');

  const enroll = (await DB()
    .prepare(`SELECT id, user_id, secret_hex, verified_at FROM mfa_enrollments WHERE id = ?`)
    .bind(enrollmentId)
    .first()) as any;
  if (!enroll) return fail(400, 'That enrollment is unknown.');
  if (enroll.verified_at) return fail(400, 'That enrollment is already verified.');

  if (!verifyTOTP(hexToBase32(enroll.secret_hex), code)) {
    await adminAudit(ctx, actor, 'mfa_confirm_failed', {
      target_type: 'user',
      target_id: enroll.user_id,
      reason: 'invalid_totp',
      ip,
      user_agent: userAgent(ctx),
    });
    return fail(401, 'The TOTP code did not match. Try again.');
  }

  await DB().prepare(`UPDATE mfa_enrollments SET verified_at = datetime('now') WHERE id = ?`).bind(enrollmentId).run();
  await DB()
    .prepare(
      `UPDATE users SET mfa_enforced = 1, mfa_confirmed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
    )
    .bind(enroll.user_id)
    .run();

  await adminAudit(ctx, actor, 'mfa_enrolled', {
    target_type: 'user',
    target_id: enroll.user_id,
    ip,
    user_agent: userAgent(ctx),
  });

  return json(200, {
    success: true,
    message: 'MFA enrolled and verified. Privileged actions on this account now require a TOTP code.',
  });
}

export async function adminDisableMfa(ctx: ExecutionContext, actor: AuthUser, body: any, ip?: string) {
  if (!actor) return fail(401, "Authentication required");
    if (!actorIsSystemAdmin(actor)) return fail(403, 'Only a System Administrator may manage MFA.');

  const targetEmail = String(body?.email || '').trim().toLowerCase();
  let targetId = actor.id;

  if (targetEmail && targetEmail !== actor.email) {
    const target = (await DB()
      .prepare(`SELECT id, role FROM users WHERE email = ? AND deleted_at IS NULL`)
      .bind(targetEmail)
      .first()) as any;
    if (!target || target.role !== 'System Administrator') {
      return fail(404, 'Administrator account not found.');
    }
    targetId = target.id;
  }

  if (await isUserMfaEnrolled(targetId)) {
    const code = String(body?.totp_code || '').trim();
    if (!code) return fail(400, 'MFA is enabled for this account. Provide a current TOTP code to disable it.');
    if (!(await verifyUserTotp(targetId, code))) {
      await adminAudit(ctx, actor, 'mfa_disable_failed', {
        target_type: 'user',
        target_id: targetId,
        reason: 'invalid_totp',
        ip,
        user_agent: userAgent(ctx),
      });
      return fail(401, 'The TOTP code did not match.');
    }
  }

  await DB().prepare(`DELETE FROM mfa_enrollments WHERE user_id = ? AND method = 'totp'`).bind(targetId).run();
  await DB()
    .prepare(`UPDATE users SET mfa_enforced = 0, mfa_confirmed_at = NULL, updated_at = datetime('now') WHERE id = ?`)
    .bind(targetId)
    .run();

  await adminAudit(ctx, actor, 'mfa_disabled', {
    target_type: 'user',
    target_id: targetId,
    ip,
    user_agent: userAgent(ctx),
  });
  return json(200, { success: true, message: 'MFA disabled for this account. Re-enroll as soon as possible.' });
}

export async function verifyActorTOTP(ctx: ExecutionContext, actor: AuthUser, body: any, ip?: string) {
  if (!actor) return fail(401, "Authentication required");
  
  const code = String(body?.totp_code || '').trim();
  if (!code) return fail(400, 'A TOTP code is required.');

  const secretHex = await getTotpSecretHex(actor.id);
  if (!secretHex) return fail(400, 'No MFA secret is enrolled for this account.');

  if (!verifyTOTP(hexToBase32(secretHex), code)) {
    await adminAudit(ctx, actor, 'totp_verify_failed', {
      target_type: 'user',
      target_id: actor.id,
      reason: 'invalid_totp',
      ip,
      user_agent: userAgent(ctx),
    });
    return fail(401, 'The TOTP code did not match.');
  }
  return json(200, { success: true, message: 'TOTP code verified.' });
}

// ---------------------------------------------------------------------------
// Staff account lifecycle
// ---------------------------------------------------------------------------

export type AccountAction = 'activate' | 'suspend' | 'reinstate' | 'revoke';

export async function updateAccountStatus(ctx: ExecutionContext, actor: AuthUser, body: any, ip?: string) {
  if (!actor) return fail(401, "Authentication required");
    if (!actorIsSystemAdmin(actor) && !actorHasPermission(actor, 'staff:suspend')) {
    return fail(403, 'You do not have permission to change staff account status.');
  }

  const userId = String(body?.user_id || body?.userId || '').trim();
  const action = String(body?.action || '').trim() as AccountAction;
  const reason = String(body?.reason || '').trim() || null;

  if (!userId || !action) return fail(400, 'user_id and action are required.');

  const db = DB();
  const target = (await db
    .prepare(
      `SELECT id, name, email, role, status, access_revoked_at, deleted_at FROM users WHERE id = ?`,
    )
    .bind(userId)
    .first()) as any;

  if (!target || target.deleted_at) return fail(404, 'User not found.');
  if (target.id === actor.id) {
    await adminAudit(ctx, actor, 'account_status_denied', {
      target_type: 'user',
      target_id: target.id,
      target_email: target.email,
      reason: 'self_status_change',
      outcome: 'denied',
      ip,
      user_agent: userAgent(ctx),
    });
    return fail(400, 'You cannot change the status of your own account.');
  }
  if (target.role === 'System Administrator') {
    // Only a System Administrator may touch another System Administrator, and
    // never the last active one (applies to actions that remove access).
    if (!actorIsSystemAdmin(actor)) {
      return fail(403, 'Only a System Administrator can manage System Administrator accounts.');
    }
    if (action === 'suspend' || action === 'revoke') {
      const admins = (await db
        .prepare(
          `SELECT COUNT(*) AS c FROM users
           WHERE role = 'System Administrator' AND status = 'active' AND access_revoked_at IS NULL AND deleted_at IS NULL`,
        )
        .first()) as { c: number };
      if ((admins?.c || 0) <= 1) {
        await adminAudit(ctx, actor, `account_${action}_denied`, {
          target_type: 'user',
          target_id: target.id,
          target_email: target.email,
          reason: 'last_active_system_administrator',
          outcome: 'denied',
          ip,
          user_agent: userAgent(ctx),
        });
        return fail(409, 'This is the last active System Administrator and cannot be suspended or revoked.');
      }
    }
  }

  const patch: Record<string, any> = {};
  switch (action) {
    case 'suspend':
      patch.status = 'suspended';
      break;
    case 'revoke':
      patch.status = 'revoked';
      patch.access_revoked_at = new Date().toISOString();
      break;
    case 'activate':
    case 'reinstate':
      patch.status = 'active';
      patch.access_revoked_at = null;
      break;
    default:
      return fail(400, 'Unsupported action. Use activate, suspend, reinstate, or revoke.');
  }

  const columns = Object.keys(patch);
  await db
    .prepare(`UPDATE users SET ${columns.map((c) => `${c} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`)
    .bind(...columns.map((c) => patch[c]), target.id)
    .run();

  // Suspension and revocation must take effect immediately.
  await bumpTokenVersion(target.id);
  await revokeAllSessions(target.id);

  await adminAudit(ctx, actor, `account_${action}`, {
    target_type: 'user',
    target_id: target.id,
    target_email: target.email,
    target_name: target.name,
    previous_state: JSON.stringify({ status: target.status, access_revoked_at: target.access_revoked_at }),
    new_state: JSON.stringify(patch),
    reason: reason || undefined,
    ip,
    user_agent: userAgent(ctx),
  });

  const env = getEnv() || {};
  const tpl =
    action === 'suspend'
      ? emailSvc.staffAccessSuspendedEmail(env, target.name || target.email, reason)
      : action === 'revoke'
        ? emailSvc.staffAccessRevokedEmail(env, target.name || target.email, reason)
        : emailSvc.staffAccessGrantedEmail(env, target.name || target.email, `${appBaseUrl()}/staff/login`);
  await emailSvc
    .sendEmail(env, {
      to: target.email,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      tags: [{ name: 'type', value: 'account-status' }, { name: 'subtype', value: action }],
    })
    .catch(() => {});

  const verb =
    action === 'suspend' ? 'suspended' : action === 'revoke' ? 'revoked' : 'reactivated';
  return json(200, {
    success: true,
    data: { user_id: target.id, status: patch.status },
    message: `Account ${verb} successfully.`,
  });
}

export async function assignRole(ctx: ExecutionContext, actor: AuthUser, body: any, ip?: string) {
  if (!actor) return fail(401, "Authentication required");
    if (!actorIsSystemAdmin(actor) && !actorHasPermission(actor, 'staff:role')) {
    return fail(403, 'You do not have permission to assign roles.');
  }

  const userId = String(body?.user_id || body?.userId || '').trim();
  const role = String(body?.role || '').trim();
  const department = String(body?.department || '').trim();

  if (!userId || !role) return fail(400, 'user_id and role are required.');
  if (role !== 'Patient' && !isValidStaffRole(role)) return fail(400, 'Invalid staff role.');
  if (department && !isValidDepartment(department)) return fail(400, 'Invalid department.');
  if (isPrivilegedRole(role) && !actorIsSystemAdmin(actor)) {
    return fail(403, 'Only a System Administrator can assign an administrative role.');
  }

  const db = DB();
  const target = (await db
    .prepare('SELECT id, name, email, role, department, status, access_revoked_at FROM users WHERE id = ? AND deleted_at IS NULL')
    .bind(userId)
    .first()) as any;
  if (!target) return fail(404, 'User not found.');

  // No one can change their own role, regardless of privilege. Elevation is a
  // two-person action: another System Administrator must perform it.
  if (target.id === actor.id) {
    await adminAudit(ctx, actor, 'role_assignment_denied', {
      target_type: 'user',
      target_id: target.id,
      target_email: target.email,
      reason: 'self_role_change',
      outcome: 'denied',
      ip,
      user_agent: userAgent(ctx),
    });
    return fail(400, 'You cannot change your own role. Ask another System Administrator to do it.');
  }
  if (isPrivilegedRole(target.role) && !actorIsSystemAdmin(actor)) {
    return fail(403, 'Only a System Administrator can modify an administrative account.');
  }

  // Never allow the last active System Administrator to be demoted.
  if (target.role === 'System Administrator' && role !== 'System Administrator') {
    const admins = (await db
      .prepare(
        `SELECT COUNT(*) AS c FROM users
         WHERE role = 'System Administrator' AND status = 'active' AND access_revoked_at IS NULL AND deleted_at IS NULL`,
      )
      .first()) as { c: number };
    if ((admins?.c || 0) <= 1) {
      await adminAudit(ctx, actor, 'role_assignment_denied', {
        target_type: 'user',
        target_id: target.id,
        target_email: target.email,
        reason: 'last_active_system_administrator',
        outcome: 'denied',
        ip,
        user_agent: userAgent(ctx),
      });
      return fail(409, 'This is the last active System Administrator. Promote another administrator before changing this role.');
    }
  }

  if (target.role === role && (department || target.department) === target.department) {
    return fail(400, 'That role and department are already assigned.');
  }

  await db
    .prepare(
      `UPDATE users SET role = ?, department = ?, updated_at = datetime('now') WHERE id = ?`,
    )
    .bind(role, department || target.department, target.id)
    .run();

  // Role changes alter effective permissions, so force a re-authentication and
  // revoke live sessions immediately.
  await bumpTokenVersion(target.id);
  await revokeAllSessions(target.id);

  await adminAudit(ctx, actor, 'role_assigned', {
    target_type: 'user',
    target_id: target.id,
    target_email: target.email,
    target_name: target.name,
    previous_state: JSON.stringify({ role: target.role, department: target.department }),
    new_state: JSON.stringify({ role, department: department || target.department }),
    ip,
    user_agent: userAgent(ctx),
  });

  return json(200, {
    success: true,
    data: { user_id: target.id, role, department: department || target.department },
    message: 'Role updated. The user must sign in again for the change to take effect.',
  });
}

/** Grant or revoke an individual permission override on top of the role default. */
export async function setPermissionOverrides(ctx: ExecutionContext, actor: AuthUser, body: any, ip?: string) {
  if (!actor) return fail(401, "Authentication required");
    if (!actorIsSystemAdmin(actor) && !actorHasPermission(actor, 'staff:permissions')) {
    return fail(403, 'You do not have permission to manage staff permissions.');
  }

  const role = String(body?.role || '').trim();
  const grant: string[] = Array.isArray(body?.grant) ? body.grant : [];
  const revoke: string[] = Array.isArray(body?.revoke) ? body.revoke : [];
  if (!role) return fail(400, 'role is required.');
  if (role === 'System Administrator') {
    return fail(400, 'System Administrator permissions cannot be reduced or extended.');
  }

  const before = await rolePermissionsFromDb(role);
  const db = DB();

  for (const permission of grant) {
    await db
      .prepare(`INSERT OR IGNORE INTO staff_role_permissions (staff_role, permission_code) VALUES (?, ?)`)
      .bind(role, permission)
      .run();
  }
  for (const permission of revoke) {
    await db
      .prepare(`DELETE FROM staff_role_permissions WHERE staff_role = ? AND permission_code = ?`)
      .bind(role, permission)
      .run();
  }

  await adminAudit(ctx, actor, 'role_permissions_updated', {
    target_type: 'role',
    target_id: role,
    previous_state: JSON.stringify({ permissions: before }),
    new_state: JSON.stringify({ permissions: await rolePermissionsFromDb(role) }),
    ip,
    user_agent: userAgent(ctx),
  });

  return json(200, {
    success: true,
    data: { role, permissions: await rolePermissionsFromDb(role), defaults: permissionsForRole(role) },
    message: 'Role permissions updated.',
  });
}

// ---------------------------------------------------------------------------
// Account recovery (admin-initiated, never reveals passwords)
// ---------------------------------------------------------------------------

export async function adminInitiatePasswordReset(ctx: ExecutionContext, actor: AuthUser, body: any, ip?: string) {
  if (!actor) return fail(401, "Authentication required");
    if (!actorIsSystemAdmin(actor) && !actorHasPermission(actor, 'staff:reset')) {
    return fail(403, 'You do not have permission to reset staff passwords.');
  }

  const email = String(body?.email || '').trim().toLowerCase();
  if (!email) return fail(400, 'email is required.');

  const rl = rateLimit(`admin-reset:${actor.id}:${email}`, 10, 15 * 60 * 1000);
  if (!rl.ok) return fail(429, 'Too many reset requests for this account. Try again later.');

  const target = (await DB()
    .prepare('SELECT id, name, email, role FROM users WHERE email = ? AND deleted_at IS NULL')
    .bind(email)
    .first()) as any;

  if (target) {
    const delivery = await sendPasswordResetEmailForUser(target);
    await adminAudit(ctx, actor, 'password_reset_initiated', {
      target_type: 'user',
      target_id: target.id,
      target_email: target.email,
      target_name: target.name,
      reason: String(body?.reason || '').trim() || undefined,
      ip,
      user_agent: userAgent(ctx),
    });
    await audit(ctx, 'admin_password_reset_initiated', actor, target.id, 'user', { delivery_ok: delivery.ok }, ip);
  }

  // Identical response whether or not the account exists.
  return json(200, {
    success: true,
    message: 'If an account matches that email, a password reset link has been sent.',
  });
}

/** Revoke every session for a user without changing their password. */
export async function revokeUserSessions(ctx: ExecutionContext, actor: AuthUser, body: any, ip?: string) {
  if (!actor) return fail(401, "Authentication required");
    if (!actorIsSystemAdmin(actor) && !actorHasPermission(actor, 'staff:revoke')) {
    return fail(403, 'You do not have permission to revoke sessions.');
  }

  const userId = String(body?.user_id || body?.userId || '').trim();
  if (!userId) return fail(400, 'user_id is required.');

  const target = (await DB()
    .prepare('SELECT id, name, email FROM users WHERE id = ? AND deleted_at IS NULL')
    .bind(userId)
    .first()) as any;
  if (!target) return fail(404, 'User not found.');

  await bumpTokenVersion(target.id);
  await revokeAllSessions(target.id);

  await adminAudit(ctx, actor, 'sessions_revoked', {
    target_type: 'user',
    target_id: target.id,
    target_email: target.email,
    target_name: target.name,
    reason: String(body?.reason || '').trim() || undefined,
    ip,
    user_agent: userAgent(ctx),
  });

  return json(200, { success: true, message: 'All sessions for that account have been revoked.' });
}

// ---------------------------------------------------------------------------
// Audit queries
// ---------------------------------------------------------------------------

export async function queryAdminAudit(ctx: ExecutionContext, actor: AuthUser, body: any, _ip?: string) {
  if (!actor) return fail(401, "Authentication required");
    if (!actorIsSystemAdmin(actor) && !actorHasPermission(actor, 'audit_read')) {
    return fail(403, 'You do not have permission to view the audit log.');
  }

  const page = Math.max(1, parseInt(String(body?.page || '1'), 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(String(body?.page_size || '25'), 10) || 25));
  const offset = (page - 1) * pageSize;

  const filters: string[] = [];
  const params: (string | number)[] = [];
  const add = (clause: string, value: string | number) => {
    filters.push(clause);
    params.push(value);
  };

  if (body?.target_type) add('target_type = ?', String(body.target_type));
  if (body?.target_email) add('LOWER(target_email) = ?', String(body.target_email).toLowerCase());
  if (body?.action) add('action = ?', String(body.action));
  if (body?.outcome) add('outcome = ?', String(body.outcome));
  if (body?.start_date) add('created_at >= ?', String(body.start_date));
  if (body?.end_date) add('created_at <= ?', `${String(body.end_date)} 23:59:59`);
  if (body?.search) {
    const like = `%${String(body.search)}%`;
    filters.push('(target_email LIKE ? OR target_name LIKE ? OR action LIKE ? OR actor_email LIKE ?)');
    params.push(like, like, like, like);
  }

  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const db = DB();

  const totalRow = (await db.prepare(`SELECT COUNT(*) AS c FROM admin_audit ${where}`).bind(...params).first()) as { c: number };
  const rows = rowsOf(await db
    .prepare(
      `SELECT id, actor_id, actor_email, actor_role, action, target_type, target_id, target_email,
              target_name, previous_state, new_state, reason, ip, user_agent, outcome, created_at
       FROM admin_audit ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    )
    .bind(...params, pageSize, offset)
    .all());

  return json(200, {
    success: true,
    data: {
      items: rows.map((r) => ({
        id: r.id,
        actor: { id: r.actor_id, email: r.actor_email, role: r.actor_role },
        action: r.action,
        target: { type: r.target_type, id: r.target_id, email: r.target_email, name: r.target_name },
        previous_state: r.previous_state ? safeJsonParse(r.previous_state) : null,
        new_state: r.new_state ? safeJsonParse(r.new_state) : null,
        reason: r.reason,
        ip: r.ip,
        user_agent: r.user_agent,
        outcome: r.outcome,
        created_at: r.created_at,
      })),
      page,
      page_size: pageSize,
      total: totalRow?.c || 0,
      total_pages: Math.max(1, Math.ceil((totalRow?.c || 0) / pageSize)),
    },
  });
}

export async function adminSecuritySummary(ctx: ExecutionContext, actor: AuthUser, _body: any, _ip?: string) {
  if (!actor) return fail(401, "Authentication required");
    if (!actorIsSystemAdmin(actor) && !actorHasPermission(actor, 'audit_read')) {
    return fail(403, 'You do not have permission to view the security summary.');
  }

  try {
    const db = DB();
    const count = async (sql: string) => {
      const row = (await db.prepare(sql).first()) as { c: number };
      return row?.c || 0;
    };

    return json(200, {
      success: true,
      data: {
        suspicious_attempts_24h:
          (await count(
            `SELECT COUNT(*) AS c FROM admin_audit WHERE outcome != 'success' AND created_at >= datetime('now','-24 hours')`,
          )) +
          (await count(
            `SELECT COUNT(*) AS c FROM audit_log
             WHERE event IN ('user_login_failed','account_locked') AND created_at >= datetime('now','-24 hours')`,
          )),
        denied_actions_24h: await count(
          `SELECT COUNT(*) AS c FROM admin_audit WHERE outcome = 'denied' AND created_at >= datetime('now','-24 hours')`,
        ),
        failed_logins_24h: await count(
          `SELECT COUNT(*) AS c FROM audit_log WHERE event = 'user_login_failed' AND created_at >= datetime('now','-24 hours')`,
        ),
        locked_accounts: await count(`SELECT COUNT(*) AS c FROM users WHERE locked_until > datetime('now')`),
        suspended_accounts: await count(`SELECT COUNT(*) AS c FROM users WHERE status = 'suspended' AND deleted_at IS NULL`),
        revoked_accounts: await count(`SELECT COUNT(*) AS c FROM users WHERE access_revoked_at IS NOT NULL AND deleted_at IS NULL`),
        pending_applications: await count(`SELECT COUNT(*) AS c FROM staff_applications WHERE status = 'pending'`),
        pending_invitations: await count(
          `SELECT COUNT(*) AS c FROM staff_invitations WHERE used_at IS NULL AND cancelled_at IS NULL AND datetime(expires_at) > datetime('now')`,
        ),
        active_administrators: await count(
          `SELECT COUNT(*) AS c FROM users WHERE role = 'System Administrator' AND status = 'active' AND access_revoked_at IS NULL AND deleted_at IS NULL`,
        ),
        recent_admin_actions: rowsOf(
          await db
            .prepare(
              `SELECT id, actor_email, actor_role, action, target_type, target_email, outcome, created_at
               FROM admin_audit ORDER BY created_at DESC LIMIT 10`,
            )
            .all(),
        ).map((r: any) => ({
          id: r.id,
          actor_email: r.actor_email,
          actor_role: r.actor_role,
          action: r.action,
          target_type: r.target_type,
          target_email: r.target_email,
          outcome: r.outcome,
          created_at: r.created_at,
        })),
      },
    });
  } catch {
    return fail(500, 'Could not load the security summary.');
  }
}
