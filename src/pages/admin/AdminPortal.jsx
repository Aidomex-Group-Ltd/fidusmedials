import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { SystemAdminPortal } from './SystemAdminPortal';
import { ClinicalWorkspace } from '../../components/staff/ClinicalWorkspace';
import { FinancePortal } from '../finance/FinancePortal';
import { WardsAndBeds } from '../WardsAndBeds';
import { MedicalFiles } from '../MedicalFiles';

/**
 * Facility administration shell.
 *
 * Every tab now renders a module backed by a real D1/R2 endpoint. The previous
 * wiring mounted legacy pages that called endpoints which did not exist
 * (`/patients`, `/appointments`, `/beds`, `/upload/*`).
 */

const ADMIN_TABS = ['admin-staff', 'admin-invitations', 'admin-audit', 'admin-security'];

const FACILITY_ADMIN_ROLES = ['System Administrator', 'Administrator', 'Facility Administrator'];

export const AdminPortal = ({ activeTab, setActiveTab }) => {
  const { user } = useAuth();
  const isFacilityAdmin = FACILITY_ADMIN_ROLES.includes(user?.role);

  // Only facility administrators may render the System Administration
  // modules. Other roles that share this shell (Reception, Records) keep the
  // operational pages and must not hit admin-only endpoints.
  if (ADMIN_TABS.includes(activeTab)) {
    if (!isFacilityAdmin) {
      return (
        <ClinicalWorkspace
          subTab="overview"
          setSubTab={setActiveTab}
          roleLabel={user?.role || 'Staff'}
          subtitle="Facility operations overview"
        />
      );
    }
    return <SystemAdminPortal activeTab={activeTab} setActiveTab={setActiveTab} />;
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
      return <WardsAndBeds />;
    case 'vault':
      return <MedicalFiles />;
    case 'dashboard':
    default:
      if (!isFacilityAdmin) {
        return (
          <ClinicalWorkspace
            subTab="overview"
            setSubTab={setActiveTab}
            roleLabel={user?.role || 'Staff'}
            subtitle="Facility operations overview"
          />
        );
      }
      return (
        <>
          <SystemAdminPortal activeTab="dashboard" setActiveTab={setActiveTab} />
          <ClinicalWorkspace subTab="overview" setSubTab={setActiveTab} roleLabel="Administrator" subtitle="Facility operations overview" />
        </>
      );
  }
};

export default AdminPortal;
