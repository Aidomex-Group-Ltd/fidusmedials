import React, { useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { dashboardService, workflowService } from '../../services/api';
import { StatCard } from '../common/StatCard';
import { Modal } from '../common/Modal';
import { PatientPicker, QueueState, useAsync, useQueue } from './StaffWorkflow';
import { Calendar, Clock, Plus, FileText, Pill } from 'lucide-react';

/**
 * Shared clinical workspace for the doctor, clinician, nurse and midwife
 * portals. One implementation, different labels and permissions — the backend
 * still enforces what each role may do.
 */

// Sidebar tabs differ per role; map anything clinical onto a real section.
const TAB_ALIASES = {
  overview: 'overview',
  appointments: 'appointments',
  patients: 'patients',
  consultations: 'consultations',
  records: 'consultations',
  diagnoses: 'consultations',
  referrals: 'consultations',
  prescriptions: 'prescriptions',
  scans: 'appointments',
  vitals: 'appointments',
  antenatal: 'appointments',
  deliveries: 'appointments',
  postnatal: 'appointments',
};

const SECTION_LABELS = {
  appointments: 'Appointments',
  patients: 'Patients',
  consultations: 'Consultations',
  prescriptions: 'Prescriptions',
};

const ACTIVE_STATUSES = ['requested', 'confirmed', 'rescheduled', 'checked_in'];

export const ClinicalWorkspace = ({ subTab = 'overview', setSubTab, roleLabel, subtitle }) => {
  const { user } = useAuth();
  const toast = useToast();
  const section = TAB_ALIASES[subTab] || 'overview';

  const appointments = useQueue('appointments');
  const consultations = useQueue('consultations');
  const prescriptions = useQueue('prescriptions');
  const stats = useAsync(() => dashboardService.getStats(), []);

  const counts = stats.data?.data?.counts || {};

  const [consultFor, setConsultFor] = useState(null);
  const [consultForm, setConsultForm] = useState({ diagnosis: '', clinicalNotes: '', treatmentPlan: '', followUpRequired: false, followUpNotes: '' });
  const [rxOpen, setRxOpen] = useState(false);
  const [rxPatient, setRxPatient] = useState(null);
  const [rxForm, setRxForm] = useState({ medication: '', strength: '', dosage: '', route: 'Oral', frequency: '', duration: '', quantity: '', instructions: '' });
  const [labOpen, setLabOpen] = useState(false);
  const [labPatient, setLabPatient] = useState(null);
  const [labTests, setLabTests] = useState('');
  const [imgOpen, setImgOpen] = useState(false);
  const [imgPatient, setImgPatient] = useState(null);
  const [imgForm, setImgForm] = useState({ examName: '', modality: 'X-Ray' });
  const [busy, setBusy] = useState(false);

  const todaysAppointments = useMemo(
    () => appointments.items.filter((item) => new Date(item.scheduled_at || item.created_at).toDateString() === new Date().toDateString()),
    [appointments.items],
  );
  const openAppointments = appointments.items.filter((item) => ACTIVE_STATUSES.includes(item.status));

  const setAppointmentStatus = async (row, status) => {
    try {
      setBusy(true);
      await workflowService.updateAppointmentStatus({ id: row.id, status });
      toast.success(`${row.reference}: ${status.replace(/_/g, ' ')}`);
      await appointments.reload();
      await stats.reload();
    } catch (err) {
      toast.error(err.message || 'Could not update the appointment.');
    } finally {
      setBusy(false);
    }
  };

  const submitConsultation = async (event) => {
    event.preventDefault();
    if (!consultFor) return;
    if (!consultForm.diagnosis.trim()) {
      toast.warning('A diagnosis or working impression is required.');
      return;
    }
    try {
      setBusy(true);
      await workflowService.createConsultation({
        patientUserId: consultFor.patient_user_id,
        appointmentId: consultFor.id,
        diagnosis: consultForm.diagnosis,
        clinicalNotes: consultForm.clinicalNotes,
        treatmentPlan: consultForm.treatmentPlan,
        followUpRequired: consultForm.followUpRequired,
        followUpNotes: consultForm.followUpNotes,
      });
      toast.success('Consultation recorded — the patient can see the summary.');
      setConsultFor(null);
      setConsultForm({ diagnosis: '', clinicalNotes: '', treatmentPlan: '', followUpRequired: false, followUpNotes: '' });
      await appointments.reload();
      await consultations.reload();
      await stats.reload();
    } catch (err) {
      toast.error(err.message || 'Could not record the consultation.');
    } finally {
      setBusy(false);
    }
  };

  const issuePrescription = async (event) => {
    event.preventDefault();
    if (!rxPatient) {
      toast.warning('Select the patient first.');
      return;
    }
    if (!rxForm.medication.trim()) {
      toast.warning('Enter the medication name.');
      return;
    }
    try {
      setBusy(true);
      await workflowService.createPrescription({ patientUserId: rxPatient.id, ...rxForm });
      toast.success('Prescription issued — visible in the patient portal now.');
      setRxOpen(false);
      setRxPatient(null);
      setRxForm({ medication: '', strength: '', dosage: '', route: 'Oral', frequency: '', duration: '', quantity: '', instructions: '' });
      await prescriptions.reload();
      await stats.reload();
    } catch (err) {
      toast.error(err.message || 'Could not issue the prescription.');
    } finally {
      setBusy(false);
    }
  };

  const orderLabs = async (event) => {
    event.preventDefault();
    if (!labPatient) {
      toast.warning('Select the patient first.');
      return;
    }
    const tests = labTests.split(',').map((t) => t.trim()).filter(Boolean);
    if (!tests.length) {
      toast.warning('List at least one test.');
      return;
    }
    try {
      setBusy(true);
      await workflowService.createLabRequest({ patientUserId: labPatient.id, tests, requestingClinician: user?.name });
      toast.success('Laboratory request sent to the laboratory queue.');
      setLabOpen(false);
      setLabPatient(null);
      setLabTests('');
    } catch (err) {
      toast.error(err.message || 'Could not create the laboratory request.');
    } finally {
      setBusy(false);
    }
  };

  const orderImaging = async (event) => {
    event.preventDefault();
    if (!imgPatient) {
      toast.warning('Select the patient first.');
      return;
    }
    if (!imgForm.examName.trim()) {
      toast.warning('Enter the examination name.');
      return;
    }
    try {
      setBusy(true);
      await workflowService.createRadiologyRequest({ patientUserId: imgPatient.id, ...imgForm, requestingClinician: user?.name });
      toast.success('Imaging request sent to radiology.');
      setImgOpen(false);
      setImgPatient(null);
      setImgForm({ examName: '', modality: 'X-Ray' });
    } catch (err) {
      toast.error(err.message || 'Could not create the imaging request.');
    } finally {
      setBusy(false);
    }
  };

  const appointmentTable = (rows, actions) => (
    <div className="table-container">
      <table className="custom-table">
        <thead>
          <tr>
            <th>When</th>
            <th>Patient</th>
            <th>Department</th>
            <th>Reason</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.scheduled_at ? new Date(row.scheduled_at).toLocaleString() : 'Unscheduled'}</td>
              <td>
                {row.patient_name || 'Patient'}
                <div style={{ fontSize: '0.75rem', color: 'var(--slate-500)' }}>{row.patient_number || row.patient_ref}</div>
              </td>
              <td>{row.department}</td>
              <td style={{ maxWidth: 200 }}>{row.reason || '—'}</td>
              <td>{row.status.replace(/_/g, ' ')}</td>
              <td>{actions(row)}</td>
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
            {(user?.name || roleLabel || 'C').slice(0, 1).toUpperCase()}
          </div>
          <div>
            <div className="portal-hero-meta">
              <span className="portal-status-pill">{roleLabel || user?.role}</span>
              <span>{user?.department || 'General'}</span>
            </div>
            <h1 className="portal-hero-title">{user?.name || roleLabel}</h1>
            <p className="portal-hero-sub">{subtitle || 'Clinical workspace'}</p>
          </div>
        </div>
        <div className="portal-hero-actions">
          <button
            className="btn btn-primary"
            onClick={() => {
              setRxOpen(true);
              setRxPatient(null);
            }}
          >
            <Pill size={16} /> New prescription
          </button>
          <button className="btn btn-secondary" onClick={() => { appointments.reload(); consultations.reload(); prescriptions.reload(); stats.reload(); }}>
            Refresh
          </button>
        </div>
      </section>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.5rem' }}>
        {Object.entries(SECTION_LABELS).map(([id, label]) => (
          <button
            key={id}
            className={`portal-chip ${section === id ? 'is-selected' : ''}`}
            style={section === id ? { background: 'var(--primary-600)', color: '#fff', borderColor: 'var(--primary-600)' } : {}}
            onClick={() => setSubTab?.(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {section === 'overview' && (
        <>
          <div className="stats-grid">
            <StatCard label="Appointments today" value={todaysAppointments.length} subtext="In my scope" icon={Calendar} color="teal" />
            <StatCard label="Open appointments" value={openAppointments.length} subtext="Requested, confirmed or checked in" icon={Clock} color="amber" />
            <StatCard label="Consultations today" value={counts.consultationsToday ?? '—'} subtext="Facility-wide" icon={FileText} color="indigo" />
            <StatCard label="Pending prescriptions" value={counts.pendingPrescriptions ?? '—'} subtext="Awaiting pharmacy" icon={Pill} color="emerald" />
          </div>

          <div className="card">
            <div className="card-header">
              <div>
                <h2 className="card-title">Today's schedule</h2>
                <p className="card-subtitle">Real appointments for today, scoped to your role</p>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => setSubTab?.('appointments')}>
                All appointments
              </button>
            </div>
            <QueueState
              loading={appointments.loading}
              error={appointments.error}
              onRetry={appointments.reload}
              empty={todaysAppointments.length === 0}
              emptyTitle="Nothing scheduled today"
              emptyDescription="Reception bookings for today will appear here."
            >
              {appointmentTable(todaysAppointments, (row) => (
                <button className="btn btn-primary btn-sm" onClick={() => setConsultFor(row)}>
                  Record consultation
                </button>
              ))}
            </QueueState>
          </div>
        </>
      )}

      {section === 'appointments' && (
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">Appointments</h2>
              <p className="card-subtitle">Confirm, check in, complete or cancel — the patient is notified of each change</p>
            </div>
          </div>
          <QueueState
            loading={appointments.loading}
            error={appointments.error}
            onRetry={appointments.reload}
            empty={appointments.items.length === 0}
            emptyTitle="No appointments in your scope"
            emptyDescription="Reception bookings appear here as soon as they are created."
          >
            {appointmentTable(appointments.items, (row) => (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {row.status === 'requested' && (
                  <button className="btn btn-outline-primary btn-sm" disabled={busy} onClick={() => setAppointmentStatus(row, 'confirmed')}>
                    Confirm
                  </button>
                )}
                {['confirmed', 'rescheduled'].includes(row.status) && (
                  <button className="btn btn-outline-primary btn-sm" disabled={busy} onClick={() => setAppointmentStatus(row, 'checked_in')}>
                    Check in
                  </button>
                )}
                {ACTIVE_STATUSES.includes(row.status) && (
                  <button className="btn btn-primary btn-sm" onClick={() => setConsultFor(row)}>
                    Consult
                  </button>
                )}
                {ACTIVE_STATUSES.includes(row.status) && (
                  <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setAppointmentStatus(row, 'cancelled')}>
                    Cancel
                  </button>
                )}
              </div>
            ))}
          </QueueState>
        </div>
      )}

      {section === 'patients' && (
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">Patient actions</h2>
              <p className="card-subtitle">Find a registered patient, then prescribe or order investigations</p>
            </div>
          </div>
          <div style={{ padding: '1rem', display: 'grid', gap: '1rem', maxWidth: 520 }}>
            <PatientPicker selected={null} onSelect={(patient) => {
              setRxPatient(patient);
              setLabPatient(patient);
              setImgPatient(patient);
              toast.success(`${patient.name} selected.`);
            }} label="Search the patient directory" />
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button className="btn btn-primary btn-sm" onClick={() => setRxOpen(true)}>
                <Pill size={14} /> Prescribe
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setLabOpen(true)}>
                <Plus size={14} /> Order laboratory test
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setImgOpen(true)}>
                <Plus size={14} /> Order imaging
              </button>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--slate-500)' }}>
              Records can only be created for a registered patient — select one above to enable the actions.
            </p>
          </div>
        </div>
      )}

      {section === 'consultations' && (
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">Consultation records</h2>
              <p className="card-subtitle">Summaries written by your team, visible to the patient</p>
            </div>
          </div>
          <QueueState
            loading={consultations.loading}
            error={consultations.error}
            onRetry={consultations.reload}
            empty={consultations.items.length === 0}
            emptyTitle="No consultations recorded"
            emptyDescription="Complete a visit from the appointments queue to create one."
          >
            <div className="table-container">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Patient</th>
                    <th>Clinician</th>
                    <th>Diagnosis</th>
                    <th>Follow-up</th>
                  </tr>
                </thead>
                <tbody>
                  {consultations.items.map((row) => (
                    <tr key={row.id}>
                      <td>{new Date(row.created_at).toLocaleDateString()}</td>
                      <td>{row.patient_name || row.patient_ref || 'Patient'}</td>
                      <td>{row.clinician_name || '—'}</td>
                      <td style={{ maxWidth: 240 }}>{row.diagnosis || '—'}</td>
                      <td>{row.follow_up_required ? row.follow_up_notes || 'Required' : 'No'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </QueueState>
        </div>
      )}

      {section === 'prescriptions' && (
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">Prescriptions</h2>
              <p className="card-subtitle">Issued prescriptions and their dispensing status</p>
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => setRxOpen(true)}>
              <Plus size={14} /> New prescription
            </button>
          </div>
          <QueueState
            loading={prescriptions.loading}
            error={prescriptions.error}
            onRetry={prescriptions.reload}
            empty={prescriptions.items.length === 0}
            emptyTitle="No prescriptions issued"
            emptyDescription="Prescriptions you issue appear here and in the patient's portal."
          >
            <div className="table-container">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>Patient</th>
                    <th>Medication</th>
                    <th>Directions</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {prescriptions.items.map((row) => (
                    <tr key={row.id}>
                      <td>{row.reference}</td>
                      <td>{row.patient_name || row.patient_ref || 'Patient'}</td>
                      <td>
                        {row.medication} {row.strength || ''}
                      </td>
                      <td>{[row.dosage, row.frequency, row.duration].filter(Boolean).join(' • ') || '—'}</td>
                      <td>{row.status.replace(/_/g, ' ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </QueueState>
        </div>
      )}

      {consultFor && (
        <Modal isOpen title={`Consultation — ${consultFor.patient_name || 'Patient'}`} onClose={() => setConsultFor(null)}>
          <form onSubmit={submitConsultation}>
            <label style={{ display: 'block' }}>
              Diagnosis / impression
              <input className="form-control" value={consultForm.diagnosis} onChange={(event) => setConsultForm((prev) => ({ ...prev, diagnosis: event.target.value }))} />
            </label>
            <label style={{ display: 'block', marginTop: '0.5rem' }}>
              Clinical notes
              <textarea className="form-control" rows={3} value={consultForm.clinicalNotes} onChange={(event) => setConsultForm((prev) => ({ ...prev, clinicalNotes: event.target.value }))} />
            </label>
            <label style={{ display: 'block', marginTop: '0.5rem' }}>
              Treatment plan
              <textarea className="form-control" rows={2} value={consultForm.treatmentPlan} onChange={(event) => setConsultForm((prev) => ({ ...prev, treatmentPlan: event.target.value }))} />
            </label>
            <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.5rem' }}>
              <input
                type="checkbox"
                checked={consultForm.followUpRequired}
                onChange={(event) => setConsultForm((prev) => ({ ...prev, followUpRequired: event.target.checked }))}
              />
              Follow-up required
            </label>
            {consultForm.followUpRequired && (
              <input
                className="form-control"
                placeholder="Follow-up instructions"
                value={consultForm.followUpNotes}
                onChange={(event) => setConsultForm((prev) => ({ ...prev, followUpNotes: event.target.value }))}
              />
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setConsultFor(null)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? 'Saving…' : 'Complete consultation'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {rxOpen && (
        <Modal isOpen title="Issue a prescription" onClose={() => setRxOpen(false)}>
          <form onSubmit={issuePrescription}>
            <PatientPicker selected={rxPatient} onSelect={setRxPatient} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.75rem' }}>
              <label>
                Medication
                <input className="form-control" value={rxForm.medication} onChange={(event) => setRxForm((prev) => ({ ...prev, medication: event.target.value }))} />
              </label>
              <label>
                Strength
                <input className="form-control" value={rxForm.strength} onChange={(event) => setRxForm((prev) => ({ ...prev, strength: event.target.value }))} placeholder="500mg" />
              </label>
              <label>
                Dosage
                <input className="form-control" value={rxForm.dosage} onChange={(event) => setRxForm((prev) => ({ ...prev, dosage: event.target.value }))} placeholder="1 capsule" />
              </label>
              <label>
                Route
                <select className="form-control" value={rxForm.route} onChange={(event) => setRxForm((prev) => ({ ...prev, route: event.target.value }))}>
                  {['Oral', 'IV', 'IM', 'Topical', 'Inhaled', 'Rectal', 'Subcutaneous'].map((route) => (
                    <option key={route} value={route}>
                      {route}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Frequency
                <input className="form-control" value={rxForm.frequency} onChange={(event) => setRxForm((prev) => ({ ...prev, frequency: event.target.value }))} placeholder="3x daily" />
              </label>
              <label>
                Duration
                <input className="form-control" value={rxForm.duration} onChange={(event) => setRxForm((prev) => ({ ...prev, duration: event.target.value }))} placeholder="7 days" />
              </label>
              <label>
                Quantity
                <input className="form-control" value={rxForm.quantity} onChange={(event) => setRxForm((prev) => ({ ...prev, quantity: event.target.value }))} placeholder="21 capsules" />
              </label>
            </div>
            <label style={{ display: 'block', marginTop: '0.5rem' }}>
              Instructions
              <textarea className="form-control" rows={2} value={rxForm.instructions} onChange={(event) => setRxForm((prev) => ({ ...prev, instructions: event.target.value }))} />
            </label>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setRxOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                Issue prescription
              </button>
            </div>
          </form>
        </Modal>
      )}

      {labOpen && (
        <Modal isOpen title="Order laboratory tests" onClose={() => setLabOpen(false)}>
          <form onSubmit={orderLabs}>
            <PatientPicker selected={labPatient} onSelect={setLabPatient} />
            <label style={{ display: 'block', marginTop: '0.75rem' }}>
              Tests (comma separated)
              <input className="form-control" value={labTests} onChange={(event) => setLabTests(event.target.value)} placeholder="Full blood count, Malaria parasite" />
            </label>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setLabOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                Send to laboratory
              </button>
            </div>
          </form>
        </Modal>
      )}

      {imgOpen && (
        <Modal isOpen title="Order imaging" onClose={() => setImgOpen(false)}>
          <form onSubmit={orderImaging}>
            <PatientPicker selected={imgPatient} onSelect={setImgPatient} />
            <label style={{ display: 'block', marginTop: '0.75rem' }}>
              Examination
              <input className="form-control" value={imgForm.examName} onChange={(event) => setImgForm((prev) => ({ ...prev, examName: event.target.value }))} placeholder="Chest X-Ray" />
            </label>
            <label style={{ display: 'block', marginTop: '0.5rem' }}>
              Modality
              <select className="form-control" value={imgForm.modality} onChange={(event) => setImgForm((prev) => ({ ...prev, modality: event.target.value }))}>
                {['X-Ray', 'Ultrasound', 'CT', 'MRI', 'Mammography', 'Fluoroscopy'].map((modality) => (
                  <option key={modality} value={modality}>
                    {modality}
                  </option>
                ))}
              </select>
            </label>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setImgOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                Send to radiology
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

export default ClinicalWorkspace;
