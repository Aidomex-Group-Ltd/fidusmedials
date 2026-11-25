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

const ROLE_SET = new Set<string>(STAFF_ROLES);
const DEPARTMENT_SET = new Set<string>(STAFF_DEPARTMENTS);

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
      .prepare('SELECT id, failed_login_count, locked_until FROM users WHERE email = ? AND deleted_at IS NULL')
      .bind(email)
      .first()) as any;
    if (existing) await recordFailedLogin(existing);
    return { status: 401, json: { success: false, message: 'Invalid email or password' } };
  }
  if (isAccountLocked(row)) {
    return {
      status: 423,
      json: {
        success: false,
        message: 'Account temporarily locked due to failed sign-in attempts. Try again later or reset your password.',
      },
    };
  }
  if (row.role === 'Patient') {
    return { status: 401, json: { success: false, message: 'Please use Patient Login to access the patient portal' } };
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

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function invitationUrl(token: string, email: string): string {
  return `${appBaseUrl()}/register?invite=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;
}

export async function createStaffInvitation(ctx: ExecutionContext, body: any, actor: any, ip?: string) {
  if (!canManageStaff(actor)) {
    return { status: 403, json: { success: false, message: 'Only authorized administrators can invite staff' } };
  }
  if (body?.role === 'System Administrator' && !isSystemAdmin(actor)) {
    return {
      status: 403,
      json: { success: false, message: 'Only a System Administrator can assign the System Administrator role' },
    };
  }

  const email = String(body?.email || '').trim().toLowerCase();
  const role = String(body?.role || '').trim();
  const department = String(body?.department || '').trim();
  const name = String(body?.name || '').trim();
  const phone = String(body?.phone || '').trim();

  if (!isValidEmail(email) || !role || !department) {
    return { status: 400, json: { success: false, message: 'A valid email, role and department are required' } };
  }
  if (!isValidStaffRole(role)) return { status: 400, json: { success: false, message: 'Invalid staff role' } };
  if (!isValidDepartment(department)) return { status: 400, json: { success: false, message: 'Invalid department' } };

  const db = DB();
  if (!db) return { status: 500, json: { success: false, message: 'Database unavailable' } };

  const existingUser = await db.prepare('SELECT id FROM users WHERE email = ? AND deleted_at IS NULL').bind(email).first();
  if (existingUser) {
    return { status: 409, json: { success: false, message: 'A staff account already exists with this email' } };
  }

  const existingInvite = await db
    .prepare(`SELECT id FROM staff_invitations WHERE email = ? AND used_at IS NULL AND status = 'pending'`)
    .bind(email)
    .first();
  if (existingInvite) {
    return { status: 409, json: { success: false, message: 'An active invitation already exists for this email' } };
  }

  const id = genId();
  const token = randomToken(32);
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS).toISOString();

  await db
    .prepare(
      `INSERT INTO staff_invitations (id, email, invited_by, role, department, name, phone, token,
                                      token_hash, status, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, datetime('now'))`,
    )
    .bind(id, email, actor.sub, role, department, name || null, phone || null, 'REDACTED', tokenHash, expiresAt)
    .run();

  await audit(ctx, 'staff_invitation_created', actor, id, 'staff_invitation', { email, role, department }, ip);

  const env = getEnv() || {};
  const url = invitationUrl(token, email);
  const tpl = emailSvc.staffInvitationEmail(env, name || email, role, department, url, expiresAt, false);
  const delivery = await emailSvc.sendEmail(env, {
    to: email,
    subject: tpl.subject,
    html: tpl.html,
    text: tpl.text,
    tags: [{ name: 'type', value: 'staff-invitation' }],
  });

  return {
    status: 201,
    json: {
      success: true,
      data: { id, email, role, department, name, phone, expires_at: expiresAt, delivery },
      message: delivery.ok ? 'Staff invitation sent' : 'Invitation created but email delivery failed',
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
        `SELECT id, email, invited_by, role, department, name, phone, status, expires_at,
                used_at, cancelled_at, resent_count, last_resent_at, created_at
         FROM staff_invitations ORDER BY created_at DESC`,).all());

    return {
      status: 200,
      json: {
        success: true,
        data: {
          items: rows.map((row) => {
            const expired = !row.used_at && new Date(row.expires_at).getTime() < Date.now();
            const status = row.used_at ? 'accepted' : row.cancelled_at ? 'cancelled' : expired ? 'expired' : 'pending';
            return { ...row, status, expired };
          }),
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
      `SELECT id, email, role, department, name, status, expires_at, used_at, cancelled_at
       FROM staff_invitations WHERE id = ?`,
    )
    .bind(id)
    .first()) as any;

  if (!inv) return { status: 404, json: { success: false, message: 'Invitation not found' } };
  if (inv.used_at) return { status: 409, json: { success: false, message: 'That invitation has already been used' } };
  if (inv.cancelled_at || inv.status === 'cancelled') {
    return { status: 409, json: { success: false, message: 'That invitation has been cancelled' } };
  }
  if (new Date(inv.expires_at).getTime() < Date.now()) {
    return { status: 409, json: { success: false, message: 'That invitation has expired. Cancel it and create a new one.' } };
  }

  // Rotate the token so a leaked old link cannot be reused.
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS).toISOString();
  await db
    .prepare(
      `UPDATE staff_invitations
       SET token = ?, token_hash = ?, expires_at = ?,
           resent_count = COALESCE(resent_count, 0) + 1, last_resent_at = datetime('now')
       WHERE id = ?`,
    )
    .bind('REDACTED', await sha256Hex(token), expiresAt, id)
    .run();

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
  );
  const delivery = await emailSvc.sendEmail(env, {
    to: inv.email,
    subject: tpl.subject,
    html: tpl.html,
    text: tpl.text,
    tags: [{ name: 'type', value: 'staff-invitation' }, { name: 'subtype', value: 'resent' }],
  });

  return {
    status: 200,
    json: {
      success: true,
      data: { id, email: inv.email, expires_at: expiresAt, delivery },
      message: delivery.ok ? 'Invitation resent' : 'Invitation resent but email delivery failed',
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
    .prepare('SELECT id, email, role, department, used_at, cancelled_at FROM staff_invitations WHERE id = ?')
    .bind(id)
    .first()) as any;

  if (!inv) return { status: 404, json: { success: false, message: 'Invitation not found' } };
  if (inv.used_at) return { status: 409, json: { success: false, message: 'That invitation has already been accepted' } };
  if (inv.cancelled_at) return { status: 409, json: { success: false, message: 'That invitation is already cancelled' } };

  await db
    .prepare(`UPDATE staff_invitations SET status = 'cancelled', cancelled_at = datetime('now') WHERE id = ?`)
    .bind(id)
    .run();

  await audit(ctx, 'staff_invitation_cancelled', actor, id, 'staff_invitation', { email: inv.email, role: inv.role }, ip);
  return { status: 200, json: { success: true, message: 'Invitation cancelled' } };
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

  const db = DB();
  if (!db) return { status: 500, json: { success: false, message: 'Database unavailable' } };

  const inv = (await db
    .prepare('SELECT * FROM staff_invitations WHERE token_hash = ?')
    .bind(await sha256Hex(rawToken))
    .first()) as any;

  if (!inv) return { status: 400, json: { success: false, message: 'Invalid invitation token' } };
  if (inv.used_at) return { status: 400, json: { success: false, message: 'Invitation has already been used' } };
  if (inv.cancelled_at) return { status: 400, json: { success: false, message: 'Invitation has been cancelled' } };
  if (new Date(inv.expires_at).getTime() < Date.now()) {
    return { status: 400, json: { success: false, message: 'Invitation has expired' } };
  }

  const email = String(inv.email || '').toLowerCase();
  const existing = await db.prepare('SELECT id FROM users WHERE email = ? AND deleted_at IS NULL').bind(email).first();
  if (existing) {
    return { status: 409, json: { success: false, message: 'An account already exists for this invitation' } };
  }

  const { hash, salt } = await hashPassword(password);
  const userId = genId();
  const phone = normalizeUgandanPhone(String(body?.phone || ''));

  await db
    .prepare(
      `INSERT INTO users (id, name, email, phone, role, department, password_hash, password_salt,
                          email_verified_at, status, invited_by, approved_by, approved_at, activated_at,
                          created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), 'active', ?, ?, datetime('now'), datetime('now'),
               datetime('now'), datetime('now'))`,
    )
    .bind(userId, name, email, phone, inv.role, inv.department, hash, salt, inv.invited_by, inv.invited_by)
    .run();

  await db
    .prepare(
      `UPDATE staff_invitations SET used_at = datetime('now'), accepted_at = datetime('now'), status = 'accepted'
       WHERE id = ?`,
    )
    .bind(inv.id)
    .run();

  await audit(ctx, 'staff_invitation_accepted', { id: userId, email, role: inv.role }, userId, 'user', { invitationId: inv.id }, ip);

  const env = getEnv() || {};
  const tpl = emailSvc.staffAccountActivatedEmail(env, name, inv.role, inv.department);
  await emailSvc
    .sendEmail(env, {
      to: email,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      tags: [{ name: 'type', value: 'staff-activation' }],
    })
    .catch(() => {});

  const token = await issueSession({ id: userId, email, role: inv.role }, ip);
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
