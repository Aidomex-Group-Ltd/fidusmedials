import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { Sidebar } from './components/common/Sidebar';
import { Navbar } from './components/common/Navbar';
import { RoleSwitcher } from './components/common/RoleSwitcher';
import { ChatBot } from './components/common/ChatBot';

// Dedicated Role Portals
import { DoctorPortal } from './pages/doctor/DoctorPortal';
import { PatientPortal } from './pages/patient/PatientPortal';
import { AdminPortal } from './pages/admin/AdminPortal';
import { NursePortal } from './pages/nurse/NursePortal';
import { MidwifePortal } from './pages/midwife/MidwifePortal';
import { ClinicianPortal } from './pages/clinician/ClinicianPortal';
import { LabPortal } from './pages/lab/LabPortal';
import { PharmacyPortal } from './pages/pharmacy/PharmacyPortal';
import { RadiologyPortal } from './pages/radiology/RadiologyPortal';
import { FinancePortal } from './pages/finance/FinancePortal';

// Auth & Landing Pages
import { LandingPage } from './pages/LandingPage';
import { ClientApp } from './v3/app';
import { PatientLogin } from './pages/PatientLogin';

import { PatientForgotPassword } from './pages/PatientForgotPassword';
import { StaffLogin } from './pages/StaffLogin';

import { StaffApply } from './pages/StaffApply';
import { StaffForgotPassword } from './pages/StaffForgotPassword';

import { Register } from './pages/Register';

import './styles/index.css';
import './styles/components.css';
import './styles/landing.css';
import './styles/portals.css';
import './styles/portal-landing.css';

function DevAuthSettings({ onClose }) {
  const { switchDemoRole, logout } = useAuth();
  const [devRole, setDevRole] = useState('Admin');
  const [applying, setApplying] = useState(false);

  const apply = async () => {
    setApplying(true);
    try {
      await switchDemoRole(devRole);
      window.location.reload();
    } catch (err) {
      alert(err.message || 'Failed to sign in as demo role');
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="dev-auth-settings">
      <h1>Dev Auth Settings</h1>
      <p>
        Development-only helper that signs you in through the real backend login
        endpoint so you can reach the dashboards quickly while running `vite`
        locally. It is stripped from production builds.
      </p>
      <fieldset>
        <legend>Dev role</legend>
        <label>
          <select value={devRole} onChange={(e) => setDevRole(e.target.value)} disabled={applying}>
            {['Administrator', 'Doctor', 'Receptionist', 'Patient', 'Nurse', 'Midwife', 'Clinician', 'Laboratory Staff', 'Pharmacy Staff', 'Radiology Staff', 'Admin & Finance'].map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </label>
      </fieldset>
      <div className="dev-auth-actions">
        <button type="button" onClick={apply} disabled={applying}>
          {applying ? 'Signing in…' : 'Sign in as this role'}
        </button>
        <button type="button" onClick={() => { logout(); window.location.reload(); }}>
          Clear session
        </button>
        <button type="button" onClick={onClose}>Back</button>
      </div>
    </div>
  );
}

// Pages available to each role, in sidebar order. URLs are /app/<tab>.
export const ROLE_TABS = {
  Admin: ['dashboard', 'appointments', 'patients', 'doctors', 'wards', 'prescriptions', 'billing', 'vault'],
  Receptionist: ['dashboard', 'appointments', 'patients', 'doctors', 'wards', 'prescriptions', 'billing', 'vault'],
  Doctor: ['overview', 'prescriptions', 'patients', 'scans'],
  Patient: ['overview', 'appointments', 'prescriptions', 'reports', 'billing', 'profile'],
  Nurse: ['overview', 'patients', 'vitals', 'records'],
  Midwife: ['overview', 'antenatal', 'deliveries', 'postnatal'],
  Clinician: ['overview', 'patients', 'diagnoses', 'referrals'],
  'Laboratory Staff': ['overview', 'samples', 'results', 'reports'],
  'Pharmacy Staff': ['overview', 'inventory', 'prescriptions', 'favorites'],
  'Radiology Staff': ['overview', 'exams', 'reports', 'inventory'],
  'Admin & Finance': ['dashboard', 'invoices', 'payments', 'reports'],
};

export const DEV_ROLE = 'Admin';
export const DEV_TABS = ROLE_TABS.Admin;

const tabsForRole = (role) => ROLE_TABS[role] || ROLE_TABS.Admin;

// Small history-based router: keeps the URL in sync so Back/Refresh/shared links work
const usePath = () => {
  const [path, setPath] = useState(() => window.location.pathname);
  const ready = useRef(false);
  useEffect(() => {
    ready.current = true;
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const navigate = useCallback((to, { replace = false } = {}) => {
    if (to === window.location.pathname) return;
    window.history[replace ? 'replaceState' : 'pushState']({}, '', to);
    if (ready.current) setPath(to);
    window.scrollTo(0, 0);
  }, []);
  return [path, navigate];
};

const MainLayout = () => {
  const {
    user,
    loading,
    isDoctor,
    isPatient,
    isNurse,
    isMidwife,
    isClinician,
    isLabStaff,
    isPharmacyStaff,
    isRadiologyStaff,
    isAdminAndFinance,
  } = useAuth();
  const [path, navigate] = usePath();
  const [globalSearch, setGlobalSearch] = useState('');

  const appTab = path.startsWith('/app/') ? path.slice('/app/'.length).split('/')[0] : null;
  const allowedTabs = user ? tabsForRole(user.role) : [];
  const activeTab = allowedTabs.includes(appTab) ? appTab : allowedTabs[0];

  // Keep the URL valid for the current auth state
  useEffect(() => {
    if (loading) return;
    if (user && (!path.startsWith('/app/') || appTab !== activeTab)) {
      navigate(`/app/${activeTab}`, { replace: true });
    } else if (!user && path.startsWith('/app')) {
      navigate('/login', { replace: true });
    }
  }, [user, loading, path, appTab, activeTab, navigate]);

  const setActiveTab = useCallback((tab) => navigate(`/app/${tab}`), [navigate]);

  if (loading) {
    return (
      <div className="app-loading">
        <div className="app-loading-spinner" />
        <p>Loading CarePulse…</p>
      </div>
    );
  }

  // Unauthenticated: landing page, login or register based on the URL
  if (!user) {        // Unified registration (patient + staff toggle)
        if (path === '/register' || path === '/patient/register') {
          return <Register onNavigateLogin={() => navigate('/login')} onNavigateHome={() => navigate('/')} defaultMode="patient" />;
        }
        if (path === '/staff/register') {
          return <Register onNavigateLogin={() => navigate('/staff/login')} onNavigateHome={() => navigate('/')} defaultMode="staff" />;
        }
        if (path === '/login' || path === '/patient/login' || path.startsWith('/app')) {
          return <PatientLogin onNavigateRegister={() => navigate('/register')} onNavigateHome={() => navigate('/')} />;
        }
        if (path === '/patient/forgot-password') {
          return <PatientForgotPassword onNavigateLogin={() => navigate('/login')} onNavigateHome={() => navigate('/')} />;
        }
        // Staff auth routes.
        if (path === '/staff/login') {
          return <StaffLogin onNavigateHome={() => navigate('/')} />;
        }

        if (path === '/staff/apply') {
          return <StaffApply onNavigateHome={() => navigate('/')} />;
        }
        if (path === '/staff/forgot-password') {
          return <StaffForgotPassword onNavigateHome={() => navigate('/')} />;
        }
        if (path === '/dev-settings') {
          if (!import.meta.env.DEV) {
            return <LandingPage onNavigateLogin={() => navigate('/login')} onNavigateRegister={() => navigate('/register')} />;
          }
          return <DevAuthSettings onClose={() => navigate('/')} />;
        }
        return <LandingPage onNavigateLogin={() => navigate('/login')} onNavigateRegister={() => navigate('/register')} />;
  }

  const renderActivePortal = () => {
    if (isDoctor) return <DoctorPortal subTab={activeTab} setSubTab={setActiveTab} />;
    if (isPatient) return <PatientPortal subTab={activeTab} setSubTab={setActiveTab} />;
    if (isNurse) return <NursePortal subTab={activeTab} setSubTab={setActiveTab} />;
    if (isMidwife) return <MidwifePortal subTab={activeTab} setSubTab={setActiveTab} />;
    if (isClinician) return <ClinicianPortal subTab={activeTab} setSubTab={setActiveTab} />;
    if (isLabStaff) return <LabPortal subTab={activeTab} setSubTab={setActiveTab} />;
    if (isPharmacyStaff) return <PharmacyPortal subTab={activeTab} setSubTab={setActiveTab} />;
    if (isRadiologyStaff) return <RadiologyPortal subTab={activeTab} setSubTab={setActiveTab} />;
    if (isAdminAndFinance) return <FinancePortal subTab={activeTab} setSubTab={setActiveTab} />;
    return <AdminPortal activeTab={activeTab} setActiveTab={setActiveTab} />;
  };

  // Fidus CMS v3: redirect dev/QA-only shadow-set to v3; production keeps castler auth.
  const isShadowCms = import.meta.env.DEV;
  if (isShadowCms) {
    return <ClientApp />;
  }
  return (
    <div className="app-container">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      <div className="main-content">
        {import.meta.env.DEV && <RoleSwitcher />}
        <Navbar onSearch={setGlobalSearch} searchQuery={globalSearch} />
        <main className="page-body">{renderActivePortal()}</main>
      </div>
      <ChatBot />
    </div>
  );
};

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <MainLayout />
      </AuthProvider>
    </ToastProvider>
  );
}
