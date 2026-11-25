import React, { useCallback, useEffect, useRef, useState } from 'react';
import { workflowService } from '../../services/api';
import { StatusBadge } from '../common/Badge';
import { RefreshCw, Search, User, AlertTriangle } from 'lucide-react';

/**
 * Shared building blocks for the facility staff portals.
 *
 * Every department portal is a queue of real records plus the actions its role
 * is allowed to perform, so the mechanics live here instead of being retyped in
 * five places.
 */

/** Load an async source with loading/error/retry state. */
export const useAsync = (loader, deps = []) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await loader();
      if (alive.current) setData(result);
    } catch (err) {
      if (alive.current) setError(err?.message || 'Could not load this list.');
    } finally {
      if (alive.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, loading, error, reload };
};

export const QueueSkeleton = ({ rows = 4 }) => (
  <div style={{ padding: '1rem' }} aria-busy="true" aria-label="Loading records">
    {Array.from({ length: rows }).map((_, index) => (
      <div
        key={index}
        style={{
          height: 16,
          margin: '0.75rem 0',
          borderRadius: 6,
          background: 'linear-gradient(90deg, var(--slate-100), var(--slate-200), var(--slate-100))',
          width: `${92 - index * 10}%`,
        }}
      />
    ))}
  </div>
);

export const QueueState = ({ loading, error, empty, emptyTitle, emptyDescription, onRetry, children, rows }) => {
  if (loading) return <QueueSkeleton rows={rows} />;
  if (error) {
    return (
      <div className="portal-empty-cell" style={{ padding: '2rem', textAlign: 'center' }}>
        <AlertTriangle size={24} style={{ color: 'var(--danger-500)', marginBottom: 6 }} />
        <p style={{ fontWeight: 600 }}>{error}</p>
        <button className="btn btn-secondary btn-sm" style={{ marginTop: '0.5rem' }} onClick={onRetry}>
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    );
  }
  if (empty) {
    return (
      <div className="portal-empty-cell" style={{ padding: '2.25rem 1rem', textAlign: 'center' }}>
        <User size={24} style={{ color: 'var(--slate-400)', marginBottom: 6 }} />
        <p style={{ fontWeight: 600 }}>{emptyTitle}</p>
        <p style={{ color: 'var(--slate-500)', fontSize: '0.85rem' }}>{emptyDescription}</p>
      </div>
    );
  }
  return children;
};

const QUEUE_LOADERS = {
  appointments: () => workflowService.appointments(),
  consultations: () => workflowService.consultations(),
  prescriptions: () => workflowService.prescriptions(),
  lab: () => workflowService.labRequests(),
  radiology: () => workflowService.radiologyRequests(),
  invoices: () => workflowService.invoices(),
};

/** Load one staff work queue. */
export const useQueue = (type) => {
  const result = useAsync(async () => {
    const res = await QUEUE_LOADERS[type]();
    return res?.data?.items || [];
  }, [type]);
  return { ...result, items: result.data || [] };
};

/** Search registered patients; a record can only be created for a real patient. */
export const PatientPicker = ({ selected, onSelect, label = 'Patient' }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const search = async (value) => {
    setQuery(value);
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }
    try {
      setSearching(true);
      const res = await workflowService.listPatients(value.trim());
      setResults(res?.data?.items || []);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div>
      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 4 }}>{label}</label>
      {selected ? (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            border: '1px solid var(--slate-200)',
            borderRadius: 8,
            padding: '0.5rem 0.75rem',
          }}
        >
          <span>
            <strong>{selected.name}</strong>
            <span style={{ color: 'var(--slate-500)', fontSize: '0.8rem' }}>
              {' '}
              • {selected.patient_number || selected.email}
            </span>
          </span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onSelect(null)}>
            Change
          </button>
        </div>
      ) : (
        <div>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: 12, color: 'var(--slate-400)' }} />
            <input
              className="form-control"
              style={{ paddingLeft: 30 }}
              placeholder="Search by name, email or patient number"
              value={query}
              onChange={(event) => search(event.target.value)}
            />
          </div>
          {searching && <p style={{ fontSize: '0.8rem', color: 'var(--slate-500)', marginTop: 4 }}>Searching…</p>}
          {!searching && query.trim().length >= 2 && results.length === 0 && (
            <p style={{ fontSize: '0.8rem', color: 'var(--slate-500)', marginTop: 4 }}>
              No registered patient matches that search.
            </p>
          )}
          {results.length > 0 && (
            <ul style={{ listStyle: 'none', margin: '0.5rem 0 0', padding: 0, maxHeight: 180, overflow: 'auto' }}>
              {results.map((patient) => (
                <li key={patient.id}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{ width: '100%', justifyContent: 'flex-start', marginBottom: 4 }}
                    onClick={() => {
                      onSelect(patient);
                      setResults([]);
                      setQuery('');
                    }}
                  >
                    {patient.name} • {patient.patient_number || patient.email}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

/** Standard stat row for a department portal, sourced from /dashboard/stats. */
export const StatRow = ({ cards }) => (
  <div className="stats-grid">
    {cards.map((card) => (
      <div className="stat-card" key={card.label}>
        <div className="stat-info">
          <span className="stat-label">{card.label}</span>
          <span className="stat-value">{card.value}</span>
          {card.subtext && <span className="stat-subtext">{card.subtext}</span>}
        </div>
      </div>
    ))}
  </div>
);

/** A record's ownership line: who it is for, and who owns it clinically. */
export const PatientCell = ({ row }) => (
  <div>
    <strong>{row.patient_name || row.patient_ref || 'Patient'}</strong>
    <div style={{ fontSize: '0.75rem', color: 'var(--slate-500)' }}>
      {row.patient_ref || ''} {row.reference ? `• ${row.reference}` : ''}
    </div>
  </div>
);

export const StatusCell = ({ status }) => <StatusBadge status={status} />;
