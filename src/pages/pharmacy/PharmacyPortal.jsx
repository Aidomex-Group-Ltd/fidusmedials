import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { StatCard } from '../../components/common/StatCard';
import { Pill, Package, Syringe, FileCheck, AlertTriangle, Clock } from 'lucide-react';

const TABS = [
  { id: 'overview', label: 'Pharmacy Dashboard', icon: Pill },
  { id: 'inventory', label: 'Inventory', icon: Package },
  { id: 'prescriptions', label: 'Dispense Queue', icon: Syringe },
  { id: 'favorites', label: 'Favorites & Suppliers', icon: Pill },
];

export const PharmacyPortal = ({ subTab = 'overview', setSubTab }) => {
  const { user } = useAuth();
  const currentTab = subTab || 'overview';

  return (
    <div>
      <section className="portal-hero">
        <img className="portal-hero-photo" src="/images/pharmacy.webp" alt="" aria-hidden="true" />
        <div className="portal-hero-main">
          <img
            className="portal-hero-avatar"
            src={user?.avatar || 'https://images.unsplash.com/photo-1585435557343-3b092031a831?auto=format&fit=crop&q=80&w=200'}
            alt="Pharmacy staff avatar"
          />
          <div>
            <div className="portal-hero-meta">
              <span className="portal-status-pill">
                <span className="portal-live-dot" /> On duty
              </span>
              <span>Central Pharmacy</span>
            </div>
            <h1 className="portal-hero-title">{user?.name || 'Pharmacy Staff'}</h1>
            <p className="portal-hero-sub">Pharmacist • CarePulse Pharmacy & Dispensing</p>
          </div>
        </div>
        <div className="portal-hero-actions">
          <button className="btn btn-secondary" onClick={() => setSubTab?.('prescriptions')}>
            <Syringe size={16} /> Dispense Queue
          </button>
          <button className="btn btn-secondary" onClick={() => setSubTab?.('inventory')}>
            <Package size={16} /> Inventory
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
          <h2 className="card-title">Pharmacy — {currentTab}</h2>
          <p className="card-subtitle">Dispensing, stock management and prescription fulfillment.</p>
        </div>
        <div className="stats-grid">
          <StatCard label="Rx in Dispense Queue" value={6} subtext="Awaiting pickup" icon={Syringe} color="amber" />
          <StatCard label="Out of Stock Items" value={2} subtext="Needs reorder alert" icon={AlertTriangle} color="rose" />
          <StatCard label="Inventory Items" value={348} subtext="Active drug stock" icon={Package} color="teal" />
          <StatCard label="Dispensed Today" value={27} subtext="Prescriptions filled" icon={FileCheck} color="indigo" />
        </div>
        <div style={{ padding: '1rem', color: 'var(--slate-500)', fontSize: '0.875rem', lineHeight: 1.6 }}>
          Minimal placeholder for the Pharmacy portal. Add dispensing queue, stock/inventory management, reorder alerts and supplier list, consistent with the CarePulse design language.
        </div>
      </div>
    </div>
  );
};
