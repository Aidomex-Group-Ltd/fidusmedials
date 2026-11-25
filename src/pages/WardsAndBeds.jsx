import React, { useEffect, useMemo, useState } from 'react';
import { useToast } from '../context/ToastContext';
import { bedService, workflowService } from '../services/api';
import { StatusBadge } from '../components/common/Badge';
import { StatCard } from '../components/common/StatCard';
import { Modal } from '../components/common/Modal';
import { BedDouble, CheckCircle2, Activity, Clock, RefreshCw, UserCheck, Stethoscope } from 'lucide-react';

const WARDS = ['ICU', 'Emergency Room', 'General Ward', 'Private Deluxe'];

const money = (amount, currency = 'UGX') =>
  `${currency} ${Number(amount || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

/**
 * Inpatient wards and beds.
 *
 * Every value on this page comes from /api/beds. Admissions require a
 * registered patient account, and a discharge closes the open bed_admissions
 * row rather than overwriting the stay.
 */
export const WardsAndBeds = () => {
  const toast = useToast();
  const [beds, setBeds] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [wardFilter, setWardFilter] = useState('');
  const [selectedBed, setSelectedBed] = useState(null);
  const [patients, setPatients] = useState([]);
  const [patientId, setPatientId] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const [bedRes, statRes] = await Promise.all([bedService.getAll(), bedService.getStats()]);
      setBeds(bedRes?.data?.items || []);
      setStats(statRes?.data || null);
    } catch (err) {
      toast.error(err.message || 'Failed to load beds.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openAdmission = async (bed) => {
    setSelectedBed(bed);
    setPatientId('');
    setNotes('');
    if (!patients.length) {
      try {
        const res = await workflowService.listPatients();
        setPatients(res?.data?.items || []);
      } catch (err) {
        toast.error(err.message || 'Could not load the patient directory.');
      }
    }
  };

  const admit = async (event) => {
    event.preventDefault();
    if (!patientId) {
      toast.warning('Select the registered patient being admitted.');
      return;
    }
    try {
      setBusy(true);
      await bedService.allocate({ bedId: selectedBed.id, patientUserId: patientId, notes });
      toast.success(`Patient admitted to ${selectedBed.bedNumber}.`);
      setSelectedBed(null);
      await load();
    } catch (err) {
      toast.error(err.message || 'Could not admit the patient.');
    } finally {
      setBusy(false);
    }
  };

  const discharge = async (bed) => {
    if (!window.confirm(`Discharge ${bed.patient?.name || 'this patient'} from ${bed.bedNumber}?`)) return;
    try {
      setBusy(true);
      await bedService.discharge({ bedId: bed.id });
      toast.success(`${bed.bedNumber} released and queued for cleaning.`);
      await load();
    } catch (err) {
      toast.error(err.message || 'Could not discharge the patient.');
    } finally {
      setBusy(false);
    }
  };

  const visibleBeds = useMemo(
    () => (wardFilter ? beds.filter((bed) => bed.wardType === wardFilter) : beds),
    [beds, wardFilter],
  );

  const grouped = useMemo(() => {
    const acc = {};
    for (const bed of visibleBeds) {
      if (!acc[bed.wardType]) acc[bed.wardType] = [];
      acc[bed.wardType].push(bed);
    }
    return acc;
  }, [visibleBeds]);

  return (
    <div>
      <section className="portal-hero">
        <div className="portal-hero-main">
          <div>
            <div className="portal-hero-meta">
              <span className="portal-status-pill">Inpatient care</span>
              <span>Wards &amp; beds</span>
            </div>
            <h1 className="portal-hero-title">Wards &amp; Beds</h1>
            <p className="portal-hero-sub">Live occupancy, admissions and discharges across the facility.</p>
          </div>
        </div>
        <div className="portal-hero-actions">
          <button className="btn btn-secondary" onClick={load} disabled={loading}>
            <RefreshCw size={15} /> Refresh
          </button>
        </div>
      </section>

      <div className="stats-grid">
        <StatCard label="Total beds" value={stats?.totalBeds ?? '—'} subtext="Facility inventory" icon={BedDouble} color="teal" />
        <StatCard label="Available" value={stats?.availableBeds ?? '—'} subtext="Ready for admission" icon={CheckCircle2} color="emerald" />
        <StatCard label="Occupied" value={stats?.occupiedBeds ?? '—'} subtext={`${stats?.occupancyRate ?? 0}% occupancy`} icon={Activity} color="rose" />
        <StatCard label="Cleaning / maintenance" value={stats?.maintenanceBeds ?? '—'} subtext="Not assignable" icon={Clock} color="amber" />
      </div>

      <div className="filter-bar" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
        <button className={`btn ${wardFilter === '' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setWardFilter('')}>
          All wards
        </button>
        {WARDS.map((ward) => (
          <button
            key={ward}
            className={`btn ${wardFilter === ward ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => setWardFilter(ward)}
          >
            {ward}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="empty-state">
          <div className="app-loading-spinner" style={{ margin: '0 auto 0.75rem auto' }} />
          <p>Loading beds…</p>
        </div>
      ) : visibleBeds.length === 0 ? (
        <div className="card empty-state">
          No beds found for this ward. Apply migration 005 to seed the ward layout.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {Object.entries(grouped).map(([ward, wardBeds]) => (
            <div key={ward} className="card">
              <div className="card-header">
                <div>
                  <h2 className="card-title">{ward}</h2>
                  <p className="card-subtitle">
                    {wardBeds.filter((bed) => bed.status === 'available').length} available ·{' '}
                    {wardBeds.filter((bed) => bed.status === 'occupied').length} occupied
                  </p>
                </div>
              </div>
              <div className="bed-grid" style={{ padding: '0 1rem 1rem' }}>
                {wardBeds.map((bed) => (
                  <div key={bed.id} className={`bed-card ${bed.status}`}>
                    <div className="bed-card-header">
                      <span className="bed-number">
                        <BedDouble size={16} /> {bed.bedNumber}
                      </span>
                      <StatusBadge status={bed.status} />
                    </div>
                    <div className="bed-meta">
                      {bed.floor || ward} · Room {bed.roomNumber || '—'}
                    </div>
                    <div className="bed-rate">{money(bed.dailyRate, bed.currency)} / day</div>

                    {bed.patient ? (
                      <div className="bed-patient-info">
                        <div style={{ fontWeight: 700 }}>{bed.patient.name}</div>
                        <div className="text-muted-sm">
                          <strong>{bed.patient.patientNumber || '—'}</strong>
                          {bed.patient.phone ? ` · ${bed.patient.phone}` : ''}
                        </div>
                        {bed.clinician && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--primary-700)', marginTop: 4 }}>
                            <Stethoscope size={11} /> {bed.clinician.name}
                          </div>
                        )}
                        <div className="text-muted-sm" style={{ marginTop: 4 }}>
                          Admitted {bed.admittedAt ? new Date(bed.admittedAt).toLocaleString() : '—'}
                        </div>
                        {bed.notes && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--slate-600)', marginTop: 4, fontStyle: 'italic' }}>
                            {bed.notes}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className={`bed-status-note ${bed.status}`}>
                        {bed.status === 'available' ? 'Ready for admission' : 'Cleaning / maintenance'}
                      </div>
                    )}

                    <div style={{ marginTop: 'auto', paddingTop: '0.5rem' }}>
                      {bed.status === 'available' ? (
                        <button className="btn btn-primary btn-sm" style={{ width: '100%', justifyContent: 'center' }} onClick={() => openAdmission(bed)}>
                          <UserCheck size={14} /> Admit patient
                        </button>
                      ) : bed.status === 'occupied' ? (
                        <button className="btn btn-danger-soft btn-sm" style={{ width: '100%', justifyContent: 'center' }} disabled={busy} onClick={() => discharge(bed)}>
                          Discharge
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedBed && (
        <Modal isOpen title={`Admit patient to ${selectedBed.bedNumber}`} onClose={() => setSelectedBed(null)} maxWidth="620px">
          <form onSubmit={admit}>
            <label style={{ display: 'block' }}>
              Registered patient
              <select className="form-control" required value={patientId} onChange={(event) => setPatientId(event.target.value)}>
                <option value="">— Select patient —</option>
                {patients.map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patient.name} ({patient.patient_number || patient.email})
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'block', marginTop: '0.75rem' }}>
              Admission notes
              <textarea
                className="form-control"
                rows={3}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Reason for admission, observations, care instructions…"
              />
            </label>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setSelectedBed(null)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? 'Admitting…' : 'Confirm admission'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
