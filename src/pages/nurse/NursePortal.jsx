import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { StatCard } from '../../components/common/StatCard';
import { Activity, Clipboard, FileText, Heart, CheckCircle, AlertTriangle, Stethoscope } from 'lucide-react';

// Simple placeholder: each tab shows a minimal card. Replace with real modules later.
const TABS = [
  { id: 'overview', label: 'Ward Overview', icon: Activity },
  { id: 'patients', label: 'Patient Rounds', icon: Clipboard },
  { id: 'vitals', label: 'Vitals & Observation', icon: Heart },
  { id: 'records', label: 'Nursing Notes', icon: FileText },
];

export const NursePortal = ({ subTab = 'overview', setSubTab }) => {
  const { user } = useAuth();
  const currentTab = subTab || 'overview';

  const handleTabChange = (tab) => setSubTab?.(tab);

  return (
    <div>
      {/* Hero banner */}
      <section className="portal-hero">
        <img className="portal-hero-photo" src="/images/ward.webp" alt="" aria-hidden="true" />
        <div className="portal-hero-main">
          <img
            className="portal-hero-avatar"
            src={user?.avatar || 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&q=80&w=200'}
            alt="Nurse avatar"
          />
          <div>
            <div className="portal-hero-meta">
              <span className="portal-status-pill">
                <span className="portal-live-dot" /> On duty
              </span>
              <span>Ward 3 · Nursing Station</span>
            </div>
            <h1 className="portal-hero-title">{user?.name || 'Nurse'}</h1>
            <p className="portal-hero-sub">Registered Nurse • CarePulse Inpatient Ward</p>
          </div>
        </div>
        <div className="portal-hero-actions">
          <button className="btn btn-secondary" onClick={() => handleTabChange('patients')}>
            <Clipboard size={16} /> Start Rounds
          </button>
          <button className="btn btn-secondary" onClick={() => handleTabChange('vitals')}>
            <Heart size={16} /> Record Vitals
          </button>
        </div>
      </section>

      {/* Tab navigation */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.5rem' }}>
        {TABS.map(({ id, label, icon: Icon }) => {
          const isActive = currentTab === id;
          return (
            <button
              key={id}
              className={`portal-chip ${isActive ? 'is-selected' : ''}`}
              style={isActive ? { background: 'var(--primary-600)', color: '#fff', borderColor: 'var(--primary-600)' } : {}}
              onClick={() => handleTabChange(id)}
            >
              <Icon size={13} /> {label}
            </button>
          );
        })}
      </div>

      {/* Placeholder content */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Nursing Station — {currentTab === 'overview' ? 'Ward Overview' : TABS.find((t) => t.id === currentTab)?.label}</h2>
          <p className="card-subtitle">CarePulse nursing workspace for inpatients and ward rounds.</p>
        </div>
        <div className="stats-grid">
          <StatCard label="Patients on Ward" value={3} subtext="Currently assigned" icon={Clipboard} color="teal" />
          <StatCard label="Vitals Due Now" value={1} subtext="Overdue observations" icon={AlertTriangle} color="rose" />
          <StatCard label="Notes Today" value={5} subtext="Nursing notes logged" icon={FileText} color="indigo" />
          <StatCard label="Handover Pending" value={2} subtext="Shift handover items" icon={Activity} color="amber" />
        </div>
        <div style={{ padding: '1rem', color: 'var(--slate-500)', fontSize: '0.875rem', lineHeight: 1.6 }}>
          <Stethoscope size={16} style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} />
          This is a minimal placeholder for the Nursing portal. Add ward dashboards, patient-round tables, vitals entry forms, and nursing-note modules here, following the same design language as the Doctor and Patient portals.
        </div>
      </div>
    </div>
  );
};
