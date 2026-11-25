import React, { useEffect, useState } from 'react';
import { adminService } from '../services/api';
import { useToast } from '../context/ToastContext';
import { Shield, Mail, CheckCircle2 } from 'lucide-react';

const ALLOWED = ['consult@fidusmedicals.space','aidomexgroup@gmail.com'];

export const AdminBootstrap = ({ onNavigateHome, onNavigateLogin }) => {
  const toast = useToast();
  const [email, setEmail] = useState(ALLOWED[0]);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');

  const load = async () => { try { setStatus((await adminService.bootstrapStatus()).data); } catch {} };
  useEffect(()=>{ load();
    const token = new URLSearchParams(window.location.search).get('token');
    if (token) {
      setBusy(true);
      adminService.bootstrapVerify(token).then(r=>{ setDone(r.message||'Bootstrap verified.'); toast.success('Bootstrap verified'); load(); }).catch(e=>toast.error(e.message||'Verification failed')).finally(()=>setBusy(false));
    }
  },[]);

  const request = async (e) => { e.preventDefault(); setBusy(true); try { const r = await adminService.bootstrapRequest(email); toast.success(r.message||'Verification email sent'); } catch(err){ toast.error(err.message||'Request failed'); } finally { setBusy(false); } };

  return (
    <div className="cp-auth">
      <aside className="cp-auth-media"><img src="/images/ward.webp" alt="Fidus Medical Center"/><div className="cp-auth-overlay"/><div className="cp-auth-media-copy"><span className="cp-logo cp-logo-light"><span className="cp-logo-mark"><Shield size={18}/></span>Fidus Medical Center</span><p className="cp-auth-tagline">Secure System Administrator bootstrap verification.</p></div></aside>
      <main className="cp-auth-panel"><div className="cp-auth-form-wrap">
        <span className="cp-eyebrow">System Administration</span>
        <h1 className="cp-auth-title" style={{marginTop:'.75rem'}}>System Administrator Bootstrap</h1>
        <p className="cp-auth-sub">Only the two pre-authorized identities can be elevated. Ownership must be verified by email before elevation. No role is granted from frontend input alone.</p>
        {done && <div className="cp-staff-flow-note" style={{marginBottom:'1rem'}}><CheckCircle2 size={16}/><p>{done} Sign out and sign in again to refresh your role.</p></div>}
        <form onSubmit={request}>
          <div className="form-group"><label className="form-label">Authorized administrator email</label><div className="cp-input-icon"><Mail size={16}/><select className="form-select" value={email} onChange={e=>setEmail(e.target.value)}>{ALLOWED.map(a=><option key={a} value={a}>{a}</option>)}</select></div></div>
          <button className="cp-btn cp-btn-primary cp-btn-lg cp-btn-block" disabled={busy}>{busy?'Processing…':'Send bootstrap verification email'}</button>
        </form>
        <div style={{marginTop:'1rem',fontSize:'.9rem',color:'var(--slate-600)'}}>
          <strong>Current status</strong>
          <ul>{(status?.admins||[]).map(a=><li key={a.email}>{a.email} — {a.role} — {a.status} — verified: {a.email_verified_at?'yes':'no'} — MFA: {a.mfa_enabled?'yes':'no'}</li>)}</ul>
        </div>
        <p className="cp-auth-switch" style={{marginTop:'1rem'}}><button type="button" className="cp-link" onClick={onNavigateLogin}>Go to staff sign in</button> · <button type="button" className="cp-link" onClick={onNavigateHome}>Home</button></p>
      </div></main>
    </div>
  );
};
