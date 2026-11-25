// src/cf/auth/patient.ts
// Patient portal flows: registration, login, email verification, resend,
// forgot-password, and reset-password. Staff and admin flows live elsewhere.

import * as emailSvc from '../email';
import {
  DB,
  getEnv,
  APP_AUDIENCE,
  EMAIL_VERIFY_TTL_SECONDS,
  PASSWORD_RESET_TTL_SECONDS,
  LOGIN_MAX_FAILURES,
  LOGIN_LOCK_MINUTES,
  appBaseUrl,
  audit,
  bumpTokenVersion,
  consumeAuthToken,
  createAuthToken,
  genId,
  hashPassword,
  isDeliverableEmail,
  isValidEmail,
  issueSession,
  jwtSecretHex,
  looksLikePhone,
  normalizeUgandanPhone,
  publicUserFromRow,
  rateLimit,
  revokeAllSessions,
  signJwt,
  verifyPassword,
  type UserRow,
} from './lib';

// ---------------------------------------------------------------------------
// Credential lookup + verification (shared with the staff portal)
// ---------------------------------------------------------------------------

const CREDENTIAL_COLUMNS = `id, name, email, phone, role, department, password_hash, password_salt,
  created_at, updated_at, deleted_at, email_verified_at, status,
  failed_login_count, locked_until, token_version`;

export async function findUserByContact(identifier: string): Promise<UserRow | null> {
  const db = DB();
  if (!db) return null;

  if (looksLikePhone(identifier)) {
    const phone = normalizeUgandanPhone(identifier);
    if (!phone) return null;
    return ((await db
      .prepare(`SELECT ${CREDENTIAL_COLUMNS} FROM users WHERE phone = ?`)
      .bind(phone)
      .first()) as UserRow | undefined) || null;
  }

  return ((await db
    .prepare(`SELECT ${CREDENTIAL_COLUMNS} FROM users WHERE email = ?`)
    .bind(identifier.toLowerCase())
    .first()) as UserRow | undefined) || null;
}

/** Verify an email/phone + password pair. Returns null on any mismatch. */
export async function verifyCredentials(identifier: string, password: string): Promise<UserRow | null> {
  const row = await findUserByContact(identifier);
  if (!row || row.deleted_at) return null;
  if (!(await verifyPassword(password, row.password_hash, row.password_salt))) return null;
  return row;
}

export function isAccountLocked(row: Partial<UserRow> | null | undefined): boolean {
  return !!(row?.locked_until && new Date(row.locked_until).getTime() > Date.now());
}

export async function recordFailedLogin(row: Partial<UserRow> & { id: string }) {
  const failures = Number(row.failed_login_count || 0) + 1;
  const locked = failures >= LOGIN_MAX_FAILURES;
  const lockedUntil = locked ? new Date(Date.now() + LOGIN_LOCK_MINUTES * 60 * 1000).toISOString() : null;
  await DB()
    .prepare(
      `UPDATE users SET failed_login_count = ?, locked_until = ?, updated_at = datetime('now') WHERE id = ?`,
    )
    .bind(failures, lockedUntil, row.id)
    .run();
  return { failures, locked, lockedUntil };
}

export async function clearFailedLogin(userId: string) {
  await DB()
    .prepare(
      `UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = datetime('now'),
                       updated_at = datetime('now') WHERE id = ?`,
    )
    .bind(userId)
    .run();
}

// ---------------------------------------------------------------------------
// Transactional email helpers (verification + reset links)
// ---------------------------------------------------------------------------

function placeholderEmailForPhone(phone: string): string {
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `phone-${phone.replace(/[^0-9+]/g, '')}-${hex}@noreply.fidus.staging`;
}

export async function sendVerificationEmailForUser(user: any) {
  const env = getEnv() || {};
  if (!isDeliverableEmail(user?.email)) {
    return { ok: false, skipped: true, error: 'No deliverable email address' };
  }
  const { token } = await createAuthToken(user.id, 'email_verification', EMAIL_VERIFY_TTL_SECONDS, {
    email: user.email,
  });
  const verifyUrl = `${appBaseUrl()}/verify-email?token=${encodeURIComponent(token)}`;
  const tpl = emailSvc.emailVerificationEmail(env, user.name, verifyUrl, '24 hours');
  return emailSvc.sendEmail(env, {
    to: user.email,
    subject: tpl.subject,
    html: tpl.html,
    text: tpl.text,
    tags: [{ name: 'type', value: 'email-verification' }],
  });
}

export async function sendPasswordResetEmailForUser(user: any) {
  const env = getEnv() || {};
  if (!isDeliverableEmail(user?.email)) {
    return { ok: false, skipped: true, error: 'No deliverable email address' };
  }
  const { token } = await createAuthToken(user.id, 'password_reset', PASSWORD_RESET_TTL_SECONDS, {
    email: user.email,
  });
  const resetUrl = `${appBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`;
  const tpl = emailSvc.passwordResetEmail(env, user.name, resetUrl, '1 hour');
  return emailSvc.sendEmail(env, {
    to: user.email,
    subject: tpl.subject,
    html: tpl.html,
    text: tpl.text,
    tags: [{ name: 'type', value: 'password-reset' }],
  });
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export async function registerPatient(ctx: ExecutionContext, body: any, ip?: string) {
  const name = String(body?.name || '').trim();
  const password = String(body?.password || '');
  const email = isValidEmail(body?.email || '') ? String(body.email).trim().toLowerCase() : '';
  const phone = normalizeUgandanPhone(String(body?.phone || '').trim());

  if (!name || !password) {
    return { status: 400, json: { success: false, message: 'Name and password are required' } };
  }
  if (password.length < 6) {
    return { status: 400, json: { success: false, message: 'Password must be at least 6 characters' } };
  }
  if (body?.passwordConfirmation && body.passwordConfirmation !== password) {
    return { status: 400, json: { success: false, message: 'Passwords do not match' } };
  }
  if (!email && !phone) {
    return {
      status: 400,
      json: { success: false, message: 'Please provide an email address or a Ugandan phone number' },
    };
  }

  const db = DB();
  if (!db) return { status: 500, json: { success: false, message: 'Database unavailable' } };

  const duplicate = email
    ? await db.prepare('SELECT id FROM users WHERE email = ? AND deleted_at IS NULL').bind(email).first()
    : await db.prepare('SELECT id FROM users WHERE phone = ? AND deleted_at IS NULL').bind(phone).first();
  if (duplicate) {
    return {
      status: 409,
      json: {
        success: false,
        message: email ? 'An account already exists with this email' : 'An account already exists with this phone number',
      },
    };
  }

  const storeEmail = email || placeholderEmailForPhone(phone!);

  try {
    const { hash, salt } = await hashPassword(password);
    const id = genId();

    await db
      .prepare(
        `INSERT INTO users (id, name, email, phone, role, department, date_of_birth, sex, blood_group,
                            password_hash, password_salt, email_verified_at, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'Patient', 'General', ?, ?, ?, ?, ?, NULL, 'active', datetime('now'), datetime('now'))`,
      )
      .bind(
        id,
        name,
        storeEmail,
        phone,
        body?.dateOfBirth ? String(body.dateOfBirth).trim() : null,
        body?.sex ? String(body.sex).trim() : null,
        body?.bloodGroup ? String(body.bloodGroup).trim() : null,
        hash,
        salt,
      )
      .run();

    await audit(ctx, 'patient_registered', { id, email: storeEmail, role: 'Patient' }, id, 'user', {
      name,
      phone: phone || null,
    }, ip);

    const user = (await db
      .prepare(
        `SELECT id, name, email, phone, role, department, date_of_birth, sex, blood_group,
                email_verified_at, status, created_at, updated_at FROM users WHERE id = ?`,
      )
      .bind(id)
      .first()) as any;

    let emailDelivery: any = { ok: false, skipped: true };
    if (email) {
      emailDelivery = await sendVerificationEmailForUser(user);
      const env = getEnv() || {};
      const welcome = emailSvc.patientWelcomeEmail(env, name);
      await emailSvc.sendEmail(env, {
        to: email,
        subject: welcome.subject,
        html: welcome.html,
        text: welcome.text,
        tags: [{ name: 'type', value: 'patient-welcome' }],
      });
    }

    // Keep the legacy response shape: patients get an unsigned convenience token
    // until they verify; sign-in issues a full session token.
    const token = await signJwt(
      { sub: id, email: storeEmail, role: 'Patient', aud: APP_AUDIENCE },
      jwtSecretHex(),
    );

    return {
      status: 201,
      json: {
        success: true,
        data: { ...publicUserFromRow(user), token },
        message: email ? 'Account created. Please verify your email address.' : 'Account created successfully.',
        email_delivery: emailDelivery,
      },
    };
  } catch (err: any) {
    if (String(err?.message || '').includes('UNIQUE')) {
      return {
        status: 409,
        json: {
          success: false,
          message: email ? 'An account already exists with this email' : 'An account already exists with this phone number',
        },
      };
    }
    return { status: 500, json: { success: false, message: 'Registration failed.' } };
  }
}

// ---------------------------------------------------------------------------
// Login (patient portal only)
// ---------------------------------------------------------------------------

export async function login(ctx: ExecutionContext, body: any, ip?: string) {
  const identifier = String(body?.email || body?.phone || '').trim();
  const password = String(body?.password || '');
  if (!identifier || !password) {
    return { status: 400, json: { success: false, message: 'Email or phone and password are required' } };
  }

  const rl = rateLimit(`login:${ip || 'unknown'}:${identifier.toLowerCase()}`, 20, 15 * 60 * 1000);
  if (!rl.ok) {
    return { status: 429, json: { success: false, message: 'Too many login attempts. Please try again later.' } };
  }

  const row = await verifyCredentials(identifier, password);
  if (!row) {
    const existing = await findUserByContact(identifier);
    if (existing) {
      await recordFailedLogin(existing);
      await audit(ctx, 'user_login_failed', { id: existing.id, email: existing.email, role: existing.role }, existing.id, 'user', {
        reason: 'invalid_password',
        portal: 'patient',
        failed_attempts: Number(existing.failed_login_count || 0) + 1,
      }, ip);
    } else {
      await audit(ctx, 'user_login_failed', { email: identifier }, undefined, 'user', {
        reason: 'unknown_account',
        portal: 'patient',
      }, ip);
    }
    return { status: 401, json: { success: false, message: 'Invalid email or phone, or password' } };
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
  if (row.role !== 'Patient') {
    return {
      status: 401,
      json: {
        success: false,
        code: 'STAFF_USE_STAFF_LOGIN',
        message: 'This is a staff account. Please use the Staff Login page.',
      },
    };
  }
  if (row.status && row.status !== 'active') {
    return {
      status: 403,
      json: { success: false, message: 'Account is not active. Please verify your email or contact support.' },
    };
  }

  await clearFailedLogin(row.id);
  await audit(ctx, 'user_login', { id: row.id, email: row.email, role: row.role }, row.id, 'user', { role: row.role }, ip);

  const token = await issueSession({ id: row.id, email: row.email, role: row.role }, ip);
  const fresh = (await DB()
    .prepare(
      `SELECT id, name, email, phone, role, department, date_of_birth, sex, blood_group,
              email_verified_at, status, created_at, updated_at FROM users WHERE id = ?`,
    )
    .bind(row.id)
    .first()) as any;

  return {
    status: 200,
    json: {
      success: true,
      data: { ...publicUserFromRow(fresh || row), token },
      message: fresh?.email_verified_at
        ? 'Signed in successfully'
        : 'Signed in. Please verify your email address to fully secure your account.',
    },
  };
}

// ---------------------------------------------------------------------------
// Email verification
// ---------------------------------------------------------------------------

export async function verifyEmail(ctx: ExecutionContext, token: string, ip?: string) {
  if (!token) return { status: 400, json: { success: false, message: 'Verification token is required' } };

  const consumed = await consumeAuthToken('email_verification', token);
  if (!consumed.ok) {
    const message =
      consumed.reason === 'expired'
        ? 'Verification link has expired'
        : consumed.reason === 'used'
          ? 'Verification link has already been used'
          : 'Invalid verification link';
    return { status: 400, json: { success: false, message } };
  }

  const db = DB();
  const user = (await db
    .prepare('SELECT id, name, email, role, email_verified_at FROM users WHERE id = ? AND deleted_at IS NULL')
    .bind(consumed.row.user_id)
    .first()) as any;
  if (!user) return { status: 404, json: { success: false, message: 'Account not found' } };

  if (!user.email_verified_at) {
    await db
      .prepare(
        `UPDATE users SET email_verified_at = datetime('now'), status = 'active', updated_at = datetime('now') WHERE id = ?`,
      )
      .bind(user.id)
      .run();
  }
  await audit(ctx, 'email_verified', { id: user.id, email: user.email, role: user.role }, user.id, 'user', {}, ip);
  return { status: 200, json: { success: true, message: 'Email verified successfully. You can now sign in.' } };
}

export async function resendVerification(ctx: ExecutionContext, body: any, ip?: string) {
  const email = String(body?.email || '').trim().toLowerCase();
  if (!isValidEmail(email)) {
    return { status: 400, json: { success: false, message: 'A valid email address is required' } };
  }

  const rl = rateLimit(`resend-verification:${ip || 'unknown'}:${email}`, 5, 15 * 60 * 1000);
  if (!rl.ok) return { status: 429, json: { success: false, message: 'Too many requests. Please try again later.' } };

  const user = (await DB()
    .prepare('SELECT id, name, email, role, email_verified_at FROM users WHERE email = ? AND deleted_at IS NULL')
    .bind(email)
    .first()) as any;

  if (user && !user.email_verified_at) {
    const delivery = await sendVerificationEmailForUser(user);
    await audit(ctx, 'verification_email_resent', { id: user.id, email: user.email, role: user.role }, user.id, 'user', { ok: delivery.ok }, ip);
  }

  // Always the same response — never reveal whether the address is registered.
  return {
    status: 200,
    json: { success: true, message: 'If an account matches that email, a verification link has been sent.' },
  };
}

// ---------------------------------------------------------------------------
// Password recovery
// ---------------------------------------------------------------------------

export async function forgotPassword(ctx: ExecutionContext, body: any, ip?: string) {
  const email = String(body?.email || body?.identifier || '').trim().toLowerCase();
  const rl = rateLimit(`forgot-password:${ip || 'unknown'}:${email}`, 5, 15 * 60 * 1000);
  if (!rl.ok) return { status: 429, json: { success: false, message: 'Too many requests. Please try again later.' } };

  if (isValidEmail(email)) {
    const user = (await DB()
      .prepare('SELECT id, name, email, role FROM users WHERE email = ? AND deleted_at IS NULL')
      .bind(email)
      .first()) as any;
    if (user) {
      const delivery = await sendPasswordResetEmailForUser(user);
      await audit(ctx, 'password_reset_requested', { id: user.id, email: user.email, role: user.role }, user.id, 'user', { ok: delivery.ok }, ip);
    }
  }

  return {
    status: 200,
    json: { success: true, message: 'If an account matches that email, password reset instructions have been sent.' },
  };
}

export async function resetPassword(ctx: ExecutionContext, body: any, ip?: string) {
  const token = String(body?.token || '').trim();
  const password = String(body?.password || '');
  const confirm = body?.passwordConfirmation ?? body?.confirmPassword ?? password;

  if (!token || !password) {
    return { status: 400, json: { success: false, message: 'Reset token and new password are required' } };
  }
  if (password.length < 6) {
    return { status: 400, json: { success: false, message: 'Password must be at least 6 characters' } };
  }
  if (password !== confirm) {
    return { status: 400, json: { success: false, message: 'Passwords do not match' } };
  }

  const consumed = await consumeAuthToken('password_reset', token);
  if (!consumed.ok) {
    const message =
      consumed.reason === 'expired'
        ? 'Reset link has expired'
        : consumed.reason === 'used'
          ? 'Reset link has already been used'
          : 'Invalid reset link';
    return { status: 400, json: { success: false, message } };
  }

  const db = DB();
  const user = (await db
    .prepare('SELECT id, email, role, status FROM users WHERE id = ? AND deleted_at IS NULL')
    .bind(consumed.row.user_id)
    .first()) as any;
  if (!user) return { status: 404, json: { success: false, message: 'Account not found' } };

  // An approved staff application creates the account as pending_activation and
  // sends this one-time link. Completing it must also activate the account,
  // otherwise the new member sets a password and is still refused at sign-in.
  const activating = user.status === 'pending_activation';

  const { hash, salt } = await hashPassword(password);
  if (activating) {
    await db
      .prepare(
        `UPDATE users SET password_hash = ?, password_salt = ?, status = 'active',
                         activated_at = COALESCE(activated_at, datetime('now')),
                         email_verified_at = COALESCE(email_verified_at, datetime('now')),
                         failed_login_count = 0, locked_until = NULL,
                         password_changed_at = datetime('now'),
                         updated_at = datetime('now') WHERE id = ?`,
      )
      .bind(hash, salt, user.id)
      .run();
  } else {
    await db
      .prepare(
        `UPDATE users SET password_hash = ?, password_salt = ?, failed_login_count = 0,
                         locked_until = NULL, password_changed_at = datetime('now'),
                         updated_at = datetime('now') WHERE id = ?`,
      )
      .bind(hash, salt, user.id)
      .run();
  }

  // A password change invalidates all existing sessions.
  await bumpTokenVersion(user.id);
  await revokeAllSessions(user.id);

  await audit(
    ctx,
    activating ? 'staff_account_activated' : 'password_reset_completed',
    { id: user.id, email: user.email, role: user.role },
    user.id,
    'user',
    activating ? { activation: 'password_link_completed' } : {},
    ip,
  );
  return {
    status: 200,
    json: {
      success: true,
      message: activating
        ? 'Account activated successfully. You can now sign in.'
        : 'Password reset successfully. You can now sign in.',
    },
  };
}
