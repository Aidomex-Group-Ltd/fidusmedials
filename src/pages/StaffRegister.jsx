import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ArrowLeft, ArrowRight, Lock, User } from 'lucide-react';

export const StaffRegister = ({ onNavigateHome }) => {
  const { acceptInvitation } = useAuth();
  const toast = useToast();

  const [token, setToken] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [phone, setPhone] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const busy = submitting;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!token) {
      return toast.warning('An invitation token is required. Use the link sent to you by an administrator.');
    }
    if (!name) {
      return toast.warning('Please enter your name.');
    }
    if (!password || password.length < 6) {
      return toast.warning('Password must be at least 6 characters.');
    }
    if (password !== confirm) {
      return toast.warning('Passwords do not match.');
    }

    try {
      setSubmitting(true);
      await acceptInvitation({
        invitation_token: token.trim(),
        name: name.trim(),
        password,
        passwordConfirmation: confirm,
        phone: phone.trim() || undefined,
      });
      toast.success('Staff account created. Signing you in…');
    } catch (err) {
      toast.error(err.message || 'Failed to accept invitation');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="cp-auth">
      <aside className="cp-auth-media">
        <img src="/images/ward.webp" alt="Modern inpatient ward with hospital beds" />
        <div className="cp-auth-overlay" />
        <div className="cp-auth-media-copy">
          <span className="cp-logo cp-logo-light">
            <span className="cp-logo-mark">
              <User size={18} />
            </span>
            Fidus Medical Center
          </span>
          <p className="cp-auth-tagline">Accept your staff invitation and set up secure access to Fidus staff systems.</p>
        </div>
      </aside>

      <main className="cp-auth-panel">
        <div className="cp-auth-form-wrap">
          {onNavigateHome && (
            <button type="button" className="cp-back-link" onClick={onNavigateHome}>
              <ArrowLeft size={16} /> Back to home
            </button>
          )}

          <span className="cp-eyebrow">Staff Portal</span>
          <h1 className="cp-auth-title" style={{ marginTop: '0.75rem' }}>Staff registration</h1>
          <p className="cp-auth-sub">
            Staff registration is restricted to authorized Fidus Medical Center personnel. A staff account must be verified and approved before access to staff systems is granted.
          </p>

          <form onSubmit={handleSubmit} noValidate>
            <div className="form-group">
              <label className="form-label" htmlFor="staff-reg-token">
                Invitation token *
              </label>
              <div className="cp-input-icon">
                <Lock size={16} aria-hidden="true" />
                <input
                  id="staff-reg-token"
                  type="text"
                  required
                  autoComplete="off"
                  placeholder="Paste the token from your invitation link"
                  className="form-input"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                />
              </div>
              <p style={{ fontSize: '0.78rem', color: 'var(--slate-500)', marginTop: '0.3rem' }}>
                This is the single-use token from the invitation link sent by an administrator. It expires after 7 days.
              </p>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="staff-reg-name">
                Full name *
              </label>
              <div className="cp-input-icon">
                <User size={16} aria-hidden="true" />
                <input
                  id="staff-reg-name"
                  type="text"
                  required
                  autoComplete="name"
                  placeholder="Your full name"
                  className="form-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="staff-reg-phone">
                Phone number (optional)
              </label>
              <div className="cp-input-icon">
                <User size={16} aria-hidden="true" />
                <input
                  id="staff-reg-phone"
                  type="tel"
                  autoComplete="tel"
                  placeholder="+256700000000"
                  className="form-input"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="staff-reg-password">
                Password * (min 6 characters)
              </label>
              <div className="cp-input-icon">
                <Lock size={16} aria-hidden="true" />
                <input
                  id="staff-reg-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength="6"
                  autoComplete="new-password"
                  placeholder="Choose a secure password"
                  className="form-input cp-has-toggle"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="cp-pw-toggle"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <ArrowRight size={16} /> : <Lock size={16} />}
                </button>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="staff-reg-confirm">
                Confirm password *
              </label>
              <div className="cp-input-icon">
                <Lock size={16} aria-hidden="true" />
                <input
                  id="staff-reg-confirm"
                  type={showConfirm ? 'text' : 'password'}
                  required
                  minLength="6"
                  autoComplete="new-password"
                  placeholder="Repeat your password"
                  className="form-input cp-has-toggle"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
                <button
                  type="button"
                  className="cp-pw-toggle"
                  onClick={() => setShowConfirm((v) => !v)}
                  aria-label={showConfirm ? 'Hide password' : 'Show password'}
                >
                  {showConfirm ? <ArrowRight size={16} /> : <Lock size={16} />}
                </button>
              </div>
            </div>

            <button type="submit" className="cp-btn cp-btn-primary cp-btn-lg cp-btn-block" disabled={busy} style={{ marginTop: '0.5rem' }}>
              {submitting ? (
                <>Creating account…</>
              ) : (
                <>Accept Invitation <ArrowRight size={18} /></>
              )}
            </button>
          </form>

          <p className="cp-auth-switch">
            Have an invitation link but it is expired or already used?{' '}
            <button type="button" className="cp-link" onClick={() => window.location.href = '/staff/apply'}>
              Submit a staff application
            </button>
          </p>

          <p className="cp-auth-switch" style={{ marginTop: '0.5rem' }}>
            Not yet invited?{' '}
            <button type="button" className="cp-link" onClick={() => window.location.href = '/staff/apply'}>
              Apply for a staff account
            </button>
          </p>

          <p className="cp-auth-switch" style={{ marginTop: '0.5rem' }}>
            Already have a staff account?{' '}
            <button type="button" className="cp-link" onClick={() => window.location.href = '/staff/login'}>
              Sign in
            </button>
          </p>
        </div>
      </main>
    </div>
  );
};
