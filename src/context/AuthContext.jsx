import React, { createContext, useContext, useState, useEffect } from 'react';
import { authService, staffService } from '../services/api';

const AuthContext = createContext(null);

// Every non-patient role is staff for routing purposes. Kept in one place so a
// new role added to the backend is not silently locked out of the portal.
const STAFF_ROLES = [
  'System Administrator',
  'Administrator',
  'Facility Administrator',
  'Medical Director',
  'Doctor',
  'Receptionist',
  'Records Officer',
  'Nurse',
  'Midwife',
  'Clinician',
  'Laboratory Staff',
  'Laboratory Personnel',
  'Pharmacy Staff',
  'Pharmacist',
  'Radiology Staff',
  'Admin & Finance',
  'Billing / Finance Staff',
];

// Roles that share an operational workspace with a canonical role. Kept here
// so the flag checks below and the portal router cannot disagree.
const isOneOf = (role, list) => list.includes(role);

// Every token this app stores is a JWT. Checking its expiry before the first
// request avoids a guaranteed 401 on /auth/me after a session has expired.
const tokenIsFresh = (token) => {
  const payload = String(token || '').split('.')[1];
  if (!payload) return false;
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')));
    return typeof json.exp === 'number' ? json.exp * 1000 > Date.now() : true;
  } catch {
    return false;
  }
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Initialize auth state from a real token issued by the Worker.
  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('fidus_token');
      if (token && !tokenIsFresh(token)) {
        localStorage.removeItem('fidus_token');
      }
      if (token && tokenIsFresh(token)) {
        try {
          // Prefer /auth/me for patients; staff endpoints are the same shape.
          const res = await authService.getMe();
          if (res && res.success && res.data) {
            setUser(res.data);
          } else {
            localStorage.removeItem('fidus_token');
          }
        } catch (error) {
          console.warn('[Auth Initialization]: Token expired, invalid, or backend unreachable');
          localStorage.removeItem('fidus_token');
        }
      }
      setLoading(false);
    };

    initAuth();
  }, []);

  // Patient login: only patient accounts can sign in here.
  const patientLogin = async (identifier, password) => {
    const res = await authService.login({ email: identifier, password });
    if (res && res.success && res.data?.token) {
      localStorage.setItem('fidus_token', res.data.token);
      setUser(res.data);
      return res.data;
    }
    // Backend returns the same 'Invalid email or password' for wrong creds,
    // but if a staff account tries patient login we forward a clear message.
    throw new Error(res?.message || 'Login failed. If you are a member of staff, use Staff Login.');
  };

  // Staff login: only staff accounts can sign in here.
  const staffLoginFn = async (email, password) => {
    const res = await staffService.login({ email, password });
    if (res && res.success && res.data?.token) {
      localStorage.setItem('fidus_token', res.data.token);
      setUser(res.data);
      return res.data;
    }
    throw new Error(res?.message || 'Login failed. If you are a patient, use the Patient Portal sign-in.');
  };

  // Patient registration (public). Accepts email and/or phone.
  const registerPatient = async (userData) => {
    const res = await authService.register(userData);
    if (res && res.success && res.data?.token) {
      localStorage.setItem('fidus_token', res.data.token);
      setUser(res.data);
      return res.data;
    }
    throw new Error(res?.message || 'Registration failed');
  };

  // Staff invitation acceptance.
  const acceptInvitation = async (data) => {
    const res = await staffService.acceptInvitation(data);
    if (res && res.success && res.data?.token) {
      localStorage.setItem('fidus_token', res.data.token);
      setUser(res.data);
      return res.data;
    }
    throw new Error(res?.message || 'Failed to accept invitation');
  };

  // Staff application (public, pending approval).
  const applyStaff = async (data) => {
    const res = await staffService.apply(data);
    if (res && res.success) return res.data;
    throw new Error(res?.message || 'Application failed');
  };

  const logout = async () => {
    try {
      await authService.logout();
    } catch (_) {
      // Best-effort; client-side clear is what matters.
    }
    localStorage.removeItem('fidus_token');
    setUser(null);
  };

  // Development-only helper: log in as a pre-seeded account via the real
  // /api/auth/login or /api/staff/login endpoint. Exists only so a developer
  // running `vite` locally can reach the dashboards quickly. Stripped from
  // production bundles by the DEV guard below.
  const switchDemoRole = async (roleName) => {
    if (!import.meta.env.DEV) {
      throw new Error('Demo role switching is only available in development mode.');
    }
    // Keep credentials config-driven and out of the happy path; only the
    // seeded admin + a few demo accounts are referenced here.
    const roleCredentials = {
      Admin: { email: 'admin@fidus.staging', password: 'admin123', asStaff: true },
      Doctor: { email: 'sarah.cardio@fidusmedicals.space', password: 'Doctor@123', asStaff: true },
      Receptionist: { email: 'reception@fidusmedicals.space', password: 'Staff@123', asStaff: true },
      Patient: { email: 'alex.johnson@example.com', password: 'Patient@123', asStaff: false },
      Nurse: { email: 'nurse@fidusmedicals.space', password: 'Nurse@123', asStaff: true },
      Midwife: { email: 'midwife@fidusmedicals.space', password: 'Midwife@123', asStaff: true },
      Clinician: { email: 'clinician@fidusmedicals.space', password: 'Clinician@123', asStaff: true },
      'Laboratory Staff': { email: 'lab@fidusmedicals.space', password: 'Lab@123', asStaff: true },
      'Pharmacy Staff': { email: 'pharmacy@fidusmedicals.space', password: 'Pharmacy@123', asStaff: true },
      'Radiology Staff': { email: 'radiology@fidusmedicals.space', password: 'Radiology@123', asStaff: true },
      'Admin & Finance': { email: 'finance@fidusmedicals.space', password: 'Finance@123', asStaff: true },
    };

    const creds = roleCredentials[roleName];
    if (!creds) throw new Error(`No demo account configured for role: ${roleName}`);
    if (creds.asStaff) {
      return await staffLoginFn(creds.email, creds.password);
    }
    return await patientLogin(creds.email, creds.password);
  };

  const updateUser = (data) => {
    setUser((prev) => ({ ...prev, ...data }));
  };

  const value = {
    user,
    loading,
    // Patient-facing auth (main Login + Register pages).
    login: patientLogin,
    register: registerPatient,
    // Staff-facing auth.
    staffLogin: staffLoginFn,
    acceptInvitation,
    applyStaff,
    logout,
    // Dev-only.
    switchDemoRole,
    updateUser,
    isAdmin: isOneOf(user?.role, ['Administrator', 'System Administrator', 'Facility Administrator']),
    isDoctor: isOneOf(user?.role, ['Doctor', 'Medical Director']),
    isNurse: user?.role === 'Nurse',
    isMidwife: user?.role === 'Midwife',
    isClinician: user?.role === 'Clinician',
    isLabStaff: isOneOf(user?.role, ['Laboratory Staff', 'Laboratory Personnel']),
    isPharmacyStaff: isOneOf(user?.role, ['Pharmacy Staff', 'Pharmacist']),
    isRadiologyStaff: user?.role === 'Radiology Staff',
    isAdminAndFinance: isOneOf(user?.role, ['Admin & Finance', 'Billing / Finance Staff']),
    isReceptionist: isOneOf(user?.role, ['Receptionist', 'Records Officer']),
    isStaff: STAFF_ROLES.includes(user?.role),
    isPatient: user?.role === 'Patient',
    isPatientAccount: user?.role === 'Patient',
    isStaffAccount: STAFF_ROLES.includes(user?.role),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
