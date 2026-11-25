import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Shield, Stethoscope, UserCheck, HeartPulse, Settings, Activity, Baby, Microscope, Package, Scan, PiggyBank } from 'lucide-react';

export const RoleSwitcher = () => {
  const { user, switchDemoRole, fakeDevLogin } = useAuth();
  const toast = useToast();

  const roles = [
    { name: 'Admin', label: 'Admin (Munna)', icon: Shield },
    { name: 'Doctor', label: 'Doctor (Dr. Sarah)', icon: Stethoscope },
    { name: 'Receptionist', label: 'Reception (Emma, RN)', icon: UserCheck },
    { name: 'Patient', label: 'Patient (Alex)', icon: HeartPulse },
    { name: 'Nurse', label: 'Nurse', icon: Activity },
    { name: 'Midwife', label: 'Midwife', icon: Baby },
    { name: 'Clinician', label: 'Clinician', icon: Stethoscope },
    { name: 'Laboratory Staff', label: 'Lab Staff', icon: Microscope },
    { name: 'Pharmacy Staff', label: 'Pharmacy Staff', icon: Package },
    { name: 'Radiology Staff', label: 'Radiology Staff', icon: Scan },
    { name: 'Admin & Finance', label: 'Admin & Finance', icon: PiggyBank },
  ];

  const handleRoleSwitch = async (roleName) => {
    try {
      if (import.meta.env.VITE_FAKE_AUTH_TOKEN) {
        fakeDevLogin('dev-user', roleName, `Dev ${roleName}`, `dev.${roleName.toLowerCase()}@fidusmc.local`);
        toast.success(`Switched dev role to ${roleName}`);
        return;
      }
      await switchDemoRole(roleName);
      toast.success(`Switched role to ${roleName}`);
    } catch (err) {
      toast.error('Failed to switch demo account');
    }
  };

  const handleDevSettings = () => {
    window.open('/dev-settings', '_self');
  };

  return (
    <div className="demo-role-banner" role="region" aria-label="Demo role switcher">
      <div className="demo-role-label">
        <span>{import.meta.env.VITE_FAKE_AUTH_TOKEN ? 'Dev mode — switch role:' : 'Demo mode — switch role:'}</span>
        <span className="demo-role-current">
          viewing as <strong>{user?.name || 'Guest'}</strong> ({user?.role || 'Guest'})
        </span>
        {import.meta.env.VITE_FAKE_AUTH_TOKEN && (
          <button type="button" className="demo-role-btn dev" onClick={handleDevSettings} title="Dev auth settings">
            <Settings size={12} />
            Dev auth
          </button>
        )}
      </div>
      <div className="demo-role-buttons">
        {roles.map((r) => {
          const Icon = r.icon;
          const isActive = user?.role === r.name;
          return (
            <button
              key={r.name}
              type="button"
              className={`demo-role-btn ${isActive ? 'active' : ''}`}
              onClick={() => handleRoleSwitch(r.name)}
              title={r.label}
              aria-pressed={isActive}
            >
              <Icon size={12} />
              {r.name}
            </button>
          );
        })}
      </div>
    </div>
  );
};
