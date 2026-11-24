import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { StatCard } from '../../components/common/StatCard';
import { Scan, FileCheck, Activity, Clock, Camera } from 'lucide-react';

const TABS = [
  { id: 'overview', label: 'Radiology Dashboard', icon: Scan },
  { id: 'exams', label: 'Imaging Exams', icon: Scan },
  { id: 'reports', label: 'Radiology Reports', icon: FileCheck },
  { id: 'inventory', label: 'Equipment & Inventory', icon: Activity },
];

export const RadiologyPortal = ({ subTab = 'overview', setSubTab }) => {
  const { user } = useAuth();
  const currentTab = subTab || 'overview';

  return (
    <div>
      <section className="portal-hero">
        <img className="portal-hero-photo" src="/images/scan-room.webp" alt="" aria-hidden="true" />
        <div className="portal-hero-main">
          <img
            className="portal-hero-avatar"
            src={user?.avatar || 'https://images.unsplash.com/photo-1537432376769-00f5c2f4c80e?auto=format&fit=crop&q=80&w=200'}
            alt="Radiology staff avatar"
          />
          <div>
            <div className="portal-hero-meta">
              <span className="portal-status-pill">
                <span className="portal-live-dot" /> On duty
              </span>
              <span>Radiology & Imaging</span>
            </div>
            <h1 className="portal-hero-title">{user?.name || 'Radiology Staff'}</h1>
            <p className="portal-hero-sub">Radiographer • CarePulse Radiology Suite</p>
          </div>
        </div>
        <div className="portal-hero-actions">
          <button className="btn btn-secondary" onClick={() => setSubTab?.('exams')}>
            <Scan size={16} /> Imaging Exams
          </button>
          <button className="btn btn-secondary" onClick={() => setSubTab?.('reports')}>
            <FileCheck size={16} /> Reports
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
          <h2 className="card-title">Radiology — {currentTab}</h2>
          <p className="card-subtitle">Imaging exam scheduling, acquisition and radiologist reporting.</p>
        </div>
        <div className="stats-grid">
          <StatCard label="Pending Exams" value={8} subtext="Waiting for imaging" icon={Scan} color="amber" />
          <StatCard label="Reports Released" value={14} subtext="Today" icon={FileCheck} color="emerald" />
          <StatCard label="X-Ray / CT / MRI" value={3} subtext="Active scanners" icon={Camera} color="teal" />
          <StatCard label="Report Backlog" value={4} subtext="Awaiting radiologist sign-off" icon={Clock} color="rose" />
        </div>
        <div style={{ padding: '1rem', color: 'var(--slate-500)', fontSize: '0.875rem', lineHeight: 1.6 }}>
          Minimal placeholder for the Radiology portal. Add imaging exam request list, modality queues, radiology report authoring and equipment status, reusing the CarePulse portal components.
        </div>
      </div>
    </div>
  );
};
