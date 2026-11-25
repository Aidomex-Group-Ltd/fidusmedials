import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { dashboardService, workflowService } from '../../services/api';
import { StatCard } from '../../components/common/StatCard';
import { QueueState, useAsync, useQueue } from '../../components/staff/StaffWorkflow';
import { Pill, Clock, CheckCircle, Package } from 'lucide-react';

const TABS = [
  { id: 'overview', label: 'Pharmacy Dashboard', icon: Pill },
  { id: 'prescriptions', label: 'Dispensing Queue', icon: Package },
  { id: 'favorites', label: 'Dispensed', icon: CheckCircle },
];

const OPEN = ['issued', 'pending_pharmacy', 'processing', 'partially_dispensed'];
const CLOSED = ['dispensed', 'cancelled', 'expired', 'discontinued'];

export const PharmacyPortal = ({ subTab = 'overview', setSubTab }) => {
  const { user } = useAuth();
  const toast = useToast();
  const currentTab = subTab || 'overview';

  const queue = useQueue('prescriptions');
  const stats = useAsync(() => dashboardService.getStats(), []);
  const [busy, setBusy] = useState(false);
  const counts = stats.data?.data?.counts || {};

  const setStatus = async (row, status) => {
    try {
      setBusy(true);
      await workflowService.dispensePrescription({ id: row.id, status });
      toast.success(`${row.medication}: ${status.replace(/_/g, ' ')}`);
      await queue.reload();
      await stats.reload();
    } catch (err) {
      toast.error(err.message || 'Could not update the prescription.');
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
            <th>Medication</th>
            <th>Directions</th>
            <th>Prescriber</th>
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
                {row.medication} {row.strength || ''}
                <div style={{ fontSize: '0.75rem', color: 'var(--slate-500)' }}>{row.quantity || ''}</div>
              </td>
              <td style={{ maxWidth: 200 }}>
                {[row.dosage, row.frequency, row.duration].filter(Boolean).join(' • ') || '—'}
              </td>
              <td>{row.clinician_name || '—'}</td>
              <td>{row.status.replace(/_/g, ' ')}</td>
              <td>{actions(row)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const openRows = queue.items.filter((item) => OPEN.includes(item.status));
  const closedRows = queue.items.filter((item) => CLOSED.includes(item.status));

  return (
    <div>
      <section className="portal-hero">
        <div className="portal-hero-main">
          <div
            className="portal-hero-avatar"
            aria-hidden="true"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--violet-50)', color: 'var(--violet-600)', fontWeight: 700 }}
          >
            {(user?.name || 'P').slice(0, 1).toUpperCase()}
          </div>
          <div>
            <div className="portal-hero-meta">
              <span className="portal-status-pill">Pharmacy</span>
              <span>{user?.department || 'Pharmacy'}</span>
            </div>
            <h1 className="portal-hero-title">{user?.name || 'Pharmacy staff'}</h1>
            <p className="portal-hero-sub">Dispensing against clinician-issued prescriptions</p>
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
          <StatCard label="Awaiting dispensing" value={counts.pendingPrescriptions ?? '—'} subtext="Open prescriptions" icon={Clock} color="amber" />
          <StatCard label="In my queue" value={openRows.length} subtext="Records in my scope" icon={Package} color="indigo" />
          <StatCard label="Prescriptions today" value={queue.items.filter((item) => new Date(item.created_at).toDateString() === new Date().toDateString()).length} subtext="Issued today" icon={Pill} color="teal" />
          <StatCard label="Dispensed" value={closedRows.filter((item) => item.status === 'dispensed').length} subtext="Completed in this queue" icon={CheckCircle} color="emerald" />
        </div>
      )}

      {(currentTab === 'prescriptions' || currentTab === 'overview') && (
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">Dispensing queue</h2>
              <p className="card-subtitle">Patients are notified as each prescription is dispensed</p>
            </div>
          </div>
          <QueueState
            loading={queue.loading}
            error={queue.error}
            onRetry={queue.reload}
            empty={openRows.length === 0}
            emptyTitle="No prescriptions waiting"
            emptyDescription="Prescriptions appear here as soon as a clinician issues them."
          >
            {table(openRows, (row) => (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {row.status === 'issued' && (
                  <button className="btn btn-outline-primary btn-sm" disabled={busy} onClick={() => setStatus(row, 'processing')}>
                    Start
                  </button>
                )}
                <button className="btn btn-outline-primary btn-sm" disabled={busy} onClick={() => setStatus(row, 'partially_dispensed')}>
                  Partial
                </button>
                <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => setStatus(row, 'dispensed')}>
                  Dispense
                </button>
              </div>
            ))}
          </QueueState>
        </div>
      )}

      {currentTab === 'favorites' && (
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">Dispensed and closed prescriptions</h2>
              <p className="card-subtitle">Full history for the prescriptions in your scope</p>
            </div>
          </div>
          <QueueState
            loading={queue.loading}
            error={queue.error}
            onRetry={queue.reload}
            empty={closedRows.length === 0}
            emptyTitle="Nothing dispensed yet"
            emptyDescription="Completed prescriptions are kept here for reference."
          >
            {table(closedRows, (row) => (
              <span style={{ fontSize: '0.8rem', color: 'var(--slate-500)' }}>
                {row.dispensed_at ? `dispensed ${new Date(row.dispensed_at).toLocaleDateString()}` : row.status}
              </span>
            ))}
          </QueueState>
        </div>
      )}
    </div>
  );
};
