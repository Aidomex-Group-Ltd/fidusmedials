// src/cf/auth/rbac.ts
// Role-based access control: the permission catalog, the role → permission
// matrix, and the checks used by API handlers. This module is the runtime
// source of truth for permission checks.
//
// migrations/002_admin_rbac_mfa.sql seeds the same mapping into
// `staff_role_permissions` so administrators can inspect and adjust role
// permissions; `rolePermissionsFromDb` gives handlers an async read of that
// table when a live value is needed.

import { DB, AuthUser, rows as rowsOf } from './lib';

export const ALL_PERMISSIONS = [
  'patients:read', 'patients:write', 'patients:register',
  'appointments:read', 'appointments:write', 'appointments:own',
  'clinical:consult', 'clinical:prescribe', 'clinical:refer',
  'lab:order', 'lab:results',
  'pharmacy:dispense', 'pharmacy:manage',
  'billing:read', 'billing:write',
  'staff:read', 'staff:invite', 'staff:resend', 'staff:cancel',
  'staff:apply', 'staff:activate', 'staff:suspend', 'staff:revoke',
  'staff:role', 'staff:permissions', 'staff:reset', 'staff:verify',
  'facility:read', 'facility:write',
  'reports:read', 'reports:export',
  'system:read', 'system:write',
  'user_admin', 'user_view', 'audit_read', 'admin_dashboard',
] as const;

export type PermissionCode = typeof ALL_PERMISSIONS[number];

export const ROLE_PERMISSION_SUMMARY: Record<string, PermissionCode[]> = {
  'System Administrator': [...ALL_PERMISSIONS],
  'Facility Administrator': [
    'staff:read', 'staff:invite', 'staff:resend', 'staff:cancel',
    'staff:apply', 'staff:activate', 'staff:suspend', 'staff:role',
    'staff:permissions', 'staff:reset', 'staff:verify',
    'facility:read', 'facility:write', 'reports:read', 'reports:export',
    'system:read', 'user_view', 'audit_read',
  ],
  // Legacy alias used by older deployments. It carries facility-level staff
  // management, but never the ability to grant System Administrator access
  // (that rule is enforced in assignRole/createStaffInvitation).
  Administrator: [
    'staff:read', 'staff:invite', 'staff:resend', 'staff:cancel',
    'staff:apply', 'staff:activate', 'staff:suspend', 'staff:role',
    'staff:permissions', 'staff:reset', 'staff:verify',
    'facility:read', 'facility:write', 'reports:read', 'reports:export',
    'system:read', 'user_view', 'audit_read',
  ],
  'Medical Director': [
    'patients:read', 'patients:write', 'appointments:read',
    'clinical:consult', 'clinical:prescribe', 'clinical:refer',
    'lab:order', 'lab:results', 'pharmacy:dispense',
    'staff:read', 'staff:apply', 'staff:verify', 'staff:activate', 'staff:suspend',
    'reports:read', 'reports:export', 'system:read',
  ],
  Doctor: [
    'patients:read', 'patients:write', 'appointments:read', 'appointments:write',
    'clinical:consult', 'clinical:prescribe', 'clinical:refer',
    'lab:order', 'lab:results', 'system:read',
  ],
  Clinician: [
    'patients:read', 'patients:write', 'appointments:read', 'appointments:write',
    'clinical:consult', 'clinical:prescribe', 'clinical:refer',
    'lab:order', 'lab:results', 'system:read',
  ],
  Nurse: ['patients:read', 'patients:write', 'appointments:read', 'clinical:consult', 'lab:order', 'lab:results', 'system:read'],
  Midwife: ['patients:read', 'patients:write', 'appointments:read', 'clinical:consult', 'lab:order', 'lab:results', 'system:read'],
  'Laboratory Staff': ['patients:read', 'lab:order', 'lab:results', 'system:read'],
  'Laboratory Personnel': ['patients:read', 'lab:order', 'lab:results', 'system:read'],
  Pharmacist: ['patients:read', 'pharmacy:dispense', 'pharmacy:manage', 'system:read'],
  'Pharmacy Staff': ['patients:read', 'pharmacy:dispense', 'pharmacy:manage', 'system:read'],
  'Radiology Staff': ['patients:read', 'lab:order', 'lab:results', 'system:read'],
  Receptionist: [
    'patients:read', 'patients:write', 'patients:register',
    'appointments:read', 'appointments:write', 'staff:read', 'system:read',
  ],
  'Billing / Finance Staff': ['patients:read', 'appointments:read', 'billing:read', 'billing:write', 'system:read'],
  'Records Officer': ['patients:read', 'patients:write', 'appointments:read', 'reports:read', 'system:read'],
  'Admin & Finance': [
    'patients:read', 'appointments:read', 'billing:read', 'billing:write',
    'staff:read', 'facility:read', 'reports:read', 'reports:export', 'system:read',
  ],
};

export function permissionsForRole(role: string): PermissionCode[] {
  return ROLE_PERMISSION_SUMMARY[role] || [];
}

/** True when an account is suspended or has had access revoked. */
export function isInactive(actor?: AuthUser | null): boolean {
  if (!actor) return false;
  if (actor.status && actor.status !== 'active') return true;
  return !!actor.access_revoked_at;
}

export function hasRolePermission(role: string, permission: string): boolean {
  if (role === 'System Administrator') return true;
  return permissionsForRole(role).includes(permission as PermissionCode);
}

/**
 * Read a role's permissions from the database (authoritative when an
 * administrator has customised a role). Falls back to the in-code matrix when
 * the table is missing or empty.
 */
export async function rolePermissionsFromDb(role: string): Promise<string[]> {
  try {
    const rows = rowsOf(
      await DB()
        .prepare(`SELECT permission_code FROM staff_role_permissions WHERE staff_role = ?`)
        .bind(role)
        .all(),
    );
    const codes = rows.map((r: any) => r.permission_code).filter(Boolean);
    if (codes.length) return codes;
  } catch {
    // Fall through to the in-code matrix (e.g. before migrations run).
  }
  return permissionsForRole(role);
}

export function actorHasPermission(actor: AuthUser | undefined | null, permission: PermissionCode | string): boolean {
  if (!actor) return false;
  if (isInactive(actor)) return false;
  return hasRolePermission(actor.role, permission);
}

export function actorIsSystemAdmin(actor: AuthUser | undefined | null): boolean {
  return !!actor && actor.role === 'System Administrator' && !isInactive(actor);
}
