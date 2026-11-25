-- Production-only completion of 003_column_additions.sql.
--
-- The production D1 database predates 003 and already has some of its columns,
-- so the original non-idempotent file cannot be replayed as-is. These are only
-- the columns that are missing on production; each statement is applied once.
--
-- Keep this out of the normal migration sequence: it exists so production can
-- be brought to the same shape without dropping or recreating tables.

ALTER TABLE users ADD COLUMN mfa_enforced INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN mfa_confirmed_at TEXT;
ALTER TABLE users ADD COLUMN activated_at TEXT;
ALTER TABLE users ADD COLUMN last_password_change_at TEXT;
ALTER TABLE users ADD COLUMN password_changed_at TEXT;

ALTER TABLE staff_invitations ADD COLUMN cancelled_at TEXT;
ALTER TABLE staff_invitations ADD COLUMN resent_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE staff_invitations ADD COLUMN last_resent_at TEXT;
ALTER TABLE staff_invitations ADD COLUMN message TEXT;
ALTER TABLE staff_invitations ADD COLUMN created_by TEXT;

ALTER TABLE staff_applications ADD COLUMN rejection_reason TEXT;
ALTER TABLE staff_applications ADD COLUMN verification_notes TEXT;
ALTER TABLE staff_applications ADD COLUMN access_granted_at TEXT;
ALTER TABLE staff_applications ADD COLUMN activated_by TEXT;
ALTER TABLE staff_applications ADD COLUMN verify_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE staff_applications ADD COLUMN last_verify_request_at TEXT;

CREATE INDEX IF NOT EXISTS idx_users_mfa_enforced ON users(mfa_enforced);
CREATE INDEX IF NOT EXISTS idx_users_status_role ON users(status, role);
CREATE INDEX IF NOT EXISTS idx_users_access_revoked ON users(access_revoked_at);
CREATE INDEX IF NOT EXISTS idx_staff_invitations_status ON staff_invitations(status, email);
CREATE INDEX IF NOT EXISTS idx_staff_invitations_hash ON staff_invitations(token_hash);
CREATE INDEX IF NOT EXISTS idx_staff_applications_status ON staff_applications(status);
