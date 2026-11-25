// src/cf/auth/staff.ts
// Staff portal flows: login, invitations (create/list/resend/cancel), access
// requests (apply/list/approve/reject), invitation acceptance, and the staff
// directory. Role/department validation lives here because it is staff policy.

import * as emailSvc from '../email';
import {
  DB,
  getEnv,
  appBaseUrl,
  audit,
  genId,
  hashPassword,
  isValidEmail,
  issueSession,
  normalizeUgandanPhone,
  publicUserFromRow,
  randomToken,
  rateLimit,
  rows as rowsOf,
  sha256Hex,
  toPublicUser,
  type AuthUser,
} from './lib';
import {
  clearFailedLogin,
  isAccountLocked,
  recordFailedLogin,
  verifyCredentials,
} from './patient';

// ---------------------------------------------------------------------------
// Roles + departments
// ---------------------------------------------------------------------------

export const BOOTSTRAP_SYSTEM_ADMINS = [
  'consult@fidusmedicals.space',
  'aidomexgroup@gmail.com',
] as const;

export const STAFF_ROLES = [
  'System Administrator',
  'Administrator',
  'Facility Administrator',
  'Medical Director',
  'Receptionist',
  'Doctor',
  'Nurse',
  'Midwife',
  'Clinician',
  'Pharmacist',
  'Laboratory Staff',
  'Laboratory Personnel',
  'Pharmacy Staff',
  'Radiology Staff',
  'Billing / Finance Staff',
  'Records Officer',
  'Admin & Finance',
] as const;

export const STAFF_DEPARTMENTS = [
  'Administration', 'Reception', 'Medical Consultation', 'Nursing', 'Maternity',
  'Laboratory', 'Pharmacy', 'Radiology and Ultrasound', 'Theatre and Surgery',
  'Inpatient Wards', 'Dental', 'Pediatrics', 'Obstetrics and Gynecology',
  'Family Planning', 'Finance and Accounts', 'Billing and Cashier', 'Human Resources',
  'Procurement and Stores', 'Records Management', 'Rehabilitation', 'Mental Health',
  'Home Healthcare', 'Telemedicine', 'IT and Systems Administration',
  'Quality Assurance', 'Cardiology', 'Neurology', 'Dermatology', 'ENT',
  'Ophthalmology', 'Orthopedics', 'Gastroenterology', 'Pulmonology',
  'Endocrinology', 'Nephrology', 'Oncology', 'Emergency', 'ICU',
] as const;

// Roles that carry administrative power over other accounts. Only a current
// System Administrator may grant any of them.
export const PRIVILEGED_ROLES = [
  'System Administrator',
  'Administrator',
  'Facility Administrator',
] as const;

const ROLE_SET = new Set<string>(STAFF_ROLES);
const DEPARTMENT_SET = new Set<string>(STAFF_DEPARTMENTS);
const PRIVILEGED_ROLE_SET = new Set<string>(PRIVILEGED_ROLES);

export const isPrivilegedRole = (role: string): boolean => PRIVILEGED_ROLE_SET.has(role);

export const isValidStaffRole = (role: string): boolean => ROLE_SET.has(role);
export const isValidDepartment = (dept: string): boolean => DEPARTMENT_SET.has(dept);

export const isSystemAdmin = (user?: { role?: string } | null): boolean =>
  !!user && user.role === 'System Administrator';

export const canManageStaff = (user?: { role?: string } | null): boolean =>
  !!user && ['System Administrator', 'Administrator', 'Facility Administrator'].includes(String(user.role));

export const isBootstrapSystemAdminEmail = (email?: string | null): boolean =>
  !!email && (BOOTSTRAP_SYSTEM_ADMINS as readonly string[]).includes(String(email).toLowerCase());

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

export async function staffLogin(ctx: ExecutionContext, body: any, ip?: string) {
  const email = String(body?.email || '').trim().toLowerCase();
  const password = String(body?.password || '');
  if (!email || !password) {
    return { status: 400, json: { success: false, message: 'Email and password are required' } };
  }

  const rl = rateLimit(`staff-login:${ip || 'unknown'}:${email}`, 20, 15 * 60 * 1000);
  if (!rl.ok) {
    return { status: 429, json: { success: false, message: 'Too many login attempts. Please try again later.' } };
  }

  const row = await verifyCredentials(email, password);
  if (!row) {
    const existing = (await DB()
      .prepare('SELECT id, role, failed_login_count, locked_until FROM users WHERE email = ? AND deleted_at IS NULL')
      .bind(email)
      .first()) as any;
    if (existing) {
      await recordFailedLogin(existing);
      await audit(ctx, 'user_login_failed', { id: existing.id, email, role: existing.role }, existing.id, 'user', {
        reason: 'invalid_password',
        portal: 'staff',
        failed_attempts: Number(existing.failed_login_count || 0) + 1,
      }, ip);
    } else {
      await audit(ctx, 'user_login_failed', { email }, undefined, 'user', {
        reason: 'unknown_account',
        portal: 'staff',
      }, ip);
    }
    return { status: 401, json: { success: false, message: 'Invalid email or password' } };
  }
  if (isAccountLocked(row)) {
    await audit(ctx, 'account_locked', { id: row.id, email: row.email, role: row.role }, row.id, 'user', {
      reason: 'failed_login_threshold',
      locked_until: row.locked_until,
    }, ip);
    return {
      status: 423,
      json: {
        success: false,
        message: 'Account temporarily locked due to failed sign-in attempts. Try again later or reset your password.',
      },
    };
  }
  if (row.role === 'Patient') {
    return {
      status: 401,
      json: {
        success: false,
        code: 'PATIENT_USE_PATIENT_LOGIN',
        message: 'This is a patient account. Please use the Patient Login page.',
      },
    };
  }
  if (row.status && row.status !== 'active') {
    return { status: 403, json: { success: false, message: 'Staff account is not active. Contact an administrator.' } };
  }

  await clearFailedLogin(row.id);
  await audit(ctx, 'user_login', { id: row.id, email: row.email, role: row.role }, row.id, 'user', { role: row.role }, ip);

  const token = await issueSession({ id: row.id, email: row.email, role: row.role }, ip);
  const fresh = (await DB()
    .prepare(
      `SELECT id, name, email, phone, role, department, email_verified_at, status, created_at, updated_at
       FROM users WHERE id = ?`,
    )
    .bind(row.id)
    .first()) as any;

  return {
    status: 200,
    json: { success: true, data: { ...publicUserFromRow(fresh || row), token }, message: 'Signed in successfully' },
  };
}

// ---------------------------------------------------------------------------
// Invitations
// ---------------------------------------------------------------------------

const INVITATION_TTL_DAYS = 7;
const INVITATION_MAX_DAYS = 30;
const INVITATION_TTL_MS = INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000;

function invitationDays(body: any): number {
  const raw = Number(body?.expires_in_days ?? body?.expiry_days ?? INVITATION_TTL_DAYS);
  if (!Number.isFinite(raw)) return INVITATION_TTL_DAYS;
  return Math.min(INVITATION_MAX_DAYS, Math.max(1, Math.trunc(raw)));
}

function invitationUrl(token: string, email: string): string {
  return `${appBaseUrl()}/staff/register?invite=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;
}

const INVITATION_SELECT = `id, email, invited_by, role, department, name, phone, status, expires_at,
  used_at, cancelled_at, resent_count, last_resent_at, message, created_at`;

/** Derive the user-facing status from the timestamps, not just the stored flag. */
function invitationStatus(row: any): 'pending' | 'accepted' | 'expired' | 'cancelled' | 'revoked' {
  if (row.used_at || row.status === 'accepted') return 'accepted';
  if (row.cancelled_at || row.status === 'cancelled') return 'cancelled';
  if (row.status === 'revoked' || row.revoked_at) return 'revoked';
  if (new Date(row.expires_at).getTime() < Date.now()) return 'expired';
  return 'pending';
}

export async function createStaffInvitation(ctx: ExecutionContext, body: any, actor: any, ip?: string) {
  if (!canManageStaff(actor)) {
    return { status: 403, json: { success: false, message: 'Only authorized administrators can invite staff' } };
  }
  const email = String(body?.email || '').trim().toLowerCase();
  const role = String(body?.role || '').trim();
  const department = String(body?.department || '').trim();
  const name = String(body?.name || '').trim();
  const phone = String(body?.phone || '').trim();
  const message = String(body?.message || '').trim().slice(0, 1000) || null;

  if (!isValidEmail(email) || !role || !department) {
    return { status: 400, json: { success: false, message: 'A valid email, role and department are required' } };
  }
  if (!isValidStaffRole(role)) return { status: 400, json: { success: false, message: 'Invalid staff role' } };
  if (!isValidDepartment(department)) return { status: 400, json: { success: false, message: 'Invalid department' } };
  if (isPrivilegedRole(role) && !isSystemAdmin(actor)) {
    return {
      status: 403,
      json: { success: false, message: 'Only a System Administrator can assign an administrative role' },
    };
  }

  const db = DB();
  if (!db) return { status: 500, json: { success: false, message: 'Database unavailable' } };

  const existingUser = await db.prepare('SELECT id FROM users WHERE email = ? AND deleted_at IS NULL').bind(email).first();
  if (existingUser) {
    return { status: 409, json: { success: false, message: 'A staff account already exists with this email' } };
  }

  // `staff_invitations.email` is UNIQUE in existing deployments. Once a row
  // exists for an address (expired, cancelled, revoked, or an earlier accepted
  // invitation whose account was later deleted), a second INSERT always fails.
  // Reuse that row instead so an administrator can re-invite the same person.
  const previous = (await db
    .prepare(
      `SELECT id, used_at, cancelled_at, revoked_at, status, expires_at
       FROM staff_invitations WHERE email = ?`,
    )
    .bind(email)
    .first()) as any;

  if (previous && invitationStatus(previous) === 'pending') {
    return {
      status: 409,
      json: { success: false, message: 'An active invitation already exists for this email. Resend or revoke it first.' },
    };
  }

  const id = previous?.id || genId();
  const token = randomToken(32);
  const tokenHash = await sha256Hex(token);
  const days = invitationDays(body);
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  const invitedBy = actor.sub || actor.id || null;

  try {
    if (previous) {
      await db
        .prepare(
          `UPDATE staff_invitations
           SET invited_by = ?, role = ?, department = ?, name = ?, phone = ?, token = ?,
               token_hash = ?, status = 'pending', message = ?, created_by = ?, expires_at = ?,
               used_at = NULL, accepted_at = NULL, cancelled_at = NULL, revoked_at = NULL,
               resent_count = 0, last_resent_at = NULL, created_at = datetime('now')
           WHERE id = ?`,
        )
        .bind(invitedBy, role, department, name || null, phone || null, id, tokenHash, message, invitedBy, expiresAt, id)
        .run();
    } else {
      await db
        .prepare(
          `INSERT INTO staff_invitations (id, email, invited_by, role, department, name, phone, token,
                                          token_hash, status, message, created_by, expires_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, datetime('now'))`,
        )
        .bind(
          id,
          email,
          invitedBy,
          role,
          department,
          name || null,
          phone || null,
          // The legacy `token` column is NOT NULL UNIQUE. It must never hold the
          // raw token (only token_hash is used for lookup), but a constant value
          // would collide on the second invitation. The row id is unique and not
          // a secret.
          id,
          tokenHash,
          message,
          invitedBy,
          expiresAt,
        )
        .run();
    }
  } catch (err: any) {
    console.error('staff_invitation_write_failed', { email, role, error: err?.message });
    // A concurrent create can win the UNIQUE(email) race after our read.
    if (String(err?.message || '').toUpperCase().includes('UNIQUE')) {
      return {
        status: 409,
        json: { success: false, message: 'An invitation for this email was just created. Refresh the list and resend it if needed.' },
      };
    }
    return {
      status: 500,
      json: { success: false, message: 'Could not save the invitation. Please try again or contact the system administrator.' },
    };
  }

  await audit(ctx, 'staff_invitation_created', actor, id, 'staff_invitation', {
    email,
    role,
    department,
    reissued: !!previous,
  }, ip);

  const env = getEnv() || {};
  const url = invitationUrl(token, email);
  const tpl = emailSvc.staffInvitationEmail(env, name || email, role, department, url, expiresAt, false, message);
  const delivery = await emailSvc.sendEmail(env, {
    to: email,
    subject: tpl.subject,
    html: tpl.html,
    text: tpl.text,
    tags: [{ name: 'type', value: 'staff-invitation' }],
  });
  await audit(
    ctx,
    delivery.ok ? 'staff_invitation_sent' : 'staff_invitation_delivery_failed',
    actor,
    id,
    'staff_invitation',
    { email, role, delivery_ok: delivery.ok, error: delivery.ok ? undefined : delivery.error },
    ip,
  );

  return {
    status: 201,
    json: {
      success: true,
      data: { id, email, role, department, name, phone, expires_at: expiresAt, days, delivery },
      message: delivery.ok
        ? 'Staff invitation sent'
        : `Invitation saved, but the email could not be delivered${delivery.error ? `: ${delivery.error}` : ''}. Resend it when delivery is available.`,
    },
  };
}

export async function listStaffInvitations(ctx: ExecutionContext, actor: any, _ip?: string) {
  if (!canManageStaff(actor)) {
    return { status: 403, json: { success: false, message: 'Only authorized administrators can list invitations' } };
  }
  const db = DB();
  if (!db) return { status: 500, json: { success: false, message: 'Database unavailable' } };

  try {
    const rows = rowsOf(await db
      .prepare(
        `SELECT i.id, i.email, i.invited_by, i.role, i.department, i.name, i.phone, i.status,
                i.expires_at, i.used_at, i.cancelled_at, i.resent_count, i.last_resent_at,
                i.message, i.created_at,
                u.name AS invited_by_name, u.email AS invited_by_email
         FROM staff_invitations i
         LEFT JOIN users u ON u.id = i.invited_by
         ORDER BY i.created_at DESC`,
      )
      .all());

    return {
      status: 200,
      json: {
        success: true,
        data: {
          items: rows.map((row) => {
            const status = invitationStatus(row);
            return { ...row, status, expired: status === 'expired' };
          }),
          counts: rows.reduce(
            (acc: Record<string, number>, row: any) => {
              const status = invitationStatus(row);
              acc[status] = (acc[status] || 0) + 1;
              return acc;
            },
            { pending: 0, accepted: 0, expired: 0, cancelled: 0, revoked: 0 },
          ),
        },
      },
    };
  } catch {
    return { status: 500, json: { success: false, message: 'Failed to list invitations' } };
  }
}

export async function resendStaffInvitation(ctx: ExecutionContext, body: any, actor: any, ip?: string) {
  if (!canManageStaff(actor)) {
    return { status: 403, json: { success: false, message: 'Only authorized administrators can resend invitations' } };
  }
  const id = String(body?.id || body?.invitation_id || '').trim();
  if (!id) return { status: 400, json: { success: false, message: 'Invitation id is required' } };

  const db = DB();
  if (!db) return { status: 500, json: { success: false, message: 'Database unavailable' } };

  const inv = (await db
    .prepare(
      `SELECT id, email, role, department, name, status, expires_at, used_at, cancelled_at, revoked_at, message
       FROM staff_invitations WHERE id = ?`,
    )
    .bind(id)
    .first()) as any;

  if (!inv) return { status: 404, json: { success: false, message: 'Invitation not found' } };
  if (inv.used_at) return { status: 409, json: { success: false, message: 'That invitation has already been used' } };
  if (inv.cancelled_at || inv.status === 'cancelled') {
    return { status: 409, json: { success: false, message: 'That invitation has been cancelled' } };
  }
  if (inv.revoked_at || inv.status === 'revoked') {
    return { status: 409, json: { success: false, message: 'That invitation has been revoked. Create a new invitation instead.' } };
  }
  if (new Date(inv.expires_at).getTime() < Date.now()) {
    return { status: 409, json: { success: false, message: 'That invitation has expired. Create a new invitation instead.' } };
  }
  if (!isValidStaffRole(String(inv.role || '')) || !isValidDepartment(String(inv.department || ''))) {
    return {
      status: 409,
      json: { success: false, message: 'That invitation has an invalid role or department. Revoke it and create a new invitation.' },
    };
  }

  const existingUser = await db
    .prepare('SELECT id FROM users WHERE email = ? AND deleted_at IS NULL')
    .bind(String(inv.email || '').toLowerCase())
    .first();
  if (existingUser) {
    return { status: 409, json: { success: false, message: 'A staff account already exists for this email' } };
  }

  // Rotate the token so a leaked old link cannot be reused.
  const token = randomToken(32);
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS).toISOString();
  try {
    await db
      .prepare(
        `UPDATE staff_invitations
         SET token = ?, token_hash = ?, expires_at = ?,
             resent_count = COALESCE(resent_count, 0) + 1, last_resent_at = datetime('now')
         WHERE id = ?`,
      )
      // `token` is a legacy NOT NULL UNIQUE column; the row id keeps it unique
      // and nothing reads it. The hash is the lookup key.
      .bind(id, tokenHash, expiresAt, id)
      .run();
  } catch (err: any) {
    console.error('staff_invitation_resend_failed', { id, error: err?.message });
    return { status: 500, json: { success: false, message: 'Could not prepare a fresh invitation link. Please try again.' } };
  }

  await audit(ctx, 'staff_invitation_resent', actor, id, 'staff_invitation', { email: inv.email, role: inv.role }, ip);

  const env = getEnv() || {};
  const tpl = emailSvc.staffInvitationEmail(
    env,
    inv.name || inv.email,
    inv.role,
    inv.department,
    invitationUrl(token, inv.email),
    expiresAt,
    true,
    inv.message,
  );
  const delivery = await emailSvc.sendEmail(env, {
    to: inv.email,
    subject: tpl.subject,
    html: tpl.html,
    text: tpl.text,
    tags: [{ name: 'type', value: 'staff-invitation' }, { name: 'subtype', value: 'resent' }],
  });
  await audit(ctx, delivery.ok ? 'staff_invitation_resent_sent' : 'staff_invitation_resent_failed', actor, id, 'staff_invitation', {
    email: inv.email,
    delivery_ok: delivery.ok,
  }, ip);

  return {
    status: 200,
    json: {
      success: true,
      data: { id, email: inv.email, expires_at: expiresAt, delivery },
      message: delivery.ok
        ? 'Invitation resent with a fresh single-use link'
        : `A fresh link was created, but delivery failed${delivery.error ? `: ${delivery.error}` : ''}.`,
    },
  };
}

export async function cancelStaffInvitation(ctx: ExecutionContext, body: any, actor: any, ip?: string) {
  if (!canManageStaff(actor)) {
    return { status: 403, json: { success: false, message: 'Only authorized administrators can cancel invitations' } };
  }
  const id = String(body?.id || body?.invitation_id || '').trim();
  if (!id) return { status: 400, json: { success: false, message: 'Invitation id is required' } };

  const db = DB();
  if (!db) return { status: 500, json: { success: false, message: 'Database unavailable' } };

  const inv = (await db
    .prepare('SELECT id, email, role, department, name, used_at, cancelled_at FROM staff_invitations WHERE id = ?')
    .bind(id)
    .first()) as any;

  if (!inv) return { status: 404, json: { success: false, message: 'Invitation not found' } };
  if (inv.used_at) return { status: 409, json: { success: false, message: 'That invitation has already been accepted' } };
  if (inv.cancelled_at) return { status: 409, json: { success: false, message: 'That invitation is already cancelled' } };

  const cancelled = await db
    .prepare(
      `UPDATE staff_invitations SET status = 'cancelled', cancelled_at = datetime('now')
       WHERE id = ? AND used_at IS NULL AND cancelled_at IS NULL`,
    )
    .bind(id)
    .run();

  if (!cancelled.meta?.changes) {
    return { status: 409, json: { success: false, message: 'The invitation could not be cancelled because it changed state.' } };
  }

  await audit(ctx, 'staff_invitation_cancelled', actor, id, 'staff_invitation', { email: inv.email, role: inv.role }, ip);

  const env = getEnv() || {};
  const tpl = emailSvc.staffInviteCancelledEmail(env, inv.name || inv.email, inv.role, inv.department);
  await emailSvc
    .sendEmail(env, {
      to: inv.email,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      tags: [{ name: 'type', value: 'staff-invitation' }, { name: 'subtype', value: 'cancelled' }],
    })
    .catch(() => {});

  return { status: 200, json: { success: true, message: 'Invitation revoked' } };
}

// ---------------------------------------------------------------------------
// Access requests (applications)
// ---------------------------------------------------------------------------

export async function applyStaff(ctx: ExecutionContext, body: any, ip?: string) {
  const email = String(body?.email || '').trim().toLowerCase();
  const name = String(body?.name || '').trim();
  const role = String(body?.role || '').trim();
  const department = String(body?.department || '').trim();

  if (!isValidEmail(email) || !name || !role || !department) {
    return { status: 400, json: { success: false, message: 'Name, a valid email, role and department are required' } };
  }
  if (!isValidStaffRole(role)) return { status: 400, json: { success: false, message: 'Invalid staff role' } };
  if (!isValidDepartment(department)) return { status: 400, json: { success: false, message: 'Invalid department' } };
  if (isPrivilegedRole(role)) {
    return {
      status: 400,
      json: {
        success: false,
        message: 'Administrative roles cannot be applied for. A System Administrator must provision that access.',
      },
    };
  }

  const db = DB();
  if (!db) return { status: 500, json: { success: false, message: 'Database unavailable' } };

  const existingUser = await db.prepare('SELECT id FROM users WHERE email = ? AND deleted_at IS NULL').bind(email).first();
  if (existingUser) {
    return { status: 409, json: { success: false, message: 'A staff account already exists with this email' } };
  }

  const existingApp = await db
    .prepare(`SELECT id FROM staff_applications WHERE email = ? AND status IN ('pending','pending_verification','verification_required')`)
    .bind(email)
    .first();
  if (existingApp) {
    return { status: 409, json: { success: false, message: 'An open application already exists for this email' } };
  }

  const id = genId();
  await db
    .prepare(
      `INSERT INTO staff_applications (id, name, email, phone, role, department,
                                       professional_designation, professional_reg, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'))`,
    )
    .bind(
      id,
      name,
      email,
      String(body?.phone || '').trim() || null,
      role,
      department,
      String(body?.professional_designation || '').trim() || null,
      String(body?.professional_reg || '').trim() || null,
    )
    .run();

  await audit(ctx, 'staff_application_submitted', { email, role }, id, 'staff_application', { name, department }, ip);

  const env = getEnv() || {};
  const tpl = emailSvc.staffApplicationReceivedEmail(env, name, role, department);
  await emailSvc
    .sendEmail(env, {
      to: email,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      tags: [{ name: 'type', value: 'staff-application' }, { name: 'subtype', value: 'received' }],
    })
    .catch(() => {});

  return {
    status: 201,
    json: {
      success: true,
      data: { id, email, role, department, status: 'pending' },
      message: 'Application submitted. Pending administrator approval.',
    },
  };
}

export async function listStaffApplications(_ctx: ExecutionContext, actor: any, _ip?: string) {
  if (!canManageStaff(actor)) {
    return { status: 403, json: { success: false, message: 'Only administrators can review applications' } };
  }
  try {
    const rows = rowsOf(await DB()
      .prepare(
        `SELECT id, name, email, phone, role, department, professional_designation, professional_reg,
                status, rejection_reason, reviewed_by, reviewed_at, created_at
         FROM staff_applications ORDER BY created_at DESC`,).all());
    return { status: 200, json: { success: true, data: rows } };
  } catch {
    return { status: 500, json: { success: false, message: 'Failed to list applications' } };
  }
}

export async function approveStaffApplication(ctx: ExecutionContext, body: any, actor: any, ip?: string) {
  if (!canManageStaff(actor)) {
    return { status: 403, json: { success: false, message: 'Only authorized administrators can approve applications' } };
  }
  const applicationId = String(body?.id || '').trim();
  if (!applicationId) return { status: 400, json: { success: false, message: 'Application id is required' } };

  const db = DB();
  if (!db) return { status: 500, json: { success: false, message: 'Database unavailable' } };

  const app = (await db
    .prepare(
      `SELECT id, name, email, phone, role, department, status
       FROM staff_applications WHERE id = ?`,
    )
    .bind(applicationId)
    .first()) as any;

  if (!app) return { status: 404, json: { success: false, message: 'Application not found' } };
  if (app.status !== 'pending') {
    return { status: 409, json: { success: false, message: `Application is already ${app.status}` } };
  }
  if (isPrivilegedRole(app.role) && !isSystemAdmin(actor)) {
    return {
      status: 403,
      json: { success: false, message: 'Only a System Administrator can approve an administrative role.' },
    };
  }

  const existing = await db.prepare('SELECT id FROM users WHERE email = ? AND deleted_at IS NULL').bind(app.email).first();
  if (existing) {
    return { status: 409, json: { success: false, message: 'An account already exists for this applicant' } };
  }

  // The applicant sets their own password via a one-time activation link. No
  // temporary password is generated or returned to the administrator.
  const activationToken = randomToken(32);
  const { hash, salt } = await hashPassword(randomToken(32));
  const userId = genId();

  await db
    .prepare(
      `INSERT INTO users (id, name, email, phone, role, department, password_hash, password_salt,
                          email_verified_at, status, approved_by, approved_at, activated_at,
                          created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 'pending_activation', ?, datetime('now'), NULL,
               datetime('now'), datetime('now'))`,
    )
    .bind(userId, app.name, app.email, app.phone || null, app.role, app.department, hash, salt, actor.sub)
    .run();

  await db
    .prepare(
      `UPDATE staff_applications SET status = 'approved', reviewed_by = ?, reviewed_at = datetime('now'),
                                     access_granted_at = datetime('now') WHERE id = ?`,
    )
    .bind(actor.sub, applicationId)
    .run();

  await db
    .prepare(
      `INSERT INTO auth_tokens (id, user_id, type, token_hash, expires_at, created_at, meta)
       VALUES (?, ?, 'password_reset', ?, ?, datetime('now'), ?)`,
    )
    .bind(
      genId(),
      userId,
      await sha256Hex(activationToken),
      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      JSON.stringify({ purpose: 'staff_activation' }),
    )
    .run();

  await audit(ctx, 'staff_application_approved', actor, userId, 'user', {
    application_id: applicationId,
    role: app.role,
    department: app.department,
  }, ip);

  const env = getEnv() || {};
  const activationUrl = `${appBaseUrl()}/reset-password?token=${encodeURIComponent(activationToken)}`;
  const tpl = emailSvc.staffActivationEmail(env, app.name, app.role, app.department, activationUrl);
  const delivery = await emailSvc
    .sendEmail(env, {
      to: app.email,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      tags: [{ name: 'type', value: 'staff-activation' }],
    })
    .catch(() => ({ ok: false }));

  return {
    status: 201,
    json: {
      success: true,
      data: { id: userId, email: app.email, role: app.role, department: app.department, delivery },
      message: 'Staff account approved. An activation link has been emailed to the applicant.',
    },
  };
}

export async function rejectStaffApplication(ctx: ExecutionContext, body: any, actor: any, ip?: string) {
  if (!canManageStaff(actor)) {
    return { status: 403, json: { success: false, message: 'Only authorized administrators can reject applications' } };
  }
  const applicationId = String(body?.id || '').trim();
  const reason = String(body?.reason || '').trim() || null;
  if (!applicationId) return { status: 400, json: { success: false, message: 'Application id is required' } };

  const db = DB();
  if (!db) return { status: 500, json: { success: false, message: 'Database unavailable' } };

  const app = (await db
    .prepare('SELECT id, name, email, status FROM staff_applications WHERE id = ?')
    .bind(applicationId)
    .first()) as any;
  if (!app) return { status: 404, json: { success: false, message: 'Application not found' } };
  if (app.status !== 'pending') {
    return { status: 409, json: { success: false, message: `Application is already ${app.status}` } };
  }

  await db
    .prepare(
      `UPDATE staff_applications SET status = 'rejected', reviewed_by = ?, reviewed_at = datetime('now'),
                                     rejection_reason = ? WHERE id = ?`,
    )
    .bind(actor.sub, reason, applicationId)
    .run();

  await audit(ctx, 'staff_application_rejected', actor, applicationId, 'staff_application', { reason }, ip);

  const env = getEnv() || {};
  const tpl = emailSvc.staffApplicationRejectedEmail(env, app.name || app.email, reason);
  await emailSvc
    .sendEmail(env, {
      to: app.email,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      tags: [{ name: 'type', value: 'staff-application' }, { name: 'subtype', value: 'rejected' }],
    })
    .catch(() => {});

  return { status: 200, json: { success: true, message: 'Application rejected' } };
}

// ---------------------------------------------------------------------------
// Invitation acceptance (public)
// ---------------------------------------------------------------------------

/**
 * Resolve an invitation link without consuming it. The token holder can see the
 * bound email, role, and department before creating an account, but this never
 * activates access.
 */
export async function getStaffInvitationInfo(_ctx: ExecutionContext, body: any, ip?: string) {
  const rawToken = String(body?.token || body?.invitation_token || '').trim();
  if (!rawToken) return { status: 400, json: { success: false, message: 'An invitation token is required.' } };

  const rl = rateLimit(`invitation-info:${ip || 'unknown'}`, 30, 15 * 60 * 1000);
  if (!rl.ok) return { status: 429, json: { success: false, message: 'Too many attempts. Please try again later.' } };

  const db = DB();
  if (!db) return { status: 500, json: { success: false, message: 'Database unavailable' } };

  const inv = (await db
    .prepare(`SELECT ${INVITATION_SELECT} FROM staff_invitations WHERE token_hash = ?`)
    .bind(await sha256Hex(rawToken))
    .first()) as any;

  if (!inv) {
    return {
      status: 404,
      json: { success: false, message: 'This invitation link is invalid. Ask the administrator to resend it.' },
    };
  }

  const status = invitationStatus(inv);
  const validAssignment =
    isValidStaffRole(String(inv.role || '')) && isValidDepartment(String(inv.department || ''));
  const existingUser = await db
    .prepare('SELECT id FROM users WHERE email = ? AND deleted_at IS NULL')
    .bind(String(inv.email || '').toLowerCase())
    .first();

  const messages: Record<string, string> = {
    accepted: 'This invitation has already been accepted. Sign in through the staff portal.',
    cancelled: 'This invitation was revoked by an administrator. Contact the facility if you still need access.',
    revoked: 'This invitation was revoked by an administrator. Contact the facility if you still need access.',
    expired: 'This invitation has expired. Ask the administrator to send a new one.',
    pending: existingUser
      ? 'An account already exists for this email. Use the staff sign-in page instead.'
      : validAssignment
        ? 'Invitation verified. Complete the form to activate your staff account.'
        : 'This invitation has an invalid role or department. Ask the administrator to send a new invitation.',
  };

  return {
    status: 200,
    json: {
      success: true,
      data: {
        email: inv.email,
        name: inv.name || '',
        role: inv.role,
        department: inv.department,
        message: inv.message || null,
        status,
        expires_at: inv.expires_at,
        can_accept: status === 'pending' && validAssignment && !existingUser,
      },
      message: messages[status] || messages.pending,
    },
  };
}

export async function acceptInvitation(ctx: ExecutionContext, body: any, ip?: string) {
  const rawToken = String(body?.invitation_token || body?.token || '').trim();
  const name = String(body?.name || '').trim();
  const password = String(body?.password || '');
  const confirmation = String(body?.passwordConfirmation ?? body?.confirmPassword ?? password);

  if (!rawToken || !name || !password) {
    return { status: 400, json: { success: false, message: 'Invitation token, name and password are required' } };
  }
  if (password.length < 6) {
    return { status: 400, json: { success: false, message: 'Password must be at least 6 characters' } };
  }
  if (password !== confirmation) {
    return { status: 400, json: { success: false, message: 'Passwords do not match' } };
  }

  const rl = rateLimit(`invitation-accept:${ip || 'unknown'}`, 10, 15 * 60 * 1000);
  if (!rl.ok) return { status: 429, json: { success: false, message: 'Too many acceptance attempts. Please try again later.' } };

  const db = DB();
  if (!db) return { status: 500, json: { success: false, message: 'Database unavailable' } };

  const inv = (await db
    .prepare('SELECT * FROM staff_invitations WHERE token_hash = ?')
    .bind(await sha256Hex(rawToken))
    .first()) as any;

  if (!inv) return { status: 400, json: { success: false, message: 'Invalid invitation token' } };

  const invState = invitationStatus(inv);
  if (invState === 'accepted') {
    return { status: 409, json: { success: false, message: 'Invitation has already been used' } };
  }
  if (invState === 'cancelled' || invState === 'revoked') {
    return { status: 410, json: { success: false, message: 'Invitation has been revoked. Contact the facility.' } };
  }
  if (invState === 'expired') {
    return { status: 410, json: { success: false, message: 'Invitation has expired. Ask the administrator to send a new one.' } };
  }

  const email = String(inv.email || '').toLowerCase();
  const invitedRole = String(inv.role || '');
  const invitedDepartment = String(inv.department || '');

  // A role the portal cannot route (legacy or hand-edited row) must never
  // produce an account: it would activate with no usable workspace.
  if (!isValidStaffRole(invitedRole) || !isValidDepartment(invitedDepartment)) {
    await audit(ctx, 'staff_invitation_accept_denied', { email }, inv.id, 'staff_invitation', {
      reason: 'invalid_role_or_department',
      role: invitedRole,
      department: invitedDepartment,
    }, ip);
    return {
      status: 409,
      json: {
        success: false,
        message: 'This invitation has an invalid role or department. Ask the administrator to revoke it and send a new invitation.',
      },
    };
  }

  const existing = (await db
    .prepare('SELECT id, status FROM users WHERE email = ? AND deleted_at IS NULL')
    .bind(email)
    .first()) as any;
  if (existing) {
    return {
      status: 409,
      json: {
        success: false,
        message:
          existing.status === 'pending_activation'
            ? 'An account already exists for this email and is awaiting activation. Ask the administrator to send a password reset link instead.'
            : 'An account already exists for this invitation',
      },
    };
  }

  const { hash, salt } = await hashPassword(password);
  const userId = genId();
  const phone = normalizeUgandanPhone(String(body?.phone || ''));

  // Claim the invitation atomically before creating the account so two
  // submissions of the same link cannot both succeed.
  const claim = await db
    .prepare(
      `UPDATE staff_invitations
       SET used_at = datetime('now'), accepted_at = datetime('now'), status = 'accepted'
       WHERE id = ? AND used_at IS NULL AND cancelled_at IS NULL
         AND datetime(expires_at) > datetime('now')`,
    )
    .bind(inv.id)
    .run();
  if (!claim.meta?.changes) {
    return { status: 409, json: { success: false, message: 'This invitation is no longer valid. Ask the administrator to resend it.' } };
  }

  try {
    await db
      .prepare(
        `INSERT INTO users (id, name, email, phone, role, department, password_hash, password_salt,
                            email_verified_at, status, invited_by, approved_by, approved_at, activated_at,
                            created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), 'active', ?, ?, datetime('now'), datetime('now'),
                 datetime('now'), datetime('now'))`,
      )
      .bind(userId, name, email, phone, invitedRole, invitedDepartment, hash, salt, inv.invited_by, inv.invited_by)
      .run();
  } catch (err: any) {
    // The account could not be created; release the invitation so the token
    // stays usable after the cause is fixed.
    console.error('staff_invitation_accept_failed', {
      invitationId: inv.id,
      email,
      role: invitedRole,
      error: err?.message,
    });
    await db
      .prepare(
        `UPDATE staff_invitations SET used_at = NULL, accepted_at = NULL, status = 'pending' WHERE id = ?`,
      )
      .bind(inv.id)
      .run();
    await audit(ctx, 'staff_invitation_accept_failed', { email }, inv.id, 'staff_invitation', {
      reason: 'account_creation_failed',
    }, ip);
    return { status: 500, json: { success: false, message: 'Could not create the staff account. Please try again.' } };
  }

  await audit(ctx, 'staff_invitation_accepted', { id: userId, email, role: invitedRole }, userId, 'user', { invitationId: inv.id }, ip);

  const env = getEnv() || {};
  const inviter = (await db
    .prepare('SELECT id, name, email FROM users WHERE id = ? AND deleted_at IS NULL')
    .bind(inv.invited_by)
    .first()) as any;
  if (inviter?.email) {
    const adminTpl = emailSvc.staffInvitationAcceptedAdminEmail(
      env,
      inviter.name || inviter.email,
      `${name} <${email}>`,
      invitedRole,
      invitedDepartment,
    );
    await emailSvc
      .sendEmail(env, {
        to: inviter.email,
        subject: adminTpl.subject,
        html: adminTpl.html,
        text: adminTpl.text,
        tags: [{ name: 'type', value: 'staff-invitation' }, { name: 'subtype', value: 'accepted-admin' }],
      })
      .catch(() => {});
  }

  const tpl = emailSvc.staffAccountActivatedEmail(env, name, invitedRole, invitedDepartment);
  await emailSvc
    .sendEmail(env, {
      to: email,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      tags: [{ name: 'type', value: 'staff-activation' }],
    })
    .catch(() => {});

  const token = await issueSession({ id: userId, email, role: invitedRole }, ip);
  const fresh = (await db.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first()) as any;

  return {
    status: 200,
    json: {
      success: true,
      data: { ...publicUserFromRow(fresh), token },
      message: 'Invitation accepted. Staff account activated.',
    },
  };
}

// ---------------------------------------------------------------------------
// Directory
// ---------------------------------------------------------------------------

export async function listUsers(_ctx: ExecutionContext, actor: AuthUser | any, _ip?: string) {
  if (!canManageStaff(actor)) {
    return { status: 403, json: { success: false, message: 'Only authorized administrators can list users' } };
  }
  try {
    const rows = rowsOf(await DB()
      .prepare(
        `SELECT id, name, email, phone, role, department, status, email_verified_at,
                created_at, last_login_at, updated_at
         FROM users WHERE deleted_at IS NULL ORDER BY created_at DESC`,).all());
    return { status: 200, json: { success: true, data: rows.map((r) => toPublicUser(r, { status: r.status })) } };
  } catch {
    return { status: 500, json: { success: false, message: 'Failed to list users' } };
  }
}
