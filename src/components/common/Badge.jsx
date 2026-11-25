import React from 'react';

export const Badge = ({ variant = 'slate', children, className = '' }) => {
  const variantMap = {
    teal: 'badge-teal',
    success: 'badge-emerald',
    warning: 'badge-amber',
    danger: 'badge-rose',
    slate: 'badge-slate',
    blue: 'badge-blue',
  };

  const badgeClass = variantMap[variant] || 'badge-slate';

  return (
    <span className={`badge ${badgeClass} ${className}`}>
      <span className="badge-dot" />
      {children}
    </span>
  );
};

/**
 * Status vocabulary shared by both portals. Backend statuses are lowercase
 * snake_case, so they are normalised before matching and rendered as readable
 * labels ("awaiting_verification" -> "Awaiting verification").
 */
const STATUS_VARIANTS = {
  // positive / settled
  confirmed: 'success',
  paid: 'success',
  dispensed: 'success',
  released: 'success',
  verified: 'success',
  active: 'success',
  available: 'success',
  completed: 'teal',
  discharged: 'teal',
  maintenance: 'warning',
  // in-flight / attention
  requested: 'warning',
  pending: 'warning',
  processing: 'warning',
  collected: 'warning',
  received: 'warning',
  scheduled: 'warning',
  checked_in: 'warning',
  awaiting_collection: 'warning',
  awaiting_verification: 'warning',
  awaiting_exam: 'warning',
  cancellation_requested: 'warning',
  partially_paid: 'warning',
  partially_dispensed: 'warning',
  pending_pharmacy: 'warning',
  report_pending: 'warning',
  report_completed: 'warning',
  // negative
  cancelled: 'danger',
  no_show: 'danger',
  overdue: 'danger',
  failed: 'danger',
  occupied: 'danger',
  discontinued: 'danger',
  expired: 'danger',
  // informational
  issued: 'blue',
  rescheduled: 'blue',
  in_progress: 'blue',
};

export const humanizeStatus = (status) => {
  const text = String(status || '').replace(/_/g, ' ').trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : 'Unknown';
};

export const StatusBadge = ({ status }) => {
  const key = String(status || '').toLowerCase();
  if (STATUS_VARIANTS[key]) {
    return <Badge variant={STATUS_VARIANTS[key]}>{humanizeStatus(status)}</Badge>;
  }

  let variant = 'slate';

  switch (status) {
    case 'Scheduled':
    case 'General Checkup':
      variant = 'blue';
      break;
    case 'Confirmed':
    case 'Active':
    case 'Paid':
    case 'Available':
    case 'Dispensed':
      variant = 'success';
      break;
    case 'In Consultation':
    case 'Partially Paid':
    case 'Pending':
    case 'Sanitizing / Maintenance':
      variant = 'warning';
      break;
    case 'Cancelled':
    case 'Occupied':
    case 'Unpaid':
    case 'Emergency':
      variant = 'danger';
      break;
    case 'Admitted':
      variant = 'blue';
      break;
    case 'Completed':
    case 'Discharged':
      variant = 'teal';
      break;
    default:
      variant = 'slate';
  }

  return <Badge variant={variant}>{status}</Badge>;
};
