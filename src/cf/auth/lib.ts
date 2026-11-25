// src/cf/auth/lib.ts
// Shared auth primitives: env/DB access, crypto, JWT, password hashing, single-use
// tokens, sessions, rate limiting, audit writers, and user serialization.
// Nothing in here knows about patients, staff, or administrators — callers build
// policy on top of these primitives.

import * as emailSvc from '../email';

// ---------------------------------------------------------------------------
// Env + DB
// ---------------------------------------------------------------------------

export const getEnv = (): any => (globalThis as any).__FIDUS_ENV__;
export const getSecrets = (): any => (globalThis as any).__FIDUS_SECRETS;

export const DB = (): any => {
  const env = getEnv();
  return env?.DB;
};

export const appBaseUrl = (): string => {
  const env = getEnv() || {};
  return String(env.FRONTEND_URL || env.APP_URL || 'https://fidusmedicals.space').replace(/\/+$/, '');
};

export const supportEmail = (): string => getEnv()?.SUPPORT_EMAIL || 'consult@fidusmedicals.space';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const APP_AUDIENCE = 'fidus-staging';
export const EMAIL_VERIFY_TTL_SECONDS = 24 * 60 * 60;
export const PASSWORD_RESET_TTL_SECONDS = 60 * 60;
export const SESSION_TTL_DAYS = 30;
export const LOGIN_MAX_FAILURES = 8;
export const LOGIN_LOCK_MINUTES = 15;

// ---------------------------------------------------------------------------
// Crypto primitives (Web Crypto — no Node dependencies)
// ---------------------------------------------------------------------------

export async function sha256Hex(input: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return hexFromBytes(new Uint8Array(bytes));
}

export function randomToken(bytes = 32): string {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export function genId(): string {
  const buf = crypto.getRandomValues(new Uint8Array(16));
  return 'fidus_' + hexFromBytes(buf);
}

export function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function hexFromBytes(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function bytesFromHex(h: string): Uint8Array {
  const clean = String(h || '').replace(/[^0-9a-fA-F]/g, '');
  const bytes = new Uint8Array(Math.floor(clean.length / 2));
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(clean.substr(i * 2, 2), 16);
  return bytes;
}

/**
 * Constant-time string comparison. Prevents an attacker learning how much of a
 * secret they guessed from response timing.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const av = new TextEncoder().encode(String(a));
  const bv = new TextEncoder().encode(String(b));
  if (av.length !== bv.length) return false;
  let diff = 0;
  for (let i = 0; i < av.length; i++) diff |= av[i] ^ bv[i];
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Password hashing (PBKDF2-SHA256, 100k iterations)
// ---------------------------------------------------------------------------

const PBKDF2_ITERATIONS = 100000;
const PBKDF2_KEY_BYTES = 32; // 256-bit derived key

async function pbkdf2(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'pbkdf2',
    false,
    ['deriveKey'],
  );
  // deriveBits is not reliably available across Workers runtimes, so derive a
  // 256-bit AES key and export its raw bytes.
  const aesKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-CBC', length: PBKDF2_KEY_BYTES * 8 },
    true,
    ['encrypt'],
  );
  const raw = await crypto.subtle.exportKey('raw', aesKey);
  return new Uint8Array(raw);
}

export async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const derived = await pbkdf2(password, salt);
  return { hash: hexFromBytes(derived), salt: hexFromBytes(salt) };
}

export async function verifyPassword(
  password: string,
  storedHash: string,
  storedSalt: string,
): Promise<boolean> {
  try {
    const derived = await pbkdf2(password, bytesFromHex(storedSalt));
    return timingSafeEqual(hexFromBytes(derived), storedHash);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// JWT (HS256)
// ---------------------------------------------------------------------------

export interface JwtPayload {
  sub: string;   // user id
  email: string;
  role: string;
  aud: string;
  tv?: number;   // token version — bumping it invalidates every issued token
  sid?: string;  // session id
  iat: number;
  exp: number;
}

export type DecodedJwt = JwtPayload;

export async function signJwt(
  payload: Omit<JwtPayload, 'iat' | 'exp'> & { iat?: number; exp?: number },
  secretHex: string,
  seconds = SESSION_TTL_DAYS * 24 * 60 * 60,
): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const full = { ...payload, iat: now, exp: now + seconds };
  const encoder = new TextEncoder();
  const h = base64url(new Uint8Array(encoder.encode(JSON.stringify(header))));
  const p = base64url(new Uint8Array(encoder.encode(JSON.stringify(full))));
  const signingInput = `${h}.${p}`;
  const key = await crypto.subtle.importKey(
    'raw',
    bytesFromHex(secretHex),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(signingInput));
  return `${signingInput}.${base64url(new Uint8Array(sig))}`;
}

export async function verifyJwt(token: string, secretHex: string): Promise<DecodedJwt | null> {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  const [h, p, sigB64] = parts;

  let payload: any;
  try {
    payload = JSON.parse(atob(p.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
  if (!payload || typeof payload.sub !== 'string') return null;

  try {
    const key = await crypto.subtle.importKey(
      'raw',
      bytesFromHex(secretHex),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const sig = Uint8Array.from(
      atob(sigB64.replace(/-/g, '+').replace(/_/g, '/')),
      (c) => c.charCodeAt(0),
    );
    const ok = await crypto.subtle.verify(
      'HMAC',
      key,
      sig,
      new TextEncoder().encode(`${h}.${p}`),
    );
    if (!ok) return null;
  } catch {
    return null;
  }

  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;

  // Server-side checks: the account may have been deleted, suspended, revoked,
  // or had its sessions invalidated since the token was issued.
  const db = DB();
  if (db) {
    try {
      const row = (await db
        .prepare(`SELECT id, token_version, status, deleted_at FROM users WHERE id = ?`)
        .bind(payload.sub)
        .first()) as any;
      if (!row || row.deleted_at) return null;
      if (row.status && ['suspended', 'revoked', 'deactivated'].includes(row.status)) return null;
      if (typeof payload.tv === 'number' && payload.tv !== Number(row.token_version || 0)) return null;

      if (payload.sid) {
        const sess = (await db
          .prepare(`SELECT id, revoked_at, expires_at FROM user_sessions WHERE id = ? AND user_id = ?`)
          .bind(payload.sid, payload.sub)
          .first()) as any;
        if (!sess || sess.revoked_at) return null;
        if (sess.expires_at && new Date(sess.expires_at).getTime() < Date.now()) return null;
      }
    } catch {
      // Best-effort DB validation; JWT expiry is still enforced above.
    }
  }

  return payload as DecodedJwt;
}

export function jwtSecretHex(): string {
  const s = getSecrets();
  if (s?.jwt_secret_hex) return s.jwt_secret_hex;
  return (getEnv()?.JWT_SECRET ?? '') as string;
}

export function sessionSecretHex(): string {
  const s = getSecrets();
  if (s?.session_secret_hex) return s.session_secret_hex;
  return (getEnv()?.SESSION_SECRET ?? '') as string;
}

// ---------------------------------------------------------------------------
// Single-use auth tokens (email verification + password reset)
// ---------------------------------------------------------------------------

export type AuthTokenType = 'email_verification' | 'password_reset';

export async function createAuthToken(
  userId: string,
  type: AuthTokenType,
  ttlSeconds: number,
  meta?: any,
) {
  const db = DB();
  const token = randomToken(32);
  const tokenHash = await sha256Hex(token);
  const id = genId();
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  await db
    .prepare(`DELETE FROM auth_tokens WHERE user_id = ? AND type = ? AND used_at IS NULL`)
    .bind(userId, type)
    .run();
  await db
    .prepare(
      `INSERT INTO auth_tokens (id, user_id, type, token_hash, expires_at, created_at, meta)
       VALUES (?, ?, ?, ?, ?, datetime('now'), ?)`,
    )
    .bind(id, userId, type, tokenHash, expiresAt, meta ? JSON.stringify(meta) : null)
    .run();
  return { token, expiresAt };
}

export async function consumeAuthToken(type: AuthTokenType, token: string) {
  const db = DB();
  const tokenHash = await sha256Hex(token);
  const row = (await db
    .prepare(
      `SELECT id, user_id, type, expires_at, used_at, meta FROM auth_tokens WHERE token_hash = ? AND type = ?`,
    )
    .bind(tokenHash, type)
    .first()) as any;
  if (!row) return { ok: false, reason: 'invalid' as const };
  if (row.used_at) return { ok: false, reason: 'used' as const };
  if (new Date(row.expires_at).getTime() < Date.now()) return { ok: false, reason: 'expired' as const };
  await db.prepare(`UPDATE auth_tokens SET used_at = datetime('now') WHERE id = ?`).bind(row.id).run();
  return { ok: true, row } as const;
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

/** Persist a session row for an already-signed token. */
export async function createSession(userId: string, token: string, ip?: string, sid = genId()) {
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await DB()
    .prepare(
      `INSERT INTO user_sessions (id, user_id, token_hash, created_at, expires_at, ip)
       VALUES (?, ?, ?, datetime('now'), ?, ?)`,
    )
    .bind(sid, userId, await sha256Hex(token), expiresAt, ip || null)
    .run();
  return { sid, expiresAt };
}

export async function revokeSession(sid: string, userId: string) {
  await DB()
    .prepare(`UPDATE user_sessions SET revoked_at = datetime('now') WHERE id = ? AND user_id = ?`)
    .bind(sid, userId)
    .run();
}

export async function revokeAllSessions(userId: string) {
  await DB()
    .prepare(`UPDATE user_sessions SET revoked_at = datetime('now') WHERE user_id = ? AND revoked_at IS NULL`)
    .bind(userId)
    .run();
}

/**
 * Invalidate every token issued for a user (used after password changes,
 * suspension, revocation, and privilege changes).
 */
export async function bumpTokenVersion(userId: string) {
  await DB()
    .prepare(
      `UPDATE users SET token_version = COALESCE(token_version, 0) + 1, updated_at = datetime('now') WHERE id = ?`,
    )
    .bind(userId)
    .run();
}

/**
 * Issue a fresh session token for an account.
 *
 * The session id is generated *before* signing and embedded in the token, so
 * every issued token is unique (two sign-ins in the same second never collide
 * on user_sessions.token_hash) and `verifyJwt` can reject tokens whose session
 * has been revoked.
 */
export async function issueSession(
  user: { id: string; email: string; role: string },
  ip?: string,
): Promise<string> {
  const fresh = (await DB()
    .prepare(`SELECT token_version FROM users WHERE id = ?`)
    .bind(user.id)
    .first()) as any;
  const sid = genId();
  const token = await signJwt(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      aud: APP_AUDIENCE,
      tv: Number(fresh?.token_version || 0),
      sid,
    },
    jwtSecretHex(),
  );
  await createSession(user.id, token, ip, sid);
  return token;
}

// ---------------------------------------------------------------------------
// Rate limiting (per Worker instance)
// ---------------------------------------------------------------------------

const inMemoryRate = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const cur = inMemoryRate.get(key);
  if (!cur || cur.resetAt <= now) {
    inMemoryRate.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1 };
  }
  if (cur.count >= limit) return { ok: false, remaining: 0, retryAfterMs: cur.resetAt - now };
  cur.count += 1;
  return { ok: true, remaining: limit - cur.count };
}

// ---------------------------------------------------------------------------
// Audit writers
// ---------------------------------------------------------------------------

export interface AdminAuditEntry {
  target_type: string;
  target_id?: string;
  target_email?: string;
  target_name?: string;
  previous_state?: string;
  new_state?: string;
  reason?: string;
  ip?: string;
  user_agent?: string;
  outcome?: 'success' | 'failed' | 'denied';
}

export type Actor = { id?: string; email?: string; role?: string };

export async function audit(
  _ctx: ExecutionContext,
  event: string,
  actor: Actor | null,
  targetId?: string,
  targetType?: string,
  details?: any,
  ip?: string,
) {
  const db = DB();
  if (!db) return;
  try {
    await db
      .prepare(
        `INSERT INTO audit_log (id, event, actor_id, actor_email, actor_role, target_id, target_type, details, ip)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        genId(),
        event,
        actor?.id ?? null,
        actor?.email ?? null,
        actor?.role ?? null,
        targetId ?? null,
        targetType ?? null,
        details ? JSON.stringify(details) : null,
        ip ?? null,
      )
      .run();
  } catch {
    // Auditing must never break a request.
  }
}

export async function adminAudit(
  ctx: ExecutionContext,
  actor: Actor,
  action: string,
  entry: AdminAuditEntry,
) {
  const db = DB();
  if (!db) return;
  try {
    const ip =
      entry.ip ||
      ctx.request?.headers?.get('cf-connecting-ip') ||
      ctx.request?.headers?.get('x-forwarded-for') ||
      'unknown';
    await db
      .prepare(
        `INSERT INTO admin_audit (id, actor_id, actor_email, actor_role, action, target_type, target_id,
                                   target_email, target_name, previous_state, new_state, reason, ip,
                                   user_agent, outcome, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      )
      .bind(
        genId(),
        actor.id ?? 'unknown',
        actor.email ?? 'unknown',
        actor.role ?? 'unknown',
        action,
        entry.target_type,
        entry.target_id ?? null,
        entry.target_email ?? null,
        entry.target_name ?? null,
        entry.previous_state ?? null,
        entry.new_state ?? null,
        entry.reason ?? null,
        ip,
        entry.user_agent ?? null,
        entry.outcome ?? 'success',
      )
      .run();
  } catch (e: any) {
    console.error('adminAudit write failed:', e?.message);
  }
}

// ---------------------------------------------------------------------------
// User rows + serialization
// ---------------------------------------------------------------------------

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
  email_verified_at?: string | null;
  status?: string;
  failed_login_count?: number;
  locked_until?: string | null;
  token_version?: number;
  access_revoked_at?: string | null;
  mfa_enforced?: number;
}

export function toPublicUser(row: UserRow | any, extra?: any): any {
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

export function publicUserFromRow(row: any): any {
  return {
    ...toPublicUser(row),
    email_verified: !!row.email_verified_at,
    status: row.status || 'active',
  };
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

export function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || ''));
}

export function normalizeUgandanPhone(raw: string): string | null {
  if (!raw) return null;
  let digits = String(raw).replace(/\D/g, '');
  if (digits.startsWith('0')) digits = '256' + digits.slice(1);
  if (!digits.startsWith('256')) return null;
  if (digits.slice(3).length !== 9) return null;
  return '+' + digits;
}

export function looksLikePhone(v: string): boolean {
  const digits = String(v || '').replace(/\D/g, '');
  if (digits.startsWith('0') && digits.length === 10) return true;
  if (digits.startsWith('256') && digits.length === 12) return true;
  return String(v || '').startsWith('+') && String(v).length === 13;
}

export function isDeliverableEmail(email?: string | null): boolean {
  return !!email && isValidEmail(email) && !String(email).includes('@noreply.fidus.staging');
}

/**
 * D1's `prepare(...).all()` resolves to `{ results, success, meta }`, not an
 * array. This normalises either shape so callers can always iterate.
 */
export function rows<T = any>(res: any): T[] {
  if (Array.isArray(res)) return res as T[];
  const list = res?.results;
  return Array.isArray(list) ? (list as T[]) : [];
}

export function safeJsonParse(raw: string): any {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function nowISO(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Shared result types
// ---------------------------------------------------------------------------

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  status?: string;
  access_revoked_at?: string | null;
  mfa_enforced?: number;
}

export interface JsonResponse {
  status: number;
  json: any;
}

export interface RequireAuthResult extends Partial<JsonResponse> {
  ok: boolean;
  user?: DecodedJwt;
}

export { emailSvc };
