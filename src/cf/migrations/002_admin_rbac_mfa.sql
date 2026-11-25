-- Fidus staging: System Administrator, RBAC, MFA, staff management, audit expansion.
-- Run on D1 after 001_auth_email.sql.
-- Safe to re-run: all objects are IF NOT EXISTS / IF NOT NULL guarded where possible.

-- ---------------------------------------------------------------------------
-- 1. MFA enrollments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mfa_enrollments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  method TEXT NOT NULL DEFAULT 'totp', -- totp | backup_code
  secret_hex TEXT NOT NULL,            -- TOTP base32 secret (hex-encoded for compatibility)
  verified_at TEXT,                    -- set when user confirms a code
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, method)
);

CREATE INDEX IF NOT EXISTS idx_mfa_user ON mfa_enrollments(user_id);

-- ---------------------------------------------------------------------------
-- 2. Permissions catalog
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS permissions (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,   -- e.g. 'patients:read', 'staff:invite'
  name TEXT NOT NULL,
  category TEXT NOT NULL,      -- patients | appointments | clinical | lab | pharmacy | billing | staff | facility | reports | system | user_admin
  description TEXT
);

-- Seed the permission catalog (idempotent-ish via INSERT OR IGNORE).
INSERT OR IGNORE INTO permissions (id, code, name, category, description) VALUES
  ('perm_pat_read',      'patients:read',       'View patient records',        'patients',     'View patient profiles, demographics, and medical history'),
  ('perm_pat_write',     'patients:write',      'Edit patient records',       'patients',     'Create and edit patient demographics and contact details'),
  ('perm_pat_register',  'patients:register',   'Register new patients',      'patients',     'Register new patients into the system'),

  ('perm_app_read',      'appointments:read',   'View appointments',         'appointments', 'View appointments across the facility'),
  ('perm_app_write',     'appointments:write',  'Manage appointments',       'appointments', 'Book, reschedule, and cancel appointments'),
  ('perm_app_own',       'appointments:own',    'Manage own appointments',   'appointments', 'Manage only appointments related to the acting user'),

  ('perm_clin_consult',  'clinical:consult',    'Conduct consultations',     'clinical',     'Record and manage clinical consultations and notes'),
  ('perm_clin_prescribe','clinical:prescribe',  'Issue prescriptions',       'clinical',     'Create and manage electronic prescriptions'),
  ('perm_clin_refer',    'clinical:refer',      'Create referrals',          'clinical',     'Refer patients to other clinicians or departments'),

  ('perm_lab_order',     'lab:order',           'Order laboratory tests',    'lab',          'Request laboratory investigations for patients'),
  ('perm_lab_view',     'lab:results',         'View lab results',          'lab',          'View and release laboratory results'),

  ('perm_pharma_dispense','pharmacy:dispense',  'Dispense medications',      'pharmacy',     'Dispense and record medication dispensing'),
  ('perm_pharma_manage', 'pharmacy:manage',     'Manage pharmacy inventory', 'pharmacy',     'Manage drug inventory and pharmacy stock'),

  ('perm_bill_read',     'billing:read',        'View billing records',      'billing',      'View invoices, payments, and billing summaries'),
  ('perm_bill_write',    'billing:write',       'Manage billing',            'billing',      'Create invoices and record payments'),

  ('perm_staff_read',    'staff:read',          'View staff directory',      'staff',        'View the staff directory and staff profiles'),
  ('perm_staff_invite',  'staff:invite',        'Send staff invitations',    'staff',        'Invite new staff members to the system'),
  ('perm_staff_resend',  'staff:resend',        'Resend staff invitations',  'staff',        'Resend pending staff invitations'),
  ('perm_staff_cancel',  'staff:cancel',        'Cancel staff invitations',  'staff',        'Cancel pending staff invitations'),
  ('perm_staff_apply',   'staff:apply',         'Review staff applications', 'staff',        'Review and decide on pending staff applications'),
  ('perm_staff_activate','staff:activate',      'Activate staff accounts',   'staff',        'Activate or reactivate staff accounts'),
  ('perm_staff_suspend', 'staff:suspend',       'Suspend staff accounts',    'staff',        'Suspend or reinstate staff accounts'),
  ('perm_staff_revoke',  'staff:revoke',        'Revoke staff access',       'staff',        'Revoke staff system access'),
  ('perm_staff_role',    'staff:role',          'Assign staff roles',        'staff',        'Assign and change staff roles'),
  ('perm_staff_perm',    'staff:permissions',   'Manage staff permissions',  'staff',        'Grant, modify, and remove staff permissions'),
  ('perm_staff_reset',   'staff:reset',         'Reset staff passwords',     'staff',        'Initiate password resets for staff accounts'),
  ('perm_staff_verify',  'staff:verify',        'Verify staff identity',     'staff',        'Verify staff identity and credentials'),

  ('perm_facility_read', 'facility:read',       'View facilities',           'facility',     'View facility and department information'),
  ('perm_facility_write','facility:write',      'Manage facilities',         'facility',     'Create and manage facilities and departments'),

  ('perm_report_read',   'reports:read',        'View reports',              'reports',      'View operational and clinical reports'),
  ('perm_report_export', 'reports:export',      'Export reports',            'reports',      'Export reports and data summaries'),

  ('perm_system_read',   'system:read',         'View system config',        'system',       'View system configuration and settings'),
  ('perm_system_write',  'system:write',        'Manage system config',      'system',       'Change system configuration and settings'),

  ('perm_user_admin',    'user_admin',          'User administration',       'user_admin',   'Full user administration and account management'),
  ('perm_user_view',     'user_view',           'View users',                'user_admin',   'View the full user list including patients and staff'),
  ('perm_audit_read',    'audit_read',          'View audit logs',           'user_admin',   'View administrative and security audit logs'),
  ('perm_admin_dashboard','admin_dashboard',    'System administration',     'user_admin',   'Access the system administration dashboard')
;

-- ---------------------------------------------------------------------------
-- 3. Role -> permission mapping
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS staff_roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,   -- matches users.role
  label TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO staff_roles (id, name, label, description) VALUES
  ('role_admin',        'System Administrator', 'System Administrator', 'Full system administration and staff management'),
  ('role_facility',     'Facility Administrator', 'Facility Administrator', 'Facility-level administration and staff management within a facility'),
  ('role_director',     'Medical Director', 'Medical Director', 'Clinical leadership and oversight'),
  ('role_doctor',       'Doctor', 'Doctor / Clinician', 'Doctor / Clinician'),
  ('role_nurse',        'Nurse', 'Nurse', 'Nursing staff'),
  ('role_midwife',      'Midwife', 'Midwife', 'Midwifery staff'),
  ('role_clinician',    'Clinician', 'Clinician', 'Clinician'),
  ('role_lab',          'Laboratory Staff', 'Laboratory Staff', 'Laboratory personnel'),
  ('role_pharmacy',     'Pharmacy Staff', 'Pharmacy Staff', 'Pharmacy personnel'),
  ('role_radiology',    'Radiology Staff', 'Radiology Staff', 'Radiology and ultrasound personnel'),
  ('role_receptionist', 'Receptionist', 'Receptionist', 'Reception and front desk staff'),
  ('role_finance',      'Admin & Finance', 'Admin & Finance', 'Billing, finance, and administrative support staff')
;

CREATE TABLE IF NOT EXISTS staff_role_permissions (
  staff_role TEXT NOT NULL REFERENCES staff_roles(name) ON DELETE CASCADE,
  permission_code TEXT NOT NULL REFERENCES permissions(code) ON DELETE CASCADE,
  PRIMARY KEY (staff_role, permission_code)
);

-- Seed role permission mappings. System Administrator gets everything.
-- Other roles get least-privilege sets appropriate to their duties.

-- System Administrator: all permissions
INSERT OR IGNORE INTO staff_role_permissions (staff_role, permission_code)
  SELECT 'System Administrator', code FROM permissions;

-- Facility Administrator: staff within facility + facility + reports + system read + user view
INSERT OR IGNORE INTO staff_role_permissions (staff_role, permission_code) VALUES
  ('Facility Administrator', 'staff:read'),
  ('Facility Administrator', 'staff:invite'),
  ('Facility Administrator', 'staff:resend'),
  ('Facility Administrator', 'staff:cancel'),
  ('Facility Administrator', 'staff:apply'),
  ('Facility Administrator', 'staff:activate'),
  ('Facility Administrator', 'staff:suspend'),
  ('Facility Administrator', 'staff:role'),
  ('Facility Administrator', 'staff:permissions'),
  ('Facility Administrator', 'staff:reset'),
  ('Facility Administrator', 'staff:verify'),
  ('Facility Administrator', 'facility:read'),
  ('Facility Administrator', 'facility:write'),
  ('Facility Administrator', 'reports:read'),
  ('Facility Administrator', 'reports:export'),
  ('Facility Administrator', 'system:read'),
  ('Facility Administrator', 'user_view'),
  ('Facility Administrator', 'audit_read')
;

-- Medical Director: clinical leadership + staff review + reports
INSERT OR IGNORE INTO staff_role_permissions (staff_role, permission_code) VALUES
  ('Medical Director', 'patients:read'),
  ('Medical Director', 'patients:write'),
  ('Medical Director', 'appointments:read'),
  ('Medical Director', 'clinical:consult'),
  ('Medical Director', 'clinical:prescribe'),
  ('Medical Director', 'clinical:refer'),
  ('Medical Director', 'lab:order'),
  ('Medical Director', 'lab:results'),
  ('Medical Director', 'pharmacy:dispense'),
  ('Medical Director', 'staff:read'),
  ('Medical Director', 'staff:apply'),
  ('Medical Director', 'staff:verify'),
  ('Medical Director', 'staff:activate'),
  ('Medical Director', 'staff:suspend'),
  ('Medical Director', 'reports:read'),
  ('Medical Director', 'reports:export'),
  ('Medical Director', 'system:read')
;

-- Doctor / Clinician: clinical duties
INSERT OR IGNORE INTO staff_role_permissions (staff_role, permission_code) VALUES
  ('Doctor', 'patients:read'),
  ('Doctor', 'patients:write'),
  ('Doctor', 'appointments:read'),
  ('Doctor', 'appointments:write'),
  ('Doctor', 'clinical:consult'),
  ('Doctor', 'clinical:prescribe'),
  ('Doctor', 'clinical:refer'),
  ('Doctor', 'lab:order'),
  ('Doctor', 'lab:results'),
  ('Doctor', 'system:read')
;
INSERT OR IGNORE INTO staff_role_permissions (staff_role, permission_code) VALUES
  ('Clinician', 'patients:read'),
  ('Clinician', 'patients:write'),
  ('Clinician', 'appointments:read'),
  ('Clinician', 'appointments:write'),
  ('Clinician', 'clinical:consult'),
  ('Clinician', 'clinical:prescribe'),
  ('Clinician', 'clinical:refer'),
  ('Clinician', 'lab:order'),
  ('Clinician', 'lab:results'),
  ('Clinician', 'system:read')
;

-- Nurse / Midwife: clinical support
INSERT OR IGNORE INTO staff_role_permissions (staff_role, permission_code) VALUES
  ('Nurse', 'patients:read'),
  ('Nurse', 'patients:write'),
  ('Nurse', 'appointments:read'),
  ('Nurse', 'clinical:consult'),
  ('Nurse', 'lab:order'),
  ('Nurse', 'lab:results'),
  ('Nurse', 'system:read')
;
INSERT OR IGNORE INTO staff_role_permissions (staff_role, permission_code) VALUES
  ('Midwife', 'patients:read'),
  ('Midwife', 'patients:write'),
  ('Midwife', 'appointments:read'),
  ('Midwife', 'clinical:consult'),
  ('Midwife', 'lab:order'),
  ('Midwife', 'lab:results'),
  ('Midwife', 'system:read')
;

-- Laboratory Staff
INSERT OR IGNORE INTO staff_role_permissions (staff_role, permission_code) VALUES
  ('Laboratory Staff', 'patients:read'),
  ('Laboratory Staff', 'lab:order'),
  ('Laboratory Staff', 'lab:results'),
  ('Laboratory Staff', 'system:read')
;

-- Pharmacy Staff
INSERT OR IGNORE INTO staff_role_permissions (staff_role, permission_code) VALUES
  ('Pharmacy Staff', 'patients:read'),
  ('Pharmacy Staff', 'pharmacy:dispense'),
  ('Pharmacy Staff', 'pharmacy:manage'),
  ('Pharmacy Staff', 'system:read')
;

-- Radiology Staff
INSERT OR IGNORE INTO staff_role_permissions (staff_role, permission_code) VALUES
  ('Radiology Staff', 'patients:read'),
  ('Radiology Staff', 'lab:order'),
  ('Radiology Staff', 'lab:results'),
  ('Radiology Staff', 'system:read')
;

-- Receptionist
INSERT OR IGNORE INTO staff_role_permissions (staff_role, permission_code) VALUES
  ('Receptionist', 'patients:read'),
  ('Receptionist', 'patients:write'),
  ('Receptionist', 'patients:register'),
  ('Receptionist', 'appointments:read'),
  ('Receptionist', 'appointments:write'),
  ('Receptionist', 'staff:read'),
  ('Receptionist', 'system:read')
;

-- Admin & Finance
INSERT OR IGNORE INTO staff_role_permissions (staff_role, permission_code) VALUES
  ('Admin & Finance', 'patients:read'),
  ('Admin & Finance', 'appointments:read'),
  ('Admin & Finance', 'billing:read'),
  ('Admin & Finance', 'billing:write'),
  ('Admin & Finance', 'staff:read'),
  ('Admin & Finance', 'facility:read'),
  ('Admin & Finance', 'reports:read'),
  ('Admin & Finance', 'reports:export'),
  ('Admin & Finance', 'system:read')
;

CREATE INDEX IF NOT EXISTS idx_role_perm_role ON staff_role_permissions(staff_role);
CREATE INDEX IF NOT EXISTS idx_role_perm_perm ON staff_role_permissions(permission_code);

-- ---------------------------------------------------------------------------
-- 4. Session store (cookie-less, token-hash based)
-- ---------------------------------------------------------------------------
-- NOTE: SQLite/D1 has no "ALTER TABLE ... ADD COLUMN IF NOT EXISTS". Column
-- additions for the pre-existing tables live in 003_column_additions.sql so
-- this file stays fully idempotent.
CREATE TABLE IF NOT EXISTS user_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  ip TEXT
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);

-- ---------------------------------------------------------------------------
-- 5. Administrator bootstrap requests (email-ownership verified elevation)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_bootstrap_requests (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | consumed | revoked
  expires_at TEXT NOT NULL,
  verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  ip TEXT
);

CREATE INDEX IF NOT EXISTS idx_bootstrap_email ON admin_bootstrap_requests(email, status);

-- ---------------------------------------------------------------------------
-- 6. Expanded admin audit log (admin_audit) for privileged actions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_audit (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL REFERENCES users(id),
  actor_email TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,   -- user | staff_invitation | staff_application | permission | role | session | system
  target_id TEXT,
  target_email TEXT,
  target_name TEXT,
  previous_state TEXT,         -- JSON snapshot before change
  new_state TEXT,              -- JSON snapshot after change
  reason TEXT,
  ip TEXT,
  user_agent TEXT,
  outcome TEXT NOT NULL DEFAULT 'success', -- success | failed | denied
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_actor ON admin_audit(actor_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_target ON admin_audit(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_action ON admin_audit(action);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit(created_at);

-- ---------------------------------------------------------------------------
-- 7. Staff session tracking (for session revocation)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS staff_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  issued_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT NOT NULL DEFAULT (datetime('now')),
  ip TEXT,
  user_agent TEXT,
  revoked_at TEXT,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON staff_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_hash ON staff_sessions(token_hash);

-- Indexes over new columns are created in 003, after the columns exist.
CREATE INDEX IF NOT EXISTS idx_audit_actor_role ON audit_log(actor_role);
