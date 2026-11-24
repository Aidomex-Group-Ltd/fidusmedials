import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { StatCard } from '../../components/common/StatCard';
import { BarChart3, Receipt, CreditCard, PiggyBank, TrendingUp, DollarSign, Clock } from 'lucide-react';

const TABS = [
  { id: 'dashboard', label: 'Finance Overview', icon: BarChart3 },
  { id: 'invoices', label: 'Invoices', icon: Receipt },
  { id: 'payments', label: 'Payments & Collections', icon: CreditCard },
  { id: 'reports', label: 'Financial Reports', icon: PiggyBank },
];

export const FinancePortal = ({ subTab = 'dashboard', setSubTab }) => {
  const { user } = useAuth();
  const currentTab = subTab || 'dashboard';

  return (
    <div>
      <section className="portal-hero">
        <img className="portal-hero-photo" src="/images/admin.webp" alt="" aria-hidden="true" />
        <div className="portal-hero-main">
          <img
            className="portal-hero-avatar"
            src={user?.avatar || 'https://images.unsplash.com/photo-1560179707-f14e90ef3623?auto=format&fit=crop&q=80&w=200'}
            alt="Finance avatar"
          />
          <div>
            <div className="portal-hero-meta">
              <span className="portal-status-pill">
                <span className="portal-live-dot" /> On duty
              </span>
              <span>Finance & Administration</span>
            </div>
            <h1 className="portal-hero-title">{user?.name || 'Admin & Finance'}</h1>
            <p className="portal-hero-sub">Finance Officer • CarePulse Admin & Finance Suite</p>
          </div>
        </div>
        <div className="portal-hero-actions">
          <button className="btn btn-secondary" onClick={() => setSubTab?.('invoices')}>
            <Receipt size={16} /> Invoices
          </button>
          <button className="btn btn-secondary" onClick={() => setSubTab?.('payments')}>
            <CreditCard size={16} /> Payments
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
          <h2 className="card-title">Finance Suite — {currentTab === 'dashboard' ? 'Overview' : TABS.find((t) => t.id === currentTab)?.label}</h2>
          <p className="card-subtitle">Invoicing, collections, revenue and financial reporting.</p>
        </div>
        <div className="stats-grid">
          <StatCard label="Monthly Revenue" value="$124,500" subtext="Current month" icon={DollarSign} color="emerald" />
          <StatCard label="Pending Collections" value="$18,200" subtext="Outstanding invoices" icon={Clock} color="amber" />
          <StatCard label="Invoices This Month" value={87} subtext="Generated" icon={Receipt} color="teal" />
          <StatCard label="Payment Rate" value="94%" subtext="Collections efficiency" icon={TrendingUp} color="indigo" />
        </div>
        <div style={{ padding: '1rem', color: 'var(--slate-500)', fontSize: '0.875rem', lineHeight: 1.6 }}>
          Minimal placeholder for the Admin & Finance portal. Add invoice management, payment recording, revenue dashboards and financial report exports, aligned with the CarePulse billing module and design system.
        </div>
      </div>
    </div>
  );
};
