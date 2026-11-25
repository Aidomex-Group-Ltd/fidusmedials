import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Shield,
  Users,
  Mail,
  Activity,
  UserCheck,
  UserX,
  RefreshCw,
  KeyRound,
  Search,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Send,
  Ban,
  Lock,
  ClipboardList,
  Eye,
  LogOut,
} from 'lucide-react';
import { adminService, staffService } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Modal } from '../../components/common/Modal';
import { Badge, StatusBadge, humanizeStatus } from '../../components/common/Badge';

// Roles accepted by the Worker. Administrator roles are only offered to a
// signed-in System Administrator; the backend enforces the same rule.
const STAFF_ROLES = [
  'System Administrator',
  'Administrator',
  'Facility Administrator',
  'Medical Director',
  'Receptionist',
  'Doctor',
  'Clinician',
  'Nurse',
  'Midwife',
  'Laboratory Staff',
  'Laboratory Personnel',
  'Pharmacy Staff',
  'Pharmacist',
  'Radiology Staff',
  'Billing / Finance Staff',
  'Records Officer',
  'Admin & Finance',
];

const DEPARTMENTS = [
  'Administration', 'Reception', 'Medical Consultation', 'Nursing', 'Maternity',
  'Laboratory', 'Pharmacy', 'Radiology and Ultrasound', 'Theatre and Surgery',
  'Inpatient Wards', 'Dental', 'Pediatrics', 'Obstetrics and Gynecology',
  'Family Planning', 'Finance and Accounts', 'Billing and Cashier', 'Human Resources',
  'Procurement and Stores', 'Records Management', 'Rehabilitation', 'Mental Health',
  'Home Healthcare', 'Telemedicine', 'IT and Systems Administration',
  'Quality Assurance', 'Cardiology', 'Neurology', 'Dermatology', 'ENT',
  'Ophthalmology', 'Orthopedics', 'Gastroenterology', 'Pulmonology',
  'Endocrinology', 'Nephrology', 'Oncology', 'Emergency', 'ICU',
];

const ADMIN_ROLES = ['System Administrator', 'Administrator', 'Facility Administrator'];

const STATUS_FILTERS = [
  { value: '', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'pending', label: 'Pending activation' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'revoked', label: 'Access revoked' },
];

const formatDate = (value) => {
  if (!value) return '—';
  let text = String(value);
  // D1 timestamps are UTC without a zone marker ("2026-11-25 04:48:22");
  // ISO values already carry one and must not have another appended.
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(text)) text = `${text.replace(' ', 'T')}Z`;
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString();
};

const shortId = (id) => {
  const text = String(id || '');
  return text.length > 14 ? `${text.slice(0, 8)}…${text.slice(-4)}` : text || '—';
};

const errorMessage = (err, fallback) => err?.message || fallback;

/* ------------------------------------------------------------------------ */
/* Shared admin UI                                                          */
/* ------------------------------------------------------------------------ */

const Th = ({ children, style }) => (
  <th style={{ textAlign: 'left', padding: '0.65rem 0.75rem', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--slate-500)', borderBottom: '1px solid var(--slate-200)', whiteSpace: 'nowrap', ...style }}>
    {children}
  </th>
);

const Td = ({ children, style }) => (
  <td style={{ padding: '0.7rem 0.75rem', borderBottom: '1px solid var(--slate-100)', verticalAlign: 'top', ...style }}>{children}</td>
);

const SectionHeader = ({ icon: Icon, title, subtitle, onRefresh, busy }) => (
  <div className="admin-section-head">
    <div>
      <h2 className="admin-section-title"><Icon size={19} /> {title}</h2>
      {subtitle && <p className="admin-section-sub">{subtitle}</p>}
    </div>
    {onRefresh && (
      <button type="button" className="cp-btn cp-btn-outline" onClick={onRefresh} disabled={busy}>
        <RefreshCw size={15} /> {busy ? 'Refreshing…' : 'Refresh'}
      </button>
    )}
  </div>
);

const EmptyRow = ({ colSpan, children }) => (
  <tr>
    <td colSpan={colSpan} style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--slate-500)' }}>
      {children}
    </td>
  </tr>
);

const Pagination = ({ page, totalPages, total, onChange }) => {
  if (!total) return null;
  return (
    <div className="admin-pagination">
      <span>{total} record{total === 1 ? '' : 's'} · page {page} of {totalPages}</span>
      <div style={{ display: 'flex', gap: '0.4rem' }}>
        <button type="button" className="cp-btn cp-btn-outline cp-btn-sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          <ChevronLeft size={14} /> Previous
        </button>
        <button type="button" className="cp-btn cp-btn-outline cp-btn-sm" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
          Next <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
};

const ConfirmDialog = ({ request, onCancel }) => {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  if (!request) return null;

  const confirm = async () => {
    setRunning(true);
    setError('');
    try {
      await request.run();
      onCancel();
    } catch (err) {
      setError(errorMessage(err, 'The action failed.'));
    } finally {
      setRunning(false);
    }
  };

  return (
    <Modal isOpen onClose={onCancel} title={request.title} maxWidth="520px">
      <div style={{ display: 'grid', gap: '0.9rem' }}>
        <p style={{ margin: 0, color: 'var(--slate-600)', lineHeight: 1.6 }}>{request.description}</p>
        {request.consequence && (
          <div className={`admin-consequence ${request.danger ? 'is-danger' : ''}`}>
            <AlertTriangle size={16} />
            <span>{request.consequence}</span>
          </div>
        )}
        {error && <div className="admin-inline-error">{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.25rem' }}>
          <button type="button" className="cp-btn cp-btn-outline" onClick={onCancel} disabled={running}>Cancel</button>
          <button
            type="button"
            className={`cp-btn ${request.danger ? 'cp-btn-danger' : 'cp-btn-primary'}`}
            onClick={confirm}
            disabled={running}
          >
            {running ? 'Working…' : (request.confirmLabel || 'Confirm')}
          </button>
        </div>
      </div>
    </Modal>
  );
};

/* ------------------------------------------------------------------------ */
/* Staff Management                                                         */
/* ------------------------------------------------------------------------ */

const blankStaffFilters = { q: '', role: '', status: '', department: '' };

const StaffManagement = ({ user }) => {
  const toast = useToast();
  const isSystemAdmin = user?.role === 'System Administrator';

  const [filters, setFilters] = useState(blankStaffFilters);
  const [page, setPage] = useState(1);
  const [staff, setStaff] = useState([]);
  const [meta, setMeta] = useState({ total: 0, total_pages: 1 });
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [detailRole, setDetailRole] = useState('');
  const [detailDepartment, setDetailDepartment] = useState('');
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [showReviewedApps, setShowReviewedApps] = useState(false);
  const [history, setHistory] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');

  const loadStaff = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await adminService.staff({ ...filters, page, page_size: 10 });
      const data = res?.data || {};
      setStaff(data.items || []);
      setMeta({ total: data.total || 0, total_pages: data.total_pages || 1 });
    } catch (err) {
      setError(errorMessage(err, 'Failed to load the staff directory.'));
      setStaff([]);
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  const loadApplications = useCallback(async () => {
    try {
      const res = await staffService.listApplications();
      setApplications(Array.isArray(res?.data) ? res.data : []);
    } catch {
      // Applications are supplementary to the directory; the directory error
      // banner already reports backend trouble.
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(loadStaff, filters.q ? 300 : 0);
    return () => clearTimeout(timer);
  }, [loadStaff, filters.q]);

  useEffect(() => { loadApplications(); }, [loadApplications]);

  const refresh = async () => {
    setBusy(true);
    await Promise.all([loadStaff(), loadApplications()]);
    setBusy(false);
  };

  const openStaff = (member) => {
    setSelected(member);
    setDetailRole(member.role || '');
    setDetailDepartment(member.department || '');
    setReason('');
    setHistory(null);
    setHistoryError('');
  };

  const loadHistory = async (member) => {
    setHistoryLoading(true);
    setHistoryError('');
    try {
      const res = await adminService.audit({ q: member.email, page: 1, page_size: 10 });
      setHistory(res?.data?.items || []);
    } catch (err) {
      setHistoryError(errorMessage(err, 'Could not load this account\'s audit history.'));
    } finally {
      setHistoryLoading(false);
    }
  };

  const updateFilter = (key, value) => {
    setPage(1);
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const runAction = async (fn, successMessage) => {
    try {
      setBusy(true);
      const res = await fn();
      toast.success(res?.message || successMessage);
      await Promise.all([loadStaff(), loadApplications()]);
      setSelected(null);
    } finally {
      setBusy(false);
    }
  };

  const askStatus = (member, action) => {
    const labels = {
      suspend: { title: 'Suspend staff access', verb: 'Suspend account', danger: true },
      reinstate: { title: 'Reactivate staff access', verb: 'Reactivate account', danger: false },
      revoke: { title: 'Revoke staff access', verb: 'Revoke access', danger: true },
    }[action];
    const consequence =
      action === 'reinstate'
        ? 'The account becomes active again and the member can sign in with their existing password.'
        : 'All active sessions are revoked immediately and the member is signed out. The action is recorded in the audit log.';

    setConfirm({
      title: labels.title,
      description: `Apply this action to ${member.name} (${member.email})?`,
      consequence,
      confirmLabel: labels.verb,
      danger: labels.danger,
      run: () => runAction(
        () => adminService.updateStatus({
          userId: member.id,
          action,
          reason: reason.trim() || (action === 'reinstate' ? undefined : `Access ${action === 'revoke' ? 'revoked' : 'suspended'} by administrator`),
        }),
        'Account updated',
      ),
    });
  };

  const askRoleChange = (member) => {
    if (!detailRole) return;
    if (detailRole === member.role && detailDepartment === (member.department || '')) {
      toast.info('Choose a different role or department first.');
      return;
    }
    setConfirm({
      title: 'Change role and department',
      description: `Change ${member.name}'s role from ${member.role} to ${detailRole}${detailDepartment ? ` in ${detailDepartment}` : ''}?`,
      consequence: 'Role changes take effect immediately, revoke all of the member\'s active sessions, and are written to the audit log. The member must sign in again.',
      confirmLabel: 'Update role',
      danger: detailRole === 'System Administrator' || member.role === 'System Administrator',
      run: () => runAction(
        () => adminService.assignRole({ userId: member.id, role: detailRole, department: detailDepartment }),
        'Role updated',
      ),
    });
  };

  const askResetPassword = (member) => {
    setConfirm({
      title: 'Send password reset link',
      description: `Send a one-time password reset link to ${member.email}?`,
      consequence: 'The member receives an email with a single-use link. No password is displayed or stored in plain text. The request is audited.',
      confirmLabel: 'Send reset link',
      run: () => runAction(() => adminService.resetPassword(member.email, 'Administrator-initiated reset'), 'Password reset initiated'),
    });
  };

  const askRevokeSessions = (member) => {
    setConfirm({
      title: 'Revoke active sessions',
      description: `Sign ${member.name} out of every device now?`,
      consequence: 'Every issued session token for this account is invalidated. Their password and account status are unchanged.',
      confirmLabel: 'Revoke sessions',
      danger: true,
      run: () => runAction(() => adminService.revokeSessions({ userId: member.id }), 'Sessions revoked'),
    });
  };

  const askApprove = (app) => {
    setConfirm({
      title: 'Approve staff application',
      description: `Approve ${app.name} (${app.email}) as ${app.role} in ${app.department}?`,
      consequence: 'A staff account is created with the requested role and an activation link is emailed to the applicant. They set their own password.',
      confirmLabel: 'Approve application',
      run: async () => {
        const res = await staffService.approveApplication({ id: app.id });
        if (res?.data?.delivery && res.data.delivery.ok === false) {
          toast.warning(res.message || 'Account approved, but the activation email could not be delivered.');
        } else {
          toast.success(res?.message || 'Application approved');
        }
        await Promise.all([loadStaff(), loadApplications()]);
      },
    });
  };

  const askReject = (app) => {
    setConfirm({
      title: 'Reject staff application',
      description: `Reject ${app.name}'s application (${app.email})?`,
      consequence: 'The applicant is notified by email and cannot be approved again from this application. A reason is helpful and is recorded in the audit log.',
      confirmLabel: 'Reject application',
      danger: true,
      run: async () => {
        await staffService.rejectApplication({ id: app.id, reason: reason.trim() || undefined });
        toast.success('Application rejected');
        await loadApplications();
      },
    });
  };

  const pendingApps = applications.filter((a) => a.status === 'pending');
  const reviewedApps = applications.filter((a) => a.status !== 'pending');
  const roleOptions = useMemo(
    () => (isSystemAdmin ? STAFF_ROLES : STAFF_ROLES.filter((r) => !ADMIN_ROLES.includes(r))),
    [isSystemAdmin],
  );

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div className="card admin-section">
        <SectionHeader
          icon={Users}
          title="Staff Management"
          subtitle="Directory, applications, roles, and account access for facility personnel."
          onRefresh={refresh}
          busy={busy}
        />

        <div className="admin-toolbar">
          <div className="admin-search">
            <Search size={16} />
            <input
              className="form-input"
              placeholder="Search name, email, phone, or staff ID"
              value={filters.q}
              onChange={(e) => updateFilter('q', e.target.value)}
              aria-label="Search staff"
            />
          </div>
          <select className="form-select" value={filters.role} onChange={(e) => updateFilter('role', e.target.value)} aria-label="Filter by role">
            <option value="">All roles</option>
            {STAFF_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <select className="form-select" value={filters.department} onChange={(e) => updateFilter('department', e.target.value)} aria-label="Filter by department">
            <option value="">All departments</option>
            {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select className="form-select" value={filters.status} onChange={(e) => updateFilter('status', e.target.value)} aria-label="Filter by status">
            {STATUS_FILTERS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>

        {error && <div className="admin-inline-error">{error}</div>}

        <div style={{ overflowX: 'auto' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <Th>Staff ID</Th>
                <Th>Name</Th>
                <Th>Email</Th>
                <Th>Role</Th>
                <Th>Department</Th>
                <Th>Status</Th>
                <Th>Registered</Th>
                <Th>Last login</Th>
                <Th style={{ textAlign: 'right' }}>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {loading && <EmptyRow colSpan={9}>Loading staff directory…</EmptyRow>}
              {!loading && !staff.length && <EmptyRow colSpan={9}>No staff match these filters.</EmptyRow>}
              {!loading && staff.map((member) => (
                <tr key={member.id}>
                  <Td><span className="admin-mono" title={member.id}>{shortId(member.id)}</span></Td>
                  <Td style={{ fontWeight: 600 }}>{member.name}</Td>
                  <Td>{member.email}</Td>
                  <Td>{member.role}</Td>
                  <Td>{member.department || '—'}</Td>
                  <Td><StatusBadge status={member.access_revoked_at ? 'revoked' : member.status} /></Td>
                  <Td style={{ whiteSpace: 'nowrap' }}>{formatDate(member.created_at)}</Td>
                  <Td style={{ whiteSpace: 'nowrap' }}>{member.last_login_at ? formatDate(member.last_login_at) : 'Never'}</Td>
                  <Td style={{ textAlign: 'right' }}>
                    <button type="button" className="cp-btn cp-btn-outline cp-btn-sm" onClick={() => openStaff(member)}>
                      <Eye size={14} /> View
                    </button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Pagination page={page} totalPages={meta.total_pages} total={meta.total} onChange={setPage} />
      </div>

      <div className="card admin-section">
        <div className="admin-section-head">
          <div>
            <h3 className="admin-section-title"><ClipboardList size={18} /> Staff applications</h3>
            <p className="admin-section-sub">
              {pendingApps.length
                ? `${pendingApps.length} application${pendingApps.length === 1 ? '' : 's'} awaiting review.`
                : 'No applications are awaiting review.'}
            </p>
          </div>
          {reviewedApps.length > 0 && (
            <button type="button" className="cp-btn cp-btn-ghost cp-btn-sm" onClick={() => setShowReviewedApps((v) => !v)}>
              {showReviewedApps ? 'Hide reviewed' : `Show reviewed (${reviewedApps.length})`}
            </button>
          )}
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <Th>Applicant</Th>
                <Th>Email</Th>
                <Th>Requested role</Th>
                <Th>Department</Th>
                <Th>Submitted</Th>
                <Th>Status</Th>
                <Th style={{ textAlign: 'right' }}>Review</Th>
              </tr>
            </thead>
            <tbody>
              {!pendingApps.length && <EmptyRow colSpan={7}>No pending applications.</EmptyRow>}
              {pendingApps.map((app) => (
                <tr key={app.id}>
                  <Td style={{ fontWeight: 600 }}>{app.name}</Td>
                  <Td>{app.email}</Td>
                  <Td>{app.role}</Td>
                  <Td>{app.department}</Td>
                  <Td style={{ whiteSpace: 'nowrap' }}>{formatDate(app.created_at)}</Td>
                  <Td><StatusBadge status={app.status} /></Td>
                  <Td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button type="button" className="cp-btn cp-btn-primary cp-btn-sm" disabled={busy} onClick={() => askApprove(app)}>
                      <CheckCircle2 size={14} /> Approve
                    </button>{' '}
                    <button type="button" className="cp-btn cp-btn-outline cp-btn-sm" disabled={busy} onClick={() => askReject(app)}>
                      <XCircle size={14} /> Reject
                    </button>
                  </Td>
                </tr>
              ))}
              {showReviewedApps && reviewedApps.map((app) => (
                <tr key={app.id} className="admin-row-muted">
                  <Td style={{ fontWeight: 600 }}>{app.name}</Td>
                  <Td>{app.email}</Td>
                  <Td>{app.role}</Td>
                  <Td>{app.department}</Td>
                  <Td style={{ whiteSpace: 'nowrap' }}>{formatDate(app.created_at)}</Td>
                  <Td><StatusBadge status={app.status} /></Td>
                  <Td style={{ textAlign: 'right', color: 'var(--slate-500)' }}>Reviewed</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <Modal isOpen onClose={() => setSelected(null)} title="Staff account" maxWidth="720px">
          <div style={{ display: 'grid', gap: '1rem' }}>
            <div className="admin-detail-grid">
              {[
                ['Staff ID', selected.id, true],
                ['Full name', selected.name],
                ['Email', selected.email],
                ['Phone', selected.phone || '—'],
                ['Role', selected.role],
                ['Department', selected.department || '—'],
                ['Account status', selected.access_revoked_at ? 'Access revoked' : humanizeStatus(selected.status)],
                ['Email verified', selected.email_verified_at ? 'Yes' : 'No'],
                ['Registered', formatDate(selected.created_at)],
                ['Last login', selected.last_login_at ? formatDate(selected.last_login_at) : 'Never'],
                ['Approved', selected.approved_at ? formatDate(selected.approved_at) : '—'],
                ['Activated', selected.activated_at ? formatDate(selected.activated_at) : '—'],
              ].map(([label, value, mono]) => (
                <div key={label}>
                  <span className="admin-detail-label">{label}</span>
                  <span className={`admin-detail-value ${mono ? 'admin-mono' : ''}`}>{value}</span>
                </div>
              ))}
            </div>

            <div className="admin-panel">
              <h4 className="admin-panel-title">Role and department</h4>
              <p className="admin-panel-hint">
                Only a System Administrator can grant System Administrator access. You cannot change your own role.
              </p>
              <div className="admin-inline-form">
                <select className="form-select" value={detailRole} onChange={(e) => setDetailRole(e.target.value)} aria-label="New role">
                  {roleOptions.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <select className="form-select" value={detailDepartment} onChange={(e) => setDetailDepartment(e.target.value)} aria-label="New department">
                  <option value="">Keep current department</option>
                  {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
                <button type="button" className="cp-btn cp-btn-primary" disabled={busy} onClick={() => askRoleChange(selected)}>
                  Update role
                </button>
              </div>
            </div>

            <div className="admin-panel">
              <h4 className="admin-panel-title">Account access</h4>
              <p className="admin-panel-hint">Actions apply immediately and are recorded in Audit &amp; Security.</p>
              <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                <label className="form-label" htmlFor="admin-reason">Reason (optional)</label>
                <input
                  id="admin-reason"
                  className="form-input"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Shown in the audit record and notification email"
                />
              </div>
              <div className="admin-action-row">
                <button type="button" className="cp-btn cp-btn-outline" disabled={busy} onClick={() => askStatus(selected, 'suspend')}>
                  <UserX size={15} /> Suspend
                </button>
                <button type="button" className="cp-btn cp-btn-outline" disabled={busy} onClick={() => askStatus(selected, 'reinstate')}>
                  <UserCheck size={15} /> Reactivate
                </button>
                <button type="button" className="cp-btn cp-btn-outline" disabled={busy} onClick={() => askStatus(selected, 'revoke')}>
                  <Ban size={15} /> Revoke access
                </button>
                <button type="button" className="cp-btn cp-btn-outline" disabled={busy} onClick={() => askResetPassword(selected)}>
                  <KeyRound size={15} /> Reset password
                </button>
                <button type="button" className="cp-btn cp-btn-outline" disabled={busy} onClick={() => askRevokeSessions(selected)}>
                  <LogOut size={15} /> Revoke sessions
                </button>
              </div>
            </div>

            <div className="admin-panel">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <h4 className="admin-panel-title">Account audit history</h4>
                <button type="button" className="cp-btn cp-btn-outline cp-btn-sm" disabled={historyLoading} onClick={() => loadHistory(selected)}>
                  <Activity size={14} /> {historyLoading ? 'Loading…' : 'Load history'}
                </button>
              </div>
              {historyError && <div className="admin-inline-error">{historyError}</div>}
              {history && !history.length && <p className="admin-panel-hint" style={{ margin: 0 }}>No audit events reference this account yet.</p>}
              {!!history?.length && (
                <div className="admin-audit-feed" style={{ marginTop: '0.5rem' }}>
                  {history.map((event) => (
                    <div key={event.id} className="admin-feed-row" style={{ cursor: 'default' }}>
                      <div className="admin-feed-main">
                        <Badge variant={eventTone(event.event)}>{String(event.event || '').replace(/_/g, ' ')}</Badge>
                        <span className="admin-feed-actor">{event.actor_email || 'system'}</span>
                        {event.reason && <span className="admin-feed-target">{event.reason}</span>}
                      </div>
                      <div className="admin-feed-meta"><span>{formatDate(event.created_at)}</span></div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}

      <ConfirmDialog request={confirm} onCancel={() => setConfirm(null)} />
    </div>
  );
};

/* ------------------------------------------------------------------------ */
/* Invitations                                                              */
/* ------------------------------------------------------------------------ */

const emptyInvite = { email: '', name: '', role: 'Doctor', department: 'Medical Consultation', message: '', expires_in_days: 7 };

const InvitationManagement = ({ user }) => {
  const toast = useToast();
  const isSystemAdmin = user?.role === 'System Administrator';

  const [invitations, setInvitations] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(emptyInvite);
  const [lastDelivery, setLastDelivery] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await adminService.invitations();
      const data = res?.data || {};
      setInvitations(data.items || []);
      setCounts(data.counts || {});
    } catch (err) {
      setError(errorMessage(err, 'Failed to load invitations.'));
      setInvitations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return invitations.filter((inv) => {
      if (statusFilter !== 'all' && inv.status !== statusFilter) return false;
      if (!needle) return true;
      return [inv.email, inv.role, inv.department, inv.name, inv.invited_by_email, inv.invited_by_name]
        .some((value) => String(value || '').toLowerCase().includes(needle));
    });
  }, [invitations, statusFilter, search]);

  const create = async (e) => {
    e.preventDefault();
    if (!form.email.trim() || !form.role || !form.department) {
      toast.warning('Email, role, and department are required.');
      return;
    }
    setBusy(true);
    setLastDelivery(null);
    try {
      const res = await staffService.invite({
        ...form,
        email: form.email.trim().toLowerCase(),
        name: form.name.trim() || undefined,
        message: form.message.trim() || undefined,
        expires_in_days: Number(form.expires_in_days) || 7,
      });
      const delivery = res?.data?.delivery;
      setLastDelivery({ ok: delivery?.ok !== false, message: res?.message || '', error: delivery?.error });
      if (delivery?.ok === false) {
        toast.warning(res?.message || 'Invitation saved, but email delivery failed.');
      } else {
        toast.success(res?.message || 'Invitation sent');
      }
      setForm({ ...emptyInvite, role: form.role, department: form.department });
      await load();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not create the invitation.'));
    } finally {
      setBusy(false);
    }
  };

  const resend = (invitation) => {
    setConfirm({
      title: 'Resend invitation',
      description: `Send a new invitation email to ${invitation.email}?`,
      consequence: 'The previous link is invalidated and a new single-use token is issued. The invitation expiry is extended.',
      confirmLabel: 'Resend invitation',
      run: async () => {
        const res = await adminService.resendInvitation(invitation.id);
        if (res?.data?.delivery?.ok === false) {
          toast.warning(res?.message || 'A new link was created, but email delivery failed.');
        } else {
          toast.success(res?.message || 'Invitation resent');
        }
        await load();
      },
    });
  };

  const revoke = (invitation) => {
    setConfirm({
      title: 'Revoke invitation',
      description: `Revoke the invitation for ${invitation.email}?`,
      consequence: 'The acceptance link stops working immediately. The recipient is emailed that the invitation was cancelled. This cannot be undone; a new invitation can be created.',
      confirmLabel: 'Revoke invitation',
      danger: true,
      run: async () => {
        await adminService.cancelInvitation(invitation.id);
        toast.success('Invitation revoked');
        await load();
      },
    });
  };

  const roleOptions = isSystemAdmin ? STAFF_ROLES : STAFF_ROLES.filter((r) => !ADMIN_ROLES.includes(r));
  const statusTabs = [
    ['all', 'All'],
    ['pending', 'Pending'],
    ['accepted', 'Accepted'],
    ['expired', 'Expired'],
    ['cancelled', 'Revoked'],
  ];

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div className="card admin-section">
        <SectionHeader
          icon={Mail}
          title="Staff Invitations"
          subtitle="Invite an eligible person, bind the role and department, and track delivery and acceptance."
          onRefresh={load}
          busy={loading}
        />

        <form onSubmit={create} className="admin-invite-form">
          <div className="form-group">
            <label className="form-label" htmlFor="inv-email">Recipient email *</label>
            <input id="inv-email" type="email" required className="form-input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@example.com" />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="inv-name">Recipient name</label>
            <input id="inv-name" className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Optional" />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="inv-role">Role *</label>
            <select id="inv-role" className="form-select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {roleOptions.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="inv-dept">Department *</label>
            <select id="inv-dept" className="form-select" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })}>
              {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="inv-days">Expires in (days)</label>
            <input id="inv-days" type="number" min="1" max="30" className="form-input" value={form.expires_in_days} onChange={(e) => setForm({ ...form, expires_in_days: e.target.value })} />
          </div>
          <div className="form-group admin-invite-message">
            <label className="form-label" htmlFor="inv-message">Message to recipient (optional)</label>
            <textarea id="inv-message" className="form-input" rows={2} maxLength={1000} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="Add context for the invitation. This appears in the email." />
          </div>
          <div className="admin-invite-submit">
            <button type="submit" className="cp-btn cp-btn-primary" disabled={busy}>
              <Send size={15} /> {busy ? 'Sending…' : 'Send invitation'}
            </button>
          </div>
        </form>

        {lastDelivery && (
          <div className={`admin-delivery ${lastDelivery.ok ? 'is-ok' : 'is-failed'}`}>
            {lastDelivery.ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            <span>{lastDelivery.ok ? 'Invitation email accepted by the mail provider.' : `Invitation saved but not delivered. ${lastDelivery.error || ''}`}</span>
          </div>
        )}
        {error && <div className="admin-inline-error">{error}</div>}
      </div>

      <div className="card admin-section">
        <div className="admin-toolbar admin-toolbar-invites">
          <div className="admin-search">
            <Search size={16} />
            <input className="form-input" placeholder="Search email, role, or sender" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search invitations" />
          </div>
          <div className="admin-tabs" role="tablist" aria-label="Invitation status">
            {statusTabs.map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={statusFilter === value}
                className={`admin-tab ${statusFilter === value ? 'is-active' : ''}`}
                onClick={() => setStatusFilter(value)}
              >
                {label}
                {value !== 'all' && counts[value] ? <span className="admin-tab-count">{counts[value]}</span> : null}
              </button>
            ))}
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <Th>Invitation ID</Th>
                <Th>Recipient</Th>
                <Th>Role</Th>
                <Th>Department</Th>
                <Th>Invited by</Th>
                <Th>Created</Th>
                <Th>Expires</Th>
                <Th>Status</Th>
                <Th style={{ textAlign: 'right' }}>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {loading && <EmptyRow colSpan={9}>Loading invitations…</EmptyRow>}
              {!loading && !visible.length && <EmptyRow colSpan={9}>No invitations match this view.</EmptyRow>}
              {!loading && visible.map((inv) => (
                <tr key={inv.id}>
                  <Td><span className="admin-mono" title={inv.id}>{shortId(inv.id)}</span></Td>
                  <Td>
                    <div style={{ fontWeight: 600 }}>{inv.name || inv.email}</div>
                    <div style={{ color: 'var(--slate-500)', fontSize: '0.82rem' }}>{inv.email}</div>
                  </Td>
                  <Td>{inv.role}</Td>
                  <Td>{inv.department}</Td>
                  <Td>
                    <div>{inv.invited_by_name || 'Administrator'}</div>
                    <div style={{ color: 'var(--slate-500)', fontSize: '0.8rem' }}>{inv.invited_by_email || '—'}</div>
                  </Td>
                  <Td style={{ whiteSpace: 'nowrap' }}>{formatDate(inv.created_at)}</Td>
                  <Td style={{ whiteSpace: 'nowrap' }}>{formatDate(inv.expires_at)}</Td>
                  <Td><StatusBadge status={inv.status} /></Td>
                  <Td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button
                      type="button"
                      className="cp-btn cp-btn-outline cp-btn-sm"
                      disabled={busy || inv.status !== 'pending'}
                      title={inv.status === 'pending' ? 'Send a fresh link' : 'Only pending invitations can be resent'}
                      onClick={() => resend(inv)}
                    >
                      <RefreshCw size={14} /> Resend
                    </button>{' '}
                    <button
                      type="button"
                      className="cp-btn cp-btn-outline cp-btn-sm"
                      disabled={busy || !['pending', 'expired'].includes(inv.status)}
                      title={['pending', 'expired'].includes(inv.status) ? 'Revoke this invitation' : 'Only pending or expired invitations can be revoked'}
                      onClick={() => revoke(inv)}
                    >
                      <Ban size={14} /> Revoke
                    </button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmDialog request={confirm} onCancel={() => setConfirm(null)} />
    </div>
  );
};

/* ------------------------------------------------------------------------ */
/* Audit & Security                                                         */
/* ------------------------------------------------------------------------ */

const AUDIT_SOURCES = [
  { value: '', label: 'All events' },
  { value: 'privileged', label: 'Administrator actions' },
  { value: 'auth', label: 'Authentication' },
];

const eventTone = (event) => {
  const text = String(event || '').toLowerCase();
  if (/(denied|failed|locked|revoked|suspend|reject)/.test(text)) return 'danger';
  if (/(expired|cancel)/.test(text)) return 'warning';
  if (/(login|accepted|approved|created|enrolled|verified|success|activated)/.test(text)) return 'success';
  return 'blue';
};

const AuditSecurity = () => {
  const [summary, setSummary] = useState(null);
  const [summaryError, setSummaryError] = useState('');
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({ total: 0, total_pages: 1 });
  const [filters, setFilters] = useState({ q: '', source: '', outcome: '' });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(null);

  const loadSummary = useCallback(async () => {
    try {
      const res = await adminService.securitySummary();
      setSummary(res?.data || null);
      setSummaryError('');
    } catch (err) {
      setSummaryError(errorMessage(err, 'Security summary unavailable.'));
    }
  }, []);

  const loadFeed = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await adminService.audit({ ...filters, page, page_size: 20 });
      const data = res?.data || {};
      setItems(data.items || []);
      setMeta({ total: data.total || 0, total_pages: data.total_pages || 1 });
    } catch (err) {
      setError(errorMessage(err, 'Failed to load the audit feed.'));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  useEffect(() => {
    const timer = setTimeout(loadFeed, filters.q ? 300 : 0);
    return () => clearTimeout(timer);
  }, [loadFeed, filters.q]);

  const refresh = async () => {
    await Promise.all([loadSummary(), loadFeed()]);
  };

  const updateFilter = (key, value) => {
    setPage(1);
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const cards = summary
    ? [
        ['Suspicious attempts (24h)', summary.suspicious_attempts_24h, AlertTriangle],
        ['Denied actions (24h)', summary.denied_actions_24h, Ban],
        ['Locked accounts', summary.locked_accounts, Lock],
        ['Suspended accounts', summary.suspended_accounts, UserX],
        ['Revoked access', summary.revoked_accounts, Shield],
        ['Active administrators', summary.active_administrators, UserCheck],
        ['Pending invitations', summary.pending_invitations, Mail],
        ['Pending applications', summary.pending_applications, ClipboardList],
      ]
    : [];

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div className="card admin-section">
        <SectionHeader
          icon={Shield}
          title="Audit & Security"
          subtitle="Authentication events and privileged administrator actions, newest first."
          onRefresh={refresh}
          busy={loading}
        />

        {summaryError && <div className="admin-inline-error">{summaryError}</div>}
        <div className="admin-stat-grid">
          {cards.map(([label, value, Icon]) => (
            <div key={label} className="admin-stat">
              <div className="admin-stat-icon"><Icon size={16} /></div>
              <div>
                <div className="admin-stat-label">{label}</div>
                <div className="admin-stat-value">{value ?? 0}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="admin-toolbar">
          <div className="admin-search">
            <Search size={16} />
            <input
              className="form-input"
              placeholder="Search event, actor, target, or reason"
              value={filters.q}
              onChange={(e) => updateFilter('q', e.target.value)}
              aria-label="Search audit events"
            />
          </div>
          <select className="form-select" value={filters.source} onChange={(e) => updateFilter('source', e.target.value)} aria-label="Event source">
            {AUDIT_SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <select className="form-select" value={filters.outcome} onChange={(e) => updateFilter('outcome', e.target.value)} aria-label="Outcome">
            <option value="">All outcomes</option>
            <option value="success">Success</option>
            <option value="denied">Denied</option>
            <option value="failed">Failed</option>
          </select>
        </div>

        {error && <div className="admin-inline-error">{error}</div>}

        <div className="admin-audit-feed">
          {loading && <div className="admin-feed-empty">Loading audit events…</div>}
          {!loading && !items.length && <div className="admin-feed-empty">No audit events match these filters.</div>}
          {!loading && items.map((item) => {
            const isOpen = expanded === item.id;
            return (
              <div key={item.id} className="admin-feed-item">
                <button type="button" className="admin-feed-row" onClick={() => setExpanded(isOpen ? null : item.id)} aria-expanded={isOpen}>
                  <div className="admin-feed-main">
                    <Badge variant={eventTone(item.event)}>{String(item.event || '').replace(/_/g, ' ')}</Badge>
                    <span className="admin-feed-actor">{item.actor_email || 'system'}</span>
                    <span className="admin-feed-role">{item.actor_role || '—'}</span>
                    {item.target_email && <span className="admin-feed-target">→ {item.target_email}</span>}
                    {item.target_id && !item.target_email && <span className="admin-feed-target">→ {shortId(item.target_id)}</span>}
                  </div>
                  <div className="admin-feed-meta">
                    <span>{formatDate(item.created_at)}</span>
                    {item.ip && <span className="admin-mono">{item.ip}</span>}
                    <span className={`admin-outcome is-${item.outcome || 'success'}`}>{item.outcome || 'success'}</span>
                  </div>
                </button>
                {isOpen && (
                  <div className="admin-feed-detail">
                    <div className="admin-detail-grid">
                      <div><span className="admin-detail-label">Event ID</span><span className="admin-detail-value admin-mono">{item.id}</span></div>
                      <div><span className="admin-detail-label">Source</span><span className="admin-detail-value">{item.source === 'privileged' ? 'Administrator action' : 'Authentication'}</span></div>
                      <div><span className="admin-detail-label">Actor</span><span className="admin-detail-value">{item.actor_email || '—'} {item.actor_role ? `(${item.actor_role})` : ''}</span></div>
                      <div><span className="admin-detail-label">Target</span><span className="admin-detail-value">{item.target_email || item.target_id || '—'}{item.target_type ? ` · ${item.target_type}` : ''}</span></div>
                      {item.reason && <div><span className="admin-detail-label">Reason</span><span className="admin-detail-value">{item.reason}</span></div>}
                    </div>
                    {item.details && (
                      <pre className="admin-json">{JSON.stringify(item.details, null, 2)}</pre>
                    )}
                    {(item.previous_state || item.new_state) && (
                      <div className="admin-state-diff">
                        <div>
                          <span className="admin-detail-label">Before</span>
                          <pre className="admin-json">{JSON.stringify(item.previous_state ?? {}, null, 2)}</pre>
                        </div>
                        <div>
                          <span className="admin-detail-label">After</span>
                          <pre className="admin-json">{JSON.stringify(item.new_state ?? {}, null, 2)}</pre>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <Pagination page={page} totalPages={meta.total_pages} total={meta.total} onChange={setPage} />
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------------ */
/* Dashboard                                                                */
/* ------------------------------------------------------------------------ */

const DashboardSummary = ({ setActiveTab }) => {
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await adminService.overview();
      setOverview(res?.data || null);
    } catch (err) {
      setError(errorMessage(err, 'Failed to load the administration overview.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const counts = overview?.counts || {};
  const stats = [
    ['Total users', counts.totalUsers, Users],
    ['Active staff', counts.activeStaff, UserCheck],
    ['Pending applications', counts.pendingApplications, ClipboardList],
    ['Pending invitations', counts.pendingInvitations, Mail],
    ['Suspended accounts', counts.suspendedAccounts, UserX],
    ['Active administrators', counts.activeAdministrators, Shield],
  ];

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div className="card admin-section">
        <SectionHeader
          icon={Shield}
          title="System Administration"
          subtitle="Facility personnel, invitations, and security oversight."
          onRefresh={load}
          busy={loading}
        />
        {error && <div className="admin-inline-error">{error}</div>}
        <div className="admin-stat-grid">
          {stats.map(([label, value, Icon]) => (
            <div key={label} className="admin-stat">
              <div className="admin-stat-icon"><Icon size={16} /></div>
              <div>
                <div className="admin-stat-label">{label}</div>
                <div className="admin-stat-value">{value ?? 0}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="admin-action-row">
          <button type="button" className="cp-btn cp-btn-primary" onClick={() => setActiveTab?.('admin-staff')}>
            <Users size={16} /> Manage staff
          </button>
          <button type="button" className="cp-btn cp-btn-outline" onClick={() => setActiveTab?.('admin-invitations')}>
            <Mail size={16} /> Invite staff
          </button>
          <button type="button" className="cp-btn cp-btn-outline" onClick={() => setActiveTab?.('admin-audit')}>
            <Activity size={16} /> Audit &amp; security
          </button>
        </div>
      </div>

      <div className="card admin-section">
        <h3 className="admin-section-title"><Activity size={18} /> Recent authentication activity</h3>
        <div className="admin-audit-feed">
          {loading && <div className="admin-feed-empty">Loading activity…</div>}
          {!loading && !(overview?.recentAuthEvents || []).length && <div className="admin-feed-empty">No recent authentication events.</div>}
          {(overview?.recentAuthEvents || []).map((event) => (
            <div key={event.id} className="admin-feed-row" style={{ cursor: 'default' }}>
              <div className="admin-feed-main">
                <Badge variant={eventTone(event.event)}>{String(event.event || '').replace(/_/g, ' ')}</Badge>
                <span className="admin-feed-actor">{event.actor_email || 'system'}</span>
                <span className="admin-feed-role">{event.actor_role || '—'}</span>
              </div>
              <div className="admin-feed-meta">
                <span>{formatDate(event.created_at)}</span>
                {event.ip && <span className="admin-mono">{event.ip}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------------ */

export const SystemAdminPortal = ({ activeTab, setActiveTab }) => {
  const { user } = useAuth();
  if (activeTab === 'admin-staff') return <StaffManagement user={user} />;
  if (activeTab === 'admin-invitations') return <InvitationManagement user={user} />;
  if (activeTab === 'admin-audit' || activeTab === 'admin-security') return <AuditSecurity />;
  return <DashboardSummary setActiveTab={setActiveTab} />;
};

export default SystemAdminPortal;
