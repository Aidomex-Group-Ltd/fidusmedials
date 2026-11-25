import React, { useEffect, useState } from 'react';
import { Bell, Check, CheckCheck, RefreshCw, Settings } from 'lucide-react';
import { notificationService } from '../../services/api';

export const NotificationCenter = () => {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [prefs, setPrefs] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [n,p] = await Promise.allSettled([notificationService.list(), notificationService.preferences()]);
    if (n.status==='fulfilled') { setItems(n.value.data?.items||[]); setUnread(n.value.data?.unread||0); }
    if (p.status==='fulfilled') setPrefs(p.value.data);
  };
  useEffect(()=>{ load(); },[]);

  const savePrefs = async () => { if (!prefs) return; setSaving(true); try { await notificationService.updatePreferences(prefs); await load(); } finally { setSaving(false); } };

  return (
    <div style={{display:'grid',gap:'1rem'}}>
      <div className="card" style={{padding:'1rem'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'1rem',flexWrap:'wrap'}}>
          <h3 style={{margin:0,display:'flex',gap:'.5rem',alignItems:'center'}}><Bell size={18}/> Notification Center <span className="badge">{unread} unread</span></h3>
          <div style={{display:'flex',gap:'.5rem'}}><button className="btn btn-secondary" onClick={load}><RefreshCw size={14}/>Refresh</button><button className="btn btn-secondary" onClick={async()=>{await notificationService.markAllRead(); load();}}><CheckCheck size={14}/>Mark all read</button></div>
        </div>
        <div style={{marginTop:'1rem',display:'grid',gap:'.5rem'}}>
          {items.map(n => (
            <div key={n.id} style={{padding:'.85rem',border:'1px solid var(--slate-200)',borderRadius:12,background:n.status==='unread'?'var(--primary-50)':'#fff'}}>
              <div style={{display:'flex',justifyContent:'space-between',gap:'1rem'}}><strong>{n.title}</strong><span style={{fontSize:'.75rem',color:'var(--slate-500)'}}>{n.priority}</span></div>
              <div style={{fontSize:'.88rem',color:'var(--slate-700)',marginTop:'.25rem'}}>{n.body}</div>
              <div style={{display:'flex',justifyContent:'space-between',marginTop:'.4rem',fontSize:'.75rem',color:'var(--slate-500)'}}><span>{new Date(n.created_at).toLocaleString()}</span>{n.status==='unread' && <button className="cp-btn cp-btn-ghost cp-btn-sm" onClick={async()=>{await notificationService.markRead(n.id); load();}}><Check size={14}/>Read</button>}</div>
            </div>
          ))}
          {items.length===0 && <div style={{color:'var(--slate-500)'}}>No notifications yet.</div>}
        </div>
      </div>
      <div className="card" style={{padding:'1rem'}}>
        <h3 style={{marginTop:0,display:'flex',gap:'.5rem',alignItems:'center'}}><Settings size={18}/> Notification Preferences</h3>
        {prefs && <div style={{display:'grid',gap:'.6rem',maxWidth:420}}>
          {['in_app','email','push','sms'].map(k => (
            <label key={k} style={{display:'flex',justifyContent:'space-between',gap:'1rem'}}><span>{k.replace('_',' ').toUpperCase()}</span><input type="checkbox" checked={!!prefs[k]} onChange={e=>setPrefs({...prefs,[k]:e.target.checked})}/></label>
          ))}
          <button className="btn btn-primary" disabled={saving} onClick={savePrefs}>{saving?'Saving…':'Save preferences'}</button>
        </div>}
      </div>
    </div>
  );
};
