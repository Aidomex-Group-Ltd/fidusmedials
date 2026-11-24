import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { StatCard } from '../../components/common/StatCard';
import { Microscope, Droplets, FileCheck, FolderLock, Clock, CheckCircle } from 'lucide-react';

const TABS = [
  { id: 'overview', label: 'Lab Dashboard', icon: Microscope },
  { id: 'samples', label: 'Samples & Tests', icon: Droplets },
  { id: 'results', label: 'Test Results', icon: FileCheck },
  { id: 'reports', label: 'Reports', icon: FolderLock },
];

export const LabPortal = ({ subTab = 'overview', setSubTab }) => {
  const { user } = useAuth();
  const currentTab = subTab || 'overview';

  return (
    <div>
      <section className="portal-hero">
        <img className="portal-hero-photo" src="/images/doctor-consult.webp" alt="" aria-hidden="true" />
        <div className="portal-hero-main">
          <img
            className="portal-hero-avatar"
            src={user?.avatar || 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&q=80&w=200'}
            alt="Lab staff avatar"
          />
          <div>
            <div className="portal-hero-meta">
              <span className="portal-status-pill">
                <span className="portal-live-dot" /> On duty
              </span>
              <span>Diagnostic Laboratory</span>
            </div>
            <h1 className="portal-hero-title">{user?.name || 'Lab Staff'}</h1>
            <p className="portal-hero-sub">Laboratory Technician • CarePulse Diagnostics</p>
          </div>
        </div>
        <div className="portal-hero-actions">
          <button className="btn btn-secondary" onClick={() => setSubTab?.('samples')}>
            <Droplets size={16} /> Samples In
          </button>
          <button className="btn btn-secondary" onClick={() => setSubTab?.('results')}>
            <FileCheck size={16} /> Release Results
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
          <h2 className="card-title">Laboratory — {currentTab}</h2>
          <p className="card-subtitle">Sample intake, test execution and result reporting.</p>
        </div>
        <div className="stats-grid">
          <StatCard label="Samples Received" value={14} subtext="Today's intake" icon={Droplets} color="teal" />
          <StatCard label="Tests Completed" value={9} subtext="Finished today" icon={CheckCircle} color="emerald" />
          <StatCard label="Results Pending Review" value={5} subtext="Awaiting sign-off" icon={Clock} color="amber" />
          <StatCard label="Reports Issued" value={120} subtext="This month" icon={FileCheck} color="indigo" />
        </div>
        <div style={{ padding: '1rem', color: 'var(--slate-500)', fontSize: '0.875rem', lineHeight: 1.6 }}>
          Minimal placeholder for the Laboratory portal. Add sample accessioning, test ordering, result entry and report release modules, matching the existing CarePulse design system.
        </div>
      </div>
    </div>
  );
};
