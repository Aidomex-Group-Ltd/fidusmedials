import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { StatCard } from '../../components/common/StatCard';
import { Stethoscope, Users, FileCheck, FolderLock, Clipboard, Activity } from 'lucide-react';

const TABS = [
  { id: 'overview', label: 'Clinician Dashboard', icon: Stethoscope },
  { id: 'patients', label: 'Patients', icon: Users },
  { id: 'diagnoses', label: 'Diagnoses & Cases', icon: FileCheck },
  { id: 'referrals', label: 'Referrals', icon: FolderLock },
];

export const ClinicianPortal = ({ subTab = 'overview', setSubTab }) => {
  const { user } = useAuth();
  const currentTab = subTab || 'overview';

  return (
    <div>
      <section className="portal-hero">
        <img className="portal-hero-photo" src="/images/care-team.webp" alt="" aria-hidden="true" />
        <div className="portal-hero-main">
          <img
            className="portal-hero-avatar"
            src={user?.avatar || 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&q=80&w=200'}
            alt="Clinician avatar"
          />
          <div>
            <div className="portal-hero-meta">
              <span className="portal-status-pill">
                <span className="portal-live-dot" /> On duty
              </span>
              <span>Internal Medicine</span>
            </div>
            <h1 className="portal-hero-title">{user?.name || 'Clinician'}</h1>
            <p className="portal-hero-sub">Clinician • CarePulse Clinical Desk</p>
          </div>
        </div>
        <div className="portal-hero-actions">
          <button className="btn btn-secondary" onClick={() => setSubTab?.('patients')}>
            <Users size={16} /> My Patients
          </button>
          <button className="btn btn-secondary" onClick={() => setSubTab?.('referrals')}>
            <FolderLock size={16} /> Referrals
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

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Clinician Portal — {currentTab}</h2>
          <p className="card-subtitle">Case review, diagnoses and inter-department referrals.</p>
        </div>
        <div className="stats-grid">
          <StatCard label="Active Cases" value={8} subtext="Open consultations" icon={Clipboard} color="teal" />
          <StatCard label="Diagnoses Today" value={3} subtext="Newly recorded" icon={FileCheck} color="indigo" />
          <StatCard label="Pending Referrals" value={2} subtext="Awaiting specialist review" icon={FolderLock} color="amber" />
          <StatCard label="Patients Assigned" value={14} subtext="Under current care" icon={Users} color="emerald" />
        </div>
        <div style={{ padding: '1rem', color: 'var(--slate-500)', fontSize: '0.875rem', lineHeight: 1.6 }}>
          Minimal placeholder for the Clinician portal. Add case lists, diagnosis recording, referral issuance and tracking, aligned with the existing Doctor/Patient portal modules in CarePulse.
        </div>
      </div>
    </div>
  );
};
