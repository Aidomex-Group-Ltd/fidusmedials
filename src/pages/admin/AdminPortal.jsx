import React from 'react';
import { SystemAdminPortal } from './SystemAdminPortal';
import { ClinicalWorkspace } from '../../components/staff/ClinicalWorkspace';
import { FinancePortal } from '../finance/FinancePortal';
import { ShieldAlert } from 'lucide-react';

/**
 * Facility administration shell.
 *
 * Replaces the previous wiring, which mounted legacy pages that called
 * endpoints that do not exist (`/patients`, `/appointments`, `/beds`,
 * `/upload/*`) and therefore rendered fake dashboards.
 */

const ADMIN_TABS = ['admin-staff', 'admin-invitations', 'admin-audit', 'admin-security'];

const NotYetAvailable = ({ title, description }) => (
  <div className="card">
    <div className="card-header">
      <div>
        <h2 className="card-title">{title}</h2>
        <p className="card-subtitle">{description}</p>
      </div>
    </div>
    <div className="portal-empty-cell" style={{ padding: '2.5rem 1rem', textAlign: 'center' }}>
      <ShieldAlert size={26} style={{ color: 'var(--slate-400)', marginBottom: 6 }} />
      <p style={{ fontWeight: 600 }}>This module is not implemented yet</p>
      <p style={{ color: 'var(--slate-500)', fontSize: '0.85rem' }}>
        It is listed here rather than shown with placeholder figures. Nothing on this page is simulated data.
      </p>
    </div>
  </div>
);

export const AdminPortal = ({ activeTab, setActiveTab }) => {
  if (ADMIN_TABS.includes(activeTab)) {
    return <SystemAdminPortal activeTab={activeTab} />;
  }

  switch (activeTab) {
    case 'appointments':
      return <ClinicalWorkspace subTab="appointments" setSubTab={setActiveTab} roleLabel="Administrator" subtitle="Facility appointment oversight" />;
    case 'patients':
      return <ClinicalWorkspace subTab="patients" setSubTab={setActiveTab} roleLabel="Administrator" subtitle="Patient directory and record actions" />;
    case 'prescriptions':
      return <ClinicalWorkspace subTab="prescriptions" setSubTab={setActiveTab} roleLabel="Administrator" subtitle="Prescription oversight" />;
    case 'billing':
      return <FinancePortal subTab="invoices" setSubTab={setActiveTab} />;
    case 'doctors':
      return <ClinicalWorkspace subTab="patients" setSubTab={setActiveTab} roleLabel="Administrator" subtitle="Clinical team and patient assignment" />;
    case 'wards':
      return <NotYetAvailable title="Wards and beds" description="Bed allocation and ward management" />;
    case 'vault':
      return <NotYetAvailable title="Medical document vault" description="Secure document storage and delivery" />;
    case 'dashboard':
    default:
      return (
        <>
          <SystemAdminPortal activeTab="dashboard" />
          <ClinicalWorkspace subTab="overview" setSubTab={setActiveTab} roleLabel="Administrator" subtitle="Facility operations overview" />
        </>
      );
  }
};

export default AdminPortal;
