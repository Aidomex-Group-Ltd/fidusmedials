// src/cf/auth/index.ts
// Public surface of the auth domain. Consumers (`src/cf/fidus.ts`,
// `src/cf/admin.ts`, `src/cf/notifications.ts`) import from './auth' and get
// exactly the handlers and helpers they need, with the implementation split by
// responsibility:
//
//   lib.ts             — env/DB, crypto, JWT, passwords, tokens, sessions, audit
//   totp.ts            — RFC 6238 TOTP + base32 helpers
//   rbac.ts            — permission catalog, role matrix, permission checks
//   session.ts         — requireAuth / requireRole / requireActor, getMe, logout
//   patient.ts         — patient registration, login, verification, recovery
//   staff.ts           — staff login, invitations, applications, acceptance
//   administration.ts  — System Administrator provisioning, MFA, lifecycle, audit

// Shared primitives
export {
  getEnv,
  DB,
  appBaseUrl,
  supportEmail,
  hashPassword,
  verifyPassword,
  signJwt,
  verifyJwt,
  jwtSecretHex,
  sessionSecretHex,
  createAuthToken,
  consumeAuthToken,
  createSession,
  revokeSession,
  revokeAllSessions,
  bumpTokenVersion,
  issueSession,
  rateLimit,
  audit,
  adminAudit,
  toPublicUser,
  publicUserFromRow,
  rows,
  isValidEmail,
  normalizeUgandanPhone,
  looksLikePhone,
  genId,
  randomToken,
  sha256Hex,
  timingSafeEqual,
} from './lib';

export type {
  AuthUser,
  DecodedJwt,
  JwtPayload,
  JsonResponse,
  RequireAuthResult,
  UserRow,
  Actor,
  AdminAuditEntry,
} from './lib';

// TOTP
export { verifyTOTP, generateBase32Secret, hexToBase32, base32ToHex, otpauthUri } from './totp';

// RBAC
export {
  ALL_PERMISSIONS,
  ROLE_PERMISSION_SUMMARY,
  permissionsForRole,
  hasRolePermission,
  actorHasPermission,
  actorIsSystemAdmin,
  isInactive,
} from './rbac';
export type { PermissionCode } from './rbac';

// Session
export { requireAuth, requireRole, requireActor, getMe, logout, logoutAll } from './session';

// Patient portal
export {
  registerPatient,
  login,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
  sendPasswordResetEmailForUser,
  sendVerificationEmailForUser,
  verifyCredentials,
  findUserByContact,
} from './patient';

// Staff portal
export {
  staffLogin,
  createStaffInvitation,
  listStaffInvitations,
  resendStaffInvitation,
  cancelStaffInvitation,
  applyStaff,
  listStaffApplications,
  approveStaffApplication,
  rejectStaffApplication,
  acceptInvitation,
  getStaffInvitationInfo,
  listUsers,
  BOOTSTRAP_SYSTEM_ADMINS,
  STAFF_ROLES,
  STAFF_DEPARTMENTS,
  isValidStaffRole,
  isValidDepartment,
  isSystemAdmin,
  canManageStaff,
  isBootstrapSystemAdminEmail,
} from './staff';

// System administration
export {
  adminBootstrap,
  adminEnrollMfa,
  adminConfirmMfa,
  adminDisableMfa,
  verifyActorTOTP,
  isUserMfaEnrolled,
  requiresMfa,
  updateAccountStatus,
  assignRole,
  setPermissionOverrides,
  adminInitiatePasswordReset,
  revokeUserSessions,
  queryAdminAudit,
  adminSecuritySummary,
} from './administration';
