-- Fidus staging: column additions for tables that already exist.
-- Run after 002_admin_rbac_mfa.sql.
--
-- SQLite/D1 does not support "ADD COLUMN IF NOT EXISTS", so this file is NOT
-- idempotent. Run it exactly once per database. To tolerate databases where a
-- column was added manually during earlier debugging, run each statement
-- individually and ignore "duplicate column name" errors, or use the guarded
-- helper in scripts/apply-migrations.sh.

-- ---------------------------------------------------------------------------
-- users: access control, MFA state, password lifecycle
-- ---------------------------------------------------------------------------
ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN access_revoked_at TEXT;
ALTER TABLE users ADD COLUMN suspension_reason TEXT;
ALTER TABLE users ADD COLUMN mfa_enforced INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN mfa_confirmed_at TEXT;
ALTER TABLE users ADD COLUMN approved_at TEXT;
ALTER TABLE users ADD COLUMN approved_by TEXT;
ALTER TABLE users ADD COLUMN invited_by TEXT;
ALTER TABLE users ADD COLUMN activated_at TEXT;
ALTER TABLE users ADD COLUMN last_password_change_at TEXT;
ALTER TABLE users ADD COLUMN password_changed_at TEXT;

CREATE INDEX IF NOT EXISTS idx_users_mfa_enforced ON users(mfa_enforced);
CREATE INDEX IF NOT EXISTS idx_users_status_role ON users(status, role);
CREATE INDEX IF NOT EXISTS idx_users_access_revoked ON users(access_revoked_at);

-- ---------------------------------------------------------------------------
-- staff_invitations: resend / cancel tracking
-- ---------------------------------------------------------------------------
ALTER TABLE staff_invitations ADD COLUMN token_hash TEXT;
ALTER TABLE staff_invitations ADD COLUMN status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE staff_invitations ADD COLUMN cancelled_at TEXT;
ALTER TABLE staff_invitations ADD COLUMN accepted_at TEXT;
ALTER TABLE staff_invitations ADD COLUMN resent_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE staff_invitations ADD COLUMN last_resent_at TEXT;
ALTER TABLE staff_invitations ADD COLUMN message TEXT;
ALTER TABLE staff_invitations ADD COLUMN created_by TEXT;

CREATE INDEX IF NOT EXISTS idx_staff_invitations_status ON staff_invitations(status, email);
CREATE INDEX IF NOT EXISTS idx_staff_invitations_hash ON staff_invitations(token_hash);

-- ---------------------------------------------------------------------------
-- staff_applications: review + verification tracking
-- ---------------------------------------------------------------------------
ALTER TABLE staff_applications ADD COLUMN rejection_reason TEXT;
ALTER TABLE staff_applications ADD COLUMN verification_notes TEXT;
ALTER TABLE staff_applications ADD COLUMN access_granted_at TEXT;
ALTER TABLE staff_applications ADD COLUMN activated_by TEXT;
ALTER TABLE staff_applications ADD COLUMN verify_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE staff_applications ADD COLUMN last_verify_request_at TEXT;
-- reviewed_by / reviewed_at already exist in the base schema.

CREATE INDEX IF NOT EXISTS idx_staff_applications_status ON staff_applications(status);
