import React, { useEffect, useState } from 'react';
import { adminService, staffService } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { Shield, Users, Mail, Activity, UserCheck, UserX, RefreshCw, KeyRound } from 'lucide-react';

const ROLES = ['System Administrator','Administrator','Facility Administrator','Medical Director','Receptionist','Doctor','Clinician','Nurse','Midwife','Pharmacist','Laboratory Staff','Laboratory Personnel','Pharmacy Staff','Radiology Staff','Billing / Finance Staff','Records Officer','Admin & Finance'];

export const SystemAdminPortal = ({ activeTab }) => {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState(null);
  const [staff, setStaff] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [audit, setAudit] = useState([]);
  const [invite, setInvite] = useState({ email:'', name:'', role:'Doctor', department:'Medical Consultation' });
  const [busy, setBusy] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [o,s,i,a] = await Promise.all([adminService.overview(), adminService.staff(), adminService.invitations(), adminService.audit()]);
      setOverview(o.data); setStaff(s.data?.items||[]); setInvitations(i.data?.items||[]); setAudit(a.data?.items||[]);
    } catch (e) { toast.error(e.message || 'Failed to load admin data'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const act = async (fn, msg) => { try { setBusy(msg); await fn(); toast.success(msg); await load(); } catch(e){ toast.error(e.message||'Action failed'); } finally { setBusy(''); } };

  if (loading) return <div className="card" style={{padding:'1.5rem'}}>Loading system administration…</div>;
  const c = overview?.counts || {};

  return (
    <div style={{display:'grid', gap:'1rem'}}>
      <div className="card" style={{padding:'1.25rem'}}>
        <div style={{display:'flex',justifyContent:'space-between',gap:'1rem',alignItems:'center',flexWrap:'wrap'}}>
          <div><h2 style={{margin:0,display:'flex',gap:'.5rem',alignItems:'center'}}><Shield size={20}/> System Administration</h2><p style={{margin:'.35rem 0 0',color:'var(--slate-600)'}}>Manage staff access, invitations, roles, account status, and audit activity.</p></div>
          <button className="cp-btn cp-btn-outline" onClick={load} disabled={!!busy}><RefreshCw size={16}/> Refresh</button>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:'.75rem',marginTop:'1rem'}}>
          {[['Users',c.totalUsers],['Active Staff',c.activeStaff],['Pending Apps',c.pendingApplications],['Pending Invites',c.pendingInvitations],['Accepted Invites',c.acceptedInvitations],['Expired Invites',c.expiredInvitations],['Suspended',c.suspendedAccounts],['Revoked',c.revokedAccess],['Admins',c.activeAdministrators]].map(([k,v])=> (
            <div key={k} style={{background:'var(--slate-50)',border:'1px solid var(--slate-200)',borderRadius:12,padding:'.85rem'}}><div style={{fontSize:'.78rem',color:'var(--slate-500)'}}>{k}</div><div style={{fontSize:'1.4rem',fontWeight:800,color:'var(--slate-900)'}}>{v ?? 0}</div></div>
          ))}
        </div>
      </div>

      {(activeTab === 'dashboard' || activeTab === 'admin-staff') && (
        <div className="card" style={{padding:'1.25rem'}}>
          <h3 style={{marginTop:0,display:'flex',gap:'.5rem',alignItems:'center'}}><Users size={18}/> Staff Directory & Access Control</h3>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:'.9rem'}}>
              <thead><tr>{['Name','Email','Role','Dept','Status','Verified','Last Login','Actions'].map(h=><th key={h} style={{textAlign:'left',padding:'.6rem',borderBottom:'1px solid var(--slate-200)'}}>{h}</th>)}</tr></thead>
              <tbody>
                {staff.map(u=> (
                  <tr key={u.id}>
                    <td style={{padding:'.6rem',borderBottom:'1px solid var(--slate-100)'}}>{u.name}</td>
                    <td style={{padding:'.6rem',borderBottom:'1px solid var(--slate-100)'}}>{u.email}</td>
                    <td style={{padding:'.6rem',borderBottom:'1px solid var(--slate-100)'}}>{u.role}</td>
                    <td style={{padding:'.6rem',borderBottom:'1px solid var(--slate-100)'}}>{u.department||'-'}</td>
                    <td style={{padding:'.6rem',borderBottom:'1px solid var(--slate-100)'}}>{u.status||'active'}</td>
                    <td style={{padding:'.6rem',borderBottom:'1px solid var(--slate-100)'}}>{u.email_verified_at?'Yes':'No'}</td>
                    <td style={{padding:'.6rem',borderBottom:'1px solid var(--slate-100)'}}>{u.last_login_at ? new Date(u.last_login_at).toLocaleString() : '-'}</td>
                    <td style={{padding:'.6rem',borderBottom:'1px solid var(--slate-100)'}}>
                      <div style={{display:'flex',gap:'.35rem',flexWrap:'wrap'}}>
                        <button className="cp-btn cp-btn-outline cp-btn-sm" disabled={!!busy} onClick={()=>act(()=>adminService.updateStatus({userId:u.id,action:'suspend',reason:'Suspended by administrator'}),'Suspended account')}><UserX size={14}/>Suspend</button>
                        <button className="cp-btn cp-btn-outline cp-btn-sm" disabled={!!busy} onClick={()=>act(()=>adminService.updateStatus({userId:u.id,action:'reinstate'}),'Reinstated account')}><UserCheck size={14}/>Reinstate</button>
                        <button className="cp-btn cp-btn-outline cp-btn-sm" disabled={!!busy} onClick={()=>act(()=>adminService.updateStatus({userId:u.id,action:'revoke',reason:'Access revoked by administrator'}),'Revoked access')}><Shield size={14}/>Revoke</button>
                        <button className="cp-btn cp-btn-outline cp-btn-sm" disabled={!!busy} onClick={()=>act(()=>adminService.resetPassword(u.email),'Password reset initiated')}><KeyRound size={14}/>Reset PW</button>
                        <select className="form-select" style={{maxWidth:180}} defaultValue={u.role} onChange={(e)=>act(()=>adminService.assignRole({userId:u.id,role:e.target.value}),'Role updated')}>
                          {ROLES.map(r=><option key={r} value={r}>{r}</option>)}
                        </select>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(activeTab === 'dashboard' || activeTab === 'admin-invitations') && (
        <div className="card" style={{padding:'1.25rem'}}>
          <h3 style={{marginTop:0,display:'flex',gap:'.5rem',alignItems:'center'}}><Mail size={18}/> Staff Invitations</h3>
          <form onSubmit={(e)=>{e.preventDefault(); act(()=>staffService.invite(invite),'Invitation sent');}} style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:'.75rem',marginBottom:'1rem'}}>
            <input className="form-input" placeholder="Name" value={invite.name} onChange={e=>setInvite({...invite,name:e.target.value})}/>
            <input className="form-input" placeholder="Email" required value={invite.email} onChange={e=>setInvite({...invite,email:e.target.value})}/>
            <select className="form-select" value={invite.role} onChange={e=>setInvite({...invite,role:e.target.value})}>{ROLES.filter(r=>r!=='System Administrator').map(r=><option key={r}>{r}</option>)}</select>
            <input className="form-input" placeholder="Department" value={invite.department} onChange={e=>setInvite({...invite,department:e.target.value})}/>
            <button className="cp-btn cp-btn-primary" disabled={!!busy}>Send Invitation</button>
          </form>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:'.9rem'}}><thead><tr>{['Email','Role','Dept','Expires','Used','Created'].map(h=><th key={h} style={{textAlign:'left',padding:'.6rem',borderBottom:'1px solid var(--slate-200)'}}>{h}</th>)}</tr></thead>
              <tbody>{invitations.map(i=><tr key={i.id}><td style={{padding:'.6rem'}}>{i.email}</td><td style={{padding:'.6rem'}}>{i.role}</td><td style={{padding:'.6rem'}}>{i.department}</td><td style={{padding:'.6rem'}}>{new Date(i.expires_at).toLocaleString()}</td><td style={{padding:'.6rem'}}>{i.used_at?'Yes':'No'}</td><td style={{padding:'.6rem'}}>{new Date(i.created_at).toLocaleString()}</td></tr>)}</tbody>
            </table>
          </div>
        </div>
      )}

      {(activeTab === 'dashboard' || activeTab === 'admin-audit') && (
        <div className="card" style={{padding:'1.25rem'}}>
          <h3 style={{marginTop:0,display:'flex',gap:'.5rem',alignItems:'center'}}><Activity size={18}/> Audit & Security Activity</h3>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:'.88rem'}}><thead><tr>{['Time','Event','Actor','Role','Target','IP'].map(h=><th key={h} style={{textAlign:'left',padding:'.6rem',borderBottom:'1px solid var(--slate-200)'}}>{h}</th>)}</tr></thead>
              <tbody>{audit.map(a=><tr key={a.id}><td style={{padding:'.6rem'}}>{new Date(a.created_at).toLocaleString()}</td><td style={{padding:'.6rem'}}>{a.event}</td><td style={{padding:'.6rem'}}>{a.actor_email||'-'}</td><td style={{padding:'.6rem'}}>{a.actor_role||'-'}</td><td style={{padding:'.6rem'}}>{a.target_id||'-'}</td><td style={{padding:'.6rem'}}>{a.ip||'-'}</td></tr>)}</tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
