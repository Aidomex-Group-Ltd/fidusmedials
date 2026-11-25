import React, { useEffect, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { notificationService } from '../../services/api';

export const NotificationBell = () => {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);

  const load = async () => {
    try {
      const res = await notificationService.list();
      setItems(res.data?.items || []);
      setUnread(res.data?.unread || 0);
    } catch {}
  };

  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, []);

  const markRead = async (id) => { try { await notificationService.markRead(id); await load(); } catch {} };
  const markAll = async () => { try { await notificationService.markAllRead(); await load(); } catch {} };

  return (
    <div style={{ position:'relative' }}>
      <button className="btn btn-secondary" onClick={() => setOpen(v=>!v)} aria-label="Notifications" style={{ position:'relative' }}>
        <Bell size={16} />
        {unread > 0 && <span style={{ position:'absolute', top:-4, right:-4, background:'#dc2626', color:'#fff', borderRadius:999, fontSize:10, padding:'1px 5px', minWidth:20, textAlign:'center' }}>{unread}</span>}
      </button>
      {open && (
        <div className="card" style={{ position:'absolute', right:0, top:'calc(100% + 8px)', width:360, maxHeight:420, overflow:'auto', zIndex:50, padding:0 }}>
          <div style={{ padding:'0.85rem 1rem', borderBottom:'1px solid var(--slate-200)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <strong>Notifications</strong>
            <button className="cp-btn cp-btn-ghost cp-btn-sm" onClick={markAll}><CheckCheck size={14}/> Mark all read</button>
          </div>
          <div>
            {items.length === 0 && <div style={{ padding:'1rem', color:'var(--slate-500)' }}>No notifications.</div>}
            {items.map(n => (
              <button key={n.id} onClick={() => markRead(n.id)} style={{ display:'block', width:'100%', textAlign:'left', padding:'0.85rem 1rem', border:'none', borderBottom:'1px solid var(--slate-100)', background: n.status==='unread' ? 'var(--primary-50)' : '#fff', cursor:'pointer' }}>
                <div style={{ fontWeight:600, fontSize:'.88rem', color:'var(--slate-900)' }}>{n.title}</div>
                <div style={{ fontSize:'.82rem', color:'var(--slate-600)', marginTop:'.2rem' }}>{n.body}</div>
                <div style={{ fontSize:'.74rem', color:'var(--slate-400)', marginTop:'.3rem' }}>{new Date(n.created_at).toLocaleString()} · {n.priority}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
