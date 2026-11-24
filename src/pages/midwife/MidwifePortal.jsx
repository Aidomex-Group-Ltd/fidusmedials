import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { StatCard } from '../../components/common/StatCard';
import { Baby, Heart, HeartPulse, FileText, Calendar, CheckCircle } from 'lucide-react';

const TABS = [
  { id: 'overview', label: 'Maternity Overview', icon: Baby },
  { id: 'antenatal', label: 'Antenatal Care', icon: Heart },
  { id: 'deliveries', label: 'Deliveries & Birth Records', icon: Baby },
  { id: 'postnatal', label: 'Postnatal Follow-up', icon: HeartPulse },
];

export const MidwifePortal = ({ subTab = 'overview', setSubTab }) => {
  const { user } = useAuth();
  const currentTab = subTab || 'overview';

  return (
    <div>
      <section className="portal-hero">
        <img className="portal-hero-photo" src="/images/private-room.webp" alt="" aria-hidden="true" />
        <div className="portal-hero-main">
          <img
            className="portal-hero-avatar"
            src={user?.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=200'}
            alt="Midwife avatar"
          />
          <div>
            <div className="portal-hero-meta">
              <span className="portal-status-pill">
                <span className="portal-live-dot" /> On duty
              </span>
              <span>Maternity Wing</span>
            </div>
            <h1 className="portal-hero-title">{user?.name || 'Midwife'}</h1>
            <p className="portal-hero-sub">Registered Midwife • CarePulse Maternity Suite</p>
          </div>
        </div>
        <div className="portal-hero-actions">
          <button className="btn btn-secondary" onClick={() => setSubTab?.('antenatal')}>
            <Heart size={16} /> Antenatal Clinic
          </button>
          <button className="btn btn-secondary" onClick={() => setSubTab?.('deliveries')}>
            <Baby size={16} /> Delivery Records
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
          <h2 className="card-title">Maternity Suite — {currentTab}</h2>
          <p className="card-subtitle">Antenatal, delivery and postnatal care workspace.</p>
        </div>
        <div className="stats-grid">
          <StatCard label="Antenatal Patients" value={4} subtext="This week's clinic" icon={Heart} color="teal" />
          <StatCard label="Deliveries This Month" value={12} subtext="Total births recorded" icon={Baby} color="indigo" />
          <StatCard label="Postnatal Follow-ups" value={6} subtext="Due in next 48h" icon={HeartPulse} color="amber" />
          <StatCard label="Birth Records Pending" value={1} subtext="Signed documents" icon={FileText} color="rose" />
        </div>
        <div style={{ padding: '1rem', color: 'var(--slate-500)', fontSize: '0.875rem', lineHeight: 1.6 }}>
          Minimal placeholder for the Midwife portal. Add antenatal clinic list, labour/delivery register, postnatal follow-up queue and birth-record documents, reusing the same portal components as the rest of CarePulse.
        </div>
      </div>
    </div>
  );
};
