import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { dashboardService, workflowService } from '../../services/api';
import { StatCard } from '../../components/common/StatCard';
import { Modal } from '../../components/common/Modal';
import { QueueState, useAsync, useQueue } from '../../components/staff/StaffWorkflow';
import { ScanLine, Clock, CheckCircle, Calendar } from 'lucide-react';

const TABS = [
  { id: 'overview', label: 'Imaging Dashboard', icon: ScanLine },
  { id: 'exams', label: 'Examinations', icon: Calendar },
  { id: 'reports', label: 'Reports', icon: CheckCircle },
];

const OPEN = ['requested', 'scheduled', 'awaiting_exam', 'in_progress', 'completed', 'report_pending'];
const DONE = ['released', 'verified', 'cancelled'];

export const RadiologyPortal = ({ subTab = 'overview', setSubTab }) => {
  const { user } = useAuth();
  const toast = useToast();
  const currentTab = subTab || 'overview';

  const queue = useQueue('radiology');
  const stats = useAsync(() => dashboardService.getStats(), []);
  const [reportFor, setReportFor] = useState(null);
  const [findings, setFindings] = useState('');
  const [impression, setImpression] = useState('');
  const [scheduleFor, setScheduleFor] = useState(null);
  const [scheduleDate, setScheduleDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const counts = stats.data?.data?.counts || {};

  const setStatus = async (row, status, extra = {}) => {
    try {
      setBusy(true);
      await workflowService.updateImagingStatus({ id: row.id, status, ...extra });
      toast.success(`${row.exam_name}: ${status.replace(/_/g, ' ')}`);
      await queue.reload();
      await stats.reload();
    } catch (err) {
      toast.error(err.message || 'Could not update the examination.');
    } finally {
      setBusy(false);
    }
  };

  const releaseReport = async (event) => {
    event.preventDefault();
    if (!findings.trim() || !impression.trim()) {
      toast.warning('Findings and impression are both required before release.');
      return;
    }
    try {
      setBusy(true);
      await workflowService.completeRadiologyReport({ id: reportFor.id, findings, impression, release: true });
      toast.success('Report released to the patient portal.');
      setReportFor(null);
      setFindings('');
      setImpression('');
      await queue.reload();
      await stats.reload();
    } catch (err) {
      toast.error(err.message || 'Could not release the report.');
    } finally {
      setBusy(false);
    }
  };

  const table = (rows, actions) => (
    <div className="table-container">
      <table className="custom-table">
        <thead>
          <tr>
            <th>Reference</th>
            <th>Patient</th>
            <th>Examination</th>
            <th>Scheduled</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                <strong>{row.reference}</strong>
              </td>
              <td>
                {row.patient_name || 'Patient'}
                <div style={{ fontSize: '0.75rem', color: 'var(--slate-500)' }}>{row.patient_number || row.patient_ref}</div>
              </td>
              <td>
                {row.exam_name}
                <div style={{ fontSize: '0.75rem', color: 'var(--slate-500)' }}>{row.modality || '—'}</div>
              </td>
              <td>{row.scheduled_at ? new Date(row.scheduled_at).toLocaleString() : 'Not scheduled'}</td>
              <td>{row.status.replace(/_/g, ' ')}</td>
              <td>{actions(row)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const openRows = queue.items.filter((item) => OPEN.includes(item.status));
  const doneRows = queue.items.filter((item) => DONE.includes(item.status));

  return (
    <div>
      <section className="portal-hero">
        <div className="portal-hero-main">
          <div
            className="portal-hero-avatar"
            aria-hidden="true"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--info-50)', color: 'var(--info-600)', fontWeight: 700 }}
          >
            {(user?.name || 'R').slice(0, 1).toUpperCase()}
          </div>
          <div>
            <div className="portal-hero-meta">
              <span className="portal-status-pill">Radiology</span>
              <span>{user?.department || 'Radiology and Ultrasound'}</span>
            </div>
            <h1 className="portal-hero-title">{user?.name || 'Radiology staff'}</h1>
            <p className="portal-hero-sub">Examination scheduling, reporting and release</p>
          </div>
        </div>
        <div className="portal-hero-actions">
          <button className="btn btn-secondary" onClick={queue.reload}>
            Refresh queue
          </button>
        </div>
      </section>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.5rem' }}>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`portal-chip ${currentTab === id ? 'is-selected' : ''}`}
            style={currentTab === id ? { background: 'var(--primary-600)', color: '#fff', borderColor: 'var(--primary-600)' } : {}}
            onClick={() => setSubTab?.(id)}
          >
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {currentTab === 'overview' && (
        <div className="stats-grid">
          <StatCard label="Open examinations" value={counts.pendingImaging ?? '—'} subtext="Awaiting scheduling or reporting" icon={Clock} color="amber" />
          <StatCard label="Released reports" value={counts.releasedReports ?? '—'} subtext="Laboratory and imaging, last 7 days" icon={CheckCircle} color="emerald" />
          <StatCard label="Appointments today" value={counts.appointmentsToday ?? '—'} subtext="Facility-wide" icon={Calendar} color="teal" />
          <StatCard label="In my queue" value={queue.items.length} subtext="Records in my scope" icon={ScanLine} color="indigo" />
        </div>
      )}

      {(currentTab === 'exams' || currentTab === 'overview') && (
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">Imaging examinations</h2>
              <p className="card-subtitle">Completion of an examination does not publish a report</p>
            </div>
          </div>
          <QueueState
            loading={queue.loading}
            error={queue.error}
            onRetry={queue.reload}
            empty={openRows.length === 0}
            emptyTitle="No imaging requests in the queue"
            emptyDescription="Requests appear here when a clinician orders an examination."
          >
            {table(openRows, (row) => (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {row.status === 'requested' && (
                  <button className="btn btn-outline-primary btn-sm" onClick={() => setScheduleFor(row)}>
                    Schedule
                  </button>
                )}
                {['scheduled', 'awaiting_exam'].includes(row.status) && (
                  <button className="btn btn-outline-primary btn-sm" disabled={busy} onClick={() => setStatus(row, 'in_progress')}>
                    Start exam
                  </button>
                )}
                {row.status === 'in_progress' && (
                  <button className="btn btn-outline-primary btn-sm" disabled={busy} onClick={() => setStatus(row, 'completed')}>
                    Complete exam
                  </button>
                )}
                {['completed', 'report_pending', 'in_progress'].includes(row.status) && (
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      setReportFor(row);
                      setFindings(row.findings || '');
                      setImpression(row.impression || '');
                    }}
                  >
                    Write report
                  </button>
                )}
                <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setStatus(row, 'cancelled')}>
                  Cancel
                </button>
              </div>
            ))}
          </QueueState>
        </div>
      )}

      {currentTab === 'reports' && (
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">Released imaging reports</h2>
              <p className="card-subtitle">Visible to the patient in their scans and reports</p>
            </div>
          </div>
          <QueueState
            loading={queue.loading}
            error={queue.error}
            onRetry={queue.reload}
            empty={doneRows.length === 0}
            emptyTitle="No released reports yet"
            emptyDescription="Reports appear here after verification and release."
          >
            {table(doneRows, (row) => (
              <span style={{ fontSize: '0.8rem', color: 'var(--slate-500)' }}>
                {row.released_at ? `released ${new Date(row.released_at).toLocaleDateString()}` : '—'}
              </span>
            ))}
          </QueueState>
        </div>
      )}

      {scheduleFor && (
        <Modal isOpen title={`Schedule — ${scheduleFor.exam_name}`} onClose={() => setScheduleFor(null)}>
          <label style={{ display: 'block' }}>
            Examination date
            <input type="date" className="form-control" value={scheduleDate} onChange={(event) => setScheduleDate(event.target.value)} />
          </label>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.75rem' }}>
            <button className="btn btn-secondary" onClick={() => setScheduleFor(null)}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={async () => {
                await setStatus(scheduleFor, 'scheduled', { scheduledAt: scheduleDate });
                setScheduleFor(null);
              }}
            >
              Save schedule
            </button>
          </div>
        </Modal>
      )}

      {reportFor && (
        <Modal isOpen title={`Report — ${reportFor.exam_name}`} onClose={() => setReportFor(null)}>
          <p style={{ fontSize: '0.85rem', color: 'var(--slate-600)' }}>
            Patient: <strong>{reportFor.patient_name || reportFor.patient_ref}</strong>
          </p>
          <form onSubmit={releaseReport}>
            <label style={{ display: 'block' }}>
              Findings
              <textarea className="form-control" rows={4} value={findings} onChange={(event) => setFindings(event.target.value)} />
            </label>
            <label style={{ display: 'block', marginTop: '0.5rem' }}>
              Impression
              <textarea className="form-control" rows={3} value={impression} onChange={(event) => setImpression(event.target.value)} />
            </label>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.75rem' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setReportFor(null)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? 'Releasing…' : 'Verify and release'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
