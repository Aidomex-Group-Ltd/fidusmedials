import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { patientPortalService } from '../../services/api';
import { StatusBadge } from '../../components/common/Badge';
import { StatCard } from '../../components/common/StatCard';
import { Modal } from '../../components/common/Modal';
import {
  Calendar,
  FileCheck,
  Receipt,
  FolderLock,
  Plus,
  Printer,
  AlertTriangle,
  Clock,
  CheckCircle,
  Shield,
  RefreshCw,
  User,
  Microscope,
  ScanLine,
} from 'lucide-react';

const DEPARTMENTS = [
  'General',
  'Medical Consultation',
  'Laboratory',
  'Radiology and Ultrasound',
  'Pharmacy',
  'Maternity',
  'Dental',
  'Paediatrics',
  'Physiotherapy',
];

const formatDateTime = (value) => {
  if (!value) return 'Not scheduled';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString();
};

const money = (amount, currency = 'UGX') =>
  `${currency} ${Number(amount || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const EmptyState = ({ icon: Icon, title, description, action }) => (
  <div className="portal-empty-cell" style={{ padding: '2.5rem 1rem', textAlign: 'center' }}>
    {Icon ? <Icon size={28} style={{ color: 'var(--slate-400)', marginBottom: '0.5rem' }} /> : null}
    <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{title}</p>
    <p style={{ color: 'var(--slate-500)', fontSize: '0.875rem' }}>{description}</p>
    {action}
  </div>
);

const Skeleton = ({ rows = 3 }) => (
  <div style={{ padding: '1rem' }} aria-busy="true" aria-label="Loading">
    {Array.from({ length: rows }).map((_, index) => (
      <div
        key={index}
        style={{
          height: 16,
          margin: '0.75rem 0',
          borderRadius: 6,
          background: 'linear-gradient(90deg, var(--slate-100), var(--slate-200), var(--slate-100))',
          width: `${90 - index * 12}%`,
        }}
      />
    ))}
  </div>
);

export const PatientPortal = ({ subTab = 'overview', setSubTab }) => {
  const { user } = useAuth();
  const toast = useToast();

  const currentTab = subTab || 'overview';
  const setCurrentTab = (tab) => setSubTab?.(tab);

  const [overview, setOverview] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [prescriptions, setPrescriptions] = useState([]);
  const [reports, setReports] = useState({ lab: [], imaging: [] });
  const [invoices, setInvoices] = useState({ items: [], outstanding: 0, currency: 'UGX' });
  const [profile, setProfile] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [appointmentFilter, setAppointmentFilter] = useState('all');

  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [booking, setBooking] = useState({
    department: 'General',
    scheduledAt: new Date().toISOString().slice(0, 10),
    time: '09:00',
    appointmentType: 'Consultation',
    reason: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const [selectedRx, setSelectedRx] = useState(null);
  const [selectedLab, setSelectedLab] = useState(null);
  const [selectedImaging, setSelectedImaging] = useState(null);
  const [selectedInvoice, setSelectedInvoice] = useState(null);

  const [profileForm, setProfileForm] = useState({
    preferred_name: '',
    phone: '',
    address: '',
    city: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    emergency_contact_relationship: '',
    insurance_provider: '',
    insurance_number: '',
  });
  const [changeRequest, setChangeRequest] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    const results = await Promise.allSettled([
      patientPortalService.overview(),
      patientPortalService.appointments({ filter: appointmentFilter }),
      patientPortalService.prescriptions(),
      patientPortalService.reports(),
      patientPortalService.invoices(),
      patientPortalService.profile(),
    ]);

    const [overviewRes, apptRes, rxRes, reportsRes, invoiceRes, profileRes] = results;
    const picked = results.filter((r) => r.status === 'fulfilled').length;
    if (picked === 0) {
      setError('We could not load your records. Please check your connection and retry.');
      setLoading(false);
      return;
    }

    if (overviewRes.status === 'fulfilled') setOverview(overviewRes.value?.data || null);
    if (apptRes.status === 'fulfilled') setAppointments(apptRes.value?.data?.items || []);
    if (rxRes.status === 'fulfilled') setPrescriptions(rxRes.value?.data?.items || []);
    if (reportsRes.status === 'fulfilled') {
      setReports({
        lab: reportsRes.value?.data?.lab || [],
        imaging: reportsRes.value?.data?.imaging || [],
      });
    }
    if (invoiceRes.status === 'fulfilled') {
      setInvoices({
        items: invoiceRes.value?.data?.items || [],
        outstanding: invoiceRes.value?.data?.outstanding || 0,
        currency: invoiceRes.value?.data?.currency || 'UGX',
      });
    }
    if (profileRes.status === 'fulfilled') {
      const data = profileRes.value?.data;
      setProfile(data);
      setProfileForm({
        preferred_name: data?.personal?.preferredName || '',
        phone: data?.personal?.phone || '',
        address: data?.personal?.address || '',
        city: data?.personal?.city || '',
        emergency_contact_name: data?.emergencyContact?.name || '',
        emergency_contact_phone: data?.emergencyContact?.phone || '',
        emergency_contact_relationship: data?.emergencyContact?.relationship || '',
        insurance_provider: data?.insurance?.provider || '',
        insurance_number: data?.insurance?.number || '',
      });
    }
    setLoading(false);
  }, [appointmentFilter]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Refresh when the patient returns to the tab: records change while the page
  // is open, and the portal must not depend on a hard reload to notice.
  useEffect(() => {
    const onFocus = () => loadAll();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [loadAll]);

  const patient = overview?.patient || {};
  const metrics = overview?.metrics || {};
  const health = overview?.health || {};
  const upcoming = useMemo(
    () => appointments.filter((a) => ['requested', 'confirmed', 'rescheduled', 'checked_in'].includes(a.status)),
    [appointments],
  );

  const submitBooking = async (event) => {
    event.preventDefault();
    if (!booking.reason.trim()) {
      toast.warning('Please describe the reason for your visit.');
      return;
    }
    try {
      setSubmitting(true);
      const res = await patientPortalService.requestAppointment(booking);
      toast.success(res?.message || 'Appointment requested.');
      setIsBookingOpen(false);
      setBooking((prev) => ({ ...prev, reason: '' }));
      await loadAll();
      setCurrentTab('appointments');
    } catch (err) {
      toast.error(err.message || 'Could not send your appointment request.');
    } finally {
      setSubmitting(false);
    }
  };

  const cancelAppointment = async (appointment) => {
    const reason = window.prompt('Please tell reception why you need to cancel (optional):') || '';
    try {
      const res = await patientPortalService.cancelAppointment({ id: appointment.id, reason });
      toast.success(res?.message || 'Cancellation request sent.');
      await loadAll();
    } catch (err) {
      toast.error(err.message || 'Could not request cancellation.');
    }
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    try {
      setSavingProfile(true);
      const payload = { ...profileForm };
      if (!payload.phone) delete payload.phone;
      const res = await patientPortalService.updateProfile(payload);
      toast.success(res?.message || 'Profile updated.');
      await loadAll();
    } catch (err) {
      toast.error(err.message || 'Could not save your profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  const submitClinicalChange = async () => {
    if (changeRequest.trim().length < 5) {
      toast.warning('Please describe the correction you need.');
      return;
    }
    try {
      setSavingProfile(true);
      const res = await patientPortalService.updateProfile({
        medical_history: [{ event: 'Patient correction request', date: new Date().toISOString().slice(0, 10), notes: changeRequest.trim() }],
      });
      toast.success(res?.message || 'Sent to your care team for review.');
      setChangeRequest('');
    } catch (err) {
      toast.error(err.message || 'Could not submit the correction.');
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <div>
      <section className="portal-hero">
        <div className="portal-hero-main">
          <div
            className="portal-hero-avatar"
            aria-hidden="true"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--primary-100)',
              color: 'var(--primary-700)',
              fontSize: '1.5rem',
              fontWeight: 700,
            }}
          >
            {(patient.preferredName || user?.name || 'P').slice(0, 1).toUpperCase()}
          </div>
          <div>
            <div className="portal-hero-meta">
              <span className="portal-status-pill">Patient</span>
              <span>
                Patient no. <strong>{patient.patientNumber || '—'}</strong>
              </span>
            </div>
            <h1 className="portal-hero-title">Welcome, {patient.preferredName || user?.name || 'there'}</h1>
            <p className="portal-hero-sub">
              {patient.facility || 'Fidus Medical Center'}
              {patient.bloodGroup ? ` • Blood group ${patient.bloodGroup}` : ''}
              {patient.dateOfBirth ? ` • Born ${formatDate(patient.dateOfBirth)}` : ''}
            </p>
          </div>
        </div>
        <div className="portal-hero-actions">
          <button className="btn btn-primary" onClick={() => setIsBookingOpen(true)}>
            <Calendar size={16} /> Request appointment
          </button>
          <button className="btn btn-secondary" onClick={loadAll} disabled={loading}>
            <RefreshCw size={16} /> {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </section>

      {error && (
        <div className="card" style={{ borderLeft: '4px solid var(--danger-500)' }}>
          <div className="card-header">
            <div>
              <h2 className="card-title">Records unavailable</h2>
              <p className="card-subtitle">{error}</p>
            </div>
            <button className="btn btn-primary btn-sm" onClick={loadAll}>
              <RefreshCw size={14} /> Retry
            </button>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Health overview                                                   */}
      {/* ---------------------------------------------------------------- */}
      {currentTab === 'overview' && (
        <div>
          <div className="stats-grid">
            <StatCard
              label="Upcoming visits"
              value={upcoming.length}
              subtext="Requested or confirmed appointments"
              icon={Calendar}
              color="teal"
            />
            <StatCard
              label="Active prescriptions"
              value={metrics.activePrescriptions || 0}
              subtext="Medication currently on file"
              icon={FileCheck}
              color="indigo"
            />
            <StatCard
              label="Outstanding balance"
              value={money(metrics.outstandingBalance, metrics.currency)}
              subtext={metrics.openInvoices ? `${metrics.openInvoices} open invoice(s)` : 'No open invoices'}
              icon={Receipt}
              color={metrics.outstandingBalance > 0 ? 'rose' : 'emerald'}
            />
            <StatCard
              label="Released reports"
              value={(metrics.labReports || 0) + (metrics.imagingReports || 0)}
              subtext="Laboratory and imaging reports"
              icon={FolderLock}
              color="blue"
            />
          </div>

          <div className="portal-two-col">
            <div className="card">
              <div className="card-header">
                <div>
                  <h2 className="card-title">Upcoming appointments</h2>
                  <p className="card-subtitle">Confirmed and requested visits</p>
                </div>
                <button className="btn btn-secondary btn-sm" onClick={() => setCurrentTab('appointments')}>
                  View all
                </button>
              </div>
              {loading ? (
                <Skeleton />
              ) : overview?.upcomingAppointments?.length ? (
                <div className="table-container">
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>When</th>
                        <th>Department</th>
                        <th>Clinician</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.upcomingAppointments.map((appt) => (
                        <tr key={appt.id}>
                          <td>{formatDateTime(appt.scheduled_at)}</td>
                          <td>{appt.department}</td>
                          <td>{appt.clinician_name || 'To be assigned'}</td>
                          <td>
                            <StatusBadge status={appt.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState
                  icon={Calendar}
                  title="No upcoming appointments"
                  description="When reception confirms a visit it will appear here."
                  action={
                    <button className="btn btn-primary btn-sm" style={{ marginTop: '0.75rem' }} onClick={() => setIsBookingOpen(true)}>
                      <Plus size={14} /> Request appointment
                    </button>
                  }
                />
              )}
            </div>

            <div className="card">
              <div className="card-header">
                <div>
                  <h2 className="card-title">Health information</h2>
                  <p className="card-subtitle">Recorded by your care team</p>
                </div>
              </div>
              {loading ? (
                <Skeleton rows={2} />
              ) : health.allergies?.length || health.conditions?.length ? (
                <div style={{ padding: '0 1rem 1rem' }}>
                  <h3 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--slate-500)' }}>Allergies</h3>
                  {health.allergies?.length ? (
                    <ul style={{ margin: '0.25rem 0 0.75rem 1rem' }}>
                      {health.allergies.map((allergy) => (
                        <li key={String(allergy)} style={{ color: 'var(--danger-600)' }}>
                          <AlertTriangle size={12} /> {String(allergy)}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p style={{ color: 'var(--slate-500)', fontSize: '0.85rem' }}>No allergies recorded.</p>
                  )}
                  <h3 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--slate-500)' }}>Conditions</h3>
                  {health.conditions?.length ? (
                    <ul style={{ margin: '0.25rem 0 0 1rem' }}>
                      {health.conditions.map((condition, index) => (
                        <li key={index}>{condition?.name || String(condition)}</li>
                      ))}
                    </ul>
                  ) : (
                    <p style={{ color: 'var(--slate-500)', fontSize: '0.85rem' }}>No conditions recorded.</p>
                  )}
                </div>
              ) : (
                <EmptyState
                  icon={Shield}
                  title="No clinical summary yet"
                  description="Allergies, conditions and care plans appear here once a clinician records them. This is not the same as having no conditions."
                />
              )}
            </div>
          </div>

          <div className="portal-two-col">
            <div className="card">
              <div className="card-header">
                <div>
                  <h2 className="card-title">Recent activity</h2>
                  <p className="card-subtitle">Everything that changed on your record</p>
                </div>
              </div>
              {loading ? (
                <Skeleton rows={4} />
              ) : overview?.activity?.length ? (
                <ul style={{ listStyle: 'none', padding: '0 1rem 1rem', margin: 0 }}>
                  {overview.activity.map((item) => (
                    <li key={item.id} style={{ display: 'flex', gap: '0.75rem', padding: '0.6rem 0', borderBottom: '1px solid var(--slate-100)' }}>
                      <Clock size={16} style={{ color: 'var(--primary-500)', marginTop: 2 }} />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{item.title}</div>
                        {item.body && <div style={{ fontSize: '0.8rem', color: 'var(--slate-600)' }}>{item.body}</div>}
                        <div style={{ fontSize: '0.75rem', color: 'var(--slate-500)' }}>
                          {formatDateTime(item.created_at)}
                          {item.actor_name ? ` • ${item.actor_name}` : ''}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState icon={Clock} title="No activity yet" description="Appointments, prescriptions and results will show up here." />
              )}
            </div>

            <div className="card">
              <div className="card-header">
                <div>
                  <h2 className="card-title">Recently released reports</h2>
                  <p className="card-subtitle">Verified and released by the facility</p>
                </div>
                <button className="btn btn-secondary btn-sm" onClick={() => setCurrentTab('reports')}>
                  View all
                </button>
              </div>
              {loading ? (
                <Skeleton rows={2} />
              ) : overview?.recentReports?.length ? (
                <div className="table-container">
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>Report</th>
                        <th>Type</th>
                        <th>Released</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.recentReports.map((report) => (
                        <tr key={report.id}>
                          <td>{report.title}</td>
                          <td>{report.kind === 'lab' ? 'Laboratory' : 'Imaging'}</td>
                          <td>{formatDate(report.available_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState icon={FolderLock} title="No released reports" description="Results appear here after a clinician releases them." />
              )}
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Appointments                                                      */}
      {/* ---------------------------------------------------------------- */}
      {currentTab === 'appointments' && (
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">My appointments</h2>
              <p className="card-subtitle">Requests, confirmations, reschedules and history</p>
            </div>
            <div className="portal-row-actions">
              <select
                className="form-control"
                value={appointmentFilter}
                onChange={(event) => setAppointmentFilter(event.target.value)}
                aria-label="Filter appointments"
              >
                <option value="all">All</option>
                <option value="upcoming">Upcoming</option>
                <option value="past">Past</option>
              </select>
              <button className="btn btn-primary" onClick={() => setIsBookingOpen(true)}>
                <Plus size={16} /> Request appointment
              </button>
            </div>
          </div>

          {loading ? (
            <Skeleton rows={5} />
          ) : appointments.length === 0 ? (
            <EmptyState
              icon={Calendar}
              title="No appointments yet"
              description="Request a visit and reception will confirm a time with you."
              action={
                <button className="btn btn-primary btn-sm" style={{ marginTop: '0.75rem' }} onClick={() => setIsBookingOpen(true)}>
                  Request appointment
                </button>
              }
            />
          ) : (
            <div className="table-container">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>When</th>
                    <th>Department</th>
                    <th>Clinician</th>
                    <th>Reason</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {appointments.map((appt) => (
                    <tr key={appt.id}>
                      <td>
                        <strong>{appt.reference}</strong>
                      </td>
                      <td>{formatDateTime(appt.scheduled_at)}</td>
                      <td>{appt.department}</td>
                      <td>{appt.clinician_name || 'To be assigned'}</td>
                      <td style={{ maxWidth: 220 }}>{appt.reason || '—'}</td>
                      <td>
                        <StatusBadge status={appt.status} />
                      </td>
                      <td>
                        {['requested', 'confirmed', 'rescheduled'].includes(appt.status) && (
                          <button className="btn btn-outline-primary btn-sm" onClick={() => cancelAppointment(appt)}>
                            Request cancellation
                          </button>
                        )}
                        {appt.instructions && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--slate-500)', marginTop: 4 }}>{appt.instructions}</div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Prescriptions                                                     */}
      {/* ---------------------------------------------------------------- */}
      {currentTab === 'prescriptions' && (
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">My prescriptions</h2>
              <p className="card-subtitle">Issued by your clinicians — instructions cannot be edited here</p>
            </div>
          </div>
          {loading ? (
            <Skeleton rows={4} />
          ) : prescriptions.length === 0 ? (
            <EmptyState icon={FileCheck} title="No prescriptions yet" description="Prescriptions issued by a clinician appear here automatically." />
          ) : (
            <div className="table-container">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>Medication</th>
                    <th>Dosage</th>
                    <th>Issued by</th>
                    <th>Date</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {prescriptions.map((rx) => (
                    <tr key={rx.id}>
                      <td>
                        <strong style={{ color: 'var(--primary-700)' }}>{rx.reference}</strong>
                      </td>
                      <td>
                        {rx.medication}
                        {rx.strength ? ` ${rx.strength}` : ''}
                      </td>
                      <td>{[rx.dosage, rx.frequency, rx.duration].filter(Boolean).join(' • ') || '—'}</td>
                      <td>{rx.clinician_name || '—'}</td>
                      <td>{formatDate(rx.created_at)}</td>
                      <td>
                        <StatusBadge status={rx.status} />
                      </td>
                      <td>
                        <button className="btn btn-outline-primary btn-sm" onClick={() => setSelectedRx(rx)}>
                          <Printer size={13} /> View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Lab reports and scans                                             */}
      {/* ---------------------------------------------------------------- */}
      {currentTab === 'reports' && (
        <div>
          <div className="card">
            <div className="card-header">
              <div>
                <h2 className="card-title">Laboratory results</h2>
                <p className="card-subtitle">Values appear only once a laboratory scientist releases them</p>
              </div>
            </div>
            {loading ? (
              <Skeleton rows={3} />
            ) : reports.lab.length === 0 ? (
              <EmptyState icon={Microscope} title="No laboratory reports yet" description="When your clinician requests a test it will be tracked here." />
            ) : (
              <div className="table-container">
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>Reference</th>
                      <th>Test</th>
                      <th>Requested</th>
                      <th>Status</th>
                      <th>Report</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reports.lab.map((report) => (
                      <tr key={report.id}>
                        <td>{report.reference}</td>
                        <td>{report.test_name}</td>
                        <td>{formatDate(report.requested_at)}</td>
                        <td>
                          <StatusBadge status={report.status} />
                          {!report.released && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--slate-500)', marginTop: 4 }}>{report.pendingReason}</div>
                          )}
                        </td>
                        <td>
                          <button
                            className="btn btn-outline-primary btn-sm"
                            onClick={() => setSelectedLab(report)}
                            disabled={!report.released}
                          >
                            {report.released ? 'View results' : 'Awaiting release'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-header">
              <div>
                <h2 className="card-title">Scans and imaging</h2>
                <p className="card-subtitle">Examination completion is not the same as a released report</p>
              </div>
            </div>
            {loading ? (
              <Skeleton rows={3} />
            ) : reports.imaging.length === 0 ? (
              <EmptyState icon={ScanLine} title="No imaging records yet" description="Requested scans and released reports will appear here." />
            ) : (
              <div className="table-container">
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>Reference</th>
                      <th>Examination</th>
                      <th>Requested</th>
                      <th>Status</th>
                      <th>Report</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reports.imaging.map((report) => (
                      <tr key={report.id}>
                        <td>{report.reference}</td>
                        <td>
                          {report.exam_name}
                          {report.modality ? ` (${report.modality})` : ''}
                        </td>
                        <td>{formatDate(report.requested_at)}</td>
                        <td>
                          <StatusBadge status={report.status} />
                          {!report.released && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--slate-500)', marginTop: 4 }}>{report.pendingReason}</div>
                          )}
                        </td>
                        <td>
                          <button
                            className="btn btn-outline-primary btn-sm"
                            onClick={() => setSelectedImaging(report)}
                            disabled={!report.released}
                          >
                            {report.released ? 'View report' : 'Awaiting release'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Invoices                                                          */}
      {/* ---------------------------------------------------------------- */}
      {currentTab === 'billing' && (
        <div>
          <div className="stats-grid">
            <StatCard label="Outstanding balance" value={money(invoices.outstanding, invoices.currency)} subtext="Across open invoices" icon={Receipt} color={invoices.outstanding > 0 ? 'rose' : 'emerald'} />
            <StatCard label="Invoices" value={invoices.items.length} subtext="All invoices on file" icon={FileCheck} color="indigo" />
            <StatCard
              label="Paid to date"
              value={money(invoices.items.reduce((sum, invoice) => sum + Number(invoice.amount_paid || 0), 0), invoices.currency)}
              subtext="Verified payments only"
              icon={CheckCircle}
              color="teal"
            />
          </div>

          <div className="card">
            <div className="card-header">
              <div>
                <h2 className="card-title">My invoices</h2>
                <p className="card-subtitle">Bills issued by the facility</p>
              </div>
            </div>
            {loading ? (
              <Skeleton rows={3} />
            ) : invoices.items.length === 0 ? (
              <EmptyState icon={Receipt} title="No invoices yet" description="Invoices issued by the billing desk appear here." />
            ) : (
              <div className="table-container">
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>Invoice</th>
                      <th>Issued</th>
                      <th>Service</th>
                      <th>Total</th>
                      <th>Paid</th>
                      <th>Balance</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.items.map((invoice) => (
                      <tr key={invoice.id}>
                        <td>
                          <strong>{invoice.number}</strong>
                        </td>
                        <td>{formatDate(invoice.issued_at)}</td>
                        <td>{invoice.service || 'Medical services'}</td>
                        <td>{money(invoice.total, invoice.currency)}</td>
                        <td>{money(invoice.amount_paid, invoice.currency)}</td>
                        <td>{money(invoice.outstanding, invoice.currency)}</td>
                        <td>
                          <StatusBadge status={invoice.status} />
                        </td>
                        <td>
                          <button className="btn btn-outline-primary btn-sm" onClick={() => setSelectedInvoice(invoice)}>
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Medical profile                                                   */}
      {/* ---------------------------------------------------------------- */}
      {currentTab === 'profile' && (
        <div className="portal-two-col">
          <div className="card">
            <div className="card-header">
              <div>
                <h2 className="card-title">Personal information</h2>
                <p className="card-subtitle">You can update these contact details</p>
              </div>
            </div>
            {loading ? (
              <Skeleton rows={4} />
            ) : (
              <form onSubmit={saveProfile} style={{ padding: '0 1rem 1rem', display: 'grid', gap: '0.75rem' }}>
                <label>
                  Full name
                  <input className="form-control" value={profile?.personal?.name || ''} disabled />
                </label>
                <label>
                  Patient number
                  <input className="form-control" value={profile?.personal?.patientNumber || ''} disabled />
                </label>
                <label>
                  Date of birth
                  <input className="form-control" value={formatDate(profile?.personal?.dateOfBirth)} disabled />
                </label>
                <label>
                  Preferred name
                  <input
                    className="form-control"
                    value={profileForm.preferred_name}
                    onChange={(event) => setProfileForm((prev) => ({ ...prev, preferred_name: event.target.value }))}
                  />
                </label>
                <label>
                  Phone
                  <input
                    className="form-control"
                    value={profileForm.phone}
                    onChange={(event) => setProfileForm((prev) => ({ ...prev, phone: event.target.value }))}
                  />
                </label>
                <label>
                  Address
                  <input
                    className="form-control"
                    value={profileForm.address}
                    onChange={(event) => setProfileForm((prev) => ({ ...prev, address: event.target.value }))}
                  />
                </label>
                <label>
                  City / district
                  <input
                    className="form-control"
                    value={profileForm.city}
                    onChange={(event) => setProfileForm((prev) => ({ ...prev, city: event.target.value }))}
                  />
                </label>
                <label>
                  Emergency contact name
                  <input
                    className="form-control"
                    value={profileForm.emergency_contact_name}
                    onChange={(event) => setProfileForm((prev) => ({ ...prev, emergency_contact_name: event.target.value }))}
                  />
                </label>
                <label>
                  Emergency contact phone
                  <input
                    className="form-control"
                    value={profileForm.emergency_contact_phone}
                    onChange={(event) => setProfileForm((prev) => ({ ...prev, emergency_contact_phone: event.target.value }))}
                  />
                </label>
                <label>
                  Insurance provider
                  <input
                    className="form-control"
                    value={profileForm.insurance_provider}
                    onChange={(event) => setProfileForm((prev) => ({ ...prev, insurance_provider: event.target.value }))}
                  />
                </label>
                <button type="submit" className="btn btn-primary" disabled={savingProfile}>
                  {savingProfile ? 'Saving…' : 'Save contact details'}
                </button>
              </form>
            )}
          </div>

          <div>
            <div className="card">
              <div className="card-header">
                <div>
                  <h2 className="card-title">Clinical record</h2>
                  <p className="card-subtitle">Maintained by your clinicians — read only</p>
                </div>
              </div>
              {loading ? (
                <Skeleton rows={3} />
              ) : (
                <div style={{ padding: '0 1rem 1rem' }}>
                  <h3 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--slate-500)' }}>Allergies</h3>
                  <p style={{ fontSize: '0.9rem' }}>
                    {profile?.clinical?.allergies?.length ? profile.clinical.allergies.join(', ') : 'None recorded'}
                  </p>
                  <h3 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--slate-500)' }}>Conditions</h3>
                  <p style={{ fontSize: '0.9rem' }}>
                    {profile?.clinical?.conditions?.length
                      ? profile.clinical.conditions.map((condition) => condition?.name || String(condition)).join(', ')
                      : 'None recorded'}
                  </p>
                  <h3 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--slate-500)' }}>Care plan</h3>
                  <p style={{ fontSize: '0.9rem' }}>{profile?.clinical?.carePlan || 'No care plan on file.'}</p>

                  <label style={{ display: 'block', marginTop: '1rem' }}>
                    Request a correction
                    <textarea
                      className="form-control"
                      rows={3}
                      value={changeRequest}
                      placeholder="Describe anything in your clinical record that needs correcting."
                      onChange={(event) => setChangeRequest(event.target.value)}
                    />
                  </label>
                  <button className="btn btn-secondary btn-sm" onClick={submitClinicalChange} disabled={savingProfile}>
                    Send for review
                  </button>
                  <p style={{ fontSize: '0.75rem', color: 'var(--slate-500)', marginTop: '0.5rem' }}>
                    Clinical records are reviewed by your care team; your request will not change the record directly.
                  </p>
                </div>
              )}
            </div>

            <div className="card">
              <div className="card-header">
                <div>
                  <h2 className="card-title">Consultation history</h2>
                  <p className="card-subtitle">Summaries written by your clinicians</p>
                </div>
              </div>
              {loading ? (
                <Skeleton rows={2} />
              ) : profile?.consultations?.length ? (
                <ul style={{ listStyle: 'none', padding: '0 1rem 1rem', margin: 0 }}>
                  {profile.consultations.map((consultation) => (
                    <li key={consultation.id} style={{ padding: '0.6rem 0', borderBottom: '1px solid var(--slate-100)' }}>
                      <div style={{ fontWeight: 600 }}>
                        {formatDate(consultation.created_at)} • {consultation.clinician_name || 'Clinician'}
                      </div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--slate-600)' }}>{consultation.diagnosis || 'No diagnosis recorded'}</div>
                      {consultation.treatment_plan && (
                        <div style={{ fontSize: '0.8rem', color: 'var(--slate-500)' }}>{consultation.treatment_plan}</div>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState icon={User} title="No consultations yet" description="Consultation summaries appear after a clinician completes a visit." />
              )}
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Modals                                                            */}
      {/* ---------------------------------------------------------------- */}
      {isBookingOpen && (
        <Modal isOpen title="Request an appointment" onClose={() => setIsBookingOpen(false)}>
          <form onSubmit={submitBooking} style={{ display: 'grid', gap: '0.75rem' }}>
            <label>
              Department
              <select
                className="form-control"
                value={booking.department}
                onChange={(event) => setBooking((prev) => ({ ...prev, department: event.target.value }))}
              >
                {DEPARTMENTS.map((department) => (
                  <option key={department} value={department}>
                    {department}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Visit type
              <select
                className="form-control"
                value={booking.appointmentType}
                onChange={(event) => setBooking((prev) => ({ ...prev, appointmentType: event.target.value }))}
              >
                {['Consultation', 'Follow-up', 'Review', 'Vaccination', 'Antenatal'].map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Preferred date
              <input
                type="date"
                className="form-control"
                min={new Date().toISOString().slice(0, 10)}
                value={booking.scheduledAt}
                onChange={(event) => setBooking((prev) => ({ ...prev, scheduledAt: event.target.value }))}
              />
            </label>
            <label>
              Preferred time
              <input
                type="time"
                className="form-control"
                value={booking.time}
                onChange={(event) => setBooking((prev) => ({ ...prev, time: event.target.value }))}
              />
            </label>
            <label>
              Reason for visit
              <textarea
                className="form-control"
                rows={3}
                value={booking.reason}
                onChange={(event) => setBooking((prev) => ({ ...prev, reason: event.target.value }))}
                placeholder="Briefly describe your symptoms or reason for the visit."
              />
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setIsBookingOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? 'Sending…' : 'Send request'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {selectedRx && (
        <Modal isOpen title={`Prescription ${selectedRx.reference}`} onClose={() => setSelectedRx(null)}>
          <dl style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '0.4rem 1rem' }}>
            <dt>Medication</dt>
            <dd>
              {selectedRx.medication} {selectedRx.strength || ''}
            </dd>
            <dt>Dosage</dt>
            <dd>{selectedRx.dosage || '—'}</dd>
            <dt>Route</dt>
            <dd>{selectedRx.route || '—'}</dd>
            <dt>Frequency</dt>
            <dd>{selectedRx.frequency || '—'}</dd>
            <dt>Duration</dt>
            <dd>{selectedRx.duration || '—'}</dd>
            <dt>Quantity</dt>
            <dd>{selectedRx.quantity || '—'}</dd>
            <dt>Instructions</dt>
            <dd>{selectedRx.instructions || '—'}</dd>
            <dt>Prescribed by</dt>
            <dd>{selectedRx.clinician_name || '—'}</dd>
            <dt>Status</dt>
            <dd>
              <StatusBadge status={selectedRx.status} />
            </dd>
            <dt>Dispensed</dt>
            <dd>{selectedRx.dispensed_at ? formatDateTime(selectedRx.dispensed_at) : 'Not yet dispensed'}</dd>
          </dl>
          <p style={{ fontSize: '0.75rem', color: 'var(--slate-500)', marginTop: '1rem' }}>
            Prescription instructions are written by your clinician and cannot be changed in this portal.
          </p>
        </Modal>
      )}

      {selectedLab && (
        <Modal isOpen title={`Laboratory report ${selectedLab.reference}`} onClose={() => setSelectedLab(null)}>
          <p style={{ marginBottom: '0.75rem' }}>
            <strong>{selectedLab.test_name}</strong> • released {formatDateTime(selectedLab.released_at)}
          </p>
          {selectedLab.results?.length ? (
            <div className="table-container">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Test</th>
                    <th>Result</th>
                    <th>Unit</th>
                    <th>Reference range</th>
                    <th>Flag</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedLab.results.map((result, index) => (
                    <tr key={index}>
                      <td>{result.name}</td>
                      <td>{result.value}</td>
                      <td>{result.unit || '—'}</td>
                      <td>{result.reference_range || '—'}</td>
                      <td>{result.flag || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>No structured values were attached to this report. Please contact the laboratory for a printed copy.</p>
          )}
          {selectedLab.comments && <p style={{ marginTop: '0.75rem' }}>{selectedLab.comments}</p>}
        </Modal>
      )}

      {selectedImaging && (
        <Modal isOpen title={`Imaging report ${selectedImaging.reference}`} onClose={() => setSelectedImaging(null)}>
          <p style={{ marginBottom: '0.75rem' }}>
            <strong>{selectedImaging.exam_name}</strong>
            {selectedImaging.modality ? ` (${selectedImaging.modality})` : ''} • released {formatDateTime(selectedImaging.released_at)}
          </p>
          <h3 style={{ fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--slate-500)' }}>Findings</h3>
          <p style={{ whiteSpace: 'pre-wrap' }}>{selectedImaging.findings || 'Not recorded.'}</p>
          <h3 style={{ fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--slate-500)' }}>Impression</h3>
          <p style={{ whiteSpace: 'pre-wrap' }}>{selectedImaging.impression || 'Not recorded.'}</p>
          <p style={{ fontSize: '0.8rem', color: 'var(--slate-500)' }}>
            Reported by {selectedImaging.radiologist || 'the radiology team'}.
          </p>
        </Modal>
      )}

      {selectedInvoice && (
        <Modal isOpen title={`Invoice ${selectedInvoice.number}`} onClose={() => setSelectedInvoice(null)}>
          <p style={{ marginBottom: '0.75rem' }}>
            Issued {formatDate(selectedInvoice.issued_at)} • <StatusBadge status={selectedInvoice.status} />
          </p>
          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Qty</th>
                  <th>Unit price</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {(selectedInvoice.items || []).map((item, index) => (
                  <tr key={index}>
                    <td>{item.description}</td>
                    <td>{item.quantity}</td>
                    <td>{money(item.unit_price, selectedInvoice.currency)}</td>
                    <td>{money(item.amount, selectedInvoice.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.3rem 1rem', marginTop: '0.75rem' }}>
            <dt>Subtotal</dt>
            <dd>{money(selectedInvoice.subtotal, selectedInvoice.currency)}</dd>
            <dt>Discount</dt>
            <dd>{money(selectedInvoice.discount, selectedInvoice.currency)}</dd>
            <dt>Tax</dt>
            <dd>{money(selectedInvoice.tax, selectedInvoice.currency)}</dd>
            <dt>
              <strong>Total</strong>
            </dt>
            <dd>
              <strong>{money(selectedInvoice.total, selectedInvoice.currency)}</strong>
            </dd>
            <dt>Paid</dt>
            <dd>{money(selectedInvoice.amount_paid, selectedInvoice.currency)}</dd>
            <dt>Balance</dt>
            <dd>{money(selectedInvoice.outstanding, selectedInvoice.currency)}</dd>
          </dl>
          {selectedInvoice.payments?.length ? (
            <>
              <h3 style={{ fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--slate-500)', marginTop: '1rem' }}>Payments</h3>
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {selectedInvoice.payments.map((payment) => (
                  <li key={payment.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <span>{formatDate(payment.created_at)} • {payment.method || 'payment'}</span>
                    <span>
                      {money(payment.amount, payment.currency)} • {payment.status}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </Modal>
      )}
    </div>
  );
};

export default PatientPortal;
