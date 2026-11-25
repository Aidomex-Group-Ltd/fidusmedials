import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { dashboardService, workflowService } from '../../services/api';
import { StatCard } from '../../components/common/StatCard';
import { Modal } from '../../components/common/Modal';
import { TaskQueuePanel } from '../../components/common/TaskQueuePanel';
import { NotificationCenter } from '../../components/common/NotificationCenter';
import { QueueState, useAsync, useQueue } from '../../components/staff/StaffWorkflow';
import { Microscope, Droplets, FileCheck, FolderLock, Clock, CheckCircle } from 'lucide-react';

const TABS = [
  { id: 'overview', label: 'Lab Dashboard', icon: Microscope },
  { id: 'samples', label: 'Samples & Tests', icon: Droplets },
  { id: 'results', label: 'Test Results', icon: FileCheck },
  { id: 'reports', label: 'Reports', icon: FolderLock },
];

const INTAKE = ['requested', 'awaiting_collection'];
const PROCESSING = ['collected', 'received', 'processing', 'awaiting_verification'];
const FINAL = ['released', 'verified', 'cancelled'];

export const LabPortal = ({ subTab = 'overview', setSubTab }) => {
  const { user } = useAuth();
  const toast = useToast();
  const currentTab = subTab || 'overview';

  const queue = useQueue('lab');
  const stats = useAsync(() => dashboardService.getStats(), []);
  const [resultFor, setResultFor] = useState(null);
  const [resultRows, setResultRows] = useState([{ name: '', value: '', unit: '', reference_range: '', flag: 'normal' }]);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  const counts = stats.data?.data?.counts || {};

  const advance = async (row, status) => {
    try {
      setBusy(true);
      await workflowService.updateLabStatus({ id: row.id, status });
      toast.success(`${row.test_name}: ${status.replace(/_/g, ' ')}`);
      await queue.reload();
      await stats.reload();
    } catch (err) {
      toast.error(err.message || 'Could not update the test.');
    } finally {
      setBusy(false);
    }
  };

  const submitResult = async (event) => {
    event.preventDefault();
    const cleaned = resultRows.filter((row) => row.name.trim() && row.value.trim());
    if (!cleaned.length) {
      toast.warning('Add at least one result value.');
      return;
    }
    try {
      setBusy(true);
      await workflowService.completeLabResult({
        id: resultFor.id,
        results: cleaned,
        comments: comment || null,
        release: true,
      });
      toast.success('Result verified and released to the patient.');
      setResultFor(null);
      setResultRows([{ name: '', value: '', unit: '', reference_range: '', flag: 'normal' }]);
      setComment('');
      await queue.reload();
      await stats.reload();
    } catch (err) {
      toast.error(err.message || 'Could not release the result.');
    } finally {
      setBusy(false);
    }
  };

  const rowsFor = (groups) => queue.items.filter((item) => groups.includes(item.status));

  const renderTable = (rows, actionsFor) => (
    <div className="table-container">
      <table className="custom-table">
        <thead>
          <tr>
            <th>Reference</th>
            <th>Patient</th>
            <th>Test</th>
            <th>Requested</th>
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
              <td>{row.test_name}</td>
              <td>{new Date(row.requested_at).toLocaleDateString()}</td>
              <td>{row.status.replace(/_/g, ' ')}</td>
              <td>{actionsFor(row)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div>
      <section className="portal-hero">
        <div className="portal-hero-main">
          <div
            className="portal-hero-avatar"
            aria-hidden="true"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--primary-100)', color: 'var(--primary-700)', fontWeight: 700 }}
          >
            {(user?.name || 'L').slice(0, 1).toUpperCase()}
          </div>
          <div>
            <div className="portal-hero-meta">
              <span className="portal-status-pill">Laboratory</span>
              <span>{user?.department || 'Diagnostic Laboratory'}</span>
            </div>
            <h1 className="portal-hero-title">{user?.name || 'Laboratory staff'}</h1>
            <p className="portal-hero-sub">Sample accessioning, result entry and release</p>
          </div>
        </div>
        <div className="portal-hero-actions">
          <button className="btn btn-secondary" onClick={() => setSubTab?.('samples')}>
            <Droplets size={16} /> Samples in
          </button>
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
        <>
          <div className="stats-grid">
            <StatCard label="Awaiting collection" value={counts.pendingLab ?? '—'} subtext="Open laboratory requests" icon={Clock} color="amber" />
            <StatCard label="Released reports" value={counts.releasedReports ?? '—'} subtext="Laboratory and imaging, last 7 days" icon={CheckCircle} color="emerald" />
            <StatCard label="Consultations today" value={counts.consultationsToday ?? '—'} subtext="Facility-wide" icon={Microscope} color="teal" />
            <StatCard label="My queue" value={queue.items.length} subtext="Records in my scope" icon={FileCheck} color="indigo" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: '1rem', marginTop: '1rem' }}>
            <TaskQueuePanel title="Laboratory task queue" />
            <NotificationCenter />
          </div>
        </>
      )}

      {currentTab === 'samples' && (
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">Samples and tests</h2>
              <p className="card-subtitle">Requests waiting for collection or accessioning</p>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={queue.reload}>
              Refresh
            </button>
          </div>
          <QueueState
            loading={queue.loading}
            error={queue.error}
            onRetry={queue.reload}
            empty={rowsFor([...INTAKE, ...PROCESSING]).length === 0}
            emptyTitle="No samples in the laboratory queue"
            emptyDescription="Requests appear here as soon as a clinician orders a test."
          >
            {renderTable(rowsFor([...INTAKE, ...PROCESSING]), (row) => (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {INTAKE.includes(row.status) && (
                  <button className="btn btn-outline-primary btn-sm" disabled={busy} onClick={() => advance(row, 'collected')}>
                    Collect
                  </button>
                )}
                {row.status === 'collected' && (
                  <button className="btn btn-outline-primary btn-sm" disabled={busy} onClick={() => advance(row, 'received')}>
                    Receive
                  </button>
                )}
                {row.status === 'received' && (
                  <button className="btn btn-outline-primary btn-sm" disabled={busy} onClick={() => advance(row, 'processing')}>
                    Start processing
                  </button>
                )}
                {['processing', 'awaiting_verification', 'received'].includes(row.status) && (
                  <button className="btn btn-primary btn-sm" onClick={() => setResultFor(row)}>
                    Enter result
                  </button>
                )}
                <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => advance(row, 'cancelled')}>
                  Cancel
                </button>
              </div>
            ))}
          </QueueState>
        </div>
      )}

      {currentTab === 'results' && (
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">Result entry and release</h2>
              <p className="card-subtitle">Releasing a result publishes it to the patient portal immediately</p>
            </div>
          </div>
          <QueueState
            loading={queue.loading}
            error={queue.error}
            onRetry={queue.reload}
            empty={rowsFor(PROCESSING).length === 0}
            emptyTitle="Nothing awaiting a result"
            emptyDescription="Tests appear here once a sample has been received."
          >
            {renderTable(rowsFor(PROCESSING), (row) => (
              <button className="btn btn-primary btn-sm" onClick={() => setResultFor(row)}>
                Enter result
              </button>
            ))}
          </QueueState>
        </div>
      )}

      {currentTab === 'reports' && (
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">Released reports</h2>
              <p className="card-subtitle">Final results already visible to patients</p>
            </div>
          </div>
          <QueueState
            loading={queue.loading}
            error={queue.error}
            onRetry={queue.reload}
            empty={rowsFor(FINAL).length === 0}
            emptyTitle="No released reports yet"
            emptyDescription="Released results are listed here with their release date."
          >
            {renderTable(rowsFor(FINAL), (row) => (
              <span style={{ fontSize: '0.8rem', color: 'var(--slate-500)' }}>
                released {row.released_at ? new Date(row.released_at).toLocaleDateString() : '—'}
              </span>
            ))}
          </QueueState>
        </div>
      )}

      {resultFor && (
        <Modal isOpen title={`Result — ${resultFor.test_name}`} onClose={() => setResultFor(null)}>
          <p style={{ fontSize: '0.85rem', color: 'var(--slate-600)' }}>
            Patient: <strong>{resultFor.patient_name || resultFor.patient_ref}</strong>
          </p>
          <form onSubmit={submitResult}>
            {resultRows.map((row, index) => (
              <div key={index} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1.4fr 1fr', gap: '0.4rem', marginBottom: '0.4rem' }}>
                <input
                  className="form-control"
                  placeholder="Test / analyte"
                  value={row.name}
                  onChange={(event) => setResultRows((prev) => prev.map((r, i) => (i === index ? { ...r, name: event.target.value } : r)))}
                />
                <input
                  className="form-control"
                  placeholder="Value"
                  value={row.value}
                  onChange={(event) => setResultRows((prev) => prev.map((r, i) => (i === index ? { ...r, value: event.target.value } : r)))}
                />
                <input
                  className="form-control"
                  placeholder="Unit"
                  value={row.unit}
                  onChange={(event) => setResultRows((prev) => prev.map((r, i) => (i === index ? { ...r, unit: event.target.value } : r)))}
                />
                <input
                  className="form-control"
                  placeholder="Reference range"
                  value={row.reference_range}
                  onChange={(event) => setResultRows((prev) => prev.map((r, i) => (i === index ? { ...r, reference_range: event.target.value } : r)))}
                />
                <select
                  className="form-control"
                  value={row.flag}
                  onChange={(event) => setResultRows((prev) => prev.map((r, i) => (i === index ? { ...r, flag: event.target.value } : r)))}
                >
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="low">Low</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
            ))}
            <div style={{ display: 'flex', gap: '0.5rem', margin: '0.5rem 0' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setResultRows((prev) => [...prev, { name: '', value: '', unit: '', reference_range: '', flag: 'normal' }])}
              >
                Add analyte
              </button>
            </div>
            <label style={{ display: 'block' }}>
              Laboratory comment
              <textarea className="form-control" rows={2} value={comment} onChange={(event) => setComment(event.target.value)} />
            </label>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.75rem' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setResultFor(null)}>
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
