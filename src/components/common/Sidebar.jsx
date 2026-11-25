import React from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  LayoutDashboard,
  CalendarCheck,
  Users,
  Stethoscope,
  FileText,
  BedDouble,
  Receipt,
  FolderLock,
  LogOut,
  Activity,
  HeartPulse,
  Clock,
  FileCheck,
  Shield,
  Mail,
  CreditCard,
  User,
  PlusCircle,
  Syringe,
  Pill,
  Droplets,
  PiggyBank,
  Microscope,
  Package,
  Scan,
  Baby,
  Heart,
  Clipboard,
  BarChart3,
  ScanLine,
} from 'lucide-react';

export const Sidebar = ({ activeTab, setActiveTab, isOpen = false, onClose }) => {
  const { user, logout, isPatient, isDoctor, isNurse, isMidwife, isClinician, isLabStaff, isPharmacyStaff, isRadiologyStaff, isAdminAndFinance } = useAuth();

  // Role-specific navigation definitions
  const doctorNav = [
    { id: 'overview', label: "Dashboard & Today's Queue", icon: LayoutDashboard },
    { id: 'prescriptions', label: 'E-Prescriptions', icon: FileCheck },
    { id: 'patients', label: 'My Patients', icon: Users },
    { id: 'scans', label: 'Diagnostics & Scans', icon: FolderLock },
  ];

  const patientNav = [
    { id: 'overview', label: 'Health Overview', icon: HeartPulse },
    { id: 'appointments', label: 'Appointments', icon: CalendarCheck },
    { id: 'prescriptions', label: 'Prescriptions', icon: FileCheck },
    { id: 'reports', label: 'Lab Reports & Scans', icon: FolderLock },
    { id: 'billing', label: 'Invoices & Payments', icon: Receipt },
    { id: 'profile', label: 'Medical Profile', icon: User },
  ];

  const adminNav = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'admin-staff', label: 'Staff Management', icon: Users },
    { id: 'admin-invitations', label: 'Invitations', icon: Mail },
    { id: 'admin-audit', label: 'Audit & Security', icon: Shield },
    { id: 'appointments', label: 'Appointments', icon: CalendarCheck },
    { id: 'patients', label: 'Patients', icon: Users },
    { id: 'doctors', label: 'Doctors', icon: Stethoscope },
    { id: 'wards', label: 'Wards & Beds', icon: BedDouble },
    { id: 'prescriptions', label: 'Prescriptions & Pharmacy', icon: FileCheck },
    { id: 'billing', label: 'Billing & Invoices', icon: Receipt },
    { id: 'vault', label: 'Medical Records', icon: FolderLock },
  ];

  const nurseNav = [
    { id: 'overview', label: 'Ward Overview', icon: Heart },
    { id: 'patients', label: 'Patient Rounds', icon: Clipboard },
    { id: 'vitals', label: 'Vitals & Observation', icon: Activity },
    { id: 'records', label: 'Nursing Notes', icon: FileText },
  ];

  const midwifeNav = [
    { id: 'overview', label: 'Maternity Overview', icon: Baby },
    { id: 'antenatal', label: 'Antenatal Care', icon: Heart },
    { id: 'deliveries', label: 'Deliveries & Birth Records', icon: Baby },
    { id: 'postnatal', label: 'Postnatal Follow-up', icon: HeartPulse },
  ];

  const clinicianNav = [
    { id: 'overview', label: 'Clinician Dashboard', icon: Stethoscope },
    { id: 'patients', label: 'Patients', icon: Users },
    { id: 'diagnoses', label: 'Diagnoses & Cases', icon: FileCheck },
    { id: 'referrals', label: 'Referrals', icon: FolderLock },
  ];

  const labNav = [
    { id: 'overview', label: 'Lab Dashboard', icon: Microscope },
    { id: 'samples', label: 'Samples & Tests', icon: Droplets },
    { id: 'results', label: 'Test Results', icon: FileCheck },
    { id: 'reports', label: 'Reports', icon: FolderLock },
  ];

  const pharmacyNav = [
    { id: 'overview', label: 'Pharmacy Dashboard', icon: Pill },
    { id: 'inventory', label: 'Inventory', icon: Package },
    { id: 'prescriptions', label: 'Dispense Queue', icon: Syringe },
    { id: 'favorites', label: 'Favorites & Suppliers', icon: Pill },
  ];

  const radiologyNav = [
    { id: 'overview', label: 'Radiology Dashboard', icon: ScanLine },
    { id: 'exams', label: 'Imaging Exams', icon: Scan },
    { id: 'reports', label: 'Radiology Reports', icon: FileCheck },
    { id: 'inventory', label: 'Equipment & Inventory', icon: Activity },
  ];

  const financeNav = [
    { id: 'dashboard', label: 'Finance Overview', icon: BarChart3 },
    { id: 'invoices', label: 'Invoices', icon: Receipt },
    { id: 'payments', label: 'Payments & Collections', icon: CreditCard },
    { id: 'reports', label: 'Financial Reports', icon: PiggyBank },
  ];

  const roleConfigs = {
    'System Administrator': { nav: adminNav, title: 'System Administration', icon: Shield, badge: 'System Admin' },
    Admin: { nav: adminNav, title: 'Admin Suite', icon: Activity, badge: 'Hospital Ops' },
    Administrator: { nav: adminNav, title: 'Admin Suite', icon: Activity, badge: 'Hospital Ops' },
    'Facility Administrator': { nav: adminNav, title: 'Facility Administration', icon: Shield, badge: 'Facility Admin' },
    Receptionist: { nav: adminNav, title: 'Reception Suite', icon: Clipboard, badge: 'Front Desk' },
    Doctor: { nav: doctorNav, title: 'Doctor Portal', icon: Stethoscope, badge: 'Clinical Desk' },
    Patient: { nav: patientNav, title: 'Patient Hub', icon: HeartPulse, badge: 'Personal Health' },
    Nurse: { nav: nurseNav, title: 'Nursing Station', icon: Heart, badge: 'Ward Care' },
    Midwife: { nav: midwifeNav, title: 'Maternity Suite', icon: Baby, badge: 'Maternity Care' },
    Clinician: { nav: clinicianNav, title: 'Clinician Portal', icon: Stethoscope, badge: 'Clinical Care' },
    'Laboratory Staff': { nav: labNav, title: 'Laboratory', icon: Microscope, badge: 'Diagnostics' },
    'Pharmacy Staff': { nav: pharmacyNav, title: 'Pharmacy', icon: Pill, badge: 'Dispensing' },
    'Radiology Staff': { nav: radiologyNav, title: 'Radiology', icon: Scan, badge: 'Imaging' },
    'Admin & Finance': { nav: financeNav, title: 'Finance Suite', icon: PiggyBank, badge: 'Finance Ops' },
  };

  const config = roleConfigs[user?.role] || roleConfigs.Admin;
  const currentNav = config.nav;
  const portalTitle = config.title;
  const PortalIconComponent = config.icon;
  const badgeText = config.badge;

  return (
    <aside className={`app-sidebar ${isOpen ? 'is-open' : ''}`} aria-label="Primary navigation">
      <div className="sidebar-brand">
        <div className="brand-icon-wrapper">
          <PortalIconComponent size={22} />
        </div>
        <div className="brand-text">
          <span className="brand-title">CarePulse</span>
          <span className="brand-badge">{badgeText}</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section-title">{portalTitle}</div>
        {currentNav.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              className={`nav-item ${isActive ? 'active' : ''}`}
              onClick={() => {
                setActiveTab(item.id);
                onClose?.();
              }}
            >
              <Icon className="nav-item-icon" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="user-profile-widget">
          <img
            src={user?.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=150'}
            alt="User avatar"
            className="user-avatar"
          />
          <div className="user-info">
            <div className="user-name">{user?.name || 'Guest User'}</div>
            <div className="user-role-tag">{user?.role || 'Visitor'} • {user?.department || 'Care'}</div>
          </div>
          <button
            onClick={logout}
            title="Sign Out"
            style={{ color: '#94a3b8', padding: '0.4rem', cursor: 'pointer' }}
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
};
