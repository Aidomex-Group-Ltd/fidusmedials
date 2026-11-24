// src/cf/auth.ts
// D1-backed auth for fidus-staging Worker.
// Uses Web Crypto for password hashing + HS256 JWT signing. No Node bcrypt/jwt.

// The Worker's env (including the DB binding) is stashed on globalThis by the
// fetch handler at request time. Read it from there so the auth module does not
// depend on the caller passing env separately.
export const getEnv = (): any => (globalThis as any).__FIDUS_ENV__;

const DB = (): any => {
  const env = getEnv();
  return env?.DB;
};

function jwtSecretHex(): string {
  // The fetch handler stashes secrets on globalThis.__FIDUS_SECRETS at request time.
  const s = (globalThis as any).__FIDUS_SECRETS;
  if (s?.jwt_secret_hex) return s.jwt_secret_hex;
  // Fallback: read directly from env (in case the fetch handler path differs).
  const env = getEnv();
  return (env?.JWT_SECRET ?? '') as string;
}

function sessionSecretHex(): string {
  const s = (globalThis as any).__FIDUS_SECRETS;
  if (s?.session_secret_hex) return s.session_secret_hex;
  const env = getEnv();
  return (env?.SESSION_SECRET ?? '') as string;
}

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function hexFromBytes(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function bytesFromHex(h: string): Uint8Array {
  const bytes = new Uint8Array(h.length / 2);
  for (let i = 0; i < h.length; i += 2) bytes[i / 2] = parseInt(h.substring(i, i + 2), 16);
  return bytes;
}

async function pbkdf2(password: string, salt: Uint8Array, iterations = 100000, keyLength = 32): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'pbkdf2',
    false,
    ['deriveKey']
  );
  // Derive AES-256 key (32 bytes) via PBKDF2, then export raw bytes.
  // deriveBits isn't reliably supported across Workers runtimes, so deriveKey+export.
  const aesKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-CBC', length: 256 },
    true,
    ['encrypt']
  );
  const raw = await crypto.subtle.exportKey('raw', aesKey);
  return new Uint8Array(raw);
}

export async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const derived = await pbkdf2(password, salt, 100000, 32);
  return { hash: hexFromBytes(derived), salt: hexFromBytes(salt) };
}

export async function verifyPassword(password: string, storedHash: string, storedSalt: string): Promise<boolean> {
  const salt = bytesFromHex(storedSalt);
  const derived = await pbkdf2(password, salt, 100000, 32);
  const expected = bytesFromHex(storedHash);
  const actual = derived;
  if (expected.length !== actual.length) return false;
  return crypto.subtle.timingSafeEqual(expected, actual);
}

function hmacSha256(key: CryptoKey, data: string): ArrayBuffer {
  return crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
}

export interface JwtPayload {
  sub: string; // user id
  email: string;
  role: string;
  aud: string;
  iat: number;
  exp: number;
}

export async function signJwt(payload: JwtPayload, secretHex: string, seconds = 2592000): Promise<string> {
  // HS256: header.payload.signature with base64url
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const full = { ...payload, iat: now, exp: now + seconds };
  const encoder = new TextEncoder();
  const h = base64url(new Uint8Array(encoder.encode(JSON.stringify(header))));
  const p = base64url(new Uint8Array(encoder.encode(JSON.stringify(full))));
  const signingInput = `${h}.${p}`;
  const key = await crypto.subtle.importKey('raw', bytesFromHex(secretHex), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await hmacSha256(key, signingInput);
  return `${signingInput}.${base64url(new Uint8Array(sig))}`;
}

export interface DecodedJwt {
  sub: string;
  email: string;
  role: string;
  aud: string;
  iat: number;
  exp: number;
}

export async function verifyJwt(token: string, secretHex: string): Promise<DecodedJwt | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, sigB64] = parts;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', bytesFromHex(secretHex), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const signingInput = `${h}.${p}`;
  try {
    const sig = Uint8Array.from(atob(sigB64.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
    if (!await crypto.subtle.verify('HMAC', key, sig, new TextEncoder().encode(signingInput))) return null;
  } catch {
    return null;
  }
  let payload: any;
  try {
    payload = JSON.parse(atob(p.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
  if (!payload || typeof payload.sub !== 'string') return null;
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload as DecodedJwt;
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

const nowISO = () => new Date().toISOString();

function genId(): string {
  const buf = crypto.getRandomValues(new Uint8Array(16));
  return 'fidus_' + hexFromBytes(buf);
}

async function audit(
  _ctx: ExecutionContext,
  event: string,
  actor: { id?: string; email?: string; role?: string } | null,
  targetId?: string,
  targetType?: string,
  details?: any,
  ip?: string
) {
  const db = DB();
  if (!db) return;
  try {
    await db.prepare(
      `INSERT INTO audit_log (id, event, actor_id, actor_email, actor_role, target_id, target_type, details, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(        genId(),
      event,
      actor?.id ?? null,
      actor?.email ?? null,
      actor?.role ?? null,
      targetId ?? null,
      targetType ?? null,
      details ? JSON.stringify(details) : null,
      ip ?? null,
    ).run();
  } catch {}
}

export interface UserRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  department: string | null;
  password_hash: string;
  password_salt: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export function toPublicUser(row: UserRow, extra?: any): any {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    department: row.department,
    created_at: row.created_at,
    ...(extra ?? {}),
  };
}

// ---------------------------------------------------------------------------
// Patient/public registration
// ---------------------------------------------------------------------------

/**
 * Validate a Ugandan phone number. Accepts formats like:
 *   +256700000000
 *   256700000000
 *   0700000000
 *   +256 70 000 0000
 * Normalized form: +256700000000 (13 chars including +).
 */
function normalizeUgandanPhone(raw: string): string | null {
  if (!raw) return null;
  let digits = String(raw).replace(/\D/g, '');
  if (digits.startsWith('0')) {
    // Local format: 0700000000 -> +256700000000
    digits = '256' + digits.slice(1);
  }
  if (!digits.startsWith('256')) return null;
  const sub = digits.slice(3);
  if (sub.length !== 9) return null;
  return '+' + digits;
}

/**
 * Check whether an identifier looks like a phone number (with or without +).
 * Used to route login/recovery lookups to the phone column.
 */
function looksLikePhone(v: string): boolean {
  const digits = v.replace(/\D/g, '');
  if (digits.startsWith('0') && digits.length === 10) return true;
  if (digits.startsWith('256') && digits.length === 12) return true;
  if (v.startsWith('+') && v.length === 13) return true;
  return false;
}

function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

/**
 * For phone-only patients, the users.email column is NOT NULL UNIQUE, so we
 * store a generated placeholder that can never collide with a real email.
 */
function placeholderEmailForPhone(phone: string): string {
  const id = crypto.getRandomValues(new Uint8Array(8));
  const hex = Array.from(id).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `phone-${phone.replace(/[^0-9+]/g, '')}-${hex}@noreply.fidus.staging`;
}

export async function registerPatient(ctx: ExecutionContext, body: any, ip?: string) {
  const name = (body.name || '').trim();
  const password = (body.password || '');
  const rawEmail = (body.email || '').trim();
  const rawPhone = (body.phone || '').trim();

  if (!name || !password) {
    return { status: 400, json: { success: false, message: 'Name and password are required' } };
  }
  if (password.length < 6) {
    return { status: 400, json: { success: false, message: 'Password must be at least 6 characters' } };
  }
  if (body.passwordConfirmation && body.passwordConfirmation !== password) {
    return { status: 400, json: { success: false, message: 'Passwords do not match' } };
  }

  // Patients must have at least one verified contact method: email OR phone.
  const email = isValidEmail(rawEmail) ? rawEmail.toLowerCase() : '';
  const phone = normalizeUgandanPhone(rawPhone);
  if (!email && !phone) {
    return { status: 400, json: { success: false, message: 'Please provide an email address or a Ugandan phone number' } };
  }

  // Optional patient fields.
  const dateOfBirth = body.dateOfBirth ? String(body.dateOfBirth).trim() : null;
  const sex = body.sex ? String(body.sex).trim() : null;
  const bloodGroup = body.bloodGroup ? String(body.bloodGroup).trim() : null;

  const db = DB();
  if (!db) return { status: 500, json: { success: false, message: 'Database unavailable' } };

  // Duplicate check: by email if provided, otherwise by phone.
  if (email) {
    const existing = await db.prepare('SELECT id FROM users WHERE email = ? AND deleted_at IS NULL').bind(email).first();
    if (existing) {
      return { status: 409, json: { success: false, message: 'An account already exists with this email' } };
    }
  } else {
    // Phone-only registration: check for an existing patient with this phone.
    const existing = await db.prepare('SELECT id FROM users WHERE phone = ? AND deleted_at IS NULL').bind(phone).first();
    if (existing) {
      return { status: 409, json: { success: false, message: 'An account already exists with this phone number' } };
    }
  }

  // For phone-only patients, the email column is NOT NULL UNIQUE, so we store
  // a generated placeholder email that can never collide with a real address.
  const storeEmail = email || placeholderEmailForPhone(phone);

  try {
    const { hash, salt } = await hashPassword(password);
    const id = genId();

    await db.prepare(
      `INSERT INTO users (id, name, email, phone, role, department, password_hash, password_salt, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'Patient', 'General', ?, ?, datetime('now'), datetime('now'))`
    ).bind(id, name, storeEmail, phone || null, hash, salt).run();

    await audit(ctx, 'patient_registered', { id, email: storeEmail, role: 'Patient' }, id, 'user', { name, phone: phone || null }, ip);

    const token = await signJwt({ sub: id, email: storeEmail, role: 'Patient', aud: 'fidus-staging' }, jwtSecretHex());
    const user = await db.prepare('SELECT id, name, email, phone, role, department, created_at, updated_at FROM users WHERE id = ?').bind(id).first() as any;
    return {
      status: 201,
      json: {
        success: true,
        data: { ...toPublicUser(user), token, date_of_birth: dateOfBirth, sex, blood_group: bloodGroup },
        message: 'Account created successfully',
      },
    };
  } catch (err: any) {
    if (err?.message?.includes && err.message.includes('UNIQUE')) {
      if (email) {
        return { status: 409, json: { success: false, message: 'An account already exists with this email' } };
      }
      return { status: 409, json: { success: false, message: 'An account already exists with this phone number' } };
    }
    return { status: 500, json: { success: false, message: 'Registration failed: ' + (err?.message ?? String(err)) } };
  }
}

// ---------------------------------------------------------------------------
// Credential verification (shared by patient + staff login)
// ---------------------------------------------------------------------------
async function verifyCredentials(identifier: string, password: string): Promise<UserRow | null> {
  const db = DB();
  if (!db) return null;

  // Support login via email or Ugandan phone number.
  if (looksLikePhone(identifier)) {
    const phone = normalizeUgandanPhone(identifier);
    if (!phone) return null;
    const row = (await db.prepare(
      `SELECT id, name, email, phone, role, department, password_hash, password_salt, created_at, updated_at, deleted_at
       FROM users WHERE phone = ?`
    ).bind(phone).first()) as UserRow | undefined;
    if (!row || row.deleted_at) return null;
    if (!(await verifyPassword(password, row.password_hash, row.password_salt))) return null;
    return row;
  }

  const row = (await db.prepare(
    `SELECT id, name, email, phone, role, department, password_hash, password_salt, created_at, updated_at, deleted_at
     FROM users WHERE email = ?`
  ).bind(identifier.toLowerCase()).first()) as UserRow | undefined;
  if (!row || row.deleted_at) return null;
  if (!(await verifyPassword(password, row.password_hash, row.password_salt))) return null;
  return row;
}

// ---------------------------------------------------------------------------
// Login (patient portal — only patient accounts)
// ---------------------------------------------------------------------------
export async function login(ctx: ExecutionContext, body: any, ip?: string) {
  // Patient portal login accepts an email or a Ugandan phone number as the
  // identifier. The backend matches it against the email or phone column.
  const identifier = (body.email || body.phone || '').trim();
  const password = body.password || '';
  if (!identifier || !password) {
    return { status: 400, json: { success: false, message: 'Email or phone and password are required' } };
  }
  const row = await verifyCredentials(identifier, password);
  if (!row) {
    return { status: 401, json: { success: false, message: 'Invalid email or phone, or password' } };
  }

  // Patient portal login: only patient accounts may sign in here.
  // Staff accounts are redirected to the staff portal.
  if (row.role !== 'Patient') {
    return { status: 401, json: { success: false, message: 'Please use Staff Login to access staff systems' } };
  }

  const actor = { id: row.id, email: row.email, role: row.role };
  await audit(ctx, 'user_login', actor, row.id, 'user', { role: row.role }, ip);

  const token = await signJwt({ sub: row.id, email: row.email, role: row.role, aud: 'fidus-staging' }, jwtSecretHex());
  return {
    status: 200,
    json: {
      success: true,
      data: {
        ...toPublicUser(row),
        token,
      },
      message: 'Signed in successfully',
    },
  };
}

// ---------------------------------------------------------------------------
// Me
// ---------------------------------------------------------------------------

export async function getMe(ctx: ExecutionContext, token: string | null, ip?: string) {
  if (!token) return { status: 401, json: { success: false, message: 'Not authenticated' } };
  const decoded = await verifyJwt(token, jwtSecretHex());
  if (!decoded) return { status: 401, json: { success: false, message: 'Session expired or invalid' } };
  const db = DB();
  if (!db) return { status: 500, json: { success: false, message: 'Database unavailable' } };
  const row = (await db.prepare(
    `SELECT id, name, email, phone, role, department, created_at, updated_at, deleted_at FROM users WHERE id = ?`
  ).bind(decoded.sub).first()) as UserRow | undefined;
  if (!row || row.deleted_at) {
    return { status: 401, json: { success: false, message: 'User not found or deactivated' } };
  }
  return {
    status: 200,
    json: { success: true, data: toPublicUser(row) },
  };
}

// ---------------------------------------------------------------------------
// Logout (no-op server side; client clears token)
// ---------------------------------------------------------------------------

export async function logout(ctx: ExecutionContext, actor?: any, ip?: string) {
  if (actor) await audit(ctx, 'user_logout', actor, undefined, 'user', undefined, ip);
  return { status: 200, json: { success: true, message: 'Signed out' } };
}

// ---------------------------------------------------------------------------
// Staff: roles allowed to be invited/approved
// ---------------------------------------------------------------------------

const STAFF_ROLES = new Set([
  'Administrator',
  'Receptionist',
  'Doctor',
  'Nurse',
  'Midwife',
  'Clinician',
  'Laboratory Staff',
  'Pharmacy Staff',
  'Radiology Staff',
  'Admin & Finance',
]);

const STAFF_DEPARTMENTS = new Set([
  'Administration',
  'Reception',
  'Medical Consultation',
  'Nursing',
  'Maternity',
  'Laboratory',
  'Pharmacy',
  'Radiology and Ultrasound',
  'Theatre and Surgery',
  'Inpatient Wards',
  'Dental',
  'Pediatrics',
  'Obstetrics and Gynecology',
  'Family Planning',
  'Finance and Accounts',
  'Billing and Cashier',
  'Human Resources',
  'Procurement and Stores',
  'Records Management',
  'Rehabilitation',
  'Mental Health',
  'Home Healthcare',
  'Telemedicine',
  'IT and Systems Administration',
  'Quality Assurance',
  'Cardiology',
  'Neurology',
  'Dermatology',
  'ENT',
  'Ophthalmology',
  'Orthopedics',
  'Gastroenterology',
  'Pulmonology',
  'Endocrinology',
  'Nephrology',
  'Oncology',
  'Emergency',
  'ICU',
]);

export function isValidStaffRole(role: string): boolean {
  return STAFF_ROLES.has(role);
}

export function isValidDepartment(dept: string): boolean {
  return STAFF_DEPARTMENTS.has(dept);
}

// ---------------------------------------------------------------------------
// Admin: create staff invitation
// ---------------------------------------------------------------------------

export async function createStaffInvitation(ctx: ExecutionContext, body: any, actor: any, ip?: string) {
  if (!actor || actor.role !== 'Administrator') {
    return { status: 403, json: { success: false, message: 'Only administrators can invite staff' } };
  }
  const email = (body.email || '').trim().toLowerCase();
  const role = (body.role || '').trim();
  const department = (body.department || '').trim();
  const name = (body.name || '').trim();
  const phone = (body.phone || '').trim();
  if (!email || !role || !department) {
    return { status: 400, json: { success: false, message: 'Email, role and department are required' } };
  }
  if (!isValidStaffRole(role)) {
    return { status: 400, json: { success: false, message: 'Invalid staff role' } };
  }
  if (!isValidDepartment(department)) {
    return { status: 400, json: { success: false, message: 'Invalid department' } };
  }

  const db = DB();
  if (!db) return { status: 500, json: { success: false, message: 'Database unavailable' } };

  const existingUser = await db.prepare('SELECT id FROM users WHERE email = ? AND deleted_at IS NULL').bind(email).first();
  if (existingUser) {
    return { status: 409, json: { success: false, message: 'A staff account already exists with this email' } };
  }

  const existingInvite = await db.prepare('SELECT id FROM staff_invitations WHERE email = ? AND used_at IS NULL').bind(email).first();
  if (existingInvite) {
    return { status: 409, json: { success: false, message: 'An invitation already exists for this email' } };
  }

  try {
    const id = genId();
    const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
    const token = base64url(tokenBytes);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

    await db.prepare(
      `INSERT INTO staff_invitations (id, email, invited_by, role, department, name, phone, token, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).bind(id, email, actor.sub, role, department, name || null, phone || null, token, expiresAt).run();

    await audit(ctx, 'staff_invitation_created', actor, id, 'staff_invitation', { email, role, department }, ip);

    return {
      status: 201,
      json: {
        success: true,
        data: { id, email, role, department, name, phone, token, expires_at: expiresAt },
        message: 'Staff invitation created',
      },
    };
  } catch (err: any) {
    return { status: 500, json: { success: false, message: 'Failed to create invitation' } };
  }
}

// ---------------------------------------------------------------------------
// Staff: apply (pending approval)
// ---------------------------------------------------------------------------

export async function applyStaff(ctx: ExecutionContext, body: any, ip?: string) {
  const email = (body.email || '').trim().toLowerCase();
  const name = (body.name || '').trim();
  const role = (body.role || '').trim();
  const department = (body.department || '').trim();
  const phone = (body.phone || '').trim();
  const professional_designation = (body.professional_designation || '').trim();
  const professional_reg = (body.professional_reg || '').trim();
  if (!email || !name || !role || !department) {
    return { status: 400, json: { success: false, message: 'Name, email, role and department are required' } };
  }
  if (!isValidStaffRole(role)) {
    return { status: 400, json: { success: false, message: 'Invalid staff role' } };
  }
  if (!isValidDepartment(department)) {
    return { status: 400, json: { success: false, message: 'Invalid department' } };
  }

  const db = DB();
  if (!db) return { status: 500, json: { success: false, message: 'Database unavailable' } };

  const existingUser = await db.prepare('SELECT id FROM users WHERE email = ? AND deleted_at IS NULL').bind(email).first();
  if (existingUser) {
    return { status: 409, json: { success: false, message: 'A staff account already exists with this email' } };
  }

  const existingApp = await db.prepare('SELECT id FROM staff_applications WHERE email = ? AND status = ?').bind(email, 'pending').first();
  if (existingApp) {
    return { status: 409, json: { success: false, message: 'A pending application already exists for this email' } };
  }

  const id = genId();
  await db.prepare(
    `INSERT INTO staff_applications (id, name, email, phone, role, department, professional_designation, professional_reg, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'))`
  ).bind(id, name, email, phone || null, role, department, professional_designation || null, professional_reg || null).run();

  await audit(ctx, 'staff_application_submitted', { email, role }, id, 'staff_application', { name, department }, ip);

  return {
    status: 201,
    json: { success: true, data: { id, email, role, department, status: 'pending' }, message: 'Application submitted. Pending administrator approval.' },
  };
}

// ---------------------------------------------------------------------------
// Admin: list / review applications
// ---------------------------------------------------------------------------

export async function listStaffApplications(ctx: ExecutionContext, actor: any, ip?: string) {
  if (!actor || actor.role !== 'Administrator') {
    return { status: 403, json: { success: false, message: 'Only administrators can review applications' } };
  }
  const db = DB();
  if (!db) return { status: 500, json: { success: false, message: 'Database unavailable' } };
  try {
    const rows = await db.prepare(
      `SELECT id, name, email, phone, role, department, professional_designation, professional_reg, status, created_at
       FROM staff_applications ORDER BY created_at DESC`
    ).all();
    return {
      status: 200,
      json: { success: true, data: rows.results.map((r: any) => ({ ...r, professional_designation: r.professional_designation, professional_reg: r.professional_reg })) },
    };
  } catch {
    return { status: 500, json: { success: false, message: 'Failed to list applications' } };
  }
}

export async function approveStaffApplication(ctx: ExecutionContext, body: any, actor: any, ip?: string) {
  if (!actor || actor.role !== 'Administrator') {
    return { status: 403, json: { success: false, message: 'Only administrators can approve applications' } };
  }
  const appId = body.id;
  if (!appId) return { status: 400, json: { success: false, message: 'Application id is required' } };
  const db = DB();
  if (!db) return { status: 500, json: { success: false, message: 'Database unavailable' } };

  try {
    const app = (await db.prepare(
      `SELECT id, name, email, phone, role, department, professional_designation, professional_reg, status FROM staff_applications WHERE id = ?`
    ).bind(appId).first()) as any;
    if (!app) return { status: 404, json: { success: false, message: 'Application not found' } };
    if (app.status !== 'pending') return { status: 409, json: { success: false, message: 'Application already reviewed' } };

    // Create the staff user
    const password = base64url(crypto.getRandomValues(new Uint8Array(16)));
    const { hash, salt } = await hashPassword(password);
    const userId = genId();
    await db.prepare(
      `INSERT INTO users (id, name, email, phone, role, department, password_hash, password_salt, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    ).bind(userId, app.name, app.email, app.phone || null, app.role, app.department, hash, salt).run();

    await db.prepare(`UPDATE staff_applications SET status = 'approved', reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?`).bind(actor.sub, appId).run();

    await audit(ctx, 'staff_application_approved', actor, userId, 'user', { application_id: appId, role: app.role, department: app.department }, ip);

    return {
      status: 201,
      json: {
        success: true,
        data: { id: userId, email: app.email, role: app.role, department: app.department, temporary_password: password },
        message: 'Staff account created and approved',
      },
    };
  } catch (err: any) {
    return { status: 500, json: { success: false, message: 'Failed to approve application' } };
  }
}

export async function rejectStaffApplication(ctx: ExecutionContext, body: any, actor: any, ip?: string) {
  if (!actor || actor.role !== 'Administrator') {
    return { status: 403, json: { success: false, message: 'Only administrators can reject applications' } };
  }
  const appId = body.id;
  if (!appId) return { status: 400, json: { success: false, message: 'Application id is required' } };
  const db = DB();
  if (!db) return { status: 500, json: { success: false, message: 'Database unavailable' } };
  try {
    const app = (await db.prepare(`SELECT id, status FROM staff_applications WHERE id = ?`).bind(appId).first()) as any;
    if (!app) return { status: 404, json: { success: false, message: 'Application not found' } };
    if (app.status !== 'pending') return { status: 409, json: { success: false, message: 'Application already reviewed' } };
    await db.prepare(`UPDATE staff_applications SET status = 'rejected', reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?`).bind(actor.sub, appId).run();
    await audit(ctx, 'staff_application_rejected', actor, appId, 'staff_application', {}, ip);
    return { status: 200, json: { success: true, message: 'Application rejected' } };
  } catch (err: any) {
    return { status: 500, json: { success: false, message: 'Failed to reject application' } };
  }
}

// ---------------------------------------------------------------------------
// Staff: accept invitation (register with token)
// ---------------------------------------------------------------------------

export async function acceptInvitation(ctx: ExecutionContext, body: any, ip?: string) {
  const token = (body.invitation_token || '').trim();
  const password = (body.password || '');
  const name = (body.name || '').trim();
  if (!token || !password || !name) {
    return { status: 400, json: { success: false, message: 'Invitation token, name and password are required' } };
  }
  if (password.length < 6) {
    return { status: 400, json: { success: false, message: 'Password must be at least 6 characters' } };
  }

  const db = DB();
  if (!db) return { status: 500, json: { success: false, message: 'Database unavailable' } };

  try {
    const invite = (await db.prepare(
      `SELECT id, email, role, department, name, phone, token, expires_at, used_at, invited_by
       FROM staff_invitations WHERE token = ?`
    ).bind(token).first()) as any;
  if (!invite) return { status: 404, json: { success: false, message: 'Invitation not found' } };
  if (invite.used_at) return { status: 409, json: { success: false, message: 'This invitation has already been used' } };
  if (new Date(invite.expires_at) < new Date()) return { status: 409, json: { success: false, message: 'This invitation has expired' } };

  // Use invited name/email if registrant didn't submit them
  const finalName = name || (invite.name || '').trim();
  const finalEmail = emailLower(body.email) || invite.email;
  const finalPhone = (body.phone || '').trim() || (invite.phone || '').trim() || null;

  const existingUser = await db.prepare('SELECT id FROM users WHERE email = ? AND deleted_at IS NULL').bind(finalEmail).first();
  if (existingUser) {
    return { status: 409, json: { success: false, message: 'A staff account already exists with this email' } };
  }

    const { hash, salt } = await hashPassword(password);
    const userId = genId();
    await db.prepare(
      `INSERT INTO users (id, name, email, phone, role, department, password_hash, password_salt, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    ).bind(userId, finalName, finalEmail, finalPhone, invite.role, invite.department, hash, salt).run();

    await db.prepare(`UPDATE staff_invitations SET used_at = datetime('now') WHERE id = ?`).bind(invite.id).run();

    const actor = { id: userId, email: finalEmail, role: invite.role };
    await audit(ctx, 'staff_invitation_accepted', actor, userId, 'user', { role: invite.role, department: invite.department }, ip);

    const jwtSecret = jwtSecretHex();
    const tokenJwt = await signJwt({ sub: userId, email: finalEmail, role: invite.role, aud: 'fidus-staging' }, jwtSecret);

    return {
      status: 201,
      json: {
        success: true,
        data: { ...toPublicUser({ id: userId, name: finalName, email: finalEmail, phone: finalPhone, role: invite.role, department: invite.department, password_hash: '', password_salt: '', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), deleted_at: null }), token: tokenJwt },
        message: 'Staff account created. You can now sign in.',
      },
    };
  } catch (err: any) {
    return { status: 500, json: { success: false, message: 'Failed to accept invitation' } };
  }
}

function emailLower(v: any): string | null {
  if (!v) return null;
  const s = String(v).trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : null;
}// ---------------------------------------------------------------------------
// Staff login (only staff accounts)
// ---------------------------------------------------------------------------
export async function staffLogin(ctx: ExecutionContext, body: any, ip?: string) {
  // Staff login accepts an email as the identifier (staff accounts always have
  // an email). Phone-based lookup is available for patients; staff use email.
  const identifier = (body.email || '').trim().toLowerCase();
  const password = body.password || '';
  if (!identifier || !password) {
    return { status: 400, json: { success: false, message: 'Email and password are required' } };
  }
  const row = await verifyCredentials(identifier, password);
  if (!row) {
    return { status: 401, json: { success: false, message: 'Invalid email or password' } };
  }

  // Staff login: only staff accounts may sign in here.
  // Patient accounts are redirected to the patient portal.
  if (row.role === 'Patient') {
    return { status: 401, json: { success: false, message: 'Please use Patient Login to access the patient portal' } };
  }

  const actor = { id: row.id, email: row.email, role: row.role };
  await audit(ctx, 'user_login', actor, row.id, 'user', { role: row.role }, ip);

  const token = await signJwt({ sub: row.id, email: row.email, role: row.role, aud: 'fidus-staging' }, jwtSecretHex());
  return {
    status: 200,
    json: {
      success: true,
      data: {
        ...toPublicUser(row),
        token,
      },
      message: 'Signed in successfully',
    },
  };
}

// ---------------------------------------------------------------------------
// Admin: list users
// ---------------------------------------------------------------------------

export async function listUsers(ctx: ExecutionContext, actor: any, ip?: string) {
  if (!actor || actor.role !== 'Administrator') {
    return { status: 403, json: { success: false, message: 'Only administrators can list users' } };
  }
  const db = DB();
  if (!db) return { status: 500, json: { success: false, message: 'Database unavailable' } };
  try {
    const rows = await db.prepare(
      `SELECT id, name, email, phone, role, department, created_at, updated_at FROM users WHERE deleted_at IS NULL ORDER BY created_at DESC`
    ).all();
    return {
      status: 200,
      json: { success: true, data: rows.results.map(toPublicUser) },
    };
  } catch {
    return { status: 500, json: { success: false, message: 'Failed to list users' } };
  }
}

export interface RequireAuthResult {
  ok: boolean;
  status: number;
  json: any;
  user?: DecodedJwt;
}

export async function requireAuth(ctx: ExecutionContext, token: string | null, ip?: string): Promise<RequireAuthResult> {
  if (!token) return { ok: false, status: 401, json: { success: false, message: 'Not authenticated' } };
  const decoded = await verifyJwt(token, jwtSecretHex());
  if (!decoded) return { ok: false, status: 401, json: { success: false, message: 'Session expired or invalid' } };
  const db = DB();
  if (!db) return { ok: false, status: 500, json: { success: false, message: 'Database unavailable' } };
  const row = (await db.prepare(
    `SELECT id, name, email, phone, role, department, deleted_at FROM users WHERE id = ?`
  ).bind(decoded.sub).first()) as any;
  if (!row || row.deleted_at) return { ok: false, status: 401, json: { success: false, message: 'User not found or deactivated' } };
  return { ok: true, status: 200, json: null, user: { ...decoded, role: row.role, email: row.email } };
}

export async function requireRole(ctx: ExecutionContext, token: string | null, roles: string[], ip?: string): Promise<RequireAuthResult> {
  const a = await requireAuth(ctx, token, ip);
  if (!a.ok) return a;
  if (!roles.includes(a.user.role)) {
    return { ok: false, status: 403, json: { success: false, message: `Role '${a.user.role}' is not authorized for this action` } };
  }
  return a;
}
