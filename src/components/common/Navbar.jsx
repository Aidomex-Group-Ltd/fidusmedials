import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { Search, Menu } from 'lucide-react';
import { NotificationBell } from './NotificationBell';

/**
 * Top bar: global search, live notifications and the signed-in identity.
 * The notification list is the real backend feed (NotificationBell), not a
 * local mock — the previous implementation showed hardcoded alerts.
 */
export const Navbar = ({ onSearch, searchQuery, onMenuClick }) => {
  const { user } = useAuth();

  return (
    <header className="app-navbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0 }}>
        {onMenuClick && (
          <button
            type="button"
            className="navbar-icon-btn sidebar-toggle"
            onClick={onMenuClick}
            aria-label="Open navigation menu"
          >
            <Menu size={18} />
          </button>
        )}
        <div className="navbar-search">
          <Search size={16} />
          <input
            type="text"
            placeholder="Search patients, appointments or invoices…"
            value={searchQuery || ''}
            onChange={(event) => onSearch && onSearch(event.target.value)}
            aria-label="Search"
          />
        </div>
      </div>

      <div className="navbar-right">
        <NotificationBell />
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingLeft: '0.5rem' }}>
          <div
            aria-hidden="true"
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: 'var(--primary-100)',
              color: 'var(--primary-700)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: '0.85rem',
            }}
          >
            {(user?.name || 'U').slice(0, 1).toUpperCase()}
          </div>
          <div style={{ lineHeight: 1.2, minWidth: 0 }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {user?.name || 'Signed in'}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--slate-500)' }}>{user?.role || ''}</div>
          </div>
        </div>
      </div>
    </header>
  );
};
