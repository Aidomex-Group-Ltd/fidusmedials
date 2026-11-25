import React, { useEffect, useState } from 'react';
import { taskService } from '../../services/api';
import { CheckCircle2, Clock, AlertTriangle } from 'lucide-react';

const NEXT = { new:'acknowledged', acknowledged:'in_progress', in_progress:'completed', awaiting_information:'in_progress', escalated:'acknowledged' };

export const TaskQueuePanel = ({ title='My Tasks & Escalations' }) => {
  const [items, setItems] = useState([]);
  const load = async () => { try { const r = await taskService.list(); setItems(r.data?.items||[]); } catch {} };
  useEffect(()=>{ load(); const t=setInterval(load,30000); return ()=>clearInterval(t); }, []);
  const act = async (task) => { const next=NEXT[task.status]||'completed'; await taskService.updateStatus(task.id,next); load(); };
  return (
    <div className="card" style={{padding:'1rem'}}>
      <h3 style={{marginTop:0,display:'flex',gap:'.5rem',alignItems:'center'}}><AlertTriangle size={18}/> {title}</h3>
      <div style={{display:'grid',gap:'.6rem'}}>
        {items.map(t=> (
          <div key={t.id} style={{border:'1px solid var(--slate-200)',borderRadius:12,padding:'.75rem'}}>
            <div style={{display:'flex',justifyContent:'space-between',gap:'.75rem'}}><strong>{t.category}</strong><span style={{fontSize:'.75rem'}}>{t.priority} · {t.status}</span></div>
            <div style={{fontSize:'.8rem',color:'var(--slate-600)',marginTop:'.2rem'}}>Patient: {t.patient_ref||'-'} · Dept: {t.department||'-'}</div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:'.45rem'}}>
              <span style={{fontSize:'.75rem',color:'var(--slate-500)'}}><Clock size={12}/> {new Date(t.created_at).toLocaleString()}</span>
              {NEXT[t.status] && <button className="btn btn-secondary" onClick={()=>act(t)}><CheckCircle2 size={14}/> {NEXT[t.status]}</button>}
            </div>
          </div>
        ))}
        {items.length===0 && <div style={{color:'var(--slate-500)'}}>No tasks assigned.</div>}
      </div>
    </div>
  );
};
